import { defineConfig } from "vite";

// Standalone Cusco hub harness: bunx vite --config src/world/cusco/dev/vite.config.ts --port 5221
// Open http://localhost:5221/?lang=es  (`&from=selva` or `&from=qhapaq` arrives through that punku)
export default defineConfig({
  root: "src/world/cusco/dev",
  server: { fs: { allow: ["../../../.."] }, hmr: false, watch: null },
  logLevel: "warn",
});
