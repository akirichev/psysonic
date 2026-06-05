//! Batch rebuild of `track_cluster_key` — source of truth for cluster identity.

use rusqlite::{params, Transaction};

use crate::store::LibraryStore;

use super::db::{self, ATTACH_ALIAS, NORM_VERSION};
use super::keys::compute_track_cluster_keys;

const REBUILD_BATCH_SIZE: usize = 5_000;

struct TrackRow {
    server_id: String,
    track_id: String,
    artist: Option<String>,
    album_artist: Option<String>,
    title: String,
    album: String,
    duration_sec: i64,
}

fn fetch_live_tracks(
    tx: &Transaction<'_>,
    server_id: Option<&str>,
) -> rusqlite::Result<Vec<TrackRow>> {
    let (sql, bind): (&str, Option<&str>) = match server_id {
        Some(_) => (
            "SELECT server_id, id, artist, album_artist, title, album, duration_sec \
             FROM track WHERE deleted = 0 AND server_id = ?1",
            server_id,
        ),
        None => (
            "SELECT server_id, id, artist, album_artist, title, album, duration_sec \
             FROM track WHERE deleted = 0",
            None,
        ),
    };
    let mut stmt = tx.prepare(sql)?;
    let rows = match bind {
        Some(sid) => stmt.query_map(params![sid], map_track_row)?.collect(),
        None => stmt.query_map([], map_track_row)?.collect(),
    };
    rows
}

fn map_track_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TrackRow> {
    Ok(TrackRow {
        server_id: row.get(0)?,
        track_id: row.get(1)?,
        artist: row.get(2)?,
        album_artist: row.get(3)?,
        title: row.get(4)?,
        album: row.get(5)?,
        duration_sec: row.get(6)?,
    })
}

fn upsert_batch(tx: &Transaction<'_>, batch: &[(TrackRow, super::keys::TrackClusterKeys)]) -> rusqlite::Result<()> {
    let mut stmt = tx.prepare(&format!(
        "INSERT INTO {ATTACH_ALIAS}.track_cluster_key \
         (server_id, track_id, cluster_key, album_key, artist_key, duration_sec) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT(server_id, track_id) DO UPDATE SET \
           cluster_key = excluded.cluster_key, \
           album_key = excluded.album_key, \
           artist_key = excluded.artist_key, \
           duration_sec = excluded.duration_sec"
    ))?;
    for (row, keys) in batch {
        stmt.execute(params![
            row.server_id,
            row.track_id,
            keys.cluster_key,
            keys.album_key,
            keys.artist_key,
            row.duration_sec,
        ])?;
    }
    Ok(())
}

