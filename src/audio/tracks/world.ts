import type { Layer, Track } from "../contract";

/**
 * 3D world music: the Andean climb, in three moods that share the tonic A so the day/night crossfade is smooth.
 *  - day:    huayno-flavoured, 104 bpm, A minor with the major-6th (F#) lift. Gallop = long-short-short in 16ths.
 *  - night:  yaravi-like, 72 bpm, slow quena, plucked charango, bombo as a heartbeat. Much silence.
 *  - summit: 96 bpm, A major, the triumphant answer of the climb.
 *
 * One bar = 16 steps (4 beats of 16ths, read as two huayno 2/4 bars of 8). The loop is 8 bars = 128 steps.
 * Intensity gates: 0 base (drone + sparse quena + soft bombo), .35 charango + full quena melody + offbeat bombo,
 * .6 zampona + shaker, .85 extra percussion + fills.
 *
 * Written by theory (stepwise motion, repeated motif + varied answer, breath at phrase ends); never auditioned.
 */

type Bars = readonly string[];
/** Joins bars (each 16 steps) into one 128-step string. */
const join = (bars: Bars) => bars.join(" | ");
const rep = (s: string, n: number) => Array.from({ length: n }, () => s).join(" ");
/** A held note of `n` steps. */
const hold = (note: string, n: number) => `${note} ${rep("-", n - 1)}`;

type Chord = readonly [string, string, string];
const CH = {
  Am: ["A4", "C5", "E5"],
  G: ["G4", "B4", "D5"],
  F: ["F4", "A4", "C5"],
  E: ["E4", "G#4", "B4"],
  D: ["A4", "D5", "F#5"],
  A: ["A4", "C#5", "E5"],
  F7m: ["F#4", "A4", "C#5"],
} satisfies Record<string, Chord>;

/** One beat of charango, huayno gallop: strum on the beat, then two quick notes. */
const gallop = (c: Chord, flip: boolean) =>
  flip ? `${c[2]}:0.85 . ${c[1]}:0.5 ${c[0]}:0.6` : `${c[0]}:0.9 . ${c[1]}:0.55 ${c[2]}:0.7`;
/** Half bar (two beats) of gallop on a chord. */
const half = (c: Chord) => `${gallop(c, false)} ${gallop(c, true)}`;
const halves = (hs: readonly Chord[]) => hs.map(half).join(" ");

/** Percussion cells. */
const GALLOP_SHAKER = "x:0.55 . x:0.3 x:0.3";
const fill = (bars: readonly number[]) =>
  Array.from({ length: 8 }, (_, b) =>
    bars.includes(b) ? `${rep(". . . . . . . . . . . . .", 1)} x:0.5 x:0.6 x:0.8` : rep(".", 16),
  ).join(" | ");

// ------------------------------------------------------------------------------------------------ DAY
const DAY_LEAD: Bars = [
  "E5 - E5 D5 C5 - D5 C5 A4 - - - . . A4 C5",
  "D5 - D5 C5 D5 - E5 D5 C5 - - - . . . .",
  "B4 - D5 B4 G4 - A4 B4 D5 - - - . . B4 D5",
  "B4 - C5 B4 G#4 - A4 B4 E5 - - - . . . .",
  "A4 - C5 E5 A5 - G5 E5 C5 - D5 E5 G5 - E5 D5",
  "F#5 - E5 D5 A4 - D5 F#5 E5 - D5 C5 D5 - - -",
  "B4 - C5 B4 G#4 - B4 E5 D5 - C5 B4 G#4 - - -",
  "A4 - - - - - - - - - - - . . B4 C5",
];
const DAY_LEAD_SPARSE: Bars = [
  "E5 - - - - - - - C5 - - - - - - -",
  "D5 - - - - - - - C5 - - - - - - -",
  "B4 - - - - - - - G4 - - - - - - -",
  "B4 - - - - - - - . . . . . . . .",
  "A4 - - - - - - - E5 - - - - - - -",
  "F#5 - - - - - - - D5 - - - - - - -",
  "B4 - - - - - - - G#4 - - - - - - -",
  "A4 - - - - - - - - - - - . . . .",
];
const DAY_ZAMPONA: Bars = [
  "C5 - - - A4 - - - E4 - - - E4 - - -",
  "A4 - - - A4 - - - E4 - - - A4 - - -",
  "G4 - - - B4 - - - D5 - - - B4 - - -",
  "G#4 - - - B4 - - - G#4 - - - E4 - - -",
  "E5 - - - C5 - - - A4 - - - C5 - - -",
  "A4 - - - F#4 - - - A4 - - - D5 - - -",
  "G#4 - - - B4 - - - E5 - - - D5 - - -",
  "C5 - - - E5 - - - A4 - - - - - - -",
];
const DAY_PROG: Chord[] = [
  CH.Am,
  CH.Am,
  CH.Am,
  CH.Am,
  CH.G,
  CH.G,
  CH.E,
  CH.E,
  CH.Am,
  CH.Am,
  CH.D,
  CH.D,
  CH.E,
  CH.E,
  CH.Am,
  CH.Am,
];

