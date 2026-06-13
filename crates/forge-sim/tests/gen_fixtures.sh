#!/bin/sh
# Regenerate the XC-04 golden fixtures after an intentional exporter change.
# Run from crates/forge-sim; review the diff before committing.
set -e
cargo run -q -p forge-validate -- bake ../../examples/vx2-mini.forge.json >/dev/null
cargo test -p forge-sim --quiet export -- --ignored 2>/dev/null || true
echo "fixtures are written by tests/write_fixtures.rs — run: cargo test -p forge-sim --test write_fixtures -- --ignored"
