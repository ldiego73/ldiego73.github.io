// The mountain's people on the new characters: the children by the trailhead, the feria at the Avances tambo
// and a terrace work site. Usage: bun src/world/characters/dev/people-shots.mjs <baseUrl> <outDir>
// (the mountain harness: bunx vite --config src/world/dev/vite.config.ts --port 5191).
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5191/?lang=es&skip=1";
const out = process.argv[3] ?? "test-results/people";
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = process.env.PW_CHROMIUM;
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const logs = [];
const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
p.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
});
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(base);
await p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 120000 });
const kw = (fn, ...a) => p.evaluate(([f, a]) => document.getElementById("world").__kw[f]?.(...a), [fn, a]);
await kw("setTime", 0.45);
await sleep(15000);
const groups = await p.evaluate(() => window.__people?.groups() ?? []);
console.log(JSON.stringify(groups.map((g) => ({ name: g.name, x: g.x, z: g.z, people: g.people }))));
for (const g of groups) {
  // Stand a few metres from the group, facing it.
  const dx = 6;
  await kw("face", g.x + dx, g.z + dx * 0.4, g.x, g.z);
  await kw("orbit", 0.25, 0.32, 8);
  await sleep(2500);
  await p.screenshot({ path: `${out}/people-${g.name}.png` });
  console.log("shot", g.name);
}
console.log(JSON.stringify(await p.evaluate(() => window.__people?.crowd?.() ?? null)));
console.log(logs.slice(0, 20).join("\n"));
await browser.close();