const day: Track = {
  id: "world.day",
  title: "Huayno del camino",
  bpm: 104,
  swing: 0.04,
  tempoBoost: 1.08,
  key: { root: "A", scale: "minor", extra: ["F#", "G#"] },
  layers: [
    { voice: "pad", steps: hold("A3", 64), gain: 0.32, pan: -0.1 },
    { voice: "pad", steps: hold("E4", 64), gain: 0.2, pan: 0.1 },
    { voice: "quena", steps: join(DAY_LEAD_SPARSE), gain: 0.5, maxIntensity: 0.34, pan: 0.05 },
    { voice: "bombo", steps: rep("x:0.5 . . . . . . . x:0.4 . . . . . . .", 8), gain: 0.5 },
    { voice: "quena", steps: join(DAY_LEAD), gain: 0.62, minIntensity: 0.35, pan: 0.05 },
    { voice: "charango", steps: halves(DAY_PROG), gain: 0.42, minIntensity: 0.35, pan: -0.2 },
    { voice: "bombo", steps: rep(". . . . . . x:0.5 . . . . . . . x:0.5 .", 8), gain: 0.4, minIntensity: 0.35 },
    { voice: "zampona", steps: join(DAY_ZAMPONA), gain: 0.4, minIntensity: 0.6, octave: -1, pan: -0.3 },
    { voice: "shaker", steps: rep(GALLOP_SHAKER, 4), gain: 0.35, minIntensity: 0.6, pan: 0.3 },
    { voice: "shaker", steps: rep(". x:0.2 . x:0.2", 4), gain: 0.25, minIntensity: 0.85, pan: -0.3 },
    { voice: "bombo", steps: fill([3, 7]), gain: 0.5, minIntensity: 0.85 },
  ] satisfies Layer[],
};

// ------------------------------------------------------------------------------------------------ NIGHT
const NIGHT_LEAD: Bars = [
  "E5 - - - - - - - D5 - - - C5 - - -",
  "B4 - - - - - - - . . . . . . . .",
  "C5 - - - - - - - A4 - - - - - - -",
  "G#4 - - - - - - - . . . . . . . .",
  "A4 - - - C5 - - - E5 - - - - - - -",
  "F5 - - - E5 - - - D5 - - - . . . .",
  "B4 - - - G#4 - - - . . . . . . . .",
  "A4 - - - - - - - - - - - - - - -",
];
const NIGHT_CH: Chord[] = [CH.Am, CH.G, CH.F, CH.E, CH.Am, ["D5", "F5", "A4"], CH.E, CH.Am];
const NIGHT_CHARANGO = NIGHT_CH.map((c) => `${c[0]}:0.7 . . . ${c[1]}:0.5 . . . ${c[2]}:0.55 . . . . . . .`).join(
  " | ",
);
const NIGHT_ZAMPONA: Bars = ["C5", "B4", "A4", "G#4", "C5", "A4", "G#4", "E5"].map((n) => `${hold(n, 12)} . . . .`);

