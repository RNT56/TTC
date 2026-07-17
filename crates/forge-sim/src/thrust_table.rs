//! Thrust-table interpolation (XC-06): when a motor/prop combo has published
//! bench data, the table is truth and the blade-element-lite estimate retires.
//! Tables are finite rectangular grids over (voltage, throttle) → (thrust,
//! current), bilinearly interpolated. Callers that grant physical authority must
//! separately prove that the requested voltage/throttle domain is covered; the
//! generic lookup remains edge-clamped for deterministic interpolation.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThrustPoint {
    pub voltage: f64,
    /// Throttle u ∈ [0,1].
    pub throttle: f64,
    pub thrust_n: f64,
    pub current_a: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ThrustTable {
    voltages: Vec<f64>,
    throttles: Vec<f64>,
    /// row-major [voltage][throttle]
    thrust: Vec<f64>,
    current: Vec<f64>,
}

#[derive(Debug, PartialEq)]
pub enum TableError {
    Empty,
    NonFinite,
    OutOfBounds,
    NotAGrid { expected: usize, got: usize },
    DuplicatePoint,
    Unsorted,
    NonMonotonic,
}

impl std::fmt::Display for TableError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TableError::Empty => write!(f, "thrust table is empty"),
            TableError::NonFinite => write!(f, "thrust table values must be finite"),
            TableError::OutOfBounds => write!(
                f,
                "thrust table requires voltage in (0,1000], throttle in [0,1], and non-negative thrust/current"
            ),
            TableError::NotAGrid { expected, got } => {
                write!(
                    f,
                    "thrust table is not rectangular: expected {expected} points, got {got}"
                )
            }
            TableError::DuplicatePoint => {
                write!(f, "thrust table contains a duplicate voltage/throttle point")
            }
            TableError::Unsorted => write!(f, "thrust table grid axes must be strictly increasing"),
            TableError::NonMonotonic => write!(
                f,
                "thrust table thrust/current must be non-decreasing with throttle at each voltage"
            ),
        }
    }
}

impl std::error::Error for TableError {}

impl ThrustTable {
    /// Build from bench points; they must form a full rectangular grid.
    pub fn from_points(points: &[ThrustPoint]) -> Result<Self, TableError> {
        if points.is_empty() {
            return Err(TableError::Empty);
        }
        if points.iter().any(|point| {
            !point.voltage.is_finite()
                || !point.throttle.is_finite()
                || !point.thrust_n.is_finite()
                || !point.current_a.is_finite()
        }) {
            return Err(TableError::NonFinite);
        }
        if points.iter().any(|point| {
            point.voltage <= 0.0
                || point.voltage > 1_000.0
                || !(0.0..=1.0).contains(&point.throttle)
                || point.thrust_n < 0.0
                || point.current_a < 0.0
        }) {
            return Err(TableError::OutOfBounds);
        }
        for (index, point) in points.iter().enumerate() {
            if points[..index]
                .iter()
                .any(|other| other.voltage == point.voltage && other.throttle == point.throttle)
            {
                return Err(TableError::DuplicatePoint);
            }
        }
        let mut voltages: Vec<f64> = points.iter().map(|p| p.voltage).collect();
        let mut throttles: Vec<f64> = points.iter().map(|p| p.throttle).collect();
        voltages.sort_by(f64::total_cmp);
        voltages.dedup();
        throttles.sort_by(f64::total_cmp);
        throttles.dedup();

        let expected = voltages.len() * throttles.len();
        if expected != points.len() {
            return Err(TableError::NotAGrid {
                expected,
                got: points.len(),
            });
        }
        let find = |axis: &[f64], v: f64| -> Result<usize, TableError> {
            axis.iter()
                .position(|a| a.total_cmp(&v).is_eq())
                .ok_or(TableError::Unsorted)
        };
        let mut thrust = vec![0.0; expected];
        let mut current = vec![0.0; expected];
        for p in points {
            let vi = find(&voltages, p.voltage)?;
            let ti = find(&throttles, p.throttle)?;
            thrust[vi * throttles.len() + ti] = p.thrust_n;
            current[vi * throttles.len() + ti] = p.current_a;
        }
        for vi in 0..voltages.len() {
            for ti in 1..throttles.len() {
                let previous = vi * throttles.len() + ti - 1;
                let current_index = vi * throttles.len() + ti;
                if thrust[current_index] < thrust[previous]
                    || current[current_index] < current[previous]
                {
                    return Err(TableError::NonMonotonic);
                }
            }
        }
        Ok(ThrustTable {
            voltages,
            throttles,
            thrust,
            current,
        })
    }

