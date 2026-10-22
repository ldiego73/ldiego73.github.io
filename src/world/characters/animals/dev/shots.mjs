// Screenshot pass for the animals harness.
// Usage: bun src/world/characters/animals/dev/shots.mjs <outDir> <query> <name> [actions-json] [w] [h]
//   actions: [["focus","llama",3,0.6,0.8],["setMode","walk"],["wait",800],["shot","name"]...]
// Needs the harness: bunx vite --config src/world/characters/animals/dev/vite.config.ts --port 5262
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "test-results/animals";
const query = process.argv[3] ?? "";
const name = process.argv[4] ?? "shot";
const actions = JSON.parse(process.argv[5] ?? "[]");
const W = Number(process.argv[6] ?? 1600);
const H = Number(process.argv[7] ?? 900);
const base = process.env.BASE ?? "http://localhost:5262/";
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
const browser = await chromium.launch({
  headless: true,
  executablePath: exe,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const logs = [];
p.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
});
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(`${base}?${query}`);
await p.waitForFunction(() => !!window.__animals, null, { timeout: 240000 });
await sleep(1500);
let shots = 0;
for (const [fn, ...a] of actions) {
  if (fn === "wait") await sleep(a[0]);
  else if (fn === "shot") {
    await p.screenshot({ path: `${out}/${a[0]}.png` });
    shots++;
  } else console.log(fn, JSON.stringify(await p.evaluate(([f, a]) => window.__animals[f](...a), [fn, a])));
}
if (!shots) await p.screenshot({ path: `${out}/${name}.png` });
console.log(JSON.stringify(await p.evaluate(() => window.__animals.stats())));
for (const l of logs.slice(0, 20)) console.log(l);
await browser.close();
