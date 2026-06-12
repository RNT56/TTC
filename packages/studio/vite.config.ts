import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // COOP/COEP: the Chromium floor for SharedArrayBuffer once the core facade
  // ticks in a worker (D15/D16). Harmless for the v0 artifact viewer.
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
