import { defineConfig } from "vite";

// Standalone Collasuyu harness: bunx vite --config src/world/titicaca/dev/vite.config.ts --port 5241
// Open http://localhost:5241/?lang=es
export default defineConfig({
  root: "src/world/titicaca/dev",
  server: { fs: { allow: ["../../../.."] }, hmr: false, watch: null },
  logLevel: "warn",
});
