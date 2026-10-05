import type { Stinger, VoiceName } from "./contract";
import { noteToMidi } from "./notation";

export interface StingerNote {
  /** Seconds from the start of the jingle. */
  at: number;
  voice: VoiceName;
  midi: number | null;
  dur: number;
  vel: number;
}

export interface StingerDef {
  notes: StingerNote[];
  /** Total length in seconds (used to time the music duck). */
  length: number;
  /** Level of the stinger bus. */
  gain: number;
  /** Music duck level while it plays. */
  duck: number;
}

const m = (n: string) => noteToMidi(n) as number;

/** A run of notes on one voice, `step` seconds apart. */
function run(voice: VoiceName, start: number, step: number, names: string[], dur: number, vel = 0.9): StingerNote[] {
  return names.map((n, i) => ({ at: start + i * step, voice, midi: m(n), dur, vel }));
}
const one = (voice: VoiceName, at: number, name: string | null, dur: number, vel = 0.9): StingerNote => ({
  at,
  voice,
  midi: name === null ? null : m(name),
  dur,
  vel,
});

export const STINGERS: Record<Stinger, StingerDef> = {
  win: {
    length: 1.5,
    gain: 0.75,
    duck: 0.35,
    notes: [
      ...run("pulse25", 0, 0.08, ["C5", "E5", "G5", "C6"], 0.08),
      one("pulse25", 0.34, "E6", 0.7),
      one("pulse50", 0.34, "C4", 0.7, 0.7),
      one("triangle", 0.34, "C3", 0.8, 0.9),
      one("bell", 0.34, "G5", 0.9, 0.6),
      one("kick", 0, null, 0.1, 0.8),
    ],
  },
  gameover: {
    length: 2.0,
    gain: 0.75,
    duck: 0.3,
    notes: [
      ...run("pulse50", 0, 0.22, ["E4", "D4", "C4", "B3"], 0.2, 0.8),
      one("pulse50", 0.9, "A3", 0.9, 0.8),
      one("triangle", 0.9, "A2", 1.0, 0.9),
      one("saw", 0.9, "E3", 0.9, 0.35),
    ],
  },
  level: {
    length: 0.9,
    gain: 0.7,
    duck: 0.5,
    notes: [
      ...run("pulse25", 0, 0.07, ["G4", "C5", "E5", "G5"], 0.07),
      one("pulse25", 0.3, "C6", 0.4),
      one("triangle", 0.3, "C3", 0.4, 0.8),
      one("hat", 0.3, null, 0.05, 0.8),
    ],
  },
  toast: {
    length: 0.5,
    gain: 1,
    duck: 0.7,
    notes: [one("bell", 0, "E6", 0.2, 0.7), one("bell", 0.09, "B6", 0.3, 0.55)],
  },
  summit: {
    length: 2.6,
    gain: 0.5,
    duck: 0.3,
    notes: [
      // charango strum rolling up D major pentatonic, quena answering, zampona + bombo underneath
      ...run("charango", 0, 0.07, ["D4", "A4", "D5", "F#5", "A5", "D6"], 0.4, 0.85),
      one("bombo", 0, null, 0.6, 0.9),
      one("pad", 0, "D3", 2.2, 0.8),
      one("pad", 0, "A3", 2.2, 0.6),
      one("quena", 0.5, "A4", 0.5, 0.8),
      one("quena", 1.05, "F#5", 0.35, 0.8),
      one("quena", 1.42, "A5", 1.1, 0.9),
      ...run("charango", 1.1, 0.09, ["D5", "F#5", "A5"], 0.4, 0.75),
      one("zampona", 1.42, "D5", 1.0, 0.6),
      one("bombo", 1.42, null, 0.8, 1),
      one("shaker", 1.42, null, 0.2, 0.7),
    ],
  },
};
