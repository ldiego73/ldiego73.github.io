/**
 * Where animal geometry comes from without blocking a frame: builds run in a Web Worker (./worker.ts, the same
 * pure builders) and land in the shared cache (./build.ts), so `createAnimal` / `createHerd` then find them
 * ready. Without workers (tests, an old browser) the build runs in an idle callback instead, one per idle
 * slot. A sync request builds right away (used for the cheap far LOD a herd needs to show up at once).
 *
 *   await prefetchAnimals(["vicuna", "llama"], [0, 1, 2]);  // during the world's load
 *   const llama = await loadAnimal("llama");                 // a single animal, built off the main thread
 */
import type { Built } from "../build";
import { type Animal, type AnimalOptions, createAnimal } from "./animal";
import { buildAnimal, cacheAnimal, cachedAnimal } from "./build";
import type { Lod } from "./lod";
import type { AnimalSpec } from "./spec";
import { type SpeciesKey, speciesOf } from "./species";

type Done = (b: Built) => void;
const pending = new Map<string, Done[]>();
let worker: Worker | null | undefined;
let seq = 0;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  try {
    if (typeof Worker !== "undefined" && typeof window !== "undefined") {
      const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<{ key: string; lod: Lod; built: Built }>) => {
        const { key, lod, built } = e.data;
        cacheAnimal(key, lod, built);
        finish(`${key}:${lod}`, built);
      };
      w.onerror = () => {
        // A worker that fails to start: fall back to idle builds for everything still pending.
        worker = null;
        for (const k of pending.keys()) {
          const [key, lod] = k.split(":");
          idleBuild(speciesOf(key as string), Number(lod) as Lod);
        }
      };
      worker = w;
    }
  } catch {
    worker = null;
  }
  return worker;
}

function finish(k: string, b: Built) {
  const list = pending.get(k);
  pending.delete(k);
  for (const f of list ?? []) f(b);
}

function idleBuild(spec: AnimalSpec, lod: Lod) {
  const run = () => finish(`${spec.key}:${lod}`, buildAnimal(spec, lod));
  const ric = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  if (ric) ric(run, { timeout: 1500 });
  else setTimeout(run, 16 + (seq++ % 8) * 30);
}

/**
 * The build of a species at a LOD: returned at once when cached (or when `sync`), otherwise scheduled off
 * the main thread; `onReady` is called when it lands (not when it was already there).
 */
export function requestAnimal(spec: AnimalSpec, lod: Lod, sync: boolean, onReady?: Done): Built | null {
  const c = cachedAnimal(spec.key, lod);
  if (c) return c;
  if (sync) return buildAnimal(spec, lod);
  const k = `${spec.key}:${lod}`;
  const list = pending.get(k);
  if (list) {
    if (onReady) list.push(onReady);
    return null;
  }
  pending.set(k, onReady ? [onReady] : []);
  const w = getWorker();
  if (w) w.postMessage({ key: spec.key, lod });
  else idleBuild(spec, lod);
  return null;
}

/** Build these species at these LODs off the main thread; resolves when all are cached. */
export function prefetchAnimals(keys: ReadonlyArray<SpeciesKey | string>, lods: readonly Lod[] = [0, 1, 2]) {
  const jobs: Promise<void>[] = [];
  for (const key of keys)
    for (const lod of lods) {
      const spec = speciesOf(key);
      if (cachedAnimal(spec.key, lod)) continue;
      jobs.push(new Promise((res) => requestAnimal(spec, lod, false, () => res())));
    }
  return Promise.all(jobs).then(() => undefined);
}

/** A single animal whose geometry is built off the main thread first. */
export async function loadAnimal(key: SpeciesKey | string, o: AnimalOptions = {}): Promise<Animal> {
  await prefetchAnimals([key], [o.lod ?? 0]);
  return createAnimal(key, o);
}