const night: Track = {
  id: "world.night",
  title: "Yaraví de la noche",
  bpm: 72,
  tempoBoost: 1.05,
  key: { root: "A", scale: "minor", extra: ["F#", "G#"] },
  layers: [
    { voice: "pad", steps: hold("A3", 64), gain: 0.3, pan: -0.1 },
    { voice: "pad", steps: hold("E4", 64), gain: 0.18, pan: 0.1 },
    { voice: "quena", steps: join(NIGHT_LEAD), gain: 0.6, pan: 0.05 },
    { voice: "bombo", steps: rep("x:0.45 . . x:0.25 . . . . . . . . . . . .", 8), gain: 0.4 },
    { voice: "charango", steps: NIGHT_CHARANGO, gain: 0.38, minIntensity: 0.35, pan: -0.2 },
    { voice: "zampona", steps: join(NIGHT_ZAMPONA), gain: 0.3, minIntensity: 0.6, octave: -1, pan: -0.3 },
    {
      voice: "shaker",
      steps: rep("x:0.18 . . . . . . . x:0.12 . . . . . . .", 8),
      gain: 0.2,
      minIntensity: 0.85,
      pan: 0.3,
    },
  ] satisfies Layer[],
};

// ------------------------------------------------------------------------------------------------ SUMMIT
const SUMMIT_LEAD: Bars = [
  "A4 - C#5 E5 A5 - - - F#5 - E5 C#5 E5 - - -",
  "A4 - C#5 E5 F#5 - - - E5 - C#5 B4 C#5 - - -",
  "D5 - F#5 A5 A5 - F#5 D5 F#5 - E5 D5 F#5 - - -",
  "B4 - E5 G#5 G#5 - - - F#5 - E5 B4 E5 - . .",
  "A4 - C#5 E5 A5 - - - G#5 - F#5 E5 A5 - - -",
  "F#5 - E5 C#5 A4 - C#5 E5 F#5 - - - E5 - C#5 A4",
  "D5 - F#5 A5 F#5 - - - E5 - G#5 B5 G#5 - - -",
  "A5 - - - - - - - E5 - - - A4 - - -",
];
const SUMMIT_PROG: Chord[] = [
  CH.A,
  CH.A,
  CH.A,
  CH.A,
  CH.D,
  CH.D,
  CH.E,
  CH.E,
  CH.A,
  CH.A,
  CH.F7m,
  CH.F7m,
  CH.D,
  CH.E,
  CH.A,
  CH.A,
];
const SUMMIT_ZAMPONA = [
  "C#5",
  "E5",
  "C#5",
  "A4",
  "D5",
  "F#5",
  "G#4",
  "B4",
  "C#5",
  "E5",
  "A4",
  "C#5",
  "F#5",
  "G#4",
  "E5",
  "A4",
]
  .map((n) => hold(n, 8))
  .join(" ");

const summit: Track = {
  id: "world.summit",
  title: "Cumbre",
  bpm: 96,
  tempoBoost: 1.06,
  key: { root: "A", scale: "major" },
  layers: [
    { voice: "pad", steps: hold("A3", 64), gain: 0.32, pan: -0.1 },
    { voice: "pad", steps: hold("E4", 64), gain: 0.22, pan: 0.1 },
    { voice: "quena", steps: join(SUMMIT_LEAD), gain: 0.66, pan: 0.05 },
    { voice: "charango", steps: halves(SUMMIT_PROG), gain: 0.46, minIntensity: 0.2, pan: -0.2 },
    { voice: "bombo", steps: rep("x:0.6 . . . . . . . x:0.5 . . . . . . .", 8), gain: 0.5 },
    { voice: "bombo", steps: rep(". . . . . . x:0.5 . . . . . . . x:0.5 .", 8), gain: 0.4, minIntensity: 0.35 },
    { voice: "zampona", steps: SUMMIT_ZAMPONA, gain: 0.42, minIntensity: 0.5, octave: -1, pan: -0.3 },
    { voice: "shaker", steps: rep(GALLOP_SHAKER, 4), gain: 0.35, minIntensity: 0.6, pan: 0.3 },
    { voice: "shaker", steps: rep(". x:0.2 . x:0.2", 4), gain: 0.25, minIntensity: 0.85, pan: -0.3 },
    { voice: "bombo", steps: fill([3, 7]), gain: 0.5, minIntensity: 0.85 },
  ] satisfies Layer[],
};

export const WORLD_TRACKS: Record<"day" | "night" | "summit", Track> = { day, night, summit };
