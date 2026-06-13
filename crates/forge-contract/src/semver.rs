//! Minimal semver for componentRef ranges (D5): exactly the three forms the
//! contract grammar admits — exact `1.2.3`, caret `^1.2.3`, tilde `~1.2.3`.
//! Deliberately NOT a general semver implementation (no prerelease/build
//! metadata, no comparators) — catalog revisions are plain x.y.z by schema.

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Version {
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
}

impl Version {
    pub fn parse(s: &str) -> Option<Version> {
        let mut it = s.split('.');
        let (a, b, c) = (it.next()?, it.next()?, it.next()?);
        if it.next().is_some() {
            return None;
        }
        // reject empty / signs / leading-zero ambiguity is tolerated (catalog
        // emits canonical numbers); non-digits reject
        let num = |t: &str| -> Option<u64> {
            if t.is_empty() || !t.bytes().all(|b| b.is_ascii_digit()) {
                None
            } else {
                t.parse().ok()
            }
        };
        Some(Version {
            major: num(a)?,
            minor: num(b)?,
            patch: num(c)?,
        })
    }
}

impl std::fmt::Display for Version {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Range {
    Exact(Version),
    /// `^x.y.z`: compatible within the leftmost non-zero component.
    Caret(Version),
    /// `~x.y.z`: patch-level changes only.
    Tilde(Version),
}

impl Range {
    pub fn parse(s: &str) -> Option<Range> {
        if let Some(rest) = s.strip_prefix('^') {
            Some(Range::Caret(Version::parse(rest)?))
        } else if let Some(rest) = s.strip_prefix('~') {
            Some(Range::Tilde(Version::parse(rest)?))
        } else {
            Some(Range::Exact(Version::parse(s)?))
        }
    }

    pub fn matches(&self, v: Version) -> bool {
        match *self {
            Range::Exact(base) => v == base,
            Range::Tilde(base) => v >= base && v.major == base.major && v.minor == base.minor,
            Range::Caret(base) => {
                if v < base {
                    return false;
                }
                if base.major > 0 {
                    v.major == base.major
                } else if base.minor > 0 {
                    v.major == 0 && v.minor == base.minor
                } else {
                    v == base
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(s: &str) -> Version {
        Version::parse(s).unwrap()
    }

    #[test]
    fn parses_and_orders() {
        assert!(v("1.2.3") < v("1.10.0"));
        assert!(v("2.0.0") > v("1.99.99"));
        assert_eq!(v("1.2.3").to_string(), "1.2.3");
        assert!(Version::parse("1.2").is_none());
        assert!(Version::parse("1.2.3.4").is_none());
        assert!(Version::parse("1.2.x").is_none());
        assert!(Version::parse("-1.2.3").is_none());
    }

    #[test]
    fn caret_semantics() {
        let r = Range::parse("^1.2.3").unwrap();
        assert!(r.matches(v("1.2.3")) && r.matches(v("1.9.0")));
        assert!(!r.matches(v("2.0.0")) && !r.matches(v("1.2.2")));
        // 0.y.z: minor is the compatibility boundary
        let r0 = Range::parse("^0.3.1").unwrap();
        assert!(r0.matches(v("0.3.9")) && !r0.matches(v("0.4.0")));
        // 0.0.z: exact only
        let r00 = Range::parse("^0.0.4").unwrap();
        assert!(r00.matches(v("0.0.4")) && !r00.matches(v("0.0.5")));
    }

    #[test]
    fn tilde_and_exact_semantics() {
        let t = Range::parse("~1.2.3").unwrap();
        assert!(t.matches(v("1.2.9")) && !t.matches(v("1.3.0")) && !t.matches(v("1.2.2")));
        let e = Range::parse("1.2.3").unwrap();
        assert!(e.matches(v("1.2.3")) && !e.matches(v("1.2.4")));
    }
}
