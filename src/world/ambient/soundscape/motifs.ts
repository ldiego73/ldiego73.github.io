/**
 * Place motifs: a short musical idea per station (and the summit, and the Inti Raymi dancers) that fades in as a
 * layer over the world music while the traveler is near it. Pure data + rules (no Web Audio), unit tested.
 *
 * Harmony. Motifs play on the world track's own step grid (MusicClock), over its 8-bar / 128-step loop:
 *   bar      0    1     2     3   4    5     6   7
 *   day      Am   Am    G     E   Am   D     E   Am      (A minor huayno, src/audio/tracks/world.ts)
 *   night    Am   G     F     E   Am   Dm    E   Am      (yaraví)
 *   summit   A    A     D     E   A    F#m   D/E A       (A major)
 * Minor motifs work over both day and night, so each note must fit the chord of BOTH moods on its bar
 * (MINOR_BAR_TONES). Melodies mostly speak on bars 0, 3, 4, 6, 7 where day and night agree. The summit motif
 * only plays over the summit track; the other motifs never do (see `motifAllowed`).
 *
 * Levels. Motif layer gains are well under the track's lead (quena ~0.5..0.66 there, ~0.15..0.3 here) and the
 * whole motif is scaled by proximity, so a motif never outweighs the music it decorates. music.ts keeps the track
 * at its calm intensity near stations so the full quena lead does not fight the motif.
 */
import type { Layer, Track } from "../../../audio/contract";

export const MOTIF_STEPS = 128;
const BAR = 16;

const rep = (s: string, n: number) => Array.from({ length: n }, () => s).join(" ");
const REST = rep(".", BAR);
/** Eight bars (missing ones are rests) joined into a 128-step string. */
const bars = (b: Partial<Record<number, string>>) => Array.from({ length: 8 }, (_, i) => b[i] ?? REST).join(" | ");

/** Pitch classes that fit each bar of the day AND night progressions (A minor motifs). */
export const MINOR_BAR_TONES: readonly (readonly string[])[] = [
  ["A", "B", "C", "D", "E", "G"], // Am / Am
  ["A", "B", "D", "E", "G"], // Am / G
  ["A", "C", "D", "G"], // G / F
  ["E", "G#", "B", "D"], // E / E
  ["A", "B", "C", "D", "E", "G"], // Am / Am
  ["A", "D", "E"], // D / Dm
  ["E", "G#", "B", "D"], // E / E
  ["A", "B", "C", "D", "E", "G"], // Am / Am
];
/** Summit progression tones (A major). Bar 6 is D then E, so only their shared colour tones. */
export const SUMMIT_BAR_TONES: readonly (readonly string[])[] = [
  ["A", "C#", "E", "B", "F#"],
  ["A", "C#", "E", "B", "F#"],
  ["D", "F#", "A", "E"],
  ["E", "G#", "B"],
  ["A", "C#", "E", "B", "F#"],
  ["F#", "A", "C#", "E"],
  ["A", "E", "B"],
  ["A", "C#", "E", "B", "F#"],
];

export type MotifMood = "minor" | "summit";

export interface Motif extends Track {
  mood: MotifMood;
  /** Overall level of the motif layer at full proximity (0..1, kept low on purpose). */
  level: number;
}

const minor = (id: string, title: string, level: number, layers: Layer[]): Motif => ({
  id: `motif.${id}`,
  title,
  bpm: 104,
  key: { root: "A", scale: "minor", extra: ["F#", "G#"] },
  mood: "minor",
  level,
  layers,
});

