// Screenshot pass for the Antisuyu jungle.
// Usage: bun src/world/selva/dev/shots.mjs [baseUrl] [outDir] [only=comma,list]
// baseUrl defaults to the Vite harness (http://localhost:5203/). Prints console errors/warnings, the chunks
// requested (to check that no mountain-only module is loaded), state and draw calls per shot.
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5203/";
const out = process.argv[3] ?? "test-results/selva";
const only = (process.argv[4] ?? "").split(",").filter(Boolean);
const want = (k) => !only.length || only.includes(k);
mkdirSync(out, { recursive: true });
const args = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = (q) => `${base}${base.includes("?") ? "&" : "?"}${q}`;
/** Mountain-only modules the jungle must never request. */
const BANNED = [
  "/src/world/layout.ts",
  "/src/world/terrain.ts",
  "/src/world/trail.ts",
  "/src/world/fauna.ts",
  "/src/world/npcs.ts",
  "/src/world/content.ts",
  "/src/world/landmarks.ts",
  "/src/world/flora/",
];

const browser = await chromium.launch({ args, headless: true });
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
const ready = (p) => p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 60000 });
const report = async (p, name) => {
  const s = await kw(p, "state");
  const dc = await kw(p, "drawCalls");
  console.log(name, JSON.stringify({ t: +s.t.toFixed(3), pos: s.pos.map((v) => +v.toFixed(1)), ...dc }));
};

const shoot = async (p, tag, lang = "es") => {
  await p.goto(url(`lang=${lang}&skip=1`));
  await ready(p);
  await sleep(1500);
  await kw(p, "setTime", 0.42);
  await sleep(500);
  await p.screenshot({ path: `${out}/${tag}-spawn.png` });
  await report(p, `${tag}-spawn`);
  for (const [t, side] of [
    [0.02, 0],
    [0.3, 0],
    [0.6, 0],
    [0.85, 0],
    [0.97, 0],
  ]) {
    for (const [time, label] of [
      [0.42, "day"],
      [0.02, "night"],
    ]) {
      await kw(p, "setTime", time);
      await kw(p, "teleport", t, side);
      await sleep(900);
      const name = `${tag}-t${String(t).replace(".", "")}-${label}`;
      await p.screenshot({ path: `${out}/${name}.png` });
      await report(p, name);
    }
  }
};

if (want("desktop")) {
  const d = await page({ viewport: { width: 1440, height: 900 } });
  await shoot(d, "desktop");
  if (want("punku")) {
    // Look back at the punku from the spawn and check the west edge of the world is hidden.
    await kw(d, "setTime", 0.42);
    await kw(d, "teleport", 0.02, 0, true);
    await sleep(900);
    await d.screenshot({ path: `${out}/desktop-punku-back.png` });
    const prompt = await d.evaluate(() => document.querySelector(".kw-prompt:not([hidden])")?.textContent ?? null);
    await kw(d, "teleport", 0.006, 0, true);
    await sleep(800);
    const prompt2 = await d.evaluate(() => document.querySelector(".kw-prompt:not([hidden])")?.textContent ?? null);
    await d.screenshot({ path: `${out}/desktop-punku-near.png` });
    console.log("prompt at spawn", prompt, "| near punku", prompt2);
    console.log("stamped", JSON.stringify((await kw(d, "state")).stamped));
  }
}
if (want("phone")) {
  const m = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.goto(url("lang=en&skip=1"));
  await ready(m);
  await sleep(1500);
  for (const [t, time, label] of [
    [0.02, 0.42, "day"],
    [0.3, 0.02, "night"],
    [0.6, 0.42, "day"],
  ]) {
    await kw(m, "setTime", time);
    await kw(m, "teleport", t, 0);
    await sleep(900);
    const name = `phone-t${String(t).replace(".", "")}-${label}`;
    await m.screenshot({ path: `${out}/${name}.png` });
    await report(m, name);
  }
}

const banned = [...requested].filter((u) => BANNED.some((b) => u.startsWith(b)));
console.log("banned modules requested:", banned.length ? banned : "none");
console.log("logs:", logs.length ? `\n${logs.join("\n")}` : "clean");
await browser.close();
