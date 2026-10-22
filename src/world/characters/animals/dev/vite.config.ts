import { defineConfig } from "vite";

// Animals harness (lineup old vs new, gait strips, LODs, crowds, mounts):
//   bunx vite --config src/world/characters/animals/dev/vite.config.ts --port 5262
// Open http://localhost:5262/?view=lineup|strip|lod|crowd|ride (&group=camelids, &species=llama, &mode=walk)
export default defineConfig({
  root: "src/world/characters/animals/dev",
  server: { fs: { allow: ["../../../../.."] }, hmr: false, watch: null },
  logLevel: "warn",
});
