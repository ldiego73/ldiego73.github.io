// Panels and states of the Cusco hub for screenshots: the khipu panel (es/en), the finale (a complete
// passport seeded in localStorage), the chasqui card, the landmark card, the map, arrivals, night, phone.
// Usage: bun src/world/cusco/dev/panels.mjs [baseUrl] [outDir]
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { CATALOG, requiredStamps } from "../../../lib/passport.ts";

const base = process.argv[2] ?? "http://localhost:5221/";
const out = process.argv[3] ?? "test-results/cusco";
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = process.env.PW_CHROMIUM;
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const logs = [];
const kw = (p, fn, ...a) => p.evaluate(([f, a]) => document.getElementById("world").__kw[f](...a), [fn, a]);
const kh = (p, fn, ...a) => p.evaluate(([f, a]) => window.__khipu[f](...a), [fn, a]);
async function open(q, ctxOpts = { viewport: { width: 1440, height: 900 } }, seed = null) {
  const ctx = await browser.newContext(ctxOpts);
  if (seed) await ctx.addInitScript((s) => localStorage.setItem("ldiego73-passport-v1", s), seed);
  const p = await ctx.newPage();
  p.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
  });
  p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  await p.goto(`${base}?${q}`);
  await p.waitForFunction(() => !!document.getElementById("world")?.__kw && !!window.__khipu, null, { timeout: 90000 });
  await sleep(2000);
  return p;
}
/** E held across a few (slow, software-GL) frames so the runtime's input poll sees it. */
const pressE = async (p) => {
  await p.keyboard.down("e");
  await sleep(1500);
  await p.keyboard.up("e");
};
const shot = async (p, name) => {
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log("shot", name);
};

const some = JSON.stringify({
  stamps: Object.fromEntries(
    [...requiredStamps("selva"), ...requiredStamps("wasi"), ...requiredStamps("qhapaq").slice(0, 13)].map((s, i) => [
      s.id,
      1700000000000 + i,
    ]),
  ),
});
const all = JSON.stringify({
  stamps: Object.fromEntries(
    CATALOG.filter((s) => requiredStamps().includes(s) || s.id.startsWith("selva:fauna:t")).map((s, i) => [
      s.id,
      1700000000000 + i,
    ]),
  ),
});

for (const lang of ["es", "en"]) {
  // Khipu panel with partial progress, on top of the usnu.
  const p = await open(`lang=${lang}&skip=1`, undefined, some);
  await kw(p, "setTime", 0.42);
  await kw(p, "face", 0, 2.4, 0, -1);
  await kw(p, "orbit", 0.5, 0.35, 8);
  await sleep(800);
  await shot(p, `khipu-cords-${lang}`);
  await kh(p, "openPanel");
  await sleep(2600);
  await shot(p, `khipu-panel-${lang}`);
  await p.keyboard.press("Escape");
  // Chasqui card.
  await kw(p, "face", -15, 19.6, -15, 23);
  await sleep(500);
  await pressE(p);
  await sleep(2600);
  await shot(p, `chasqui-card-${lang}`);
  await p.keyboard.press("Escape");
  // Qorikancha stele card.
  await kw(p, "face", 29, 4.6, 33, 4.6);
  await sleep(500);
  await pressE(p);
  await sleep(2600);
  await shot(p, `qorikancha-card-${lang}`);
  await p.keyboard.press("Escape");
  // Closed gate prompt + note.
  await kw(p, "face", -51.4, -43.4, -54, -46);
  await sleep(600);
  await shot(p, `gate-closed-prompt-${lang}`);
  await pressE(p);
  await sleep(2600);
  await shot(p, `gate-closed-note-${lang}`);
  // Map.
  await kw(p, "face", 0, 12, 0, 0);
  await sleep(300);
  await p.keyboard.press("m");
  await sleep(2600);
  await shot(p, `map-${lang}`);
  await p.keyboard.press("m");
  await p.context().close();
}

// Finale: every page complete, arrive at the usnu.
{
  const p = await open("lang=es&skip=1", undefined, all);
  await kw(p, "setTime", 0.42);
  await kw(p, "face", 0, 7.5, 0, 0);
  await kw(p, "orbit", 0, 0.42, 15);
  await sleep(2500);
  await kh(p, "advance", 0.7);
  await sleep(300);
  await shot(p, "finale-burst-es");
  await kh(p, "advance", 2);
  await sleep(800);
  await shot(p, "finale-panel-es");
  console.log(JSON.stringify(await kh(p, "state")));
  await p.context().close();
}
{
  const p = await open("lang=en&skip=1", undefined, all);
  await kw(p, "setTime", 0.42);
  await kw(p, "face", 0, 7, 0, 0);
  await sleep(1500);
  await kh(p, "advance", 3);
  await sleep(800);
  await shot(p, "finale-panel-en");
  await p.context().close();
}
// Night, arrivals, phone.
{
  const p = await open("lang=en&skip=1");
  await kw(p, "setTime", 0.02);
  await sleep(1500);
  await shot(p, "night-spawn-en");
  await kw(p, "face", 40, -32, 54, -46);
  await sleep(900);
  await shot(p, "night-antisuyu-en");
  await kw(p, "face", 0, 14, 0, 0);
  await kw(p, "orbit", 0, 0.5, 30);
  await sleep(900);
  await shot(p, "night-overview-en");
  await p.context().close();
}
for (const f of ["selva", "qhapaq"]) {
  const p = await open(`lang=es&from=${f}`);
  await kw(p, "setTime", 0.42);
  await sleep(800);
  await shot(p, `from-${f}`);
  console.log(f, JSON.stringify(await kw(p, "state")));
  await p.context().close();
}
for (const lang of ["es", "en"]) {
  const p = await open(
    `lang=${lang}&skip=1`,
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    some,
  );
  await kw(p, "setTime", 0.42);
  await sleep(800);
  await shot(p, `phone-spawn-${lang}`);
  await kw(p, "face", 0, 2.4, 0, -1);
  await kh(p, "openPanel");
  await sleep(2600);
  await shot(p, `phone-khipu-${lang}`);
  await p.context().close();
}
console.log(logs.length ? logs.join("\n") : "no console errors");
await browser.close();
