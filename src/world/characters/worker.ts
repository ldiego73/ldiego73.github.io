/**
 * Build worker: composes and polygonises human archetypes off the main thread (./pipeline.ts posts
 * `{ id, spec, lod }`, gets back the built geometry blobs with their buffers transferred, plus the plain
 * metadata the animator needs). Only pure modules are imported here (no DOM, no Three).
 */
import { composeHuman, type HumanSpec, type Lod } from "./archetype";
import { buildArchetype } from "./build";
import { builtBuffers, type WorkerReply } from "./worker-protocol";

interface Req {
  id: number;
  spec: HumanSpec;
  lod: Lod;
}

const post = (msg: WorkerReply, transfer: Transferable[]) =>
  (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(msg, transfer);

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, spec, lod } = e.data;
  try {
    const c = composeHuman(spec, lod);
    const built = buildArchetype(c.bones, c.pieces);
    post(
      { id, ok: true, built, meta: { hangs: c.hangs, style: c.style, face: c.face, opts: c.opts } },
      builtBuffers(built),
    );
  } catch (err) {
    post({ id, ok: false, error: String((err as Error)?.stack ?? err) }, []);
  }
};
