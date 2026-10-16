/**
 * Pure rules of the Collasuyu finale (../titikala.ts): arrival at the sacred rock, the sunrise-gold burst
 * (spawn and step of the sparks: a fountain from the rock that fans out and drifts down), the glow curve, the
 * panel's title and its true stats (counted from src/data/career.ts through ../../plan.ts). No DOM, no three.js
 * (tested in logic.test.ts).
 */
import type { L, Lang } from "../../../contract";
import { certificationCount, educationCount, skillCount, skillGroups } from "../../plan";

export const BURST = { sparks: 140, life: 7.5 } as const;
/** Arrival radius round the rock (first time in a page session), prompt radius afterwards. */
export const ARRIVE_R = 8;
export const PROMPT_R = 9;

/** Hysteresis on the arrival: in within `r`, out again beyond r + 2. */
export function arrived(inside: boolean, d: number, r = ARRIVE_R): boolean {
  return inside ? d < r + 2 : d < r;
}

export function prng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Spin speeds and phase (flutter). */
  sx: number;
  sy: number;
  ph: number;
  /** Colour index. */
  c: number;
  landed: boolean;
}

/** A fountain of sparks from `y0` above the rock: up and out in every direction. */
export function spawnSparks(n: number, y0: number, colors: number, rand: () => number): Spark[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rand() * Math.PI * 2;
    const out = 1.5 + rand() * 4.5;
    return {
      x: (rand() - 0.5) * 0.6,
      y: y0 + rand() * 0.5,
      z: (rand() - 0.5) * 0.6,
      vx: Math.cos(a) * out,
      vy: 6 + rand() * 6,
      vz: Math.sin(a) * out,
      sx: 2 + rand() * 5,
      sy: 1 + rand() * 4,
      ph: rand() * Math.PI * 2,
      c: i % colors,
      landed: false,
    };
  });
}

/** One step: gravity and air drag (the sparks float down like petals once their throw is spent), land on `floor`. */
export function stepSpark(p: Spark, dt: number, age: number, floor: (x: number, z: number) => number): void {
  if (p.landed) return;
  const drag = Math.exp(-1.6 * dt);
  p.vx *= drag;
  p.vz *= drag;
  // Fall slower than a stone: a terminal speed of ~1.6 u/s with a sideways flutter.
  p.vy = Math.max(-1.6, p.vy - 9 * dt);
  p.x += (p.vx + Math.sin(age * 3 + p.ph) * 0.5) * dt;
  p.z += (p.vz + Math.cos(age * 2.6 + p.ph) * 0.5) * dt;
  p.y += p.vy * dt;
  const f = floor(p.x, p.z);
  if (p.y <= f) {
    p.y = f;
    p.landed = true;
  }
}

/** The sparks' size over the burst: pop in, hold, shrink away at the end. */
export function burstScale(age: number): number {
  if (age < 0.25) return age / 0.25;
  if (age > BURST.life - 1.5) return Math.max(0, (BURST.life - age) / 1.5);
  return 1;
}

/** The rock's and the sun disc's glow: a flash, then a slow fade. */
export function glowAt(age: number): number {
  if (age < 0) return 0;
  if (age < 0.4) return age / 0.4;
  return Math.max(0, 1 - (age - 0.4) / (BURST.life - 0.4));
}

export const FINALE_COPY = {
  kicker: { es: "Fin del Collasuyu", en: "End of the Collasuyu" },
  title: { es: "¡Lo lograste, {name}!", en: "You made it, {name}!" },
  titleNoName: { es: "¡Lo lograste!", en: "You made it!" },
  lede: {
    es: "Recorriste todo el camino del Collasuyu, del punku de piedra a la roca sagrada de la Isla del Sol, donde según la leyenda inca Inti hizo nacer del lago a Manco Cápac y Mama Ocllo.",
    en: "You walked the whole Collasuyu road, from the stone punku to the sacred rock of the Isla del Sol, where in Inca legend Inti made Manco Cápac and Mama Ocllo rise from the lake.",
  },
  stats: { es: "Lo que viste en el lago", en: "What you saw on the lake" },
  postcard: { es: "Crear mi postal", en: "Make my postcard" },
  book: { es: "Agendar 60 min", en: "Book 60 min" },
  cv: { es: "Descargar CV", en: "Download resume" },
  cusco: { es: "Volver a Qusqu", en: "Back to Qusqu" },
  site: { es: "Volver al sitio", en: "Back to the site" },
  view: { es: "E · Ver tu premio", en: "E · See your reward" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
  sign: { es: "TITIKALA", en: "TITIKALA" },
  signSub: { es: "La roca del puma · Isla del Sol", en: "The puma's rock · Isla del Sol" },
  stampLabel: { es: "Fin del Collasuyu", en: "End of the Collasuyu" },
} satisfies Record<string, L>;

export function finaleTitle(lang: Lang, name: string): string {
  const n = name.trim();
  return n ? FINALE_COPY.title[lang].replace("{name}", n) : FINALE_COPY.titleNoName[lang];
}

export interface Tile {
  label: L;
  value: string;
}

/** The four true stats: skill groups (islands), skills, education entries, certifications. */
export function statTiles(): Tile[] {
  return [
    {
      label: { es: "Islas · grupos de habilidades", en: "Islands · skill groups" },
      value: String(skillGroups().length),
    },
    { label: { es: "Habilidades en las islas", en: "Skills on the islands" }, value: String(skillCount()) },
    { label: { es: "Estudios en Taquile", en: "Studies on Taquile" }, value: String(educationCount()) },
    { label: { es: "Certificaciones", en: "Certifications" }, value: String(certificationCount()) },
  ];
}
