/**
 * Main-thread check for the animal builds (no rendering on this page): a 16 ms interval measures how late it
 * fires while a set of species builds, first in the Web Worker (../assets.ts), then synchronously on the main
 * thread for comparison. Open /worker.html on the animals harness; the result lands in window.__workerCheck.
 */
import { prefetchAnimals } from "../assets";
import { buildAnimal } from "../build";
import { SPECIES, type SpeciesKey } from "../species";

const keys = (
  new URLSearchParams(location.search).get("keys") ?? "condor,pelican,gull,macaw,llama,horse,penguin"
).split(",") as SpeciesKey[];

function jitter() {
  let worst = 0;
  let last = performance.now();
  const id = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last - 16);
    last = now;
  }, 16);
  return () => {
    clearInterval(id);
    return worst;
  };
}

const out = document.getElementById("out") as HTMLElement;
const t0 = performance.now();
const stopW = jitter();
await prefetchAnimals(keys, [0]);
const worker = { ms: performance.now() - t0, worstLate: stopW() };
// Sync on the main thread (LOD 1, not cached yet) for comparison.
const stopS = jitter();
const t1 = performance.now();
const per: Record<string, number> = {};
for (const k of keys) {
  const t = performance.now();
  buildAnimal(SPECIES[k], 1);
  per[k] = Math.round(performance.now() - t);
}
await new Promise((r) => setTimeout(r, 30));
const sync = { ms: performance.now() - t1, worstLate: stopS(), per };
const r = { keys, worker, sync };
(window as unknown as { __workerCheck: unknown }).__workerCheck = r;
out.textContent = JSON.stringify(r, null, 2);
