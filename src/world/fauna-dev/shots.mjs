// Fauna screenshot pass, driven through the core harness dev hook (document.getElementById("world").__kw).
// Start the harness: bunx vite --config src/world/dev/vite.config.ts --port 5191
// Usage: bun src/world/fauna-dev/shots.mjs [baseUrl] [outDir] [only=comma,list]
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5191/";
const out = process.argv[3] ?? "test-results/fauna";
const only = (process.argv[4] ?? "").split(",").filter(Boolean);
const want = (k) => !only.length || only.includes(k);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
  headless: true,
});
const logs = [];
const variant = process.env.FAUNA_VARIANT ?? "";
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: variant.includes("rm") ? "reduce" : "no-preference",
});
if (variant.includes("low")) await ctx.addInitScript(() => localStorage.setItem("ldiego73-world-quality", "low"));
const p = await ctx.newPage();
p.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
});
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

const sep = base.includes("?") ? "&" : "?";
await p.goto(`${base}${sep}lang=es&skip=1`);
await p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 30000 });
await p.evaluate(() => document.getElementById("world").__kw.setTime(0.42));
await sleep(800);

/**
 * Stand the traveler `standoff` units from animal `index` of `kind` (on the line from the nearest trail point),
 * then put the camera behind the traveler looking at the animal.
 */
const frame = (kind, index, standoff, pitch, dist, extraYaw = 0) =>
  p.evaluate(
    ([kind, index, standoff, pitch, dist, extraYaw]) => {
      const kw = document.getElementById("world").__kw;
      const mesh = kw.scene.getObjectByName(`fauna-${kind}-body`);
      if (!mesh || index >= mesh.count) return null;
      const e = mesh.instanceMatrix.array;
      const ax = e[index * 16 + 12];
      const ay = e[index * 16 + 13];
      const az = e[index * 16 + 14];
      const L = kw.layout;
      const t = L.trail.nearestT(ax, az);
      const pt = L.trail.pointAt(t);
      const tg = L.trail.tangentAt(t);
      const rx = -tg.z;
      const rz = tg.x;
      const lat = (ax - pt.x) * rx + (az - pt.z) * rz;
      const along = (ax - pt.x) * tg.x + (az - pt.z) * tg.z;
      const side = lat - Math.sign(lat || 1) * Math.min(Math.abs(lat), standoff);
      kw.teleport(Math.min(1, Math.max(0, t + along / L.trail.length)), side);
      const s = kw.state();
      const hx = ax - s.pos[0];
      const hz = az - s.pos[2];
      const camYaw = Math.atan2(-hx, -hz) + extraYaw;
      const yaw = Math.atan2(tg.x, tg.z);
      kw.orbit(camYaw - yaw - Math.PI, pitch, dist);
      return {
        kind,
        at: [ax, ay, az].map((v) => +v.toFixed(1)),
        traveler: s.pos.map((v) => +v.toFixed(1)),
        t: +t.toFixed(3),
      };
    },
    [kind, index, standoff, pitch, dist, extraYaw],
  );

/**
 * Free close-up camera: each render, place the camera `dist` from the animal (at bearing `ang`, `h` above
 * its ground) looking at it. With `from` the camera stays put at that world point and tracks the animal.
 */
const look = (kind, index, dist, h, ang, from = null) =>
  p.evaluate(
    ([kind, index, dist, h, ang, from]) => {
      const kw = document.getElementById("world").__kw;
      const mesh = kw.scene.getObjectByName(`fauna-${kind}-body`);
      kw.scene.onBeforeRender = (_r, _s, cam) => {
        if (!mesh) return;
        const e = mesh.instanceMatrix.array;
        const x = e[index * 16 + 12];
        const y = e[index * 16 + 13];
        const z = e[index * 16 + 14];
        if (from) cam.position.set(from[0], from[1], from[2]);
        else {
          if (ang === null) {
            // Downhill side: the camera looks up at the animal instead of sitting inside a slope.
            let best = Infinity;
            for (let k = 0; k < 16; k++) {
              const a = (k / 16) * Math.PI * 2;
              const hh = kw.layout.heightAt(x + Math.sin(a) * dist, z + Math.cos(a) * dist);
              if (hh < best) {
                best = hh;
                ang = a;
              }
            }
          }
          const cx = x + Math.sin(ang) * dist;
          const cz = z + Math.cos(ang) * dist;
          cam.position.set(cx, Math.max(y, kw.layout.heightAt(cx, cz)) + h, cz);
        }
        cam.lookAt(x, y + (from ? 0 : 0.6), z);
        cam.updateMatrixWorld();
      };
    },
    [kind, index, dist, h, ang, from],
  );
const free = () => p.evaluate(() => (document.getElementById("world").__kw.scene.onBeforeRender = () => {}));

const close = async (name, kind, index, dist, h, ang, standoff = 30) => {
  await frame(kind, index, standoff, 0.3, 9);
  await look(kind, index, dist, h, ang);
  await sleep(1500);
  await p.screenshot({ path: `${out}/${name}.png` });
  await free();
  console.log(name);
};
if (want("c-vicuna")) await close("c1-vicuna-close", "vicuna", 1, 7, 1.4, 2.2, 40);
if (want("c-alpaca")) await close("c2-alpaca-close", "alpaca", 2, 5, 1.2, 0.8, 25);
if (want("c-vizcacha")) await close("c3-vizcacha-close", "vizcacha", 1, 3.6, 1.1, null, 25);
if (want("c-llama")) await close("c4-llama-close", "llama", 1, 5, 1.2, 1.6, 40);
if (want("c-condor")) {
  await frame("condor", 0, 40, 0.3, 9);
  const s = await p.evaluate(() => document.getElementById("world").__kw.state().pos);
  await look("condor", 0, 0, 0, 0, [s[0], s[1] + 2, s[2]]);
  await sleep(1200);
  await p.screenshot({ path: `${out}/c5-condor-sky.png` });
  await look("condor", 0, 9, 2, 1.7);
  await sleep(600);
  await p.screenshot({ path: `${out}/c6-condor-close.png` });
  await free();
}

