/**
 * Kuntisuyu herds on the shared animals (../../../characters/animals): the farmers' pack llamas (../gente.ts,
 * ../viajeros.ts), each with its aguayo blanket and saddlebags in a different dye, as one instanced herd (one
 * draw per LOD for the whole file). Coats alternate white, brown, black and spotted; the blanket dye is the
 * palette's first t'ika slot, so the ear tassels match it, as they are tied from the same yarn.
 */
import { createHerd, type Herd } from "../../../characters/animals/crowd";
import { recolor } from "../../../characters/animals/spec";
import { speciesOf } from "../../../characters/animals/species";

/** Llama coats (spec variant keys) and the aguayo dyes, cycled per member. */
const COATS = ["white", "brown", "black", "spotted", "cafe"] as const;
const AGUAYO = ["#c4383f", "#2a9d8f", "#dda63c", "#8a2f6a", "#3446a6"];
/** The llama palette slot that dyes the blanket and the first t'ika (plan-quad.ts Q.t1). */
const T1 = 12;

/** Pack-llama palettes: member i takes coat i and dye i (mod their counts). */
export function packPalettes(n: number): string[][] {
  const spec = speciesOf("llama");
  return Array.from({ length: n }, (_, i) => {
    const coat = spec.variants?.[COATS[i % COATS.length] as string] ?? spec.palette;
    return recolor(coat, { [T1]: AGUAYO[i % AGUAYO.length] as string });
  });
}

/** A herd of `n` pack llamas (variant i for member i), packs on. */
export function packLlamas(name: string, n: number): Herd {
  const herd = createHerd("llama", { max: Math.max(1, n), variants: packPalettes(n), features: { pack: true } });
  herd.group.name = name;
  return herd;
}
