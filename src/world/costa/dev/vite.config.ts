import { defineConfig } from "vite";

// Standalone coast harness: bunx vite --config src/world/costa/dev/vite.config.ts --port 5231
// Open http://localhost:5231/?lang=es  (`&from=cusco` arrives through the punku)
export default defineConfig({
  root: "src/world/costa/dev",
  server: { fs: { allow: ["../../../.."] }, hmr: false, watch: null },
  logLevel: "warn",
});
