// Captures the hub's share-card screenshot (src/assets/og/cusco.jpg, 1200×630) from the harness, UI hidden.
// Usage: bun src/world/cusco/dev/og-shot.mjs [baseUrl] [out.jpg]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5221/";
const out = process.argv[3] ?? "src/assets/og/cusco.jpg";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = process.env.PW_CHROMIUM;
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto(`${base}?lang=es&skip=1`);
await p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 90000 });
await p.addStyleTag({ content: ".kw-chrome,.kw-hud,.qn-passport,.kw-map-toast{display:none!important}" });
const kw = (fn, ...a) => p.evaluate(([f, a]) => document.getElementById("world").__kw[f](...a), [fn, a]);
await sleep(2500);
await kw("setTime", 0.36);
// From the south-west of the plaza toward the usnu and the Qorikancha's gold disc.
await kw("face", -6, 15, 14, -2);
await kw("orbit", -0.35, 0.3, 17);
await sleep(5000);
await p.screenshot({ path: out, type: "jpeg", quality: 82 });
console.log("wrote", out);
await browser.close();
