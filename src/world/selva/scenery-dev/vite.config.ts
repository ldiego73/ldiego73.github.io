import { defineConfig } from "vite";

// Scenery-only harness for the jungle world: bunx vite --config src/world/selva/scenery-dev/vite.config.ts --port 5204
export default defineConfig({
  root: "src/world/selva/scenery-dev",
  server: { fs: { allow: ["../../../.."] } },
  logLevel: "warn",
});
