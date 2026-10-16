// Captures the coast's share-card screenshot (src/assets/og/costa.jpg, 1200×630) from the harness, UI hidden.
// Usage: PW_CHROMIUM=/path/to/chrome bun src/world/costa/dev/og-shot.mjs [baseUrl] [out.jpg]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5231/";
const out = process.argv[3] ?? "src/assets/og/costa.jpg";
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
await p.addStyleTag({
  content: ".kw-chrome,.kw-hud,.qn-passport,.kw-map-toast,.qn-toast,.qnc-finale{display:none!important}",
});
const kw = (fn, ...a) => p.evaluate(([f, a]) => document.getElementById("world").__kw[f](...a), [fn, a]);
await sleep(2500);
// The finale at sunset: on the headland's platform, the sun going down into the Pacific through the golden ring.
const at = await p.evaluate(() => {
  const f = window.__finale?.state();
  return f ? { x: f.platform.x, z: f.platform.z, yaw: f.frame.yaw } : null;
});
if (at) {
  await kw("face", at.x, at.z, at.x + Math.sin(at.yaw) * 20, at.z + Math.cos(at.yaw) * 20);
  await p.waitForFunction(() => window.__finale?.state().celebrated, null, { timeout: 60000 });
  // Let the celebration play out (sky to sunset, burst gone), then frame the ring from behind and above.
  await p.evaluate(() => window.__finale?.advance(16));
  await kw("orbit", -0.35, 0.16, 15);
}
await sleep(6000);
await p.screenshot({ path: out, type: "jpeg", quality: 82 });
console.log("wrote", out);
await browser.close();
