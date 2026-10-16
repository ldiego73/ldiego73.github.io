// Screenshot pass for the Collasuyu (Lake Titicaca).
// Usage: PW_CHROMIUM=/path/to/chrome bun src/world/titicaca/dev/shots.mjs [baseUrl] [outDir] [only=comma,list]
// baseUrl defaults to the Vite harness (http://localhost:5241/). Prints console errors/warnings, mountain- or
// jungle-only chunks requested (there must be none), state and draw calls per shot.
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5241/";
const out = process.argv[3] ?? "test-results/titicaca";
const only = (process.argv[4] ?? "").split(",").filter(Boolean);
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
const ready = (p) => p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 120000 });
/** Draw calls and triangles of one colour pass (the ink prepass comes on top). */
const colourPass = (p) =>
  p.evaluate(() => {
    const k = document.getElementById("world").__kw;
    const r = k.engine.renderer;
    r.info.autoReset = false;
    r.info.reset();
    r.render(k.scene, k.engine.camera);
    const out = { calls: r.info.render.calls, tris: r.info.render.triangles };
    r.info.autoReset = true;
    return out;
  });
const report = async (p, name) => {
  const s = await kw(p, "state");
  const dc = await colourPass(p);
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
  await sleep(900);
};
const open = async (p, q) => {
  await p.goto(url(q));
  await ready(p);
  await sleep(3000);
};

const VIEWS = [
  ["spawn", null],
  ["road", [-250, 28, -150, 20, [0, 0.3, 12]]],
  ["punku", [-322, 30, -340, 30, [0.3, 0.25, 10]]],
  ["overview", [-122, 16, -122, -40, [0, 0.6, 70]]],
  ["uros", [-122, 10, -122, -36, [0, 0.35, 16]]],
  ["island", [-122, -30, -122, -36, [0.6, 0.35, 14]]],
  ["sillustani", [-196, 60, -196, 78, [0, 0.35, 18]]],
  ["taquile", [104, -12, 104, -30, [0, 0.35, 16]]],
  ["lake", [60, 18, 60, -60, [0, 0.18, 10]]],
  ["sol", [292, -64, 297, -82, [0, 0.35, 16]]],
  ["cordillera", [0, 28, 0, -200, [0, 0.12, 8]]],
  ["people", [-119, -28, -122, -36, [0.9, 0.3, 9]]],
  ["weavers", [104, -20, 104, -30, [0.4, 0.3, 11]]],
  ["flamingos", [196, 16, 196, -4, [0, 0.22, 10]]],
  ["alpacas", [-24, 34, -24, 54, [0, 0.25, 10]]],
  ["llamas", [172, 30, 172, 50, [0, 0.25, 10]]],
  ["vizcachas", [-190, 56, -196, 78, [0.3, 0.3, 14]]],
  ["frog", [52, 0, 40, -2, [0.2, 0.3, 9]]],
];

const run = async (p, tag, lang, time) => {
  await open(p, `lang=${lang}&skip=1`);
  await kw(p, "setTime", time);
  await sleep(600);
  for (const [name, v] of VIEWS) {
    if (only.length && !only.includes(name) && !only.includes(tag.split("-")[0])) continue;
    if (v) await view(p, ...v);
    await shot(p, `${tag}-${name}`);
  }
  await p.context().close();
};

const want = (k) => !only.length || only.includes(k);
if (want("panels")) {
  // Every panel: an island, Taquile, the finale (burst forwarded with the dev hook), in both languages.
  for (const lang of ["es", "en"]) {
    const p = await page({ viewport: { width: 1440, height: 900 } });
    await open(p, `lang=${lang}&skip=1`);
    await kw(p, "setTime", 0.4);
    await view(p, -122, -32, -122, -36, [0, 0.3, 9]);
    // Software GL runs a frame or two a second: let the ambients see the traveler before pressing E.
    await sleep(3000);
    await p.keyboard.press("e");
    await sleep(1200);
    await shot(p, `panel-island-${lang}`);
    await p.keyboard.press("Escape");
    await view(p, 104, -27.5, 104, -30.5, [0, 0.3, 9]);
    await sleep(3000);
    await p.keyboard.press("e");
    await sleep(1200);
    await shot(p, `panel-taquile-${lang}`);
    await p.keyboard.press("Escape");
    await view(p, 299, -80, 297, -87, [0.35, 0.32, 15]);
    await p.waitForFunction(() => window.__titikala?.state().celebrated, null, { timeout: 60000 });
    await p.evaluate(() => window.__titikala?.advance(0.9));
    await sleep(600);
    await shot(p, `finale-burst-${lang}`);
    await p.evaluate(() => window.__titikala?.advance(2));
    await sleep(1500);
    await shot(p, `finale-panel-${lang}`);
    await p.context().close();
  }
}
if (want("ride")) {
  // Board the balsa at the Uros jetty, punt across toward Taquile, land.
  const p = await page({ viewport: { width: 1440, height: 900 } });
  await open(p, "lang=es&skip=1");
  await kw(p, "setTime", 0.4);
  await view(p, -104, -82.6, -104, -86, [0.5, 0.3, 11]);
  await shot(p, "ride-dock");
  await p.keyboard.press("e");
  await sleep(2500);
  await shot(p, "ride-aboard");
  await kw(p, "walk", 0, 1, 6, 3.6);
  await sleep(7000);
  await kw(p, "orbit", 0.9, 0.28, 12);
  await sleep(800);
  await shot(p, "ride-sailing");
  await p.context().close();
}
const viewOnly = VIEWS.some(([n]) => only.includes(n));
if (want("day") || viewOnly) await run(await page({ viewport: { width: 1440, height: 900 } }), "day-es", "es", 0.42);
if (want("dusk")) await run(await page({ viewport: { width: 1440, height: 900 } }), "dusk-en", "en", 0.73);
if (want("night")) await run(await page({ viewport: { width: 1440, height: 900 } }), "night-en", "en", 0.02);
if (want("map")) {
  const p = await page({ viewport: { width: 1440, height: 900 } });
  await open(p, "lang=es&skip=1");
  await kw(p, "setTime", 0.42);
  await sleep(1500);
  await p.keyboard.press("m");
  await sleep(2500);
  await shot(p, "map-es");
  await p.context().close();
}
if (want("from")) {
  const p = await page({ viewport: { width: 1280, height: 800 } });
  await open(p, "lang=en&from=cusco");
  await kw(p, "setTime", 0.42);
  await sleep(800);
  await shot(p, "from-cusco");
  await p.context().close();
}
if (want("phone")) {
  const p = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await open(p, "lang=es&skip=1");
  await kw(p, "setTime", 0.42);
  await shot(p, "phone-spawn");
  await view(p, -122, 10, -122, -36, [0, 0.35, 16]);
  await shot(p, "phone-uros");
  await sleep(3000);
  await p.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", code: "KeyE", bubbles: true }));
  });
  await view(p, -122, -32, -122, -36, [0, 0.3, 9]);
  await sleep(3000);
  await p.keyboard.press("e");
  await sleep(1500);
  await shot(p, "phone-panel");
  await p.context().close();
}
const bad = [...requested].filter((r) => BANNED.some((b) => r.startsWith(b)));
console.log("banned chunks:", bad.length ? bad : "none");
console.log(logs.length ? logs.join("\n") : "no console errors");
await browser.close();
