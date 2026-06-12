//! Deterministic transcendental math for the core crates (D17/XT-001).
//!
//! `f64::sin` & friends resolve to the platform libm natively but to Rust's
//! bundled implementation on wasm32 — and they disagree by ULPs on real
//! inputs (the golden-number suite caught exactly this on the hrx7/vx2-hornet
//! bakes). Core code therefore routes every non-correctly-rounded operation
//! through the pure-Rust `libm` crate, which compiles to identical bits on
//! every target. IEEE-correctly-rounded ops (`sqrt`, arithmetic, `abs`,
//! `floor`, …) stay on the std intrinsics — they cannot diverge.

#![forbid(unsafe_code)]
#![no_std]

#[inline]
pub fn sin(x: f64) -> f64 {
    libm::sin(x)
}

#[inline]
pub fn cos(x: f64) -> f64 {
    libm::cos(x)
}

#[inline]
pub fn sin_cos(x: f64) -> (f64, f64) {
    (libm::sin(x), libm::cos(x))
}

#[inline]
pub fn acos(x: f64) -> f64 {
    libm::acos(x)
}

#[inline]
pub fn asin(x: f64) -> f64 {
    libm::asin(x)
}

#[inline]
pub fn atan2(y: f64, x: f64) -> f64 {
    libm::atan2(y, x)
}

#[inline]
pub fn pow(x: f64, y: f64) -> f64 {
    libm::pow(x, y)
}

#[cfg(test)]
mod tests {
    #[test]
    fn matches_std_closely() {
        // sanity: libm agrees with std well within 1 ULP-ish tolerance on a
        // few representative values (exact equality is NOT required vs std —
        // only across our own targets, which the golden suite enforces)
        for x in [0.1f64, 0.5, 1.0, 2.0, 6.2831853 / 22.0 * 7.0] {
            assert!((super::sin(x) - x.sin()).abs() < 1e-15);
            assert!((super::cos(x) - x.cos()).abs() < 1e-15);
        }
    }
}
