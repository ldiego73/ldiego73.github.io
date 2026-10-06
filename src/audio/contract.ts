/**
 * Music contract shared by the audio engine, the arcade shell and the 3D world.
 *
 * Everything is procedural (Web Audio API): no audio files, no licensing. Tracks are data:
 * a tempo, a key, and layers of step strings. The engine plays them with built-in synth voices.
 *
 * Step strings (one token per step, space separated, `|` is an ignored bar line):
 *   `.`        rest
 *   `-`        sustain the previous note one more step
 *   `A3` `C#4` `Bb2`   a note (scientific pitch, C4 = middle C = MIDI 60); optional velocity `A3:0.6`
 *   `x` `X`    drum hit / accent (drum voices only); optional velocity `x:0.4`
 */
import type { VoiceBank } from "./voices";

export type TonalVoice =
  | "pulse12" // thin chip lead
  | "pulse25" // chip lead
  | "pulse50" // hollow chip bass/lead
  | "triangle" // soft chip bass
  | "saw" // buzzy synth
  | "bell" // glassy mallet
  | "pad" // slow soft chord bed
  | "quena" // breathy end-blown flute (Andean)
  | "zampona" // panpipe: breathy, short attack (Andean)
  | "charango"; // bright plucked string, strummed arpeggios (Andean)

export type DrumVoice = "kick" | "snare" | "hat" | "shaker" | "bombo"; // bombo = deep Andean bass drum

export type VoiceName = TonalVoice | DrumVoice;

export const DRUM_VOICES: readonly DrumVoice[] = ["kick", "snare", "hat", "shaker", "bombo"];
export const TONAL_VOICES: readonly TonalVoice[] = [
  "pulse12",
  "pulse25",
  "pulse50",
  "triangle",
  "saw",
  "bell",
  "pad",
  "quena",
  "zampona",
  "charango",
];

export const isDrum = (v: VoiceName): v is DrumVoice => (DRUM_VOICES as readonly string[]).includes(v);

export type ScaleName =
  | "major"
  | "minor"
  | "dorian"
  | "phrygian"
  | "mixolydian"
  | "minorPentatonic"
  | "majorPentatonic"
  | "harmonicMinor";

export interface Layer {
  voice: VoiceName;
  /** Step string, see the header. Loops independently; its length must divide the longest layer's length. */
  steps: string;
  /** 0..1, default 0.6. Relative level inside the track. */
  gain?: number;
  /** The layer plays only when music intensity >= this (0..1, default 0). Layers fade in/out. */
  minIntensity?: number;
  /** The layer plays only when intensity <= this (default 1). Use for calm-only layers. */
  maxIntensity?: number;
  /** Octave shift applied to the notes (default 0). */
  octave?: number;
  /** -1 (left) .. 1 (right), default 0. */
  pan?: number;
}

export interface TrackKey {
  /** Pitch class of the tonic, e.g. "A", "C#", "Bb". */
  root: string;
  scale: ScaleName;
  /** Extra pitch classes allowed outside the scale (passing tones, leading tone), e.g. ["G#"]. */
  extra?: string[];
}

export interface Track {
  /** Stable id, e.g. "arcade.snake" or "world.day". */
  id: string;
  title: string;
  /** Beats per minute, 60..200. */
  bpm: number;
  /** Steps per beat, default 4 (sixteenth notes). */
  stepsPerBeat?: number;
  /** 0..0.5 swing on off-beat steps, default 0. */
  swing?: number;
  key: TrackKey;
  /** Tempo multiplier reached at intensity 1 (default 1.12). 1 = tempo never changes. */
  tempoBoost?: number;
  layers: Layer[];
}

/** Short one-shot jingles built into the engine. */
export type Stinger = "win" | "gameover" | "level" | "toast" | "summit";

export interface PlayOptions {
  /** Fade-in/crossfade time in ms (default 600). */
  fadeMs?: number;
  /** Start intensity 0..1 (default: keep the current one). */
  intensity?: number;
}

export interface AudioState {
  muted: boolean;
  /** Master volume 0..1. */
  volume: number;
  playing: boolean;
  trackId: string | null;
}

/**
 * The shared audio output for sound effects and the world soundscape. Same AudioContext, master volume, mute,
 * limiter as the music. Obtained through `MusicPlayer.output?.()`, which returns null whenever nothing may sound.
 */
export interface AudioOutput {
  ctx: BaseAudioContext;
  /** One-shot effects bus (a little under the music). */
  sfx: AudioNode;
  /** Continuous ambience bus (dipped while stingers play). */
  ambient: AudioNode;
  /** The engine's synth voices (quena, bell, charango...) for musical one-shots. */
  voices: VoiceBank;
  /**
   * Music-side bus for layers that belong to the music (world place motifs, festival band): it follows the music's
   * duck and pause, unlike `sfx` / `ambient`. Optional for older players.
   */
  music?: AudioNode;
}

/** Where the playing track is on its step grid, so other layers can play in time with it. */
export interface MusicClock {
  trackId: string;
  /** Next global step the music has not scheduled yet. */
  step: number;
  /** Audio time of that step (before swing). */
  time: number;
  /** Current step length in seconds (follows the intensity tempo boost). */
  stepSec: number;
  /** 0..0.5 swing delay on odd steps, as a fraction of a step. */
  swing: number;
}

export interface MusicPlayer {
  readonly state: AudioState;
  /**
   * Call from a user gesture (click/key). Resumes the AudioContext. Safe to call repeatedly.
   * Tracks requested before unlock are remembered and start once unlocked.
   */
  unlock(): Promise<void>;
  /** Replace the current track (crossfade). */
  play(track: Track, opts?: PlayOptions): void;
  /** Fade out and stop. */
  stop(fadeMs?: number): void;
  /**
   * Save the current track + intensity on a stack and play `track` over it.
   * `pop()` restores the saved one. Used when a game opens inside the 3D world.
   */
  push(track: Track, opts?: PlayOptions): void;
  pop(opts?: PlayOptions): void;
  /** Freeze/continue at the same position (game pause, tab hidden). */
  pause(): void;
  resume(): void;
  /** 0..1: adds layers, raises tempo (up to tempoBoost) and brightness. Smoothly ramped. */
  setIntensity(value: number): void;
  /** Temporarily scale music level, 0..1 (1 = normal). */
  duck(level: number, ms?: number): void;
  stinger(name: Stinger): void;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  /**
   * Effects/ambience output, or null while audio is locked (no gesture yet), muted, paused, hidden or unsupported.
   * Optional so silent players need not implement it.
   */
  output?(): AudioOutput | null;
  /**
   * The playing track's step grid, or null while nothing plays (or audio is not live). Optional. Pass `out` to
   * have it filled instead of allocating (per-frame callers).
   */
  clock?(out?: MusicClock): MusicClock | null;
  /** Called on any state change (mute, volume, track). Returns an unsubscribe function. */
  onChange(cb: (s: AudioState) => void): () => void;
}
