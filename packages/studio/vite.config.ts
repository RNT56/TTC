import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // COOP/COEP: the Chromium floor for SharedArrayBuffer once the core facade
  // ticks in a worker (D15/D16). Harmless for the v0 artifact viewer.
  build: {
    rollupOptions: {
      output: {
        // three + postprocessing in their own chunk: first paint races the
        // wasm download instead of waiting behind a 500 kB vendor bundle
        manualChunks: { three: ["three", "n8ao"] },
      },
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
