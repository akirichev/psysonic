//! Attached `library-cluster.db` schema and metadata.

use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};

pub const CLUSTER_DB_FILENAME: &str = "library-cluster.db";
pub const ATTACH_ALIAS: &str = "cluster";
pub const NORM_VERSION: &str = "1";

pub fn cluster_db_path(library_db_path: &Path) -> PathBuf {
    library_db_path.with_file_name(CLUSTER_DB_FILENAME)
}

fn escape_sqlite_path(path: &str) -> String {
    path.replace('\'', "''")
}

fn init_cluster_on_attached(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        &format!(
            "CREATE TABLE IF NOT EXISTS {ATTACH_ALIAS}.track_cluster_key (
               server_id    TEXT NOT NULL,
               track_id     TEXT NOT NULL,
               cluster_key  TEXT NOT NULL,
               album_key    TEXT,
               artist_key   TEXT,
               duration_sec INTEGER,
               PRIMARY KEY (server_id, track_id)
             )"
        ),
        [],
    )?;
    conn.execute(
        &format!(
            "CREATE INDEX IF NOT EXISTS {ATTACH_ALIAS}.idx_cluster_key \
             ON track_cluster_key(cluster_key)"
        ),
        [],
    )?;
    conn.execute(
        &format!(
            "CREATE INDEX IF NOT EXISTS {ATTACH_ALIAS}.idx_album_key \
             ON track_cluster_key(album_key)"
        ),
        [],
    )?;
    conn.execute(
        &format!(
            "CREATE INDEX IF NOT EXISTS {ATTACH_ALIAS}.idx_artist_key \
             ON track_cluster_key(artist_key)"
        ),
        [],
    )?;
    conn.execute(
        &format!(
            "CREATE TABLE IF NOT EXISTS {ATTACH_ALIAS}.cluster_meta (
               key TEXT PRIMARY KEY,
               value TEXT
             )"
        ),
        [],
    )?;
    init_cluster_meta(conn)?;
    Ok(())
}

fn init_cluster_file(cluster_path: &Path) -> rusqlite::Result<()> {
    let cluster_conn = Connection::open(cluster_path)?;
    cluster_conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS track_cluster_key (
           server_id    TEXT NOT NULL,
           track_id     TEXT NOT NULL,
           cluster_key  TEXT NOT NULL,
           album_key    TEXT,
           artist_key   TEXT,
           duration_sec INTEGER,
           PRIMARY KEY (server_id, track_id)
         );
         CREATE INDEX IF NOT EXISTS idx_cluster_key ON track_cluster_key(cluster_key);
         CREATE INDEX IF NOT EXISTS idx_album_key  ON track_cluster_key(album_key);
         CREATE INDEX IF NOT EXISTS idx_artist_key ON track_cluster_key(artist_key);
         CREATE TABLE IF NOT EXISTS cluster_meta (
           key TEXT PRIMARY KEY,
           value TEXT
         );",
    )?;
    cluster_conn.execute(
        "INSERT OR IGNORE INTO cluster_meta (key, value) VALUES ('norm_version', ?1)",
        params![NORM_VERSION],
    )?;
    Ok(())
}

/// Create or migrate the cluster file, then attach it to `conn`.
pub fn attach_cluster_database(conn: &Connection, cluster_path: &Path) -> rusqlite::Result<()> {
    if let Some(parent) = cluster_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_IOERR),
                Some(e.to_string()),
            )
        })?;
    }
    init_cluster_file(cluster_path)?;
    let path_str = escape_sqlite_path(&cluster_path.to_string_lossy());
    conn.execute_batch(&format!(
        "ATTACH DATABASE '{path_str}' AS {ATTACH_ALIAS}"
    ))?;
    Ok(())
}

/// In-memory cluster DB for tests — attach then init schema on the alias.
pub fn attach_cluster_database_uri(conn: &Connection, uri: &str) -> rusqlite::Result<()> {
    let path_str = escape_sqlite_path(uri);
    conn.execute_batch(&format!(
        "ATTACH DATABASE '{path_str}' AS {ATTACH_ALIAS}"
    ))?;
    init_cluster_on_attached(conn)
}

pub fn ensure_cluster_schema(conn: &Connection) -> rusqlite::Result<()> {
    init_cluster_on_attached(conn)
}

pub fn init_cluster_meta(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        &format!(
            "INSERT OR IGNORE INTO {ATTACH_ALIAS}.cluster_meta (key, value) VALUES ('norm_version', ?1)"
        ),
        params![NORM_VERSION],
    )?;
    Ok(())
}

pub fn stored_norm_version(conn: &Connection) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        &format!(
            "SELECT value FROM {ATTACH_ALIAS}.cluster_meta WHERE key = 'norm_version'"
        ),
        [],
        |row| row.get(0),
    )
    .optional()
}

pub fn needs_norm_rebuild(conn: &Connection) -> rusqlite::Result<bool> {
    Ok(stored_norm_version(conn)?.as_deref() != Some(NORM_VERSION))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_creates_cluster_tables_on_attach() {
        let conn = Connection::open_in_memory().unwrap();
        attach_cluster_database_uri(&conn, "file:cluster_mem?mode=memory&cache=shared").unwrap();
        let count: i64 = conn
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM {ATTACH_ALIAS}.sqlite_master \
                     WHERE type='table' AND name='track_cluster_key'"
                ),
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }
}
