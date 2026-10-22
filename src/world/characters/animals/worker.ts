/**
 * Web Worker that builds animal geometry off the main thread (./assets.ts posts {key, lod}; the pure builders
 * run here and the typed arrays are transferred back, not copied).
 */
import type { Built, GeoData } from "../build";
import { buildAnimal } from "./build";
import type { Lod } from "./lod";
import { speciesOf } from "./species";

const transfers = (g: GeoData | null) => {
  if (!g) return [];
  return Object.values(g)
    .filter((v): v is ArrayBufferView => ArrayBuffer.isView(v))
    .map((v) => v.buffer as ArrayBuffer);
};

self.onmessage = (e: MessageEvent<{ key: string; lod: Lod }>) => {
  const { key, lod } = e.data;
  const built: Built = buildAnimal(speciesOf(key), lod);
  (self as unknown as Worker).postMessage({ key, lod, built }, [...transfers(built.body), ...transfers(built.cloth)]);
};
