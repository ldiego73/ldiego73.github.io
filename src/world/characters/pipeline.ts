/**
 * Non-blocking, cached builds of human archetypes. A build (compose + polygonise + skin, 10–150 ms) runs in a
 * Web Worker (./worker.ts, one or two of them), so the world never waits on it; results are cached per
 * (spec, LOD) for the page's lifetime and shared by every person and crowd that uses the archetype.
 *
 *   requestHuman(spec, lod)    → Promise<HumanAsset> (queued; far LODs first: they are cheap and let a crowd
 *                                draw something right away)
 *   peekHuman(spec, lod)       → the asset if it is ready, else null (renderers fall back to another LOD)
 *   buildHumanNow(spec, lod)   → synchronous build on this thread (tests, harness, and the first frame of
 *                                the traveler at the far LOD, which takes a few ms)
 *   prefetchHumans(specs)      → queue every LOD of a list of specs (far → near)
 *
 * Without workers (old browsers, a worker that fails to load) the queue drains on the main thread, one
 * archetype per idle slot, so a frame is never blocked by more than one build.
 */
import { composeHuman, type HumanSpec, type Lod, specKey } from "./archetype";
import { buildArchetype } from "./build";
import { assetFromBuilt, type CharacterAsset } from "./character";
import type { HumanMeta, WorkerReply } from "./worker-protocol";

export interface HumanAsset extends CharacterAsset {
  key: string;
  lod: Lod;
  meta: HumanMeta;
  /** Build time (ms, in the worker or on the main thread). */
  ms: number;
  where: "worker" | "main";
}

interface Job {
  id: number;
  key: string;
  spec: HumanSpec;
  lod: Lod;
  prio: number;
  t0: number;
  resolve(a: HumanAsset): void;
  reject(e: unknown): void;
}

const cache = new Map<string, HumanAsset>();
const pending = new Map<string, Promise<HumanAsset>>();
const queue: Job[] = [];
const running = new Map<number, { job: Job; w: Worker }>();
let workers: Worker[] | null = null;
let idle: Worker[] = [];
let broken = false;
let nextId = 1;
let mainScheduled = false;
const stats = { worker: 0, main: 0, workerMs: 0, mainMs: 0 };

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export const humanKey = (spec: HumanSpec, lod: Lod) => `${specKey(spec)}#${lod}`;

export function peekHuman(spec: HumanSpec, lod: Lod): HumanAsset | null {
  return cache.get(humanKey(spec, lod)) ?? null;
}

/** Best ready LOD for `want` (exact, then nearer-to-far fallbacks, then any). */
export function bestHuman(spec: HumanSpec, want: Lod): HumanAsset | null {
  const order: Lod[] = want === 0 ? [0, 1, 2] : want === 1 ? [1, 2, 0] : [2, 1, 0];
  for (const l of order) {
    const a = cache.get(humanKey(spec, l));
    if (a) return a;
  }
  return null;
}

function finish(
  key: string,
  lod: Lod,
  built: ReturnType<typeof buildArchetype>,
  meta: HumanMeta,
  ms: number,
  where: "worker" | "main",
) {
  const a: HumanAsset = { ...assetFromBuilt(built), key, lod, meta, ms, where };
  cache.set(key, a);
  pending.delete(key);
  return a;
}

/** Synchronous build on this thread (cached). */
export function buildHumanNow(spec: HumanSpec, lod: Lod): HumanAsset {
  const key = humanKey(spec, lod);
  const hit = cache.get(key);
  if (hit) return hit;
  const t0 = now();
  const c = composeHuman(spec, lod);
  const built = buildArchetype(c.bones, c.pieces);
  const ms = now() - t0;
  stats.main++;
  stats.mainMs += ms;
  const a = finish(key, lod, built, { hangs: c.hangs, style: c.style, face: c.face, opts: c.opts }, ms, "main");
  // Anyone waiting on the queued build gets this one.
  const j = queue.findIndex((q) => q.key === key);
  if (j >= 0) {
    const [job] = queue.splice(j, 1);
    job?.resolve(a);
  }
  return a;
}

