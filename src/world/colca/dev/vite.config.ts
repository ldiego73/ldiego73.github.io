import { defineConfig } from "vite";

// Standalone Kuntisuyu harness: bunx vite --config src/world/colca/dev/vite.config.ts --port 5251
// Open http://localhost:5251/?lang=es
export default defineConfig({
  root: "src/world/colca/dev",
  server: { fs: { allow: ["../../../.."] }, hmr: false, watch: null },
  logLevel: "warn",
});
