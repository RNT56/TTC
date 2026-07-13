import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const headers = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

const proxy = {
  "/v1": {
    target: process.env.FORGE_GATEWAY_PROXY ?? "http://127.0.0.1:8080",
    changeOrigin: true,
  },
  "/auth": {
    target: process.env.FORGE_GATEWAY_PROXY ?? "http://127.0.0.1:8080",
    changeOrigin: true,
  },
};

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
    headers,
    proxy,
  },
  // QA-002 exercises the production bundle without adding a second CORS
  // boundary. Preview must preserve the same headers and same-origin proxy as
  // the development/Compose surface.
  preview: {
    headers,
    proxy,
  },
});
