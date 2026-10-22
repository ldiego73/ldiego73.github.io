import { defineConfig } from "vite";

// Characters prototype harness (old vs new, side by side):
//   bunx vite --config src/world/characters/dev/vite.config.ts --port 5261
// Open http://localhost:5261/  (?mode=walk|run|idle, ?time=day|dusk|night, ?view=front|three|side|back, ?rm=1)
export default defineConfig({
  root: "src/world/characters/dev",
  server: { fs: { allow: ["../../../.."] }, hmr: false, watch: null },
  logLevel: "warn",
});
