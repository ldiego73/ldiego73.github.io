// Traveler check in a world harness: idle close-up, walking and running mid-stride, jumping, riding (a
// `world:mount` event), seated (bench and desk), on a slope. Also counts the people crowd when present.
// Usage: bun src/world/characters/dev/world-shots.mjs <baseUrl> <outDir> [prefix]
// e.g. bun src/world/characters/dev/world-shots.mjs "http://localhost:5191/?lang=es&skip=1" out mountain
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2];
const out = process.argv[3] ?? "test-results/world-chars";
const pre = process.argv[4] ?? "world";
const vehicle = process.argv[5] ?? "";
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = process.env.PW_CHROMIUM;
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const logs = [];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
p.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
});
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(base);
await p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 120000 });
const kw = (fn, ...a) => p.evaluate(([f, a]) => document.getElementById("world").__kw[f]?.(...a), [fn, a]);
const ev = (name, detail) =>
  p.evaluate(([n, d]) => window.dispatchEvent(new CustomEvent(n, { detail: d })), [name, detail]);
const shot = async (n) => {
  await p.screenshot({ path: `${out}/${pre}-${n}.png` });
  console.log("shot", n);
};
await kw("setTime", 0.42);
await sleep(12000); // worker builds of the traveler's near LOD
await kw("orbit", 0.5, 0.15, 4.2);
await sleep(800);
await shot("idle");
await kw("orbit", Math.PI - 0.4, 0.15, 4.2);
await sleep(600);
await shot("idle-back");
// Walk and run (keyboard), screenshot mid-motion from the side.
await kw("orbit", Math.PI / 2, 0.12, 4.5);
await p.keyboard.down("KeyW");
await sleep(900);
await shot("walk");
await p.keyboard.down("ShiftLeft");
await sleep(900);
await shot("run");
await p.keyboard.up("ShiftLeft");
await p.keyboard.up("KeyW");
await sleep(500);
await p.keyboard.press("Space");
await sleep(180);
await shot("jump");
await sleep(1200);
// Riding (no mount model: the pose only).
await ev("world:mount", { riding: true, speedMul: 1, seatHeight: 0.6, ...(vehicle ? { vehicle } : {}) });
await sleep(900);
await kw("orbit", 0.9, 0.15, 4.2);
await sleep(500);
await shot(`ride${vehicle ? `-${vehicle}` : ""}`);
await ev("world:mount", { riding: false, speedMul: 1, seatHeight: 0 });
await sleep(600);
for (const pose of ["bench", "desk"]) {
  const st = await kw("state");
  const [x, y, z] = st?.pos ?? [0, 0, 0];
  await ev("world:sit", { seated: true, id: "dev:seat", x, y: y + 0.48, z, yaw: 0, pose });
  await sleep(900);
  await kw("orbit", 0.8, 0.15, 3.6);
  await sleep(500);
  await shot(`sit-${pose}`);
  await ev("world:sit", { seated: false });
  await sleep(500);
}
console.log(JSON.stringify(await kw("drawCalls")));
console.log(logs.slice(0, 20).join("\n"));
await browser.close();
