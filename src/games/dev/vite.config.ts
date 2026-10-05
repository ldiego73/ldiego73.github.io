import { defineConfig } from "vite";

// Standalone harness: bunx vite --config src/games/dev/vite.config.ts --port <n>
// Open http://localhost:<n>/?game=<slug>&lang=es&theme=dark&autostart=1
export default defineConfig({
  root: "src/games/dev",
  server: { fs: { allow: ["../.."] } },
  logLevel: "warn",
});
