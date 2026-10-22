// Mount check in a world harness: stand next to the world's ride mount, press E, ride forward, screenshot.
// Usage: bun src/world/characters/animals/dev/ride-world.mjs <baseUrl> <mountName> <outDir> <prefix> [query]
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const [base, name, out, prefix, query = "lang=es&skip=1"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const p = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const logs = [];
p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(`[${m.type()}] ${m.text()}`));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(`${base}?${query}`);
await p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 300000 });
await sleep(4000);
await p.evaluate(() => document.getElementById("world").__kw.setTime?.(0.4));
const kw = (f, ...a) => p.evaluate(([f, a]) => document.getElementById("world").__kw[f](...a), [f, a]);
const where = () =>
  p.evaluate((n) => {
    const kw = document.getElementById("world").__kw;
    const g = kw.scene.getObjectByName(n);
    if (!g) return null;
    const v = g.getWorldPosition(g.position.clone());
    return { x: v.x, y: v.y, z: v.z, yaw: g.rotation.y, kids: g.children.length };
  }, name);
let m = null;
for (let i = 0; i < 30 && !m; i++) {
  m = await where();
  if (!m) await sleep(1000);
}
console.log("mount", JSON.stringify(m));
if (!m) {
  console.log(logs.slice(0, 10).join("\n"));
  process.exit(1);
}
// Stand 1.6 m to the mount's left, facing it.
const lx = m.x + Math.cos(m.yaw) * 1.6;
const lz = m.z - Math.sin(m.yaw) * 1.6;
await kw("face", lx, lz, m.x, m.z);
await kw("orbit", 0.9, 0.25, 4.5);
await sleep(2500);
await p.screenshot({ path: `${out}/${prefix}-1-waiting.png` });
await p.keyboard.press("KeyE");
await sleep(1500);
const s1 = await kw("state");
console.log("after E", JSON.stringify(s1.pos), JSON.stringify(await where()));
await kw("orbit", Math.PI / 2, 0.12, 4.0);
await sleep(1500);
await p.screenshot({ path: `${out}/${prefix}-2-mounted.png` });
// Ride along the mount's facing direction.
await kw("walk", Math.sin(m.yaw), Math.cos(m.yaw), 6);
await sleep(1800);
await kw("orbit", Math.PI / 2, 0.12, 4.0);
await sleep(600);
await p.screenshot({ path: `${out}/${prefix}-3-riding.png` });
const s2 = await kw("state");
console.log("riding", JSON.stringify(s2.pos), JSON.stringify(await where()));
if (typeof (await p.evaluate(() => typeof document.getElementById("world").__kw.drawCalls)) === "string")
  console.log("drawCalls", JSON.stringify(await kw("drawCalls")));
console.log("logs:", logs.length ? logs.slice(0, 12).join("\n") : "clean");
await browser.close();
