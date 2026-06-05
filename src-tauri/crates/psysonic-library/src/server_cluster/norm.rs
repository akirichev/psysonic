//! Cheap Unicode normalization for cluster identity keys (spec §2.2).

use unicode_normalization::UnicodeNormalization;

/// NFD → drop combining marks → lowercase → letters/digits only.
pub fn norm_field(raw: &str) -> String {
    raw.nfd()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .flat_map(|c| c.to_lowercase())
        .filter(|c| c.is_alphanumeric())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_diacritics_and_punctuation() {
        assert_eq!(norm_field("Café"), "cafe");
        assert_eq!(norm_field("Mötley Crüe"), "motleycrue");
        assert_eq!(norm_field("Hello, World!"), "helloworld");
    }

    #[test]
    fn lowercases_and_removes_whitespace() {
        assert_eq!(norm_field("  Pink   FLOYD  "), "pinkfloyd");
        assert_eq!(norm_field("The\tBeatles\n"), "thebeatles");
    }

    #[test]
    fn preserves_unicode_letters_and_digits() {
        assert_eq!(norm_field("Sigur Rós"), "sigurros");
        assert_eq!(norm_field("Track 99"), "track99");
    }

    #[test]
    fn empty_or_non_alnum_only_becomes_empty() {
        assert_eq!(norm_field(""), "");
        assert_eq!(norm_field("   "), "");
        assert_eq!(norm_field("---"), "");
    }
}
