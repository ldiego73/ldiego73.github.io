/**
 * Offline loudness/health check for the procedural tracks.
 * Usage: bun scripts/audio-qa.ts [trackIdPrefix] [--secs=N] [--wav=outDir] [--demo]
 * Bundles the engine with Bun, renders every Track found in src/audio/tracks/*.ts (and every built-in stinger)
 * with an OfflineAudioContext inside Chromium, at intensities 0, 0.5 and 1, and prints per track:
 * peak dBFS, RMS dBFS, clipped samples, silence ratio. Warns when RMS is outside -20 +/- 3 dBFS or a NaN shows up.
 * Nothing here is a substitute for listening: the numbers only catch gross level/clipping/silence problems.
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}`))?.split("=")[1] ?? null;
const prefix = args.find((a) => !a.startsWith("--")) ?? "";
const secsArg = flag("secs");
const wavDir = flag("wav");
const demo = args.includes("--demo");

const root = resolve(import.meta.dir, "..");
const audioDir = join(root, "src/audio");
const trackFiles = readdirSync(join(audioDir, "tracks")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

const TARGET = -20;
const TOLERANCE = 3;

const entry = `
import { AudioEngine } from ${JSON.stringify(join(audioDir, "engine.ts"))};
import { stepSeconds } from ${JSON.stringify(join(audioDir, "scheduler.ts"))};
import { trackLoopSteps } from ${JSON.stringify(join(audioDir, "notation.ts"))};
import { STINGERS } from ${JSON.stringify(join(audioDir, "stingers.ts"))};
${trackFiles.map((f, i) => `import * as T${i} from ${JSON.stringify(join(audioDir, "tracks", f))};`).join("\n")}

const tracks = [];
const seen = new Set();
const visit = (v, depth) => {
  if (!v || typeof v !== "object" || depth > 3) return;
  if (Array.isArray(v.layers) && typeof v.id === "string") { if (!seen.has(v.id)) { seen.add(v.id); tracks.push(v); } return; }
  for (const k of Object.keys(v)) visit(v[k], depth + 1);
};
[${trackFiles.map((_, i) => `T${i}`).join(", ")}].forEach((m) => visit(m, 0));

const SR = 44100;
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

function analyse(buf) {
  let peak = 0, sum = 0, n = 0, clip = 0, nan = 0, silent = 0, windows = 0;
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const win = Math.floor(SR * 0.05);
  for (let w = 0; w + win <= L.length; w += win) {
    let ws = 0;
    for (let i = w; i < w + win; i++) {
      const a = L[i], b = R[i];
      if (Number.isNaN(a) || Number.isNaN(b)) { nan++; continue; }
      const m = Math.max(Math.abs(a), Math.abs(b));
      if (m > peak) peak = m;
      if (m >= 0.999) clip++;
      ws += (a * a + b * b) / 2;
    }
    sum += ws; n += win; windows++;
    if (10 * Math.log10(ws / win + 1e-20) < -60) silent++;
  }
  return { peak: db(peak), rms: db(Math.sqrt(sum / Math.max(1, n))), clip, nan, silence: windows ? silent / windows : 1 };
}

function pcm16(buf) {
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const out = new Int16Array(L.length * 2);
  for (let i = 0; i < L.length; i++) {
    out[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767;
    out[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767;
  }
  let s = ""; const u = new Uint8Array(out.buffer);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

window.__qa = {
  ids: () => tracks.map((t) => t.id),
  stingers: () => Object.keys(STINGERS),
  defaultSecs: (id) => {
    const t = tracks.find((x) => x.id === id);
    return Math.min(40, Math.max(8, Math.ceil(trackLoopSteps(t) * stepSeconds(t, 0) * 2)));
  },
  addTrack: (t) => { if (!seen.has(t.id)) { seen.add(t.id); tracks.push(t); } },
  async render(kind, id, intensity, secs, wav) {
    const ctx = new OfflineAudioContext(2, Math.floor(SR * secs), SR);
    const engine = new AudioEngine(ctx);
    engine.setLevelNow(1);
    let secsOut = secs;
    if (kind === "stinger") engine.scheduleStingerOffline(id);
    else {
      const t = tracks.find((x) => x.id === id);
      engine.createRunner(t, 0, intensity).scheduleRange(secs);
    }
    const buf = await ctx.startRendering();
    const res = analyse(buf);
    res.dropped = engine.voices.dropped;
    if (wav) res.pcm = pcm16(buf);
    return res;
  },
};
`;

const entryPath = join(tmpdir(), "ldiego73-audio-qa-entry.ts");
writeFileSync(entryPath, entry);
const built = await Bun.build({ entrypoints: [entryPath], target: "browser", format: "iife" });
if (!built.success) {
  console.error(built.logs.join("\n"));
  process.exit(1);
}
const bundle = await (built.outputs[0] as Blob).text();

const DEMO = {
  id: "demo.andes",
  title: "Demo",
  bpm: 96,
  swing: 0.1,
  key: { root: "D", scale: "minorPentatonic" },
  layers: [
    { voice: "bombo", steps: "x . . . . . x . x . . . . . . . ".repeat(2), gain: 0.7 },
    { voice: "shaker", steps: "x:0.4 x:0.6 x:0.5 x:0.6 ".repeat(8), gain: 0.4, minIntensity: 0.3 },
    { voice: "triangle", steps: "D2 . . . . . A2 . D2 . . . F2 . A2 . ".repeat(2), gain: 0.6 },
    { voice: "charango", steps: "D4 F4 A4 D5 A4 F4 A4 D5 ".repeat(4), gain: 0.5, minIntensity: 0.15 },
    {
      voice: "quena",
      steps: "A4 - - - - - D5 - F5 - - - - - - - . . . . A4 - - - D5 - - - - - - - ",
      gain: 0.6,
      octave: 0,
    },
    { voice: "zampona", steps: "D4 . . . F4 . . . A3 . . . C4 . . . ".repeat(2), gain: 0.4, minIntensity: 0.6 },
    { voice: "pad", steps: "D3 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ", gain: 0.3 },
  ],
};
const FAKE = demo || (args.length === 0 && trackFiles.length === 0);

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.setContent("<!doctype html><title>qa</title>");
await page.addScriptTag({ content: bundle });
const qa = (fn: string, ...a: unknown[]) =>
  page.evaluate(
    ([f, x]) =>
      (window as unknown as { __qa: Record<string, (...a: unknown[]) => unknown> }).__qa[f as string](
        ...(x as unknown[]),
      ),
    [fn, a] as const,
  );
if (FAKE) await qa("addTrack", DEMO);

const ids = ((await qa("ids")) as string[]).filter((id) => id.startsWith(prefix));
const stingers = ((await qa("stingers")) as string[]).filter((s) => `stinger.${s}`.startsWith(prefix));
if (wavDir) mkdirSync(wavDir, { recursive: true });

interface Res {
  peak: number;
  rms: number;
  clip: number;
  nan: number;
  silence: number;
  dropped: number;
  pcm?: string;
}
const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1).padStart(6) : "  -inf");
let warnings = 0;
const warn = (msg: string) => {
  warnings++;
  console.log(`  WARN ${msg}`);
};

function writeWav(name: string, pcm: string, sr = 44100) {
  const data = Buffer.from(pcm, "base64");
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  writeFileSync(join(wavDir as string, `${name}.wav`), Buffer.concat([h, data]));
}

console.log(`target RMS ${TARGET} dBFS +/- ${TOLERANCE}   (peak/rms in dBFS)`);
console.log(
  "id".padEnd(28),
  "int".padStart(4),
  "peak".padStart(6),
  " rms".padStart(6),
  "clip".padStart(6),
  " silence",
  "drop",
);
if (ids.length === 0 && stingers.length === 0)
  console.log(`no tracks match "${prefix}" (tracks dir has ${trackFiles.length} files)`);

for (const id of ids) {
  const secs = secsArg ? Number(secsArg) : ((await qa("defaultSecs", id)) as number);
  for (const intensity of [0, 0.5, 1]) {
    const r = (await qa("render", "track", id, intensity, secs, !!wavDir)) as Res;
    console.log(
      id.padEnd(28),
      intensity.toFixed(1).padStart(4),
      fmt(r.peak),
      fmt(r.rms),
      String(r.clip).padStart(6),
      `${(r.silence * 100).toFixed(0).padStart(6)}%`,
      String(r.dropped).padStart(4),
    );
    if (r.nan) warn(`${id} @${intensity}: ${r.nan} NaN samples`);
    if (r.clip) warn(`${id} @${intensity}: ${r.clip} clipped samples`);
    if (!Number.isFinite(r.rms) || Math.abs(r.rms - TARGET) > TOLERANCE)
      warn(`${id} @${intensity}: RMS ${r.rms.toFixed(1)} dBFS is outside ${TARGET} +/- ${TOLERANCE}`);
    if (r.silence > 0.35) warn(`${id} @${intensity}: ${(r.silence * 100).toFixed(0)}% of the render is silent`);
    if (r.dropped > 0) warn(`${id} @${intensity}: ${r.dropped} notes dropped by the polyphony cap`);
    if (wavDir && r.pcm) writeWav(`${id}@${intensity}`, r.pcm);
  }
}
for (const s of stingers) {
  const r = (await qa("render", "stinger", s, 0, 3.5, !!wavDir)) as Res;
  console.log(
    `stinger.${s}`.padEnd(28),
    "   -",
    fmt(r.peak),
    fmt(r.rms),
    String(r.clip).padStart(6),
    `${(r.silence * 100).toFixed(0).padStart(6)}%`,
  );
  if (r.nan) warn(`stinger.${s}: NaN samples`);
  if (r.clip) warn(`stinger.${s}: ${r.clip} clipped samples`);
  if (r.peak < -30) warn(`stinger.${s}: very quiet (peak ${r.peak.toFixed(1)} dBFS)`);
  if (wavDir && r.pcm) writeWav(`stinger.${s}`, r.pcm);
}
await browser.close();
if (errors.length) console.log(`browser errors:\n${errors.join("\n")}`);
console.log(warnings ? `${warnings} warning(s)` : "all checks passed");
process.exit(errors.length ? 1 : 0);
