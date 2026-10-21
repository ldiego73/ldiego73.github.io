// Screenshot pass for the characters prototype (old vs new).
// Usage: bun src/world/characters/dev/shots.mjs [outDir] [only=comma,list] [baseUrl]
// Needs the harness running: bunx vite --config src/world/characters/dev/vite.config.ts --port 5261
// Chromium: PW_CHROMIUM=/opt/pw-browsers/chromium (or Playwright's default).
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "test-results/characters";
const only = (process.argv[3] ?? "").split(",").filter(Boolean);
const base = process.argv[4] ?? "http://localhost:5261/";
const want = (k) => !only.length || only.some((o) => k.startsWith(o) || o.startsWith(k));
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
  await sleep(1500);
  return p;
}
const C = (p, fn, ...a) => p.evaluate(([f, a]) => window.__chars[f](...a), [fn, a]);
const shot = async (p, name) => {
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log("shot", name);
};

if (want("lineup")) {
  const pl = await open("", { width: 1800, height: 760 });
  console.log(JSON.stringify(await C(pl, "stats")));
  for (const [n, a] of [
    ["front", 0],
    ["34", 0.7],
    ["side", Math.PI / 2],
    ["back", Math.PI],
  ]) {
    await C(pl, "setYaw", a);
    await C(pl, "view", null, 6.3, 1.05, 0, 0.82);
    await sleep(500);
    await shot(pl, `lineup-${n}`);
  }
  await pl.context().close();
}
const p = await open("", { width: 900, height: 900 });
if (want("face")) {
  await C(p, "setYaw", 0.25);
  for (const e of ["neutral", "smile", "blink"]) {
    await C(p, "setExpression", e);
    for (const k of await C(p, "slots"))
      if (k.startsWith("new") || k === "old-traveler" || k === "old-campesina") {
        if (k === "new-llama") await C(p, "viewBone", k, "head", 0.8, 0.05, 0.9);
        else if (k === "old-campesina") await C(p, "view", k, 1.3, 1.35, 0, 1.3);
        else await C(p, "view", k, 1.3, 1.45, 0, k === "new-campesina" ? 1.33 : 1.38);
        await sleep(400);
        await shot(p, `face-${k}-${e}`);
      }
  }
  await C(p, "setExpression", "auto");
  await C(p, "setYaw", 0);
}
if (want("hands")) {
  await C(p, "setYaw", 0.9);
  for (const k of ["old-traveler", "new-traveler", "new-campesina"]) {
    await C(p, "view", k, 1.2, 0.85, 0.2, 0.65);
    await sleep(400);
    await shot(p, `hands-${k}`);
  }
  await C(p, "setYaw", 0);
}
if (want("bend")) {
  // Mid-stride run (deep knee and elbow bends), seen from the side, ink on: no seam lines at the joints.
  await C(p, "setMode", "run");
  await sleep(1500);
  await C(p, "hold", 0.3);
  await C(p, "setYaw", Math.PI / 2);
  await sleep(600);
  for (const k of ["old-traveler", "new-traveler", "new-campesina"]) {
    await C(p, "view", k, 1.9, 1.0, 0, 0.75);
    await sleep(400);
    await shot(p, `bend-${k}`);
  }
  await C(p, "hold", null);
  await C(p, "setMode", "idle");
  await C(p, "setYaw", 0);
}
if (want("strip")) {
  await C(p, "setMode", "walk");
  await C(p, "setYaw", Math.PI / 2);
  await sleep(1500);
  for (const k of ["new-traveler", "new-campesina", "new-llama"]) {
    for (let i = 0; i < 8; i++) {
      await C(p, "hold", i / 8);
      await C(p, "view", k, k === "new-llama" ? 3.0 : 2.3, 1.0, 0, k === "new-llama" ? 0.85 : 0.8);
      await sleep(350);
      await shot(p, `strip-${k}-${i}`);
    }
  }
  await C(p, "hold", null);
  await C(p, "setMode", "idle");
  await C(p, "setYaw", 0);
}
if (want("cloth")) {
  await C(p, "setYaw", 0.6);
  for (const k of ["new-traveler", "new-campesina"])
    for (let i = 0; i < 3; i++) {
      await C(p, "view", k, 2.6, 1.3, 0, 0.9);
      await sleep(700);
      await shot(p, `cloth-${k}-${i}`);
    }
  await C(p, "setYaw", 0);
}
if (want("light")) {
  for (const t of ["dusk", "night"]) {
    await C(p, "setTime", t);
    await sleep(1200);
    await C(p, "view", "new-campesina", 6.5, 1.6, 0, 0.85);
    await sleep(400);
    await shot(p, `light-${t}`);
    await C(p, "view", "new-campesina", 3.5, 1.4, 0.3, 0.9);
    await sleep(400);
    await shot(p, `light-${t}-close`);
  }
  await C(p, "setTime", "day");
}
if (want("ink")) {
  await C(p, "setYaw", 0.7);
  await C(p, "setWire", true);
  await C(p, "view", "new-traveler", 3.2, 1.3, 0.2, 0.85);
  await sleep(400);
  await shot(p, "wire");
  await C(p, "setWire", false);
  await C(p, "setInk", false);
  await sleep(300);
  await shot(p, "noink");
  await C(p, "setInk", true);
  await C(p, "setYaw", 0);
}
if (want("phone")) {
  const ph = await open("&mode=walk", { width: 390, height: 844 });
  await C(ph, "setYaw", 0.5);
  await C(ph, "view", "new-campesina", 5.5, 1.6, 0, 0.9);
  await sleep(800);
  await shot(ph, "phone");
  await ph.evaluate(() => document.body.classList.remove("clean"));
  await sleep(300);
  await shot(ph, "phone-ui");
}
console.log(logs.slice(0, 30).join("\n"));
await browser.close();
