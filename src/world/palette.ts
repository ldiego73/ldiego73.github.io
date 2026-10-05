import type { Dye } from "../data/career";

/** Khipu dyes (natural pigments) used as accents on cords and textiles. See the surface brief, OWN-WORLD. */
export const DYE: Record<Dye | "cotton", string> = {
  red: "#c4383f", // cochineal
  indigo: "#3446a6",
  ochre: "#dda63c",
  turq: "#2a9d8f",
  alpaca: "#a8825f",
  cotton: "#efe6d6",
};

/** Andean world palette (flat toon colors). */
export const WORLD = {
  stone: "#b9b1a3",
  stoneDark: "#8f877b",
  grass: "#7fae6a",
  grassDark: "#5f8f55",
  ichu: "#d8b46a",
  adobe: "#c98b5a",
  thatch: "#a8743f",
  river: "#5fb8c2",
  snow: "#f3efe6",
  bark: "#8a4b2f",
  soil: "#9a6b47",
  inkDay: "#1f1a17",
  inkNight: "#161a3d",
  torch: "#ffb35c",
  moon: "#a9b8ff",
} as const;

/** Resolved CSS font stacks for canvas text (canvas can't read var()). */
export function fonts() {
  const s = getComputedStyle(document.documentElement);
  const get = (n: string, f: string) => s.getPropertyValue(n).trim() || f;
  return {
    display: get("--font-display", '"Archivo", "Arial Narrow", sans-serif'),
    body: get("--font-body", '"Hanken Grotesk", system-ui, sans-serif'),
    mono: get("--font-mono", '"JetBrains Mono", ui-monospace, monospace'),
    arcade: get("--font-arcade", '"Tektur", "Arial Narrow", sans-serif'),
  };
}
