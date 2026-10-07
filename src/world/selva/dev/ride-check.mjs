// Checks the ride hook (ride.ts), passport page, rewards and postcard in the harness.
// Usage: bun src/world/selva/dev/ride-check.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5203/";
const out = process.argv[3] ?? "test-results/selva";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(m.text()));
p.on("pageerror", (e) => logs.push(e.message));
await p.goto(`${base}?lang=es`);
await p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 60000 });
await sleep(1200);
const r = await p.evaluate(async () => {
  const kw = document.getElementById("world").__kw;
  const L = kw.layout;
  const dock = L.canoe.from;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  window.dispatchEvent(
    new CustomEvent("world:mount", { detail: { riding: true, vehicle: "canoe", speedMul: 1, seatHeight: 0.3 } }),
  );
  kw.ride.pose = { x: dock.x, y: L.river.level + 0.2, z: dock.z, yaw: 1.2 };
  kw.ride.active = true;
  await wait(400);
  const riding = kw.state();
  const path = L.canoe.path;
  const mid = path[Math.floor(path.length / 2)];
  kw.ride.pose.x = mid[0];
  kw.ride.pose.z = mid[1];
  await wait(400);
  const mid1 = kw.state();
  kw.ride.active = false;
  window.dispatchEvent(new CustomEvent("world:mount", { detail: { riding: false, speedMul: 1, seatHeight: 0 } }));
  await wait(400);
  const landed = kw.state();
  return {
    world: document.documentElement.dataset.world,
    riding: riding.pos,
    mid: mid1.pos,
    midTarget: mid,
    landed: landed.pos,
    landedWalkable: L.walkable(landed.pos[0], landed.pos[2]),
    passportBtn: !!document.querySelector(".qn-passport-button, [class*=passport]"),
  };
});
console.log(JSON.stringify(r));
await p.keyboard.press("KeyP");
await sleep(700);
await p.screenshot({ path: `${out}/passport-open.png` });
await p.keyboard.press("Escape");
await sleep(300);
await p.evaluate(() => window.dispatchEvent(new CustomEvent("world:postcard")));
await sleep(1500);
await p.screenshot({ path: `${out}/postcard.png` });
console.log("logs:", logs.length ? logs.join("\n") : "clean");
await browser.close();
