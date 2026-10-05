// Screenshot pass for the Qhapaq Ñan world.
// Usage: bun src/world/dev/shots.mjs [baseUrl] [outDir] [only=comma,list]
// baseUrl defaults to the Vite harness (http://localhost:5191/).
import { mkdirSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5191/";
const out = process.argv[3] ?? "test-results/world";
const only = (process.argv[4] ?? "").split(",").filter(Boolean);
const want = (k) => !only.length || only.includes(k);
mkdirSync(out, { recursive: true });
const args = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = (q) => `${base}${base.includes("?") ? "&" : "?"}${q}`;

const browser = await chromium.launch({ args, headless: true });
const logs = [];
async function page(ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const p = await ctx.newPage();
  p.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
  });
  p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  return p;
}
const kw = (p, fn, ...a) => p.evaluate(([f, a]) => document.getElementById("world").__kw[f](...a), [fn, a]);
const ready = (p) => p.waitForFunction(() => !!document.getElementById("world")?.__kw, null, { timeout: 30000 });
const fps = (p) =>
  p.evaluate(
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

const d = await page({ viewport: { width: 1440, height: 900 } });
if (want("title")) {
  await d.goto(url("lang=es"));
  await ready(d);
  await kw(d, "setTime", 0.45);
  await sleep(1800);
  await d.screenshot({ path: `${out}/01-title-day.png` });
  await kw(d, "setTime", 0.02);
  await sleep(900);
  await d.screenshot({ path: `${out}/02-title-night.png` });
  await kw(d, "setTime", 0.45);
  await d.keyboard.press("Enter");
  await sleep(1500);
  await d.screenshot({ path: `${out}/03-swoop.png` });
  await sleep(2600);
  await d.screenshot({ path: `${out}/04-trailhead.png` });
  console.log("fps trailhead", await fps(d));
}
const play = async (p, lang = "es") => {
  await p.goto(url(`lang=${lang}&skip=1`));
  await ready(p);
  await kw(p, "setTime", 0.42);
  await sleep(600);
};
if (want("trail")) {
  await play(d);
  // Mid-trail by a tambo (Belcorp, t=0.23).
  await kw(d, "teleport", 0.215);
  await kw(d, "orbit", 0.7, 0.3, 11);
  await sleep(1200);
  await d.screenshot({ path: `${out}/05-midtrail-tambo.png` });
  console.log("fps mid", await fps(d));
  // Walk a little (controller + camera follow).
  await d.keyboard.down("KeyW");
  await sleep(1500);
  await d.keyboard.up("KeyW");
  await sleep(500);
  await d.screenshot({ path: `${out}/06-walking.png` });
}
if (want("gorge")) {
  await play(d);
  await kw(d, "teleport", 0.655);
  await kw(d, "orbit", 0.9, 0.42, 16);
  await sleep(1300);
  await d.screenshot({ path: `${out}/07-gorge.png` });
}
if (want("fixed")) {
  // The three spots that used to break: TopSort approach, TopSort → Globant, the build plot on the way.
  await play(d);
  for (const [name, t, yo, p, dist] of [
    ["12-topsort-approach", 0.49, 0.5, 0.32, 12],
    ["13-topsort-globant", 0.565, -0.6, 0.38, 14],
    ["14-build-2", 0.548, 0.9, 0.42, 16],
  ]) {
    await kw(d, "teleport", t);
    await kw(d, "orbit", yo, p, dist);
    await sleep(1200);
    await d.screenshot({ path: `${out}/${name}.png` });
  }
}
if (want("terraces")) {
  await play(d);
  await kw(d, "teleport", 0.2);
  await kw(d, "orbit", 1.3, 0.5, 20);
  await sleep(1200);
  await d.screenshot({ path: `${out}/15-terraces-trail.png` });
}
if (want("waterfall")) {
  await play(d);
  const st = await d.evaluate(() => document.getElementById("world").__kw.layout.stream.t);
  await kw(d, "teleport", st - 0.012);
  await kw(d, "orbit", 0.75, 0.28, 12);
  await sleep(1300);
  await d.screenshot({ path: `${out}/16-waterfall-crossing.png` });
  const w = await d.evaluate(() => {
    const s = document.getElementById("world").__kw.layout.stream;
    return { cx: s.cross.x, cz: s.cross.z, fx: s.fallBase.x, fz: s.fallBase.z };
  });
  await kw(d, "face", w.cx, w.cz, w.fx, w.fz);
  await kw(d, "orbit", 0.25, 0.18, 8);
  await sleep(1200);
  await d.screenshot({ path: `${out}/17-waterfall-close.png` });
}
if (want("summit")) {
  await play(d);
  await kw(d, "teleport", 0.975);
  await kw(d, "orbit", 0.5, 0.42, 15);
  await sleep(1300);
  await d.screenshot({ path: `${out}/08-summit.png` });
  await kw(d, "teleport", 0.9);
  await kw(d, "orbit", 0.2, 0.3, 12);
  await sleep(1000);
  await d.screenshot({ path: `${out}/09-summit-climb.png` });
  await kw(d, "setTime", 0.0);
  await sleep(900);
  await d.screenshot({ path: `${out}/10-summit-night.png` });
}
if (want("stations")) {
  await play(d);
  for (const [id, name] of [
    ["arcade", "18-arcade"],
    ["contact", "19-house"],
  ]) {
    const g = await d.evaluate((id) => {
      const L = document.getElementById("world").__kw.layout;
      const p = L.stationPose(id).position;
      const st = L.plazas.find((q) => q.id === id);
      return { x: p.x, z: p.z, tx: st.tx, tz: st.tz };
    }, id);
    // From the trail, looking at the plaza (approach).
    await kw(d, "face", g.tx, g.tz, g.x, g.z);
    await kw(d, "orbit", 0.55, 0.42, 15);
    await sleep(1300);
    await d.screenshot({ path: `${out}/${name}-approach.png` });
    // Standing at the pose (content raises world:interior inside; camera closes in).
    await kw(d, "face", g.x, g.z, g.tx, g.tz);
    await sleep(1800);
    await d.screenshot({ path: `${out}/${name}-inside.png` });
  }
}
if (want("photo")) {
  const p = await page({ viewport: { width: 1440, height: 900 } });
  await p.goto(url("lang=es"));
  await ready(p);
  await p.evaluate(() => localStorage.removeItem("qn.traveler"));
  await kw(p, "setTime", 0.45);
  await p.evaluate(() => window.addEventListener("world:traveler", (e) => (window.__traveler = e.detail.name)));
  await p.fill(".kw-title .kw-name-input", "  Ana   Quispe <b>🌄");
  await sleep(600);
  await p.screenshot({ path: `${out}/20-title-name.png` });
  await p.press(".kw-title .kw-name-input", "Enter");
  await sleep(4300);
  console.log(
    "traveler event:",
    await p.evaluate(() => window.__traveler),
    "stored:",
    await p.evaluate(() => localStorage.getItem("qn.traveler")),
  );
  await kw(p, "teleport", 0.215);
  await kw(p, "orbit", 0.7, 0.3, 11);
  await sleep(1200);
  await p.keyboard.press("KeyF");
  await p.waitForSelector(".kw-photo:not([hidden]) .kw-photo-img[src]", { timeout: 10000 });
  await sleep(600);
  console.log("download:", await p.$eval(".kw-photo a[download]", (a) => a.getAttribute("download")));
  await p.screenshot({ path: `${out}/21-photo-trail.png` });
  // Movement is paused while open.
  const before = await kw(p, "state");
  await p.keyboard.down("KeyW");
  await sleep(500);
  await p.keyboard.up("KeyW");
  const after = await kw(p, "state");
  console.log(
    "moved while dialog open:",
    Math.hypot(after.pos[0] - before.pos[0], after.pos[2] - before.pos[2]).toFixed(3),
  );
  await p.keyboard.press("Escape");
  await sleep(300);
  console.log("closed by Esc:", await p.$eval(".kw-photo", (e) => e.hidden));
  await kw(p, "teleport", 0.985);
  await kw(p, "orbit", 0.5, 0.35, 12);
  await sleep(1200);
  await p.click('[data-k="photo"]');
  await p.waitForSelector(".kw-photo:not([hidden]) .kw-photo-img[src]", { timeout: 10000 });
  await sleep(600);
  await p.screenshot({ path: `${out}/22-photo-summit.png` });
  // Save the postcard itself for review.
  const b64 = await p.$eval(".kw-photo-img", async (img) => {
    const r = await fetch(img.src);
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = "";
    for (const c of buf) s += String.fromCharCode(c);
    return btoa(s);
  });
  await Bun.write(`${out}/23-postcard-summit.png`, Buffer.from(b64, "base64"));
  await p.click(".kw-photo .kw-btn:last-child");
  await sleep(200);
  console.log("img src cleared after close:", await p.$eval(".kw-photo-img", (i) => !i.getAttribute("src")));
}
if (want("tour")) {
  await play(d);
  await kw(d, "teleport", 0.03);
  await kw(d, "tour");
  await sleep(9000);
  console.log("tour state", JSON.stringify(await kw(d, "state")));
  await d.screenshot({ path: `${out}/11-tour.png` });
}
if (want("mobile")) {
  const m = await page({ ...devices["Pixel 7"] });
  await m.goto(url("lang=en"));
  await ready(m);
  await kw(m, "setTime", 0.45);
  await sleep(1600);
  await m.screenshot({ path: `${out}/m1-title.png` });
  await m.tap(".kw-begin");
  await sleep(4200);
  await m.screenshot({ path: `${out}/m2-trailhead.png` });
}

console.log(logs.slice(0, 40).join("\n"));
await browser.close();
