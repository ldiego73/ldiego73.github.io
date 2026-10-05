// NPC chasquis screenshot pass against the core harness.
// Usage: bunx vite --config src/world/dev/vite.config.ts --port 5191 ; bun src/world/npc-dev/shots.mjs [baseUrl] [outDir]
import { mkdirSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5191/";
const out = process.argv[3] ?? "test-results/npcs";
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const logs = [];
async function page(opts, lang = "es") {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  p.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
  });
  p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  await p.goto(`${base}?lang=${lang}&skip=1`);
  await p.waitForFunction(() => !!document.getElementById("world")?.__kw && !!window.__npcs, null, { timeout: 30000 });
  await kw(p, "setTime", 0.42);
  await sleep(500);
  return p;
}
const kw = (p, fn, ...a) => p.evaluate(([f, a]) => document.getElementById("world").__kw[f](...a), [fn, a]);
const npc = (p, fn, ...a) => p.evaluate(([f, a]) => window.__npcs[f](...a), [fn, a]);

const d = await page({ viewport: { width: 1280, height: 800 } });
// 1) A group of chasquis on the trail around the Belcorp tambo.
await npc(d, "place", "amauta", 0.205, 1);
await npc(d, "place", "waman", 0.222, -1);
await npc(d, "place", "killa", 0.24, -1);
await npc(d, "place", "sisa", 0.315, -1);
await kw(d, "teleport", 0.19, 0.8);
await kw(d, "orbit", 0.5, 0.25, 9);
await sleep(900);
await d.screenshot({ path: `${out}/01-trail.png` });
console.log(JSON.stringify(await npc(d, "npcs")));

// 2) Prompt: stand next to Waman.
await kw(d, "teleport", 0.296, -0.6);
await npc(d, "place", "waman", 0.2975, -1);
await kw(d, "orbit", 0.9, 0.22, 6.5);
await sleep(1200);
await d.screenshot({ path: `${out}/02-prompt.png` });
console.log("prompt pill:", await d.evaluate(() => document.querySelector(".kw-prompt")?.textContent));

// 3) Dialog with choices.
await d.keyboard.press("KeyE");
await sleep(400);
await d.screenshot({ path: `${out}/03-dialog-typing.png` });
for (let i = 0; i < 6; i++) {
  const has = await d.evaluate(() => document.querySelectorAll(".qn-npc-choice").length);
  if (has) break;
  await d.keyboard.press("Space");
  await sleep(250);
}
await sleep(300);
await d.screenshot({ path: `${out}/04-dialog-choices.png` });
await d.keyboard.press("Digit1");
await sleep(2500);
await d.screenshot({ path: `${out}/05-dialog-branch.png` });
await d.keyboard.press("Escape");
await sleep(300);
console.log("card hidden after Esc:", await d.evaluate(() => document.querySelector(".qn-npc-card")?.hidden));

// 3b) Waman from behind (rack + LEDs).
await kw(d, "teleport", 0.296, -0.6);
await npc(d, "place", "waman", 0.2985, 1);
await kw(d, "orbit", -2.4, 0.2, 5);
await sleep(900);
await d.screenshot({ path: `${out}/05b-rack.png` });

// 4) Sisa + llama and Inti with tablet, closer.
await npc(d, "place", "sisa", 0.45, 1);
await npc(d, "place", "inti", 0.465, -1);
await kw(d, "teleport", 0.43, 0.5);
await kw(d, "orbit", 0.35, 0.2, 7);
await sleep(1500);
await d.screenshot({ path: `${out}/06-llama-tablet.png` });

// 5) Upper trail: Yupanqui (satchel) + Chaska (montera, tablet), English.
const e = await page({ viewport: { width: 1280, height: 800 } }, "en");
await npc(e, "place", "yupanqui", 0.8, 1);
await npc(e, "place", "chaska", 0.812, -1);
await kw(e, "teleport", 0.79, 0.4);
await kw(e, "orbit", 0.45, 0.2, 7);
await sleep(1500);
await e.screenshot({ path: `${out}/07-upper-en.png` });
await kw(e, "teleport", 0.806, 0.9);
await npc(e, "place", "chaska", 0.8075, -1);
await sleep(600);
await e.keyboard.press("KeyE");
await sleep(2500);
await e.keyboard.press("Space");
await sleep(2500);
await e.screenshot({ path: `${out}/08-dialog-en.png` });

// 6) Mobile.
const m = await page({ ...devices["iPhone 13"] });
await kw(m, "teleport", 0.296, -0.6);
await npc(m, "place", "killa", 0.2975, -1);
await kw(m, "orbit", 0.9, 0.25, 7);
await sleep(1000);
await m.screenshot({ path: `${out}/09-mobile-tag.png` });
await m.evaluate(() => document.querySelector(".qn-npc-tag")?.click());
await sleep(300);
for (let i = 0; i < 6; i++) {
  if (await m.evaluate(() => document.querySelectorAll(".qn-npc-choice").length)) break;
  await m.evaluate(() => document.querySelector(".qn-npc-next")?.click());
  await sleep(300);
}
await sleep(400);
await m.screenshot({ path: `${out}/10-mobile-dialog.png` });
console.log("talked:", await m.evaluate(() => localStorage.getItem("qn.npcs.talked")));
console.log(logs.slice(0, 20).join("\n"));
await browser.close();
