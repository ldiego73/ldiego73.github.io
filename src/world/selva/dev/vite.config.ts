import { defineConfig } from "vite";

// Standalone Antisuyu harness: bunx vite --config src/world/selva/dev/vite.config.ts --port 5203
// Open http://localhost:5203/?lang=es  (`&skip=1` is accepted for parity with the mountain; there is no title)
export default defineConfig({
  root: "src/world/selva/dev",
  server: { fs: { allow: ["../../../.."] }, hmr: false, watch: null },
  logLevel: "warn",
});
