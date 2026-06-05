//! Merged artist listing for cluster scope (spec §4 Tier 1 — dedup by `artist_key`).

use rusqlite::types::Value as SqlValue;
use serde_json::Value;

use crate::dto::{LibraryArtistDto, LibraryClusterArtistsResponse};
use crate::search::PAGE_LIMIT_MAX;
use crate::store::LibraryStore;

use super::db::ATTACH_ALIAS;
use super::priority::{in_list_sql, priority_case_sql};

pub fn list_merged_artists(
    store: &LibraryStore,
    servers_ordered: &[String],
    limit: u32,
    offset: u32,
) -> Result<LibraryClusterArtistsResponse, String> {
    if servers_ordered.is_empty() {
        return Ok(LibraryClusterArtistsResponse {
            artists: vec![],
            has_more: false,
        });
    }
    let limit = limit.clamp(1, PAGE_LIMIT_MAX);
    let offset = offset.min(i32::MAX as u32) as i32;
    let (in_placeholders, mut in_params) = in_list_sql(servers_ordered);
    let (priority_sql, mut priority_params) = priority_case_sql("t.server_id", servers_ordered);

    let sql = format!(
        "WITH candidates AS (
           SELECT
             t.rowid AS tid,
             t.server_id,
             COALESCE(NULLIF(t.artist_id, ''), t.artist) AS artist_ref,
             k.artist_key,
             ({priority_sql}) AS priority_rank
           FROM track t
           LEFT JOIN {ATTACH_ALIAS}.track_cluster_key k
             ON k.server_id = t.server_id AND k.track_id = t.id
           WHERE t.deleted = 0
             AND t.server_id IN ({in_placeholders})
             AND COALESCE(t.artist, '') != ''
         ),
         partitioned AS (
           SELECT c.tid,
             CASE
               WHEN c.artist_key IS NULL THEN 'solo:' || c.server_id || ':' || c.artist_ref
               ELSE c.artist_key
             END AS merge_key,
             c.priority_rank
           FROM candidates c
         ),
         winners AS (
           SELECT tid,
             ROW_NUMBER() OVER (PARTITION BY merge_key ORDER BY priority_rank) AS rn
           FROM partitioned
         )
         SELECT
           t.server_id,
           COALESCE(NULLIF(t.artist_id, ''), t.artist),
           COALESCE(ar.name, t.artist),
           COALESCE(ar.album_count, (
             SELECT COUNT(DISTINCT c.album_id) FROM track c
              WHERE c.server_id = t.server_id
                AND c.deleted = 0
                AND c.album_id IS NOT NULL
                AND (c.artist_id = t.artist_id OR c.artist = t.artist)
           )),
           COALESCE(ar.synced_at, t.synced_at),
           ar.raw_json
         FROM winners w
         JOIN track t ON t.rowid = w.tid
         LEFT JOIN artist ar ON ar.server_id = t.server_id
           AND ar.id = COALESCE(NULLIF(t.artist_id, ''), t.artist)
        WHERE w.rn = 1
        ORDER BY COALESCE(ar.name, t.artist) COLLATE NOCASE, t.server_id
        LIMIT ? OFFSET ?",
    );

    let mut params: Vec<SqlValue> = Vec::new();
    params.append(&mut priority_params);
    params.append(&mut in_params);
    params.push(SqlValue::Integer(limit as i64));
    params.push(SqlValue::Integer(offset as i64));

    let artists: Vec<LibraryArtistDto> = store.with_read_conn(|conn| {
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), map_artist_row)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
    })?;

    let has_more = artists.len() as u32 == limit;
    Ok(LibraryClusterArtistsResponse { artists, has_more })
}

fn map_artist_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryArtistDto> {
    let raw: Option<String> = r.get(5)?;
    Ok(LibraryArtistDto {
        server_id: r.get(0)?,
        id: r.get(1)?,
        name: r.get(2)?,
        album_count: r.get(3)?,
        synced_at: r.get(4)?,
        raw_json: raw
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(Value::Null),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repos::{TrackRepository, TrackRow};
    use crate::server_cluster::rebuild::rebuild_all_cluster_keys;

    fn track(server: &str, id: &str, artist: &str) -> TrackRow {
        TrackRow {
            server_id: server.into(),
            id: id.into(),
            title: "Song".into(),
            title_sort: None,
            artist: Some(artist.into()),
            artist_id: Some(format!("art-{server}")),
            album: "LP".into(),
            album_id: Some("alb1".into()),
            album_artist: Some(artist.into()),
            duration_sec: 200,
            track_number: Some(1),
            disc_number: Some(1),
            year: None,
            genre: None,
            suffix: None,
            bit_rate: None,
            size_bytes: None,
            cover_art_id: None,
            starred_at: None,
            user_rating: None,
            play_count: None,
            played_at: None,
            server_path: None,
            library_id: None,
            isrc: None,
            mbid_recording: None,
            bpm: None,
            replay_gain_track_db: None,
            replay_gain_album_db: None,
            content_hash: None,
            server_updated_at: None,
            server_created_at: None,
            deleted: false,
            synced_at: 1,
            raw_json: "{}".into(),
        }
    }

    #[test]
    fn merge_collapses_same_artist_key_by_priority() {
        let store = LibraryStore::open_in_memory();
        TrackRepository::new(&store)
            .upsert_batch(&[track("s1", "t1", "Band"), track("s2", "t2", "Band")])
            .unwrap();
        rebuild_all_cluster_keys(&store).unwrap();

        let resp = list_merged_artists(&store, &["s1".into(), "s2".into()], 50, 0).unwrap();
        assert_eq!(resp.artists.len(), 1);
        assert_eq!(resp.artists[0].server_id, "s1");
    }
}
