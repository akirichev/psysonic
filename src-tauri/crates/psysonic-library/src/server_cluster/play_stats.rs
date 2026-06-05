//! Cluster-scoped player statistics — aggregate `play_session` across members (spec §4 Tier 2).

use rusqlite::types::Value as SqlValue;

use crate::dto::{
    PlaySessionHeatmapDayDto, PlaySessionYearSummaryDto,
};
use crate::store::LibraryStore;

use super::db::ATTACH_ALIAS;
use super::priority::in_list_sql;

fn server_filter_sql(servers_ordered: &[String]) -> Result<(String, Vec<SqlValue>), String> {
    if servers_ordered.is_empty() {
        return Err("servers_ordered required".into());
    }
    let (placeholders, params) = in_list_sql(servers_ordered);
    Ok((format!("ps.server_id IN ({placeholders})"), params))
}

fn unique_track_expr() -> &'static str {
    "COALESCE(k.cluster_key, ps.server_id || ':' || ps.track_id)"
}

fn count_listening_sessions(plays: &[(i64, f64)]) -> u32 {
    const GAP_MS: i64 = 30 * 60 * 1000;
    if plays.is_empty() {
        return 0;
    }
    let mut sorted = plays.to_vec();
    sorted.sort_by_key(|p| p.0);
    let mut sessions = 1u32;
    let mut prev_end = sorted[0].0 + (sorted[0].1 * 1000.0) as i64;
    for (started, listened) in sorted.iter().skip(1) {
        if *started - prev_end > GAP_MS {
            sessions += 1;
        }
        let end = *started + (*listened * 1000.0) as i64;
        prev_end = prev_end.max(end);
    }
    sessions
}

pub fn cluster_year_summary(
    store: &LibraryStore,
    servers_ordered: &[String],
    year: i32,
) -> Result<PlaySessionYearSummaryDto, String> {
    let (server_sql, mut params) = server_filter_sql(servers_ordered)?;
    let year_str = year.to_string();
    let unique = unique_track_expr();

    store
        .with_read_conn(|conn| {
            let sql = format!(
                "SELECT \
                   COALESCE(SUM(ps.listened_sec), 0.0), \
                   COUNT(*), \
                   COUNT(DISTINCT {unique}), \
                   COUNT(DISTINCT date(ps.started_at_ms / 1000, 'unixepoch', 'localtime')), \
                   COALESCE(SUM(CASE WHEN ps.completion = 'full' THEN 1 ELSE 0 END), 0), \
                   COALESCE(SUM(CASE WHEN ps.completion = 'partial' THEN 1 ELSE 0 END), 0) \
                 FROM play_session ps \
                 LEFT JOIN {ATTACH_ALIAS}.track_cluster_key k \
                   ON k.server_id = ps.server_id AND k.track_id = ps.track_id \
                 WHERE {server_sql} \
                   AND strftime('%Y', ps.started_at_ms / 1000, 'unixepoch', 'localtime') = ?",
            );
            params.push(SqlValue::Text(year_str.clone()));

            let totals = conn.query_row(
                &sql,
                rusqlite::params_from_iter(params.iter()),
                |row| {
                    Ok((
                        row.get::<_, f64>(0)?,
                        row.get::<_, i64>(1)? as u32,
                        row.get::<_, i64>(2)? as u32,
                        row.get::<_, i64>(3)? as u32,
                        row.get::<_, i64>(4)? as u32,
                        row.get::<_, i64>(5)? as u32,
                    ))
                },
            )?;

            let plays_sql = format!(
                "SELECT ps.started_at_ms, ps.listened_sec \
                 FROM play_session ps \
                 WHERE {server_sql} \
                   AND strftime('%Y', ps.started_at_ms / 1000, 'unixepoch', 'localtime') = ? \
                 ORDER BY ps.started_at_ms ASC",
            );
            let mut play_params = params[..params.len() - 1].to_vec();
            play_params.push(SqlValue::Text(year_str));

            let mut stmt = conn.prepare(&plays_sql)?;
            let plays = stmt
                .query_map(rusqlite::params_from_iter(play_params.iter()), |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, f64>(1)?))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;

            let (
                total_listened_sec,
                track_play_count,
                unique_track_count,
                listening_day_count,
                full_count,
                partial_count,
            ) = totals;
            Ok(PlaySessionYearSummaryDto {
                total_listened_sec,
                session_count: count_listening_sessions(&plays),
                track_play_count,
                unique_track_count,
                listening_day_count,
                full_count,
                partial_count,
            })
        })
        .map_err(|e| e.to_string())
}

pub fn cluster_heatmap(
    store: &LibraryStore,
    servers_ordered: &[String],
    year: i32,
) -> Result<Vec<PlaySessionHeatmapDayDto>, String> {
    let (server_sql, mut params) = server_filter_sql(servers_ordered)?;
    params.push(SqlValue::Text(year.to_string()));

    store
        .with_read_conn(|conn| {
            let sql = format!(
                "SELECT \
                   date(ps.started_at_ms / 1000, 'unixepoch', 'localtime') AS d, \
                   COUNT(*) AS n \
                 FROM play_session ps \
                 WHERE {server_sql} \
                   AND strftime('%Y', ps.started_at_ms / 1000, 'unixepoch', 'localtime') = ? \
                 GROUP BY d \
                 ORDER BY d ASC",
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt
                .query_map(rusqlite::params_from_iter(params.iter()), |row| {
                    Ok(PlaySessionHeatmapDayDto {
                        date: row.get(0)?,
                        track_play_count: row.get::<_, i64>(1)? as u32,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows)
        })
        .map_err(|e| e.to_string())
}