/** Per place id (STATIONS ids + "summit" + "festival"). Build stations get none: they are workshops, not places. */
export const MOTIFS: Record<string, Motif> = {
  // Puerta: a two-note zampoña welcome and its answer.
  gate: minor("gate", "Bienvenida", 0.8, [
    {
      voice: "zampona",
      steps: bars({ 0: "E5 - - - A4 - - - - - . . . . . .", 4: "A4 - - - E5 - - - - - . . . . . ." }),
      gain: 0.26,
    },
    { voice: "zampona", steps: bars({ 7: ". . . . . . . . A4 - - - - - . ." }), gain: 0.18, octave: -1, pan: -0.3 },
  ]),
  // Avances: a simple, bright quena phrase in the high register, speaking in the lead's rests.
  avances: minor("avances", "Quena de Avances", 0.85, [
    {
      voice: "quena",
      steps: bars({
        0: ". . . . E5 - A5 - C6 - B5 - A5 - - -",
        3: ". . . . B5 - G#5 - E5 - - - . . . .",
        4: ". . . . E5 - A5 - C6 - D6 C6 B5 - - -",
        6: ". . . . G#5 - B5 - D6 - B5 - . . . .",
        7: ". . . . A5 - - - - - - - . . . .",
      }),
      gain: 0.22,
      pan: 0.15,
    },
    { voice: "pad", steps: bars({ 0: `A4 ${rep("-", 15)}`, 4: `A4 ${rep("-", 15)}` }), gain: 0.1 },
  ]),
  // Hundred: ira y arka, two zampoña rows trading single notes (the hocket of real sikus).
  hundred: minor("hundred", "Ira y arka", 0.8, [
    {
      voice: "zampona",
      steps: bars({
        0: "A4 - . . . . C5 - . . . . E5 - . .",
        3: "B4 - . . . . G#4 - . . . . E4 - . .",
        4: "A4 - . . . . D5 - . . . . E5 - . .",
        7: "A4 - - - . . . . . . . . . . . .",
      }),
      gain: 0.22,
      pan: -0.25,
    },
    {
      voice: "zampona",
      steps: bars({
        0: ". . . B4 - . . . D5 - . . . . . .",
        3: ". . . D5 - . . . B4 - . . . . . .",
        4: ". . . C5 - . . . B4 - . . . . . .",
      }),
      gain: 0.2,
      pan: 0.25,
    },
  ]),
  // Belcorp: an elegant bell arpeggio with a quena sigh.
  belcorp: minor("belcorp", "Campanas de Belcorp", 0.75, [
    {
      voice: "bell",
      steps: bars({ 0: "A5 . . . E5 . . . C6 . . . . . . .", 4: "C6 . . . A5 . . . E5 . . . . . . ." }),
      gain: 0.3,
      pan: 0.2,
    },
    {
      voice: "quena",
      steps: bars({ 6: ". . . . . . . . B5 - - - G#5 - - -", 7: "A5 - - - - - - - . . . . . . . ." }),
      gain: 0.18,
    },
  ]),
  // Auna: a calm pad, two slow voices breathing with the chords (care, not hurry).
  auna: minor("auna", "Calma de Auna", 0.8, [
    {
      voice: "pad",
      steps: bars({
        0: `E5 ${rep("-", 15)}`,
        1: rep("-", 16),
        3: `B4 ${rep("-", 15)}`,
        4: `E5 ${rep("-", 15)}`,
        5: rep("-", 16),
        6: `B4 ${rep("-", 15)}`,
        7: `C5 ${rep("-", 11)} . . . .`,
      }),
      gain: 0.26,
      pan: 0.2,
    },
    {
      voice: "pad",
      steps: bars({
        0: `A4 ${rep("-", 15)}`,
        3: `G#4 ${rep("-", 15)}`,
        4: `A4 ${rep("-", 15)}`,
        6: `G#4 ${rep("-", 15)}`,
        7: `A4 ${rep("-", 11)} . . . .`,
      }),
      gain: 0.24,
      pan: -0.2,
    },
    {
      voice: "bell",
      steps: bars({ 0: "A5:0.6 . . . . . . . . . . . . . . .", 4: "E6:0.5 . . . . . . . . . . . . . . ." }),
      gain: 0.1,
    },
  ]),
  // Xepelin: a quick rising charango arpeggio, once per phrase.
  xepelin: minor("xepelin", "Arpegio de Xepelin", 0.9, [
    {
      voice: "charango",
      steps: bars({
        0: ". . . . . . . . A4:0.7 C5:0.6 E5:0.7 A5:0.9 - - . .",
        3: ". . . . . . . . E4:0.7 G#4:0.6 B4:0.7 E5:0.9 - - . .",
        4: ". . . . . . . . A4:0.7 C5:0.6 E5:0.7 A5:0.9 - - . .",
        6: ". . . . . . . . E4:0.7 G#4:0.6 B4:0.7 D5:0.8 - - . .",
        7: "C5:0.7 - . . A4:0.9 - - - . . . . . . . .",
      }),
      gain: 0.55,
      pan: -0.15,
    },
    { voice: "bell", steps: bars({ 7: ". . . . A5:0.5 . . . . . . . . . . ." }), gain: 0.16, pan: 0.2 },
  ]),
  // TopSort: a rhythmic charango figure, 3+3+2 against the huayno gallop.
  topsort: minor("topsort", "Charango de TopSort", 0.95, [
    {
      voice: "charango",
      steps: bars({
        0: "A4:0.9 . . C5:0.6 . . E5:0.8 . A4:0.9 . . C5:0.6 . . E5:0.8 .",
        1: "A4:0.8 . . B4:0.5 . . E5:0.7 . A4:0.8 . . D5:0.5 . . E5:0.7 .",
        3: "E4:0.9 . . G#4:0.6 . . B4:0.8 . E4:0.9 . . G#4:0.6 . . B4:0.8 .",
        4: "A4:0.9 . . C5:0.6 . . E5:0.8 . A4:0.9 . . C5:0.6 . . E5:0.8 .",
        6: "E4:0.9 . . G#4:0.6 . . B4:0.8 . E4:0.9 . . D5:0.6 . . B4:0.8 .",
        7: "A4:0.9 . . C5:0.6 . . E5:0.8 . A4:0.9 - - - . . . .",
      }),
      gain: 0.5,
      pan: 0.2,
    },
    { voice: "shaker", steps: rep("x:0.5 . . x:0.3 . . x:0.4 .", 16), gain: 0.22, pan: -0.25 },
  ]),
  // Globant: quena and bombo in dialogue.
  globant: minor("globant", "Diálogo de Globant", 0.75, [
    {
      voice: "quena",
      steps: bars({
        0: ". . . . . . . . E5 - - - A5 - - -",
        4: ". . . . . . . . C6 - - - B5 - A5 -",
        6: ". . . . . . . . B5 - - - G#5 - - -",
        7: "A5 - - - - - . . . . . . . . . .",
      }),
      gain: 0.2,
    },
    {
      voice: "bombo",
      steps: bars({
        0: "x:0.6 . . x:0.4 . . x:0.5 . . . . . . . . .",
        4: "x:0.6 . . x:0.4 . . x:0.5 . . . . . . . . .",
      }),
      gain: 0.22,
    },
  ]),
  // Puente: long breathy low zampoña tones, wind in the gorge.
  bridge: minor("bridge", "Viento del puente", 0.8, [
    {
      voice: "zampona",
      steps: bars({
        0: `E4 ${rep("-", 11)} . . . .`,
        3: `B3 ${rep("-", 11)} . . . .`,
        4: `A3 ${rep("-", 11)} . . . .`,
        6: `G#3 ${rep("-", 11)} . . . .`,
      }),
      gain: 0.22,
    },
    { voice: "pad", steps: bars({ 0: `A3 ${rep("-", 15)}`, 4: `E4 ${rep("-", 15)}` }), gain: 0.12 },
  ]),
  // Tambo arcade: a chiptune-flavoured quena: the phrase doubled by a thin pulse that echoes it three steps late.
  arcade: minor("arcade", "Quena de 8 bits", 0.75, [
    {
      voice: "quena",
      steps: bars({
        0: "A5 - C6 - E6 - . . D6 - C6 - B5 - . .",
        3: "B5 - G#5 - E5 - . . . . . . . . . .",
        4: "A5 - C6 - E6 - . . G6 - E6 - D6 - . .",
        6: "G#5 - B5 - D6 - . . B5 - - - . . . .",
        7: "A5 - - - . . . . . . . . . . . .",
      }),
      gain: 0.18,
      pan: -0.1,
    },
    {
      voice: "pulse25",
      steps: bars({
        0: ". . . A5:0.5 - C6:0.5 - E6:0.5 - . . D6:0.5 - C6:0.5 - B5:0.5",
        3: ". . . B5:0.5 - G#5:0.5 - E5:0.5 - . . . . . . .",
        4: ". . . A5:0.5 - C6:0.5 - E6:0.5 - . . G6:0.5 - E6:0.5 - D6:0.5",
        6: ". . . G#5:0.5 - B5:0.5 - D6:0.5 - . . B5:0.5 - . . .",
        7: ". . . A5:0.5 - . . . . . . . . . . .",
      }),
      gain: 0.12,
      pan: 0.3,
    },
  ]),
  // Intihuatana (AI): a bell motif, sun-stone clear.
  ai: minor("ai", "Campana del Intihuatana", 0.9, [
    {
      voice: "bell",
      steps: bars({
        0: "A5 . . . E6 . . . C6 . . . B5 . . .",
        3: "G#5 . . . B5 . . . E6 . . . . . . .",
        4: "C6 . . . B5 . . . A5 . . . E5 . . .",
        6: "B5 . . . D6 . . . G#5 . . . . . . .",
        7: "A5 . . . . . . . . . . . . . . .",
      }),
      gain: 0.4,
      pan: 0.15,
    },
    {
      voice: "bell",
      steps: bars({ 0: "A4:0.5 . . . . . . . . . . . . . . .", 4: "A4:0.5 . . . . . . . . . . . . . . ." }),
      gain: 0.22,
      pan: -0.2,
    },
  ]),
  // Puesto del chasqui: a quena call and a zampoña reply, messages along the road.
  contact: minor("contact", "Llamado del chasqui", 0.75, [
    {
      voice: "quena",
      steps: bars({ 0: "E5 - - - A5 - - - - - . . . . . .", 6: ". . . . . . . . B5 - - - E5 - - -" }),
      gain: 0.2,
    },
    {
      voice: "zampona",
      steps: bars({ 4: ". . . . . . . . A4 - - - E4 - - -", 7: "A4 - - - - - - - . . . . . . . ." }),
      gain: 0.2,
    },
  ]),
  // Cumbre: fuller zampoña chords answering the summit theme (A major, only over the summit track).
  summit: {
    id: "motif.summit",
    title: "Coro de zampoñas",
    bpm: 96,
    key: { root: "A", scale: "major" },
    mood: "summit",
    level: 0.65,
    layers: [
      {
        voice: "zampona",
        steps: bars({
          0: `E5 ${rep("-", 11)} . . . .`,
          3: `B4 ${rep("-", 11)} . . . .`,
          4: `E5 ${rep("-", 11)} . . . .`,
          5: `C#5 ${rep("-", 11)} . . . .`,
          7: `E5 ${rep("-", 15)}`,
        }),
        gain: 0.16,
        pan: 0.25,
      },
      {
        voice: "zampona",
        steps: bars({
          0: `C#5 ${rep("-", 11)} . . . .`,
          3: `G#4 ${rep("-", 11)} . . . .`,
          4: `C#5 ${rep("-", 11)} . . . .`,
          5: `A4 ${rep("-", 11)} . . . .`,
          7: `C#5 ${rep("-", 15)}`,
        }),
        gain: 0.16,
      },
      {
        voice: "zampona",
        steps: bars({
          0: `A4 ${rep("-", 11)} . . . .`,
          3: `E4 ${rep("-", 11)} . . . .`,
          4: `A4 ${rep("-", 11)} . . . .`,
          5: `F#4 ${rep("-", 11)} . . . .`,
          7: `A4 ${rep("-", 15)}`,
        }),
        gain: 0.16,
        pan: -0.25,
      },
    ],
  },
  // Inti Raymi: the dancers' band, bombo gallop and a festive quena (positioned at the nearest dancer).
  festival: minor("festival", "Banda del Inti Raymi", 0.5, [
    { voice: "bombo", steps: rep("x:0.8 . . x:0.4 x:0.6 . . . x:0.7 . . x:0.4 x:0.6 . x:0.3 .", 8), gain: 0.3 },
    { voice: "shaker", steps: rep("x:0.5 . x:0.3 x:0.3", 32), gain: 0.16, pan: 0.2 },
    {
      voice: "quena",
      steps: bars({
        0: "A5 - C6 A5 E5 - A5 - C6 - D6 C6 B5 - A5 -",
        1: "B5 - A5 - E5 - D5 - E5 - - - . . . .",
        2: "C6 - A5 - G5 - A5 - D5 - - - . . . .",
        3: "B5 - D6 B5 G#5 - B5 - E5 - - - . . . .",
        4: "A5 - C6 A5 E5 - A5 - C6 - D6 C6 B5 - A5 -",
        5: "A5 - D5 - E5 - A5 - D6 - - - . . . .",
        6: "B5 - G#5 - E5 - G#5 - B5 - D6 - B5 - . .",
        7: "A5 - - - E5 - - - A5 - - - . . . .",
      }),
      gain: 0.24,
      pan: -0.1,
    },
  ]),
};

