// The mountain's side of the Qusqu road: the tinkuy signpost and the Qusqu punku at the trail's south end.
// Usage: bun src/world/cusco/dev/tinkuy-shots.mjs [mountain harness url] [outDir]
// (mountain harness: bunx vite --config src/world/dev/vite.config.ts --port 5222)
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5222/";
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
for (const lang of ["es", "en"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
  });
  p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  await p.goto(`${base}?lang=${lang}&skip=1`);
  await p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 120000 });
  await sleep(4000);
  await kw(p, "setTime", 0.42);
  // From the trail's start, looking south down the branch to the punku.
  await kw(p, "face", 42.2, 112.5, 39.4, 127.8);
  await kw(p, "orbit", 0, 0.3, 9);
  await sleep(3500);
  await p.screenshot({ path: `${out}/tinkuy-qusqu-branch-${lang}.png` });
  // At the doorway: the prompt.
  await kw(p, "face", 39.7, 125.4, 39.4, 127.8);
  await sleep(3500);
  await p.screenshot({ path: `${out}/tinkuy-qusqu-punku-${lang}.png` });
  // Overview of the crossroads from above, both punkus and the Wasi.
  await kw(p, "face", 44, 104, 44, 124);
  await kw(p, "orbit", 0.4, 0.75, 36);
  await sleep(3500);
  await p.screenshot({ path: `${out}/tinkuy-overview-${lang}.png` });
  // The signpost.
  await kw(p, "face", 41, 109, 38.75, 105.45);
  await kw(p, "orbit", 0.2, 0.18, 5);
  await sleep(3500);
  await p.screenshot({ path: `${out}/tinkuy-sign-${lang}.png` });
  await ctx.close();
}
console.log(logs.length ? logs.join("\n") : "no console errors");
await browser.close();
