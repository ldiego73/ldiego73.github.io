// Captures the Kuntisuyu's share-card screenshot (src/assets/og/colca.jpg, 1200×630) from the harness, UI hidden.
// Usage: bun src/world/colca/dev/og-shot.mjs [baseUrl] [out.jpg]   (PW_CHROMIUM=<path> to pick a browser)
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5251/";
const out = process.argv[3] ?? "src/assets/og/colca.jpg";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = process.env.PW_CHROMIUM;
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto(`${base}?lang=es`);
await p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 120000 });
await p.addStyleTag({ content: ".kw-chrome,.kw-hud,.qn-passport,.kw-map-toast{display:none!important}" });
const kw = (fn, ...a) => p.evaluate(([f, a]) => document.getElementById("world").__kw[f](...a), [fn, a]);
await sleep(3000);
// Morning on the rim road west of the colcas, looking along the canyon: terraces, the far wall, condors.
await kw("setTime", 0.34);
await kw("teleport", 0.3, 0);
const st = await kw("state");
await kw("face", st.pos[0], st.pos[2], st.pos[0] - 100, st.pos[2] + 30);
await kw("orbit", 0.35, 0.3, 22);
await sleep(5000);
await p.screenshot({ path: out, type: "jpeg", quality: 82 });
console.log("wrote", out);
await browser.close();