const shot = async (name, ...args) => {
  const wait = typeof args.at(-1) === "string" ? Number(args.pop()) : 1400;
  const info = await frame(...args);
  console.log(name, JSON.stringify(info));
  await sleep(wait);
  await p.screenshot({ path: `${out}/${name}.png` });
};

if (want("vicuna")) await shot("01-vicunas", "vicuna", 0, 17, 0.18, 4, 0.45);
if (want("vicuna2")) await shot("01b-vicunas-wide", "vicuna", 5, 26, 0.3, 10, 0.3);
if (want("alpaca")) await shot("02-alpacas", "alpaca", 0, 6, 0.2, 3.5, 0.6);
if (want("alpaca2")) await shot("03-alpacas-tambo", "alpaca", 6, 7, 0.25, 4, 0.6);
if (want("vizcacha")) await shot("04-vizcachas", "vizcacha", 0, 11, 0.2, 3, 0.4);
if (want("hide")) await shot("05-vizcachas-hide", "vizcacha", 0, 5, 0.35, 6, 0.6, "4000");
if (want("llama")) await shot("06-caravan", "llama", 0, 0, 0.2, 7, 0.9);
if (want("condor")) await shot("07-condors", "condor", 0, 40, 0.18, 14);
if (want("hello")) {
  await p.goto(`${base}${sep}lang=es&skip=1`);
  await p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 30000 });
  await p.evaluate(() => document.getElementById("world").__kw.setTime(0.42));
  await sleep(500);
  // Legal approach: stand on the paved band (|side| ≤ halfWidth − 0.3) beside the alpaca closest to the path.
  const info = await p.evaluate(() => {
    const kw = document.getElementById("world").__kw;
    const mesh = kw.scene.getObjectByName("fauna-alpaca-body");
    const L = kw.layout;
    let best = null;
    for (let i = 0; i < mesh.count; i++) {
      const e = mesh.instanceMatrix.array;
      const x = e[i * 16 + 12];
      const z = e[i * 16 + 14];
      const t = L.trail.nearestT(x, z);
      const pt = L.trail.pointAt(t);
      const tg = L.trail.tangentAt(t);
      const lat = (x - pt.x) * -tg.z + (z - pt.z) * tg.x;
      const d = L.trailQuery(x, z).d;
      // Skip the trail ends (trailhead plaza): the gate keeps alpacas at a distance on purpose.
      if (t > 0.03 && t < 0.97 && (!best || d < best.d)) best = { i, t, lat, tg, d };
    }
    const side = Math.sign(best.lat) * (L.trail.halfWidth - 0.3);
    kw.teleport(best.t, side);
    const yaw = Math.atan2(best.tg.x, best.tg.z);
    // Camera on the path side, looking across the traveler at the alpaca.
    kw.orbit(Math.atan2(best.tg.z * Math.sign(best.lat), -best.tg.x * Math.sign(best.lat)) - yaw - Math.PI, 0.3, 6);
    return {
      alpaca: best.i,
      lat: +best.lat.toFixed(2),
      walkable: L.walkable(...[kw.state().pos[0], kw.state().pos[2]]),
    };
  });
  // Stand still: curious alpacas amble over to the path edge.
  await sleep(14000);
  const near = await p.evaluate(() => {
    const kw = document.getElementById("world").__kw;
    const mesh = kw.scene.getObjectByName("fauna-alpaca-body");
    const e = mesh.instanceMatrix.array;
    const s = kw.state().pos;
    let best = Infinity;
    for (let i = 0; i < mesh.count; i++)
      best = Math.min(best, Math.hypot(e[i * 16 + 12] - s[0], e[i * 16 + 14] - s[2]));
    return +best.toFixed(2);
  });
  console.log("nearest alpaca", near);
  const promptShown = await p.evaluate(() => /saludar/i.test(document.body.innerText));
  await p.keyboard.press("KeyE");
  await sleep(500);
  const bubble = await p.evaluate(() => {
    const b = document.querySelector(".kw-fauna-bubble");
    return b ? `${b.textContent} opacity=${getComputedStyle(b).opacity}` : null;
  });
  await p.screenshot({ path: `${out}/08-alpaca-hello.png` });
  console.log("hello", JSON.stringify(info), "prompt", promptShown, "bubble", bubble);
}
if (want("fps")) {
  await frame("vicuna", 0, 30, 0.3, 12);
  const fps = await p.evaluate(
    () =>
      new Promise((res) => {
        let n = 0;
        const t0 = performance.now();
        const f = () => {
          n++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(f);
          else res(Math.round((n * 1000) / (performance.now() - t0)));
        };
        requestAnimationFrame(f);
      }),
  );
  const counts = await p.evaluate(() => {
    const kw = document.getElementById("world").__kw;
    const o = {};
    kw.scene.traverse((m) => {
      if (m.isInstancedMesh && m.name.startsWith("fauna-") && m.name.endsWith("-body")) o[m.name] = m.count;
    });
    return o;
  });
  console.log("fps", fps, JSON.stringify(counts));
}
console.log(logs.slice(0, 30).join("\n"));
await browser.close();
