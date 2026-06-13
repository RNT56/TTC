#!/bin/sh
# Build the core WASM facade into the studio (committed so the studio builds
# without a Rust toolchain; regenerate after any core change).
set -e
pnpm exec wasm-pack build crates/forge-wasm --target web --release \
  --out-dir ../../packages/studio/src/wasm-pkg --out-name forge_wasm
rm -f packages/studio/src/wasm-pkg/.gitignore packages/studio/src/wasm-pkg/package.json
echo "facade: $(gzip -c packages/studio/src/wasm-pkg/forge_wasm_bg.wasm | wc -c) bytes gz (budget 2 MB)"
