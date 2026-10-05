import type { Layer, TonalVoice, Track, TrackKey } from "../contract";

interface Score {
  slug: string;
  title: string;
  key: TrackKey;
  bpm: number;
  boost: number;
  swing: number;
  progression: string;
  /** Each bar lists root, third and fifth in the bass register. */
  chords: [string, string, string, string];
  /** Two notes per bar: statement over bars 1–2, varied answer over bars 3–4. */
  motif: string;
  /** Four notes per bar, in a separate high register. */
  counter: string;
  bassVoice: TonalVoice;
  leadVoice: TonalVoice;
  arpVoice: TonalVoice;
  bassSlots: [number, number, number];
  leadSlots: [number, number];
  kick: string;
  snare: string;
  hat: string;
  pad?: boolean;
}

/** Put articulated notes on a 16-step bar; rests preserve the gaps in the groove. */
function bar(notes: string[], slots: readonly number[], velocities: readonly number[]): string {
  const steps = Array<string>(16).fill(".");
  slots.forEach((slot, i) => {
    steps[slot] = `${notes[i % notes.length]}:${velocities[i % velocities.length]}`;
  });
  return steps.join(" ");
}

function chordRegister(note: string): string {
  // Fold upper bass fifths down to keep the accompaniment below the high lead.
  const shift = /^[FGAB][#b]?3$/.test(note) ? 1 : 2;
  return note.replace(/\d$/, (octave) => String(Number(octave) + shift));
}

function compose(score: Score): Track {
  const chords = score.chords.map((chord) => chord.split(" "));
  const motif = score.motif.split(" ");
  const counter = score.counter.split(" ");
  const layers: Layer[] = [
    {
      voice: score.bassVoice,
      gain: 0.72,
      steps: chords.map((chord) => bar(chord, score.bassSlots, [0.95, 0.65, 0.8])).join(" | "),
    },
    {
      voice: score.leadVoice,
      gain: 0.42,
      pan: -0.15,
      steps: chords.map((_, i) => bar(motif.slice(i * 2, i * 2 + 2), score.leadSlots, [0.8, 0.5])).join(" | "),
    },
    { voice: score.slug === "lobby" ? "shaker" : "hat", gain: 0.35, steps: score.hat },
    { voice: "kick", gain: 0.8, minIntensity: 0.3, steps: score.kick },
    { voice: "snare", gain: 0.55, minIntensity: 0.3, steps: score.snare },
    {
      voice: score.arpVoice,
      gain: 0.38,
      minIntensity: score.slug === "keep-alive" ? 0.6 : 0.55,
      pan: 0.3,
      // Root–third–fifth–third, twice per bar: the harmony follows the bass exactly.
      steps: chords
        .map((chord) => {
          const upper = chord.map(chordRegister);
          return bar(
            [upper[0]!, upper[1]!, upper[2]!, upper[1]!, upper[0]!, upper[1]!, upper[2]!, upper[1]!],
            [0, 2, 4, 6, 8, 10, 12, 14],
            [0.75, 0.4, 0.6, 0.45],
          );
        })
        .join(" | "),
    },
    {
      voice: "pulse12",
      gain: 0.35,
      minIntensity: 0.8,
      pan: -0.35,
      steps: chords
        .map((_, i) => bar(counter.slice(i * 4, i * 4 + 4), [1, 5, 9, 13], [0.9, 0.5, 0.7, 0.45]))
        .join(" | "),
    },
    {
      voice: "shaker",
      gain: 0.35,
      minIntensity: 0.8,
      steps: ". x:0.3 . x:0.5 . x:0.3 . x:0.4 . x:0.3 . x:0.5 . x:0.3 . x:0.4",
    },
  ];
  if (score.pad) {
    // One quiet root per bar, held for two beats, then space; fades away as danger grows.
    layers.push({
      voice: "pad",
      gain: 0.35,
      maxIntensity: 0.4,
      steps: chords.map((chord) => `${chordRegister(chord[0]!)}:0.4 - - - - - - - . . . . . . . .`).join(" | "),
    });
  }
  if (score.slug === "zero-day-sweeper") {
    // Long dotted-quarter bells hang over the gaps in the ticking suspense groove.
    layers[1]!.steps = layers[1]!.steps.replace(/([A-G][#b]?\d:[\d.]+)(?: \.){5}/g, "$1 - - - - -");
  } else if (score.slug === "keep-alive") {
    // A gentle dotted-eighth bell figure leaves room for the calm-only pad.
    layers[1]!.steps = layers[1]!.steps.replace(/([A-G][#b]?\d:[\d.]+) \. \./g, "$1 - -");
  }
  return {
    id: `arcade.${score.slug}`,
    title: score.title,
    key: score.key,
    bpm: score.bpm,
    stepsPerBeat: 4,
    tempoBoost: score.boost,
    swing: score.swing,
    layers,
  };
}

const FOUR_FLOOR = "X:0.95 . . . x:0.8 . . . X:0.9 . . . x:0.8 . . .";
const BACKBEAT = ". . . . X:0.9 . . . . . . x:0.35 X:0.95 . . .";
const TICK = ". . x:0.4 . . . . . . . . . . . . .";

/** Harmony and phrases are authored, not random: every entry is a four-bar, 64-step score. */
const SCORES: Score[] = [
  {
    slug: "snake",
    title: "Pocket Serpent",
    key: { root: "C", scale: "major" },
    bpm: 124,
    boost: 1.12,
    swing: 0.12,
    progression: "I–V–vi–IV",
    chords: ["C2 E2 G2", "G2 B2 D3", "A2 C3 E3", "F2 A2 C3"],
    motif: "G4 E5 A4 G5 G4 F5 D5 C5",
    counter: "C5 E5 G5 B5 D5 F5 A5 C6 E5 G5 B5 A5 G5 F5 D5 C5",
    bassVoice: "triangle",
    leadVoice: "pulse25",
    arpVoice: "pulse50",
    bassSlots: [0, 6, 12],
    leadSlots: [3, 10],
    kick: FOUR_FLOOR,
    snare: BACKBEAT,
    hat: TICK,
  },
  {
    slug: "pac-bug",
    title: "Chase the Packet",
    key: { root: "A", scale: "minor" },
    bpm: 148,
    boost: 1.16,
    swing: 0,
    progression: "i–VI–III–VII",
    chords: ["A2 C3 E3", "F2 A2 C3", "C2 E2 G2", "G2 B2 D3"],
    motif: "E5 A5 E5 G5 G5 E5 D5 B4",
    counter: "C5 E5 A5 B5 D5 F5 G5 C6 E5 G5 B5 A5 G5 E5 D5 C5",
    bassVoice: "pulse50",
    leadVoice: "pulse12",
    arpVoice: "pulse25",
    bassSlots: [0, 4, 10],
    leadSlots: [2, 8],
    kick: "X:1 . . x:0.5 x:0.8 . . . X:0.95 . . x:0.5 x:0.8 . . .",
    snare: BACKBEAT,
    hat: TICK,
  },
  {
    slug: "monolith-breaker",
    title: "Break the Block",
    key: { root: "D", scale: "mixolydian" },
    bpm: 132,
    boost: 1.1,
    swing: 0,
    progression: "I–VII–IV–I",
    chords: ["D2 F#2 A2", "C2 E2 G2", "G2 B2 D3", "D2 F#2 A2"],
    motif: "A4 D5 G4 C5 B4 G5 F#5 D5",
    counter: "D5 F#5 A5 C6 E5 G5 B5 D6 G5 A5 B5 C6 A5 G5 F#5 D5",
    bassVoice: "saw",
    leadVoice: "pulse50",
    arpVoice: "pulse25",
    bassSlots: [0, 7, 10],
    leadSlots: [4, 12],
    kick: "X:1 . . . x:0.9 . x:0.5 . X:1 . . . x:0.9 . . x:0.5",
    snare: BACKBEAT,
    hat: TICK,
  },
  {
    slug: "zero-day-sweeper",
    title: "Hidden Fuse",
    key: { root: "B", scale: "harmonicMinor" },
    bpm: 100,
    boost: 1.08,
    swing: 0,
    progression: "i–VI–iv–V",
    chords: ["B2 D3 F#3", "G2 B2 D3", "E2 G2 B2", "F#2 A#2 C#3"],
    motif: "B4 F#5 B4 G5 E5 D5 C#5 B4",
    counter: "B4 C#5 D5 F#5 E5 G5 A#5 B5 G5 E5 D5 C#5 F#5 E5 A#5 B5",
    bassVoice: "triangle",
    leadVoice: "bell",
    arpVoice: "pulse50",
    bassSlots: [0, 8, 14],
    leadSlots: [2, 10],
    kick: "X:0.9 . . . . . . . x:0.6 . . . . . . .",
    snare: ". . . . . . . . . . . . x:0.5 . . .",
    hat: TICK,
  },
  {
    slug: "request-invaders",
    title: "Descending Requests",
    key: { root: "E", scale: "phrygian" },
    bpm: 118,
    boost: 1.14,
    swing: 0,
    progression: "i–VII–VI–v",
    chords: ["E3 B2 G2", "D3 A2 F2", "C3 G2 E2", "B2 F2 D2"],
    motif: "B4 E5 A4 D5 G4 C5 F5 E5",
    counter: "E5 F5 G5 B5 D5 A5 C6 E6 C6 B5 A5 G5 F5 G5 F5 E5",
    bassVoice: "pulse50",
    leadVoice: "pulse25",
    arpVoice: "triangle",
    bassSlots: [0, 4, 8],
    leadSlots: [6, 14],
    kick: "X:0.95 . . . . . . . X:0.95 . . . . . . .",
    snare: ". . . . X:0.9 . . . . . . . X:0.9 . x:0.35 .",
    hat: TICK,
  },
  {
    slug: "catch-the-bug",
    title: "Bug Bounce",
    key: { root: "G", scale: "major" },
    bpm: 140,
    boost: 1.18,
    swing: 0.08,
    progression: "I–vi–IV–V",
    chords: ["G2 B2 D3", "E2 G2 B2", "C2 E2 G2", "D2 F#2 A2"],
    motif: "D5 B5 E5 G5 E5 C5 A5 G5",
    counter: "D5 G5 B5 D6 E5 F#5 A5 C6 G5 E6 D6 B5 A5 G5 F#5 G5",
    bassVoice: "triangle",
    leadVoice: "pulse12",
    arpVoice: "bell",
    bassSlots: [0, 6, 11],
    leadSlots: [3, 9],
    kick: FOUR_FLOOR,
    snare: BACKBEAT,
    hat: TICK,
  },
  {
    slug: "incident-commander",
    title: "Escalation Ladder",
    key: { root: "D", scale: "minor", extra: ["C#"] },
    bpm: 126,
    boost: 1.2,
    swing: 0,
    progression: "i–VI–iv–V (leading-tone accent)",
    chords: ["D2 F2 A2", "Bb2 D3 F3", "G2 Bb2 D3", "A2 E3 A2"],
    motif: "A4 A4 Bb4 Bb4 D5 F5 C#5 D5",
    counter: "D5 E5 F5 A5 E5 G5 Bb5 C6 F5 G5 A5 Bb5 A5 G5 C#6 D6",
    bassVoice: "pulse50",
    leadVoice: "pulse25",
    arpVoice: "saw",
    bassSlots: [0, 5, 10],
    leadSlots: [2, 10],
    kick: "X:1 . . . x:0.8 . . x:0.4 X:0.95 . . . x:0.8 . . x:0.5",
    snare: BACKBEAT,
    hat: TICK,
  },
  {
    slug: "deploy-hero",
    title: "Assembly Line",
    key: { root: "C", scale: "dorian" },
    bpm: 112,
    boost: 1.12,
    swing: 0.04,
    progression: "i–IV–VII–i",
    chords: ["C2 Eb2 G2", "F2 A2 C3", "Bb2 D3 F3", "C2 Eb2 G2"],
    motif: "G4 C5 A4 F5 Bb4 D5 Eb5 C5",
    counter: "C5 Eb5 G5 Bb5 D5 F5 A5 C6 Bb5 A5 G5 F5 Eb5 D5 Bb5 C6",
    bassVoice: "saw",
    leadVoice: "pulse12",
    arpVoice: "pulse50",
    bassSlots: [0, 7, 14],
    leadSlots: [3, 11],
    kick: "X:0.95 . . x:0.45 . . x:0.8 . X:0.9 . . . . x:0.7 . .",
    snare: BACKBEAT,
    hat: TICK,
  },
  {
    slug: "keep-alive",
    title: "Heartbeat Monitor",
    key: { root: "D", scale: "dorian" },
    bpm: 96,
    boost: 1.18,
    swing: 0.06,
    progression: "i–IV–VII–i",
    chords: ["D2 F2 A2", "G2 B2 D3", "C2 E2 G2", "D2 F2 A2"],
    motif: "A4 D5 B4 G5 G4 E5 F5 D5",
    counter: "D5 F5 A5 C6 E5 G5 B5 D6 C6 B5 A5 G5 F5 E5 C6 D6",
    bassVoice: "triangle",
    leadVoice: "bell",
    arpVoice: "pulse25",
    pad: true,
    bassSlots: [0, 8, 12],
    leadSlots: [2, 10],
    kick: "X:0.9 . . x:0.5 . . . . X:0.85 . . x:0.4 . . . .",
    snare: BACKBEAT,
    hat: TICK,
  },
  {
    slug: "lobby",
    title: "Insert Coin, Take a Breath",
    key: { root: "F", scale: "major" },
    bpm: 92,
    boost: 1.06,
    swing: 0.18,
    progression: "I–vi–ii–V",
    chords: ["F2 A2 C3", "D2 F2 A2", "G2 Bb2 D3", "C2 E2 G2"],
    motif: "A4 C5 A4 D5 Bb4 G5 E5 F5",
    counter: "C5 F5 A5 C6 D5 E5 G5 Bb5 A5 G5 F5 E5 D5 G5 E5 F5",
    bassVoice: "triangle",
    leadVoice: "pulse50",
    arpVoice: "bell",
    pad: true,
    bassSlots: [0, 6, 10],
    leadSlots: [3, 11],
    kick: "X:0.65 . . . . . x:0.45 . x:0.6 . . . . . x:0.4 .",
    snare: ". . . x:0.35 . . . . . . x:0.4 . . . . .",
    hat: TICK,
  },
];

/** Arcade game slugs plus the calm arcade-hall loop. */
export const ARCADE_TRACKS: Record<string, Track> = Object.fromEntries(
  SCORES.map((score) => [score.slug, compose(score)]),
);
