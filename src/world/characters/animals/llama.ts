/**
 * The approved prototype llama's original entry points (bones, pieces, palette), now served by the shared
 * camelid plan (./species/camelids.ts LLAMA): the same one-surface llama, made parametric, plus t'ika and
 * pack bones. ../llama.ts re-exports these so ../index.ts and the characters harness keep working.
 * Pure (no DOM, no Three).
 */
import type { BoneDef, Piece } from "../build";
import { LLAMA } from "./species/camelids";

/** Palette of the llama (quadruped slots, ./spec.ts). */
export const LLAMA_PALETTE: readonly string[] = LLAMA.palette;

export function llamaBones(): BoneDef[] {
  return LLAMA.plan().kit.skeleton();
}

/** The llama's pieces (the bone list is the plan's own; `bones` is accepted for the old signature). */
export function llamaPieces(_bones?: BoneDef[]): Piece[] {
  const p = LLAMA.plan();
  return p.kit.pieces({ h: p.h, ...(p.woolNormal !== undefined ? { woolNormal: p.woolNormal } : {}) });
}
