// Screenshot driver for the coast harness: runs a list of shots from a JSON spec in one page.
// Usage: PW_CHROMIUM=/path/to/chrome bun src/world/costa/dev/shoot.mjs spec.json [baseUrl]
// spec: { lang, width, height, out, query, shots: [{ name, time?, teleport?: [t, side, faceBack],
//         face?: [x, z, tx, tz], orbit?: [yawOff, pitch, dist], wait?, js? }] }
// Prints console errors, banned (mountain or jungle) chunk requests, state and draw calls per shot.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));
const base = process.argv[3] ?? "http://localhost:5231/";
const out = spec.out ?? "test-results/costa";
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const ctx = await browser.newContext({
  viewport: { width: spec.width ?? 1280, height: spec.height ?? 760 },
  deviceScaleFactor: spec.dpr ?? 1,
  ...(spec.mobile ? { isMobile: true, hasTouch: true } : {}),
  ...(spec.reducedMotion ? { reducedMotion: "reduce" } : {}),
});
const p = await ctx.newPage();
p.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
  if (spec.log && m.type() === "log") console.log("[log]", m.text());
});
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
p.on("request", (r) => requested.add(new URL(r.url()).pathname));
p.on("framenavigated", (f) => {
  if (f === p.mainFrame()) logs.push(`[nav] ${f.url()}`);
});
if (spec.storage)
  await p.addInitScript((s) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, spec.storage);
const t0 = Date.now();
await p.goto(`${base}?lang=${spec.lang ?? "es"}&skip=1${spec.query ? `&${spec.query}` : ""}`);
await p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 180000 });
console.log("ready in", ((Date.now() - t0) / 1000).toFixed(1), "s");
if (spec.hideUi)
  await p.addStyleTag({
    content: ".kw-chrome,.kw-hud .qn-tools,.qn-passport-button,.kw-map-toast{display:none!important}",
  });
const kw = (fn, ...a) => p.evaluate(([f, a]) => document.getElementById("world").__kw[f](...a), [fn, a]);
await sleep(spec.settle ?? 2500);
for (const s of spec.shots)
  try {
    if (s.time !== undefined) await kw("setTime", s.time);
    if (s.teleport) await kw("teleport", ...s.teleport);
    if (s.face) await kw("face", ...s.face);
    if (s.walk) await kw("walk", ...s.walk);
    if (s.orbit) await kw("orbit", ...s.orbit);
    if (s.js) {
      const r = await p.evaluate(s.js);
      if (s.print) console.log(s.print, typeof r === "string" ? r : JSON.stringify(r));
    }
    await sleep(s.wait ?? 1500);
    if (s.js2) await p.evaluate(s.js2);
    if (s.keys)
      for (const k of s.keys) {
        await p.keyboard.press(k);
        await sleep(300);
      }
    if (s.after) await sleep(s.after);
    if (s.name) {
      await p.screenshot({ path: `${out}/${s.name}.png` });
      const st = await kw("state");
      const dc = s.dc === false ? {} : await kw("drawCalls");
      console.log(
        s.name,
        JSON.stringify({
          pos: st.pos.map((v) => +v.toFixed(1)),
          t: +st.t.toFixed(3),
          riding: st.riding,
          stamped: st.stamped,
          ...dc,
        }),
      );
    }
  } catch (err) {
    console.log("shot failed", s.name, String(err).slice(0, 200));
    console.log(logs.join("\n"));
    break;
  }
const banned = [...requested].filter((u) => BANNED.some((b) => u.includes(b)));
console.log("banned chunks:", banned.length ? banned : "none");
console.log(logs.length ? logs.join("\n") : "no console errors");
await browser.close();
