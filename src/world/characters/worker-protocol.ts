/**
 * Messages between ./pipeline.ts and ./worker.ts, and the helpers both sides share. Pure (no DOM, no Three).
 */
import type { HangSpec, HumanStyle } from "./anim-human";
import type { Built, GeoData } from "./build";
import type { HumanOpts } from "./human";

/** What the animator and the renderer need besides the geometry (plain data). */
export interface HumanMeta {
  hangs: HangSpec[];
  style: HumanStyle;
  face: number;
  opts: HumanOpts;
}

export type WorkerReply =
  | { id: number; ok: true; built: Built; meta: HumanMeta }
  | { id: number; ok: false; error: string };

/** The ArrayBuffers of a built archetype (transferred, not copied). */
export function builtBuffers(b: Built): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>();
  const add = (g: GeoData | null) => {
    if (!g) return;
    for (const v of Object.values(g)) if (ArrayBuffer.isView(v)) out.add(v.buffer as ArrayBuffer);
  };
  add(b.body);
  add(b.cloth);
  return [...out];
}