    /// Bilinear lookup, edge-clamped: returns (thrust_n, current_a).
    pub fn lookup(&self, voltage: f64, throttle: f64) -> (f64, f64) {
        let (vi, vf) = bracket(&self.voltages, voltage);
        let (ti, tf) = bracket(&self.throttles, throttle);
        let n_t = self.throttles.len();
        let at = |g: &[f64], i: usize, j: usize| g[i * n_t + j];
        let lerp2 = |g: &[f64]| {
            let a = at(g, vi, ti) * (1.0 - tf) + at(g, vi, (ti + 1).min(n_t - 1)) * tf;
            let vi1 = (vi + 1).min(self.voltages.len() - 1);
            let b = at(g, vi1, ti) * (1.0 - tf) + at(g, vi1, (ti + 1).min(n_t - 1)) * tf;
            a * (1.0 - vf) + b * vf
        };
        (lerp2(&self.thrust), lerp2(&self.current))
    }
}

/// Returns (lower index, fraction toward the next index), clamped to the axis.
fn bracket(axis: &[f64], v: f64) -> (usize, f64) {
    if v <= axis[0] {
        return (0, 0.0);
    }
    if v >= *axis.last().unwrap() {
        return (axis.len() - 1, 0.0);
    }
    for i in 0..axis.len() - 1 {
        if v < axis[i + 1] {
            return (i, (v - axis[i]) / (axis[i + 1] - axis[i]));
        }
    }
    (axis.len() - 1, 0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grid() -> ThrustTable {
        // thrust = 10·u·(v/16), current = 20·u² — easy closed forms
        let mut pts = Vec::new();
        for v in [12.0, 16.0] {
            for u in [0.0, 0.5, 1.0] {
                pts.push(ThrustPoint {
                    voltage: v,
                    throttle: u,
                    thrust_n: 10.0 * u * (v / 16.0),
                    current_a: 20.0 * u * u,
                });
            }
        }
        ThrustTable::from_points(&pts).unwrap()
    }

    #[test]
    fn exact_at_grid_points_and_interpolates_between() {
        let t = grid();
        let (thrust, current) = t.lookup(16.0, 1.0);
        assert!((thrust - 10.0).abs() < 1e-12 && (current - 20.0).abs() < 1e-12);
        // midpoint in both axes
        let (thrust, _) = t.lookup(14.0, 0.25);
        // u: between 0 and 0.5 → thrust linear in u within the cell
        let expect = 10.0 * 0.25 * (14.0 / 16.0);
        assert!((thrust - expect).abs() < 1e-9, "{thrust} vs {expect}");
    }

    #[test]
    fn clamps_at_edges() {
        let t = grid();
        let lo = t.lookup(5.0, -0.2);
        assert_eq!(lo, t.lookup(12.0, 0.0));
        let hi = t.lookup(99.0, 2.0);
        assert_eq!(hi, t.lookup(16.0, 1.0));
    }

    #[test]
    fn non_grid_is_rejected() {
        let pts = vec![
            ThrustPoint {
                voltage: 12.0,
                throttle: 0.0,
                thrust_n: 0.0,
                current_a: 0.0,
            },
            ThrustPoint {
                voltage: 16.0,
                throttle: 0.5,
                thrust_n: 1.0,
                current_a: 1.0,
            },
        ];
        assert!(matches!(
            ThrustTable::from_points(&pts),
            Err(TableError::NotAGrid { .. })
        ));
    }

    #[test]
    fn duplicate_non_finite_and_non_monotonic_points_are_rejected() {
        let duplicate = vec![
            ThrustPoint {
                voltage: 16.0,
                throttle: 0.0,
                thrust_n: 0.0,
                current_a: 0.0,
            },
            ThrustPoint {
                voltage: 16.0,
                throttle: 0.0,
                thrust_n: 1.0,
                current_a: 1.0,
            },
        ];
        assert_eq!(
            ThrustTable::from_points(&duplicate),
            Err(TableError::DuplicatePoint)
        );

        let mut invalid = duplicate.clone();
        invalid[1].throttle = f64::NAN;
        assert_eq!(
            ThrustTable::from_points(&invalid),
            Err(TableError::NonFinite)
        );

        let non_monotonic = vec![
            ThrustPoint {
                voltage: 16.0,
                throttle: 0.0,
                thrust_n: 2.0,
                current_a: 2.0,
            },
            ThrustPoint {
                voltage: 16.0,
                throttle: 1.0,
                thrust_n: 1.0,
                current_a: 1.0,
            },
        ];
        assert_eq!(
            ThrustTable::from_points(&non_monotonic),
            Err(TableError::NonMonotonic)
        );
    }
}
