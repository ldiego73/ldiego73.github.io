// Integration checks: bun src/world/dev/integration.mjs [baseUrl]
// 1) walk from spawn past the trailhead, 2) scripted bridge crossing, 3) guided tour reaches stops, 4) what sits on the trail at t 0.02–0.03.
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5191/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`${base}?lang=es&skip=1`);
await p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 30000 });
const kw = (fn, ...a) => p.evaluate(([f, a]) => document.getElementById("world").__kw[f](...a), [fn, a]);
await sleep(800);

// 4) Objects near the trail centerline at the trailhead.
console.log(
  "near trail t=0.02..0.035:",
  JSON.stringify(
    await p.evaluate(() => {
      const k = document.getElementById("world").__kw;
      const L = k.layout;
      const hits = new Set();
      new (k.scene.children[0].constructor === Object ? Object : Object)();
      const pts = [];
      for (let t = 0.012; t <= 0.04; t += 0.002) pts.push(L.trail.pointAt(t));
      k.scene.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh) return;
        const e = o.matrixWorld.elements;
        const x = e[12],
          z = e[14];
        for (const q of pts)
          if (Math.hypot(q.x - x, q.z - z) < 1.8) {
            const chain = [];
            for (let n = o; n; n = n.parent) chain.push(n.name || n.type);
            hits.add(`${chain.slice(0, 5).join(" < ")} @(${x.toFixed(1)},${z.toFixed(1)})`);
            break;
          }
      });
      return [...hits].slice(0, 12);
    }),
  ),
);

// 1) Walk from spawn.
await kw("teleport", 0.006);
await p.keyboard.down("KeyW");
await sleep(3500);
await p.keyboard.up("KeyW");
console.log("walk from spawn → t", (await kw("state")).t.toFixed(4), "(should pass 0.04)");

// 2) Bridge crossing.
const g = await p.evaluate(() => {
  const L = document.getElementById("world").__kw.layout;
  return { t0: L.gorge.t0, t1: L.gorge.t1, len: L.trail.length };
});
await kw("teleport", g.t0 - 8 / g.len);
await kw("orbit", 0, 0.3, 9);
await sleep(300);
await p.keyboard.down("KeyW");
let worst = 0;
for (let i = 0; i < 40; i++) {
  await sleep(200);
  const s = await kw("state");
  const ty = await p.evaluate((t) => document.getElementById("world").__kw.layout.trail.pointAt(t).y, s.t);
  worst = Math.min(worst, s.pos[1] - ty);
}
await p.keyboard.up("KeyW");
const after = await kw("state");
console.log(
  `bridge: gap ${g.t0.toFixed(4)}..${g.t1.toFixed(4)}  end t ${after.t.toFixed(4)} (need > ${(g.t1 + 0.01).toFixed(4)})  worst dy ${worst.toFixed(2)}`,
);

// 3) Tour.
await kw("teleport", 0.03);
await kw("tour");
for (let i = 0; i < 9; i++) {
  await sleep(5000);
  const s = await kw("state");
  console.log(`tour +${(i + 1) * 5}s t=${s.t.toFixed(4)} touring=${s.touring}`);
}
console.log("errors", errs.slice(0, 5));
await b.close();