/** True when a motif may play over the given world track (minor motifs over day/night, summit over summit). */
export function motifAllowed(m: Motif, trackId: string | null): boolean {
  if (trackId === "world.summit") return m.mood === "summit";
  if (trackId === "world.day" || trackId === "world.night") return m.mood === "minor";
  return false;
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Proximity weight 0..1: full within `full`, fading out to 0 at `out` (smoothstep). */
export function proximity(d: number, full: number, out: number): number {
  return 1 - smooth(full, out, d);
}

/** Station motif radii (world units): full inside STATION_FULL, silent beyond STATION_OUT. */
export const STATION_FULL = 7;
export const STATION_OUT = 18;
export const SUMMIT_FULL = 10;
export const SUMMIT_OUT = 22;
export const FESTIVAL_FULL = 10;
export const FESTIVAL_OUT = 34;

/**
 * Picks the one place motif that should lead: the strongest weight, but the current one keeps the lead until a
 * rival is clearly stronger (hysteresis), so walking between two close places does not flip-flop.
 */
export function pickPlace(weights: ReadonlyMap<string, number>, current: string | null, margin = 0.15): string | null {
  let best: string | null = null;
  let bw = 0;
  for (const [id, w] of weights) {
    if (w > bw) {
      bw = w;
      best = id;
    }
  }
  if (!best || bw < 0.01) return null;
  const cw = current ? (weights.get(current) ?? 0) : 0;
  if (current && cw >= 0.01 && best !== current && bw < cw + margin) return current;
  return best;
}

/** The subset of MusicClock the motif timing needs. */
export interface GridClock {
  step: number;
  time: number;
  stepSec: number;
  swing: number;
}

/** Audio time of global step `s` on the music's grid (swing delays odd steps like the track scheduler does). */
export function stepTime(c: GridClock, s: number): number {
  return c.time + (s - c.step) * c.stepSec + (s % 2 === 1 ? c.swing * c.stepSec : 0);
}

/**
 * Steps a motif layer should emit now: every step after `last` whose time falls in [now - 0.005, now + ahead),
 * never reaching back more than a bar (a stalled frame drops notes instead of firing a burst).
 * Returns the inclusive range [from, to] (empty when to < from).
 */
export function dueSteps(
  c: GridClock,
  last: number,
  now: number,
  ahead: number,
  out: { from: number; to: number } = { from: 0, to: -1 },
): { from: number; to: number } {
  let from = Math.max(last + 1, c.step - 16);
  while (from <= c.step + 4096 && stepTime(c, from) < now - 0.005) from++;
  let to = from - 1;
  while (stepTime(c, to + 1) < now + ahead && to - from < 64) to++;
  out.from = from;
  out.to = to;
  return out;
}
