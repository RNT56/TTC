# P7-012 protected consumer-hardware evidence

This directory closes P7-012 at **controlled consumer-hardware simulation**
maturity. It does not claim deployed GPU execution, electricity consumption,
external-user acceptance, real-device transfer, or field proof.

## Authority

- implementation PR: #72, exact head `1bce0d1f15a4a67ab4493f4de002f83e066aad54`
- PR checks: CI `29425066833`, security `29425066479`
- protected source: `8e094c0b70e83bb4ccf35cf9f4d78d6d9b00825e`
- protected checks: CI `29426237373`, security `29426237345`
- suite request SHA-256:
  `7b27f6f9f0469fe5c255528010d7ad9cc32c4c5f13c89d4baf66568d932c79bc`

The clean protected checkout was intentionally interrupted after the atomic
hover checkpoint. No `suite.json` existed at that point. The resume command reused
hover only after validating the frozen task request, ONNX byte count, SHA-256, and
export gate, then executed waypoint and wrote the passing suite atomically.

## Retained files

| File | Bytes | SHA-256 | Meaning |
|---|---:|---|---|
| `suite.json` | 6,439 | `2e9f64851ffe880723e30ef6674e5d5165d16375b5160a5f16e70553fc56996c` | frozen suite, recovery, hardware, runtime, result, energy, cost, and nonclaim summary |
| `hover-hold.json` | 11,117 | `47b5cfe5b2ba901f7fbe489e4608a4b6bb567bc5181c685b2299e40929ca6ac6` | seed 1201 exact task evidence |
| `hover-hold.onnx` | 78,152 | `9afc1152b0e99398652274a1b97c97d53292f51995784f03323094727866fc4c` | exact passing hover policy |
| `waypoint-chain.json` | 11,386 | `56d62f32bcd7e0e3fc699650176ed64c9911312dd0f6d45641a3b49def2694dd` | seed 1207 exact task evidence |
| `waypoint-chain.onnx` | 78,156 | `b07b023aa81c4c9d96f38a0f232e92277e5c71f51b0454fcbe1f722529edb1a2` | exact passing waypoint policy |

Both tasks score 1.0 on the eight-episode baseline and each held-out mass +15%,
Kv -8%, and wind 4 m/s row under unchanged 0.85/0.70 thresholds. Hover took
30.203 s task wall time and waypoint 10.340 s. The declared Apple M2 Pro host has a
19-core available MPS device, but the frozen MLP PPO recipe executes on CPU under
D43. Host-energy values are conservative 140 W adapter-rating-times-wall-time upper
bounds (1.175 Wh and 0.402 Wh), not measurements. Provider cost is zero for locally
owned hardware; electricity cost is deliberately null.

Independent reconciliation re-parsed all JSON, checked both ONNX graphs, recomputed
every byte count and SHA-256, rejected serial/UUID and inline model bytes, and
confirmed exact protected-source lineage.
