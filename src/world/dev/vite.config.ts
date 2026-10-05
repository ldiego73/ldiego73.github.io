import { defineConfig } from "vite";

// Standalone harness: bunx vite --config src/world/dev/vite.config.ts --port 5191
// Open http://localhost:5191/?lang=es  (add &skip=1 to start in the world)
export default defineConfig({
  root: "src/world/dev",
  server: { fs: { allow: ["../../.."] }, hmr: false, watch: null },
  logLevel: "warn",
});
