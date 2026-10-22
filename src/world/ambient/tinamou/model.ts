/**
 * Perdiz andina / pisaca (Nothoprocta ornata, Nothura): the plumage colours and the tiny feather the flush
 * leaves behind (a two-sided quad, drawn instanced by ../tinamou.ts). The birds themselves are the shared
 * tinamou (characters/animals "tinamou").
 */
import * as THREE from "three";

/** Plumage palette (sRGB): the feather puffs take these. */
export const PLUMAGE = {
  base: "#8c7254",
  buff: "#c8ad80",
  bar: "#4b3a29",
  mottle: "#6f5a42",
  streak: "#ddc9a0",
  breast: "#a99780",
  throat: "#ece3cc",
} as const;

/** A tiny feather (two-sided quad) for the flush puffs. */
export function featherGeometry(): THREE.BufferGeometry {
  const f = new THREE.PlaneGeometry(0.05, 0.085, 1, 1);
  f.deleteAttribute("uv");
  return f;
}
