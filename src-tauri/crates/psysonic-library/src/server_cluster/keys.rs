//! Derive `cluster_key`, `album_key`, and `artist_key` from track metadata.

use std::hash::{Hash, Hasher};

use twox_hash::XxHash64;

use super::norm::norm_field;

const FIELD_SEP: u8 = 0x1f;

/// Precomputed keys for one track. `None` when any required field normalizes empty.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrackClusterKeys {
    pub cluster_key: String,
    pub album_key: String,
    pub artist_key: String,
}

fn effective_artist<'a>(artist: Option<&'a str>, album_artist: Option<&'a str>) -> Option<&'a str> {
    artist
        .filter(|s| !s.is_empty())
        .or_else(|| album_artist.filter(|s| !s.is_empty()))
}

fn effective_album_artist<'a>(
    album_artist: Option<&'a str>,
    artist: Option<&'a str>,
) -> Option<&'a str> {
    album_artist
        .filter(|s| !s.is_empty())
        .or_else(|| artist.filter(|s| !s.is_empty()))
}

fn hash_parts(parts: &[&str], sep: Option<u8>) -> String {
    let mut hasher = XxHash64::with_seed(0);
    for (i, part) in parts.iter().enumerate() {
        if i > 0 {
            if let Some(sep) = sep {
                sep.hash(&mut hasher);
            }
        }
        part.hash(&mut hasher);
    }
    format!("{:016x}", hasher.finish())
}

/// Compute cluster identity keys from raw track fields (spec §2.1–2.5).
pub fn compute_track_cluster_keys(
    artist: Option<&str>,
    album_artist: Option<&str>,
    title: &str,
    album: &str,
) -> Option<TrackClusterKeys> {
    let artist_src = effective_artist(artist, album_artist)?;
    let norm_artist = norm_field(artist_src);
    let norm_title = norm_field(title);
    let norm_album = norm_field(album);
    if norm_artist.is_empty() || norm_title.is_empty() || norm_album.is_empty() {
        return None;
    }

    let cluster_key = hash_parts(&[&norm_artist, &norm_title, &norm_album], Some(FIELD_SEP));

    let album_artist_src = effective_album_artist(album_artist, artist).unwrap_or(artist_src);
    let norm_album_artist = norm_field(album_artist_src);
    let album_key = hash_parts(&[&norm_album_artist, &norm_album], None);
    let artist_key = hash_parts(&[&norm_artist], None);

    Some(TrackClusterKeys {
        cluster_key,
        album_key,
        artist_key,
    })
}

/// Stable cross-server artist merge key from display name alone (spec §2.5).
pub fn artist_key_from_display_name(name: &str) -> Option<String> {
    let norm = norm_field(name);
    if norm.is_empty() {
        return None;
    }
    Some(hash_parts(&[&norm], None))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_metadata_yields_same_keys() {
        let a = compute_track_cluster_keys(
            Some("Artist"),
            None,
            "Title",
            "Album",
        )
        .unwrap();
        let b = compute_track_cluster_keys(
            Some("artist"),
            None,
            "title",
            "album",
        )
        .unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn artist_falls_back_to_album_artist_for_cluster_key() {
        let with = compute_track_cluster_keys(None, Some("Band"), "Song", "LP").unwrap();
        let direct = compute_track_cluster_keys(Some("Band"), None, "Song", "LP").unwrap();
        assert_eq!(with.cluster_key, direct.cluster_key);
    }

    #[test]
    fn empty_title_or_album_yields_none() {
        assert!(compute_track_cluster_keys(Some("A"), None, "", "Album").is_none());
        assert!(compute_track_cluster_keys(Some("A"), None, "Title", "").is_none());
        assert!(compute_track_cluster_keys(None, None, "Title", "Album").is_none());
    }

    #[test]
    fn artist_key_from_display_name_matches_track_derived_key() {
        let from_track = compute_track_cluster_keys(Some("Pink Floyd"), None, "x", "y").unwrap();
        let from_name = artist_key_from_display_name("Pink Floyd").unwrap();
        assert_eq!(from_track.artist_key, from_name);
    }

    #[test]
    fn punctuation_insensitive_cluster_key() {
        let a = compute_track_cluster_keys(Some("Pink Floyd"), None, "Time", "Dark Side").unwrap();
        let b = compute_track_cluster_keys(Some("Pink Floyd"), None, "Time!", "Dark Side.").unwrap();
        assert_eq!(a.cluster_key, b.cluster_key);
    }
}
