// Screenshot pass for the content harness. Usage: bun src/world/content-dev/shots.mjs [outDir]
import { chromium, devices } from "@playwright/test";

const base = "http://localhost:5192/";
const out = process.argv[2] ?? "test-results/content";
const only = process.argv[3];
const args = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args, headless: true });
const logs = [];
async function page(opts, q = "lang=es") {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  p.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
  });
  p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  await p.goto(`${base}?${q}`);
  await p.waitForFunction(() => window.__qn);
  await sleep(1500);
  return p;
}
const qn = (p, fn, ...a) => p.evaluate(([f, a]) => window.__qn[f](...a), [fn, a]);
const shot = async (p, name) => {
  if (only && !name.includes(only)) return;
  await p.screenshot({ path: `${out}/${name}.png` });
};

const d = await page({ viewport: { width: 1440, height: 900 } });
// Avatar close-up (idle, then walking)
await qn(d, "goto", "gate", 0, 0);
await qn(d, "face", 0.4);
await qn(d, "cam", 0.4, 0.15, 3.2);
await sleep(800);
await shot(d, "01-avatar");
await d.keyboard.down("KeyW");
await sleep(500);
await shot(d, "02-avatar-walk");
await d.keyboard.down("ShiftLeft");
await sleep(400);
await shot(d, "03-avatar-run");
await d.keyboard.up("ShiftLeft");
await d.keyboard.up("KeyW");
// Tambo with panel (day)
for (const id of ["auna", "xepelin"]) {
  await qn(d, "view", id, -0.5, 0.28, 8.5, 0);
  await sleep(2600);
  await shot(d, `05-tambo-${id}-day`);
}
// Night
await qn(d, "time", 0.92);
await sleep(1200);
await shot(d, "06-tambo-xepelin-night");
await qn(d, "view", "belcorp", 0.5, 0.3, 11, 0);
await sleep(2200);
await shot(d, "07-tambo-belcorp-night");
await qn(d, "view", "arcade", 0.3, 0.25, 10, 0);
await sleep(1500);
await shot(d, "07b-arcade-night");
await qn(d, "time", 0.45);
// Bridge
await qn(d, "spot", "art:design-system");
await qn(d, "cam", 1.6, 0.35, 9);
await sleep(1600);
await shot(d, "08-bridge");
await qn(d, "view", "bridge", 1.4, 0.25, 16, 0);
await sleep(1200);
await shot(d, "08b-bridge-wide");
// Arcade
await qn(d, "view", "arcade", 0.2, 0.22, 11, 0);
await sleep(1500);
await shot(d, "09-arcade");
await qn(d, "spot", "cab:snake");
await sleep(600);
await shot(d, "09b-arcade-cabinet");
await d.keyboard.press("KeyE");
await sleep(2500);
await shot(d, "09c-game");
await d.keyboard.press("Escape");
await sleep(500);
await shot(d, "09d-after-game");
// AI
await qn(d, "view", "ai", 0.4, 0.22, 8, 0);
await sleep(2500);
await shot(d, "10-ai");
// Summit
await qn(d, "view", "contact", 0.5, 0.3, 10, 0);
await sleep(1500);
await shot(d, "11-summit");
// Build plot
await qn(d, "view", "build-2", 0.3, 0.35, 11, 0);
await sleep(1200);
await shot(d, "12-build");
// Gate
await qn(d, "view", "gate", 0.5, 0.25, 10, 0);
await sleep(1200);
await shot(d, "04-gate");
// Wide overview
await qn(d, "cam", 0.8, 0.9, 60);
await sleep(800);
await shot(d, "13-overview");
await d.keyboard.press("KeyM");
await sleep(500);
await shot(d, "14-map");
await d.keyboard.press("KeyM");
await d.keyboard.press("KeyH");
await sleep(300);
await shot(d, "15-help");
await d.keyboard.press("Escape");
const pos = await qn(d, "pos");
console.log("render", JSON.stringify(await qn(d, "info")), JSON.stringify(pos));

const m = await page({ ...devices["Pixel 7"] }, "lang=en");
await qn(m, "view", "topsort", -0.4, 0.3, 9, 0);
await sleep(2400);
await shot(m, "m1-tambo");
await qn(m, "view", "contact", 0.3, 0.3, 9, 0);
await sleep(1500);
await shot(m, "m2-contact");

console.log(
  logs
    .filter((l) => !l.includes("'map' has value") && !l.includes("Clock"))
    .slice(0, 30)
    .join("\n"),
);
await browser.close();
