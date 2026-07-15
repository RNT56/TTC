# Contributing to ForgedTTC

Start with [`AGENTS.md`](AGENTS.md), then read the current project state, relevant
TODO row, system document, compatibility policy, and repository governance contract.

## Find the right contribution

- New contributors should start from a maintainer-curated
  [`good first issue`](https://github.com/RNT56/TTC/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
  and follow [`docs/CONTRIBUTOR-ONBOARDING.md`](docs/CONTRIBUTOR-ONBOARDING.md).
- Reproducible defects and proposals use the structured GitHub forms. Include the
  current commit and sanitized evidence.
- Vulnerabilities, credentials, private data, or unsafe hardware authority use
  [private reporting](https://github.com/RNT56/TTC/security/advisories/new), never a
  public issue.

For a curated issue, comment with the focused command you will run and ask to be
assigned before editing. A maintainer confirms that the task is still current and
assigns it; a comment alone is not a reservation. First issues never require secrets,
paid providers, production access, migrations, public-format authority, golden
re-pins, or hardware.

## Development setup

Required: Rust 1.96.0 via the committed toolchain, Node 22.13+, pnpm 11.13.0, Python
3.11+ (3.12 in CI), and the `wasm32-unknown-unknown` target.

```bash
pnpm install --frozen-lockfile
python3 -m pip install -e 'workers[dev]'
pnpm verify
```

Database changes additionally require Docker and `pnpm verify:db`. Native Desktop
changes require `pnpm verify:desktop-native` on macOS or the protected macOS check.

## Change protocol

1. Open or reference a stable `docs/TODO.md` item and work on a `codex/` or focused
   feature branch.
2. Change behavior at the owning architectural layer; never duplicate validator
   truth in presentation code.
3. Add success, failure, boundary, and authorization tests. Schema/report/API changes
   follow [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md).
4. Update invalidated living docs and add a newest-first changelog entry.
5. Run the narrow gates while iterating and the full relevant gate before requesting
   review. Report skips and unavailable prerequisites honestly.
6. Submit a current pull request and resolve every review thread. Direct ordinary
   pushes to `main` are prohibited.

If the task grows beyond its issue, stop and ask the maintainer to split or re-scope
it. Follow-up ideas belong in separate issues; `good first issue` does not reduce the
normal correctness, evidence, licensing, or protected-check bar.

## Licensing

The repository has two license zones. Contributions to `crates/`, `schema/`, and
`examples/` are Apache-2.0. Contributions elsewhere are accepted only under the
grant described in [`LICENSE`](LICENSE). By submitting a contribution, you confirm
you have the right to provide it under the applicable terms.

No generated or imported asset may be added without provenance and redistribution
rights. Never commit secrets, personal data, unreviewed catalog claims, or prohibited
weapons/targeting functionality.
