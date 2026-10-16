// Captures the Collasuyu's share-card screenshot (src/assets/og/titicaca.jpg, 1200×630) from the harness, UI hidden.
// Usage: PW_CHROMIUM=/path/to/chrome bun src/world/titicaca/dev/og-shot.mjs [baseUrl] [out.jpg]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5241/";
const out = process.argv[3] ?? "src/assets/og/titicaca.jpg";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = process.env.PW_CHROMIUM;
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto(`${base}?lang=es&skip=1`);
await p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 120000 });
await p.addStyleTag({ content: ".kw-chrome,.kw-hud,.qn-passport,.kw-map-toast{display:none!important}" });
const kw = (fn, ...a) => p.evaluate(([f, a]) => document.getElementById("world").__kw[f](...a), [fn, a]);
await sleep(3000);
await kw("setTime", 0.38);
// From the boardwalk toward the Uros islands, the lake and the Cordillera Real behind.
await kw("face", -122, 12, -122, -36);
await kw("orbit", -0.4, 0.26, 14);
await sleep(6000);
await p.screenshot({ path: out, type: "jpeg", quality: 82 });
console.log("wrote", out);
await browser.close();
