// Screenshot + draw-call pass for the scenery harness (server on port 5204, see main.ts).
// Usage: bun src/world/selva/scenery-dev/shots.mjs [outDir] [only]
import { chromium } from "@playwright/test";

const base = "http://localhost:5204/";
const out = process.argv[2] ?? "test-results/selva-scenery";
const only = process.argv[3];
const args = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args, headless: true });
const logs = [];
async function page(opts, query) {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  p.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
  });
  p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  await p.goto(`${base}?${query}`);
  await p.waitForFunction(() => window.__sc, null, { timeout: 120000 });
  await sleep(1500);
  return p;
}
const sc = (p, fn, ...a) => p.evaluate(([f, a]) => window.__sc[f](...a), [fn, a]);
const shot = async (p, name) => {
  if (only && !name.includes(only)) return;
  await sleep(700);
  await p.screenshot({ path: `${out}/${name}.png` });
};
const report = {};

for (const q of ["high", "low"]) {
  const p = await page({ viewport: { width: 1440, height: 900 } }, `q=${q}&time=0.42`);
  const stats = {};
  for (const t of [0.1, 0.3, 0.5, 0.7]) {
    await sc(p, "road", t, 0, 2.2);
    await shot(p, `${q}-road-${t}`);
    stats[`road-${t}`] = await sc(p, "stats");
  }
  // Canopy walkway (deck at its highest), looking along it.
  await sc(p, "road", 0.858, 0, 2.2, false, -6);
  await shot(p, `${q}-canopy-0.86`);
  stats["canopy-0.86"] = await sc(p, "stats");
  if (q === "high") {
    // Overview from high above the middle of the road.
    const L = await p.evaluate(() => {
      const a = window.__sc.layout.trail.pointAt(0.5);
      return { x: a.x, y: a.y, z: a.z };
    });
    await sc(p, "look", L.x - 160, 140, L.z + 170, L.x + 40, 0, L.z - 10);
    await shot(p, `${q}-overview`);
    stats.overview = await sc(p, "stats");
    // River with victoria regia: low over the water, looking downstream past the first lily patch.
    await p.evaluate(() => {
      const r = window.__sc.layout.river;
      const [x, z] = r.pts[Math.round(0.52 * (r.pts.length - 1))];
      window.__sc.look(x - 18, r.level + 3.5, z - 4, x + 10, r.level, z + 3);
    });
    await shot(p, "high-river-lilies");
    // Dawn mist over the river, seen from the embarcadero plaza; then the same view and the road at night.
    await sc(p, "time", 0.262);
    await p.evaluate(() => {
      const L = window.__sc.layout;
      const pl = L.plazas.find((q) => q.id === "embarcadero");
      const f = L.canoe.from;
      window.__sc.look(pl.x + (pl.x - f.x) * 0.4, pl.y + 3.2, pl.z + (pl.z - f.z) * 0.4, f.x + 10, f.y + 0.5, f.z - 2);
    });
    await shot(p, "high-dawn-river");
    await sc(p, "time", 0.95);
    await shot(p, "high-night-river");
    await sc(p, "road", 0.45, 0, 2.2, false, -3);
    await shot(p, "high-night-road");
    await sc(p, "time", 0.42);
  }
  report[q] = stats;
  await p.context().close();
}
// Phone viewport (forced phone profile, low quality).
{
  const p = await page(
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    "q=low&device=phone&time=0.42",
  );
  await sc(p, "road", 0.3, 0, 2.2);
  await shot(p, "phone-road-0.3");
  report.phone = { "road-0.3": await sc(p, "stats") };
  await p.context().close();
}
// Sky-only baseline (scenery hidden).
{
  const p = await page({ viewport: { width: 1440, height: 900 } }, "q=high&hide=1&time=0.42");
  await sc(p, "road", 0.3, 0, 2.2);
  report.baseline = await sc(p, "stats");
  await p.context().close();
}
await browser.close();
const fmt = (s) =>
  `${s.all.calls} calls / ${Math.round(s.all.tris / 1000)}k tris (color pass ${s.color.calls} / ${Math.round(s.color.tris / 1000)}k)`;
for (const [q, stats] of Object.entries(report)) {
  if (q === "baseline") {
    console.log(`baseline (sky only): ${fmt(stats)}`);
    continue;
  }
  for (const [k, s] of Object.entries(stats))
    console.log(`${q} ${k}: ${fmt(s)}  colliders ${s.colliders}  build ${Math.round(s.build.scenery)} ms`);
}
if (logs.length) console.log(`\n${logs.slice(0, 30).join("\n")}`);
