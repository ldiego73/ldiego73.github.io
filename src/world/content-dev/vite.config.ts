import { defineConfig } from "vite";

// Content-only harness with a mock WorldEnv: bunx vite --config src/world/content-dev/vite.config.ts --port 5192
export default defineConfig({
  root: "src/world/content-dev",
  server: { fs: { allow: ["../../.."] } },
  logLevel: "warn",
});
