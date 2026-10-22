// Screenshot pass for the characters harness.
// Usage: bun src/world/characters/dev/shots.mjs <outDir> [only=comma,list] [baseUrl]
// Needs the harness running: bunx vite --config src/world/characters/dev/vite.config.ts --port 5261
// Chromium: PW_CHROMIUM=/path/to/chrome (or Playwright's default).
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "test-results/characters";
const only = (process.argv[3] ?? "").split(",").filter(Boolean);
const base = process.argv[4] ?? "http://localhost:5261/";
const want = (k) => !only.length || only.some((o) => k.startsWith(o));
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = process.env.PW_CHROMIUM;
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const logs = [];
async function open(q = "", vp = { width: 1600, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
  });
  p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  await p.goto(`${base}?clean=1${q}`);
  await p.waitForFunction(() => !!window.__chars, null, { timeout: 120000 });
  // Wait for the worker builds (near LODs) to land.
  for (let i = 0; i < 120; i++) {
    if (await p.evaluate(() => window.__chars.allBuilt())) break;
    await sleep(500);
  }
  await sleep(1200);
  return p;
}
const C = (p, fn, ...a) => p.evaluate(([f, a]) => window.__chars[f](...a), [fn, a]);
const shot = async (p, name) => {
  await p.screenshot({ path: `${out}/${name}.png`, timeout: 180000 });
  console.log("shot", name);
};

if (want("lineup")) {
  const p = await open("&view=lineup", { width: 1900, height: 900 });
  console.log(JSON.stringify(await C(p, "stats")));
  for (const [n, a] of [
    ["front", 0],
    ["34", 0.7],
    ["back", Math.PI],
  ]) {
    await C(p, "setYaw", a);
    await C(p, "view", null, 10.5, 1.7, 0, 0.6, -0.6);
    await sleep(500);
    await shot(p, `lineup-${n}`);
  }
  await C(p, "setYaw", 0.35);
  for (const k of await C(p, "slots")) {
    await C(p, "view", k, 2.4, 1.25, 0.25, 0.85);
    await sleep(300);
    await shot(p, `person-${k}`);
  }
  await p.context().close();
}
if (want("outfits")) {
  const p = await open("&view=outfits", { width: 1700, height: 800 });
  for (const [n, a] of [
    ["front", 0],
    ["34", 0.7],
    ["side", Math.PI / 2],
    ["back", Math.PI],
  ]) {
    await C(p, "setYaw", a);
    await C(p, "view", null, 6.4, 1.2, 0, 0.82);
    await sleep(500);
    await shot(p, `outfits-${n}`);
  }
  await C(p, "setYaw", 0.3);
  for (const k of await C(p, "slots")) {
    await C(p, "view", k, 1.9, 1.3, 0.2, 0.9);
    await sleep(300);
    await shot(p, `outfit-${k}`);
    await C(p, "viewBone", k, "head", 0.9, 0.05, 0.2);
    await sleep(300);
    await shot(p, `face-${k}`);
  }
  // Walk and run strips seen from the side.
  await C(p, "setYaw", Math.PI / 2);
  for (const m of ["walk", "run"]) {
    await C(p, "setMode", m);
    await sleep(1200);
    for (let i = 0; i < 6; i++) {
      await C(p, "hold", i / 6);
      await C(p, "view", "traveler-andean", 2.4, 1.0, 0, 0.8);
      await sleep(250);
      await shot(p, `strip-${m}-${i}`);
    }
    await C(p, "hold", null);
  }
  await C(p, "setMode", "idle");
  await p.context().close();
}
if (want("actions")) {
  const p = await open("&view=actions", { width: 1900, height: 1000 });
  console.log(JSON.stringify(await C(p, "stats")));
  await C(p, "view", null, 15, 6, 0, 0, -3);
  await sleep(800);
  await shot(p, "actions-all");
  const n = (await C(p, "stats")).crowd.people;
  // ACTIONS=4,5,8 shoots only those walkers (busy machines).
  const pickIdx = (process.env.ACTIONS ?? "").split(",").filter(Boolean).map(Number);
  for (let i = 0; i < n; i++) {
    if (pickIdx.length && !pickIdx.includes(i)) continue;
    await C(p, "viewWalker", i, 2.6, 1.3, 0.5, 0.7);
    await sleep(350);
    await shot(p, `action-${String(i).padStart(2, "0")}`);
  }
  await p.context().close();
}
if (want("crowd")) {
  const p = await open("&view=crowd&n=60&mode=walk", { width: 1600, height: 900 });
  await sleep(3000);
  console.log(JSON.stringify(await C(p, "stats")));
  await C(p, "view", null, 14, 4, 0.3, 0.5, -8);
  await sleep(600);
  await shot(p, "crowd");
  await p.evaluate(() => document.body.classList.remove("clean"));
  await sleep(1200);
  await shot(p, "crowd-stats");
  await p.context().close();
}
if (want("ride")) {
  const p = await open("&view=ride", { width: 1600, height: 800 });
  for (const [n, a] of [
    ["side", Math.PI / 2],
    ["34", 0.7],
  ]) {
    await C(p, "setYaw", a);
    await C(p, "view", null, 7.5, 1.6, 0, 1.0);
    await sleep(600);
    await shot(p, `ride-${n}`);
  }
  await C(p, "setYaw", Math.PI / 2);
  for (const k of await C(p, "slots")) {
    await C(p, "view", k, 3.0, 1.5, 0, 1.2);
    await sleep(400);
    await shot(p, `ride-${k}`);
  }
  await C(p, "setMode", "walk");
  await sleep(800);
  await C(p, "view", "ride-horse", 3.0, 1.5, 0, 1.2);
  await sleep(400);
  await shot(p, "ride-horse-walk");
  await p.context().close();
}
if (want("lod")) {
  for (const who of (process.env.WHO ?? "campesina,campesino,comunera").split(",")) {
    const p = await open(`&view=lod&who=${who}`, { width: 1400, height: 800 });
    await C(p, "setYaw", 0.5);
    await C(p, "view", null, 4.6, 1.2, 0, 0.85);
    await sleep(500);
    await shot(p, `lod-${who}`);
    await C(p, "setWire", true);
    await sleep(300);
    await shot(p, `lod-${who}-wire`);
    await p.context().close();
  }
}
console.log(logs.slice(0, 30).join("\n"));
await browser.close();