/** Queue a build (lower `prio` runs sooner; default: far LODs first). */
export function requestHuman(spec: HumanSpec, lod: Lod, prio = lod === 2 ? 0 : lod === 1 ? 1 : 2): Promise<HumanAsset> {
  const key = humanKey(spec, lod);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const p = pending.get(key);
  if (p) return p;
  const promise = new Promise<HumanAsset>((resolve, reject) => {
    queue.push({ id: nextId++, key, spec, lod, prio, t0: now(), resolve, reject });
    queue.sort((a, b) => a.prio - b.prio || a.id - b.id);
  });
  pending.set(key, promise);
  pump();
  return promise;
}

/** Queue every LOD of each spec (far first). */
export function prefetchHumans(specs: Iterable<HumanSpec>, lods: readonly Lod[] = [2, 1, 0]) {
  for (const s of specs) for (const l of lods) requestHuman(s, l).catch(() => {});
}

export function pipelineStats() {
  return {
    ...stats,
    cached: cache.size,
    queued: queue.length,
    running: running.size,
    workers: workers?.length ?? 0,
    broken,
  };
}

function startWorkers() {
  if (workers || broken) return;
  workers = [];
  if (typeof Worker === "undefined") {
    broken = true;
    return;
  }
  const n = typeof navigator !== "undefined" && (navigator.hardwareConcurrency ?? 2) >= 4 ? 2 : 1;
  try {
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<WorkerReply>) => onReply(w, e.data);
      w.onerror = (e) => {
        e.preventDefault?.();
        fail(w);
      };
      workers.push(w);
      idle.push(w);
    }
  } catch {
    broken = true;
  }
}

function onReply(w: Worker, r: WorkerReply) {
  const run = running.get(r.id);
  running.delete(r.id);
  idle.push(w);
  if (run) {
    const job = run.job;
    if (r.ok) {
      // Build time measured in the worker (the wait in the queue is not the build's cost).
      const ms = r.built.stats.ms;
      stats.worker++;
      stats.workerMs += ms;
      if (!cache.has(job.key)) job.resolve(finish(job.key, job.lod, r.built, r.meta, ms, "worker"));
      else job.resolve(cache.get(job.key) as HumanAsset);
    } else {
      // A spec the worker cannot build will not build here either: report it.
      pending.delete(job.key);
      job.reject(new Error(r.error));
    }
  }
  pump();
}

/** A worker died (failed to load or crashed): requeue its job and fall back to the main thread. */
function fail(w: Worker) {
  for (const [id, run] of running)
    if (run.w === w) {
      running.delete(id);
      queue.unshift(run.job);
    }
  idle = idle.filter((x) => x !== w);
  workers = (workers ?? []).filter((x) => x !== w);
  w.terminate();
  if (!workers.length) broken = true;
  pump();
}

function pump() {
  startWorkers();
  if (!broken) {
    while (idle.length && queue.length) {
      const w = idle.pop() as Worker;
      const job = queue.shift() as Job;
      if (cache.has(job.key)) {
        idle.push(w);
        job.resolve(cache.get(job.key) as HumanAsset);
        continue;
      }
      running.set(job.id, { job, w });
      w.postMessage({ id: job.id, spec: job.spec, lod: job.lod });
    }
    return;
  }
  scheduleMain();
}

function scheduleMain() {
  if (mainScheduled || !queue.length) return;
  mainScheduled = true;
  const run = () => {
    mainScheduled = false;
    const job = queue.shift();
    if (job) {
      try {
        job.resolve(buildHumanNow(job.spec, job.lod));
      } catch (e) {
        pending.delete(job.key);
        job.reject(e);
      }
    }
    scheduleMain();
  };
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (ric) ric(run, { timeout: 250 });
  else setTimeout(run, 16);
}