fn rebuild_in_tx(
    tx: &Transaction<'_>,
    server_id: Option<&str>,
    clear_scope: bool,
) -> rusqlite::Result<u32> {
    if clear_scope {
        match server_id {
            Some(sid) => {
                tx.execute(
                    &format!("DELETE FROM {ATTACH_ALIAS}.track_cluster_key WHERE server_id = ?1"),
                    params![sid],
                )?;
            }
            None => {
                tx.execute(
                    &format!("DELETE FROM {ATTACH_ALIAS}.track_cluster_key"),
                    [],
                )?;
            }
        }
    }

    let tracks = fetch_live_tracks(tx, server_id)?;
    let mut written = 0u32;
    let mut batch: Vec<(TrackRow, super::keys::TrackClusterKeys)> = Vec::new();

    for row in tracks {
        let Some(keys) = compute_track_cluster_keys(
            row.artist.as_deref(),
            row.album_artist.as_deref(),
            &row.title,
            &row.album,
        ) else {
            continue;
        };
        batch.push((row, keys));
        if batch.len() >= REBUILD_BATCH_SIZE {
            upsert_batch(tx, &batch)?;
            written = written.saturating_add(batch.len() as u32);
            batch.clear();
        }
    }
    if !batch.is_empty() {
        upsert_batch(tx, &batch)?;
        written = written.saturating_add(batch.len() as u32);
    }

    tx.execute(
        &format!(
            "INSERT INTO {ATTACH_ALIAS}.cluster_meta (key, value) VALUES ('norm_version', ?1) \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ),
        params![NORM_VERSION],
    )?;

    Ok(written)
}

/// Rebuild cluster keys for every live track in the library index.
pub fn rebuild_all_cluster_keys(store: &LibraryStore) -> Result<u32, String> {
    store.with_conn_mut("cluster_rebuild_all", |conn| {
        let tx = conn.transaction()?;
        let count = rebuild_in_tx(&tx, None, true)?;
        tx.commit()?;
        Ok(count)
    })
}

/// Rebuild cluster keys for one server's live tracks (deletes stale rows first).
pub fn rebuild_cluster_keys_for_server(
    store: &LibraryStore,
    server_id: &str,
) -> Result<u32, String> {
    store.with_conn_mut("cluster_rebuild_server", |conn| {
        let tx = conn.transaction()?;
        let count = rebuild_in_tx(&tx, Some(server_id), true)?;
        tx.commit()?;
        Ok(count)
    })
}

/// Rebuild when `cluster_meta.norm_version` lags the compiled rules.
pub fn rebuild_if_norm_version_stale(store: &LibraryStore) -> Result<Option<u32>, String> {
    let stale = store.with_conn("cluster_norm_check", db::needs_norm_rebuild)?;
    if !stale {
        return Ok(None);
    }
    rebuild_all_cluster_keys(store).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::LibraryStore;
    use rusqlite::params;

    fn seed_track(
        store: &LibraryStore,
        server: &str,
        id: &str,
        artist: &str,
        title: &str,
        album: &str,
        duration: i64,
    ) {
        store
            .with_conn_mut("misc", |conn| {
                conn.execute(
                    "INSERT INTO track (server_id, id, title, artist, album, duration_sec, synced_at, raw_json) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, '{}')",
                    params![server, id, title, artist, album, duration],
                )
            })
            .unwrap();
    }

    #[test]
    fn rebuild_is_idempotent() {
        let store = LibraryStore::open_in_memory();
        seed_track(&store, "s1", "t1", "Artist", "Song", "Album", 200);
        seed_track(&store, "s2", "t2", "Artist", "Song", "Album", 205);

        let first = rebuild_all_cluster_keys(&store).unwrap();
        assert_eq!(first, 2);

        let count_after: i64 = store
            .with_conn("misc", |c| {
                c.query_row(
                    &format!("SELECT COUNT(*) FROM {ATTACH_ALIAS}.track_cluster_key"),
                    [],
                    |r| r.get(0),
                )
            })
            .unwrap();
        assert_eq!(count_after, 2);

        let second = rebuild_all_cluster_keys(&store).unwrap();
        assert_eq!(second, 2);
        let count_again: i64 = store
            .with_conn("misc", |c| {
                c.query_row(
                    &format!("SELECT COUNT(*) FROM {ATTACH_ALIAS}.track_cluster_key"),
                    [],
                    |r| r.get(0),
                )
            })
            .unwrap();
        assert_eq!(count_again, 2);
    }

    #[test]
    fn tracks_with_empty_fields_get_no_row() {
        let store = LibraryStore::open_in_memory();
        seed_track(&store, "s1", "t1", "", "Song", "Album", 100);
        seed_track(&store, "s1", "t2", "Artist", "Song", "Album", 100);

        let written = rebuild_all_cluster_keys(&store).unwrap();
        assert_eq!(written, 1);

        let count: i64 = store
            .with_conn("misc", |c| {
                c.query_row(
                    &format!("SELECT COUNT(*) FROM {ATTACH_ALIAS}.track_cluster_key"),
                    [],
                    |r| r.get(0),
                )
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn same_cluster_key_across_servers_after_rebuild() {
        let store = LibraryStore::open_in_memory();
        seed_track(&store, "s1", "t1", "Band", "Hit", "LP", 180);
        seed_track(&store, "s2", "t9", "Band", "Hit", "LP", 182);
        rebuild_all_cluster_keys(&store).unwrap();

        let keys: Vec<String> = store
            .with_conn("misc", |c| {
                let mut stmt = c.prepare(&format!(
                    "SELECT cluster_key FROM {ATTACH_ALIAS}.track_cluster_key ORDER BY server_id"
                ))?;
                let rows: rusqlite::Result<Vec<String>> =
                    stmt.query_map([], |r| r.get(0))?.collect();
                rows
            })
            .unwrap();
        assert_eq!(keys.len(), 2);
        assert_eq!(keys[0], keys[1]);
    }

    #[test]
    fn per_server_rebuild_replaces_stale_rows() {
        let store = LibraryStore::open_in_memory();
        seed_track(&store, "s1", "t1", "A", "One", "X", 1);
        seed_track(&store, "s2", "t1", "B", "Two", "Y", 2);
        rebuild_all_cluster_keys(&store).unwrap();

        store
            .with_conn_mut("misc", |conn| {
                conn.execute(
                    "UPDATE track SET title = 'Updated' WHERE server_id = 's1' AND id = 't1'",
                    [],
                )
            })
            .unwrap();

        rebuild_cluster_keys_for_server(&store, "s1").unwrap();

        let title_norm_row: Option<String> = store
            .with_conn("misc", |c| {
                use rusqlite::OptionalExtension;
                c.query_row(
                    &format!(
                        "SELECT k.cluster_key FROM {ATTACH_ALIAS}.track_cluster_key k \
                         JOIN track t ON t.server_id = k.server_id AND t.id = k.track_id \
                         WHERE k.server_id = 's1' AND k.track_id = 't1'"
                    ),
                    [],
                    |r| r.get(0),
                )
                .optional()
            })
            .unwrap();
        assert!(title_norm_row.is_some());

        let s2_count: i64 = store
            .with_conn("misc", |c| {
                c.query_row(
                    &format!(
                        "SELECT COUNT(*) FROM {ATTACH_ALIAS}.track_cluster_key WHERE server_id = 's2'"
                    ),
                    [],
                    |r| r.get(0),
                )
            })
            .unwrap();
        assert_eq!(s2_count, 1);
    }

    #[test]
    fn norm_version_bump_triggers_full_rebuild() {
        let store = LibraryStore::open_in_memory();
        seed_track(&store, "s1", "t1", "Artist", "Old", "Album", 1);
        rebuild_all_cluster_keys(&store).unwrap();

        store
            .with_conn_mut("misc", |conn| {
                conn.execute(
                    &format!(
                        "UPDATE {ATTACH_ALIAS}.cluster_meta SET value = '0' WHERE key = 'norm_version'"
                    ),
                    [],
                )
            })
            .unwrap();

        assert!(
            store
                .with_conn("misc", db::needs_norm_rebuild)
                .unwrap()
        );

        let rebuilt = rebuild_if_norm_version_stale(&store).unwrap();
        assert_eq!(rebuilt, Some(1));

        let version: String = store
            .with_conn("misc", |c| {
                c.query_row(
                    &format!(
                        "SELECT value FROM {ATTACH_ALIAS}.cluster_meta WHERE key = 'norm_version'"
                    ),
                    [],
                    |r| r.get(0),
                )
            })
            .unwrap();
        assert_eq!(version, NORM_VERSION);
    }
}
