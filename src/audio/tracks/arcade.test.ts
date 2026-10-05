import { describe, expect, test } from "bun:test";
import { isDrum, type Layer } from "../contract";
import { layerLength, parseSteps, trackLoopSteps, validateTrack } from "../notation";
import { ARCADE_TRACKS } from "./arcade";

const SLUGS = [
  "snake",
  "pac-bug",
  "monolith-breaker",
  "zero-day-sweeper",
  "request-invaders",
  "catch-the-bug",
  "incident-commander",
  "deploy-hero",
  "keep-alive",
  "lobby",
];
const CHIP_VOICES = new Set([
  "pulse12",
  "pulse25",
  "pulse50",
  "triangle",
  "saw",
  "bell",
  "pad",
  "kick",
  "snare",
  "hat",
  "shaker",
]);

function tonalEvents(layer: Layer) {
  return parseSteps(layer.steps, false).events.map((event) => ({
    ...event,
    midi: event.midi! + 12 * (layer.octave ?? 0),
  }));
}

function averagePitch(layer: Layer): number {
  const events = tonalEvents(layer);
  return events.reduce((sum, event) => sum + event.midi, 0) / events.length;
}

describe("arcade scores", () => {
  test("contains exactly the nine game slugs and lobby, with unique matching ids", () => {
    expect(Object.keys(ARCADE_TRACKS).sort()).toEqual([...SLUGS].sort());
    expect(new Set(Object.values(ARCADE_TRACKS).map((track) => track.id)).size).toBe(10);
    for (const slug of SLUGS) expect(ARCADE_TRACKS[slug]!.id).toBe(`arcade.${slug}`);
  });

  for (const slug of SLUGS) {
    describe(slug, () => {
      const track = ARCADE_TRACKS[slug]!;

      test("passes the notation validator with chip voices and clean four-bar loops", () => {
        expect(validateTrack(track)).toEqual([]);
        expect(track.bpm).toBeGreaterThanOrEqual(90);
        expect(track.bpm).toBeLessThanOrEqual(150);
        expect(track.tempoBoost!).toBeGreaterThanOrEqual(1.05);
        expect(track.tempoBoost!).toBeLessThanOrEqual(1.25);
        expect(track.stepsPerBeat).toBe(4);
        const loop = trackLoopSteps(track);
        expect([64, 128]).toContain(loop);
        for (const layer of track.layers) {
          expect(CHIP_VOICES.has(layer.voice)).toBe(true);
          expect(loop % layerLength(layer)).toBe(0);
          expect(layer.gain!).toBeGreaterThanOrEqual(0.35);
          expect(layer.gain!).toBeLessThanOrEqual(0.8);
        }
      });

      test("starts sparse and grows through distinct intensity gates", () => {
        const loop = trackLoopSteps(track);
        const audible = track.layers.filter((layer) => (layer.minIntensity ?? 0) === 0);
        // Density = sum of onset-bearing steps across ALL audible layers / loop steps.
        // Expand shorter loops; a sustained event counts once, simultaneous layers each count.
        // This measures rhythmic activity, not held-note occupancy or envelope duration.
        const onsets = audible.reduce((sum, layer) => {
          const parsed = parseSteps(layer.steps, isDrum(layer.voice));
          return sum + new Set(parsed.events.map((event) => event.step)).size * (loop / parsed.length);
        }, 0);
        expect(onsets / loop).toBeLessThanOrEqual(0.45);
        expect(audible.some((layer) => layer.voice === "hat" || layer.voice === "shaker")).toBe(true);
        expect(track.layers.length).toBeGreaterThanOrEqual(4);
        const thresholds = new Set(track.layers.map((layer) => layer.minIntensity ?? 0));
        expect(thresholds.size).toBeGreaterThanOrEqual(3);
        expect(thresholds.has(0.3)).toBe(true);
        expect(thresholds.has(slug === "keep-alive" ? 0.6 : 0.55)).toBe(true);
        expect(thresholds.has(0.8)).toBe(true);
        expect(
          track.layers.filter((layer) => layer.voice === "kick").every((layer) => layer.minIntensity! >= 0.3),
        ).toBe(true);
      });

      test("high melody has a real pitch vocabulary and bass outlines each bar", () => {
        const tonal = track.layers
          .filter((layer) => !isDrum(layer.voice))
          .sort((a, b) => averagePitch(a) - averagePitch(b));
        const bass = tonal[0]!;
        const high = tonal[tonal.length - 1]!;
        expect(new Set(tonalEvents(high).map((event) => event.midi)).size).toBeGreaterThanOrEqual(8);
        expect(averagePitch(high) - averagePitch(bass)).toBeGreaterThan(24);
        const parsed = tonalEvents(bass);
        const length = layerLength(bass);
        const loop = trackLoopSteps(track);
        for (let start = 0; start < loop; start += 16) {
          const classes = new Set<number>();
          for (let repeat = 0; repeat < loop; repeat += length) {
            for (const event of parsed) {
              const step = repeat + event.step;
              if (step >= start && step < start + 16) classes.add(event.midi % 12);
            }
          }
          expect(classes.size).toBeGreaterThanOrEqual(2);
        }
      });
    });
  }
});
