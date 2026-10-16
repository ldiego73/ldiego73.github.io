// Screenshot pass for the Cusco hub.
// Usage: bun src/world/cusco/dev/shots.mjs [baseUrl] [outDir] [only=comma,list]
// baseUrl defaults to the Vite harness (http://localhost:5221/). Prints console errors/warnings, mountain- or
// jungle-only chunks requested (there must be none), state and draw calls per shot.
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5221/";
const out = process.argv[3] ?? "test-results/cusco";
const only = (process.argv[4] ?? "").split(",").filter(Boolean);
const want = (k) => !only.length || only.includes(k);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = (q) => `${base}${base.includes("?") ? "&" : "?"}${q}`;
const BANNED = [
  "/src/world/layout.ts",
  "/src/world/terrain.ts",
  "/src/world/trail.ts",
  "/src/world/fauna.ts",
  "/src/world/npcs.ts",
  "/src/world/content.ts",
  "/src/world/landmarks.ts",
  "/src/world/flora/",
  "/src/world/selva/",
];
const exe = process.env.PW_CHROMIUM;
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const logs = [];
const requested = new Set();
async function page(ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const p = await ctx.newPage();
  p.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
  });
  p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  p.on("request", (r) => requested.add(new URL(r.url()).pathname));
  return p;
}
const kw = (p, fn, ...a) => p.evaluate(([f, a]) => document.getElementById("world").__kw[f](...a), [fn, a]);
const ready = (p) => p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 90000 });
const report = async (p, name) => {
  const s = await kw(p, "state");
  const dc = await kw(p, "drawCalls");
  console.log(name, JSON.stringify({ pos: s.pos.map((v) => +v.toFixed(1)), stamped: s.stamped, ...dc }));
};
const shot = async (p, name) => {
  await p.screenshot({ path: `${out}/${name}.png` });
  await report(p, name);
};
/** Stand at (x, z) facing (tx, tz), camera orbit (yaw offset, pitch, distance). */
const view = async (p, x, z, tx, tz, orbit = [0, 0.32, 9.5]) => {
  await kw(p, "face", x, z, tx, tz);
  await kw(p, "orbit", ...orbit);
  await sleep(700);
};
const open = async (p, q) => {
  await p.goto(url(q));
  await ready(p);
  await sleep(2500);
};

const views = [
  ["spawn", null],
  ["usnu", [0, 14, 0, 0, [0, 0.38, 14]]],
  ["overview", [0, 30, 0, 0, [0, 0.62, 40]]],
  ["north", [0, 10, 0, -40, [0, 0.25, 12]]],
  ["qorikancha", [22, 0, 40, 0, [0, 0.28, 10]]],
  ["antisuyu", [38, -30, 54, -46, [0, 0.3, 9]]],
  ["hatun", [41, -35, 36, -40, [0.6, 0.18, 6]]],
  ["chinchaysuyu", [-38, -30, -54, -46, [0, 0.3, 9]]],
  ["collasuyu", [38, 30, 54, 46, [0, 0.3, 9]]],
  ["kuntisuyu", [-38, 30, -54, 46, [0, 0.3, 9]]],
  ["qhapaq", [0, 40, 0, 56, [0, 0.3, 9]]],
  ["chasqui", [-15, 15, -15, 22, [0, 0.3, 8]]],
  ["sacsay", [0, 0, 0, -150, [0, 0.42, 26]]],
];

const run = async (p, tag, lang, time) => {
  await open(p, `lang=${lang}&skip=1`);
  await kw(p, "setTime", time);
  await sleep(600);
  for (const [name, v] of views) {
    if (only.length && !only.includes(name) && !only.includes(tag.split("-")[0])) continue;
    if (v) await view(p, ...v);
    await shot(p, `${tag}-${name}`);
  }
};

const viewOnly = views.some(([n]) => only.includes(n));
if (want("day") || viewOnly) await run(await page({ viewport: { width: 1440, height: 900 } }), "day-es", "es", 0.42);
if (want("night")) await run(await page({ viewport: { width: 1440, height: 900 } }), "night-en", "en", 0.02);
if (want("phone")) {
  const p = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await open(p, "lang=es&skip=1");
  await kw(p, "setTime", 0.42);
  await shot(p, "phone-spawn");
}
if (want("from")) {
  for (const f of ["selva", "qhapaq"]) {
    const p = await page({ viewport: { width: 1280, height: 800 } });
    await open(p, `lang=es&from=${f}`);
    await kw(p, "setTime", 0.42);
    await sleep(500);
    await shot(p, `from-${f}`);
  }
}
const bad = [...requested].filter((r) => BANNED.some((b) => r.startsWith(b)));
console.log("banned chunks:", bad.length ? bad : "none");
console.log(logs.length ? logs.join("\n") : "no console errors");
await browser.close();
