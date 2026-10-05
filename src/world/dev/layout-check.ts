// Top-down layout check: bun src/world/dev/layout-check.ts [out.bmp]
// Prints trail length, gorge gap, station poses and overlap warnings; writes a shaded height map with the trail.
import { writeFileSync } from "node:fs";
import { STATIONS } from "../contract";
import { baseHeight, buildLayout, HALF_WIDTH, rimRadius, WORLD_HALF } from "../layout";
import { trailWallPlacements } from "../trail";

const t0 = performance.now();
// Mirrors content.ts STATION_FOOTPRINT (importing content.ts here would pull in DOM/CSS modules).
const FOOTPRINT: Record<string, number> = Object.fromEntries(
  STATIONS.map((s) => [
    s.id,
    s.kind === "arcade"
      ? 10.5
      : s.kind === "contact"
        ? 7.5
        : s.kind === "company"
          ? 6
          : s.kind === "bridge"
            ? 0
            : s.kind === "build"
              ? 5
              : 4.5,
  ]),
);
const L = buildLayout({ cells: 280, footprint: FOOTPRINT });
console.log(`build ${Math.round(performance.now() - t0)} ms, trail length ${L.trail.length.toFixed(1)}`);
console.log(
  `gorge gap t ${L.gorge.t0.toFixed(4)}..${L.gorge.t1.toFixed(4)} (${((L.gorge.t1 - L.gorge.t0) * L.trail.length).toFixed(1)} u)`,
);
for (const t of [0, 0.25, 0.5, 0.68, 0.75, 1]) {
  const p = L.trail.pointAt(t);
  console.log(
    `t=${t} (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) ground ${L.heightAt(p.x, p.z).toFixed(2)}`,
  );
}
// Max grade along the trail.
let maxG = 0;
for (let i = 0; i < 400; i++) {
  const a = L.trail.pointAt(i / 400);
  const b = L.trail.pointAt((i + 1) / 400);
  const g = Math.abs(b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z);
  if (g > maxG) maxG = g;
}
console.log(`max grade ${(maxG * 100).toFixed(1)}%`);
{
  let dev = 0;
  let devT = 0;
  for (let i = 0; i <= 600; i++) {
    const p = L.trail.pointAt(i / 600);
    const d = p.y - baseHeight(p.x, p.z);
    if (Math.abs(d) > Math.abs(dev)) {
      dev = d;
      devT = i / 600;
    }
  }
  for (let k = 0; k <= 20; k++) {
    const p = L.trail.pointAt(k / 20);
    console.log(
      `  t=${(k / 20).toFixed(2)} y ${p.y.toFixed(1)} base ${baseHeight(p.x, p.z).toFixed(1)} ang ${((Math.atan2(p.z + 20, p.x - 14) * 180) / Math.PI).toFixed(0)}`,
    );
  }
  console.log(`max trail vs base deviation ${dev.toFixed(1)} at t=${devT.toFixed(3)}`);
}
for (const s of STATIONS) {
  const p = L.stationPose(s.id);
  const q = L.trailQuery(p.position.x, p.position.z);
  const ok = L.walkable(p.position.x, p.position.z);
  const gy = L.heightAt(p.position.x, p.position.z);
  // Another leg too close: nearest t differs from station t.
  const warn =
    s.offset > 0.5 && Math.abs(q.t - s.t) > 0.02 ? ` WARN nearest leg t=${q.t.toFixed(3)} d=${q.d.toFixed(1)}` : "";
  const gz =
    Math.hypot(p.position.x - L.gorge.x, p.position.z - L.gorge.z) < 12 && s.id !== "bridge" ? " WARN near gorge" : "";
  console.log(
    `${s.id.padEnd(9)} t=${s.t} pos (${p.position.x.toFixed(1)}, ${p.position.y.toFixed(1)}, ${p.position.z.toFixed(1)}) ground ${gy.toFixed(2)} yaw ${p.yaw.toFixed(2)} walkable ${ok}${warn}${gz}`,
  );
}

// ---------------------------------------------------------------- path integrity (fails the run)
let failures = 0;
{
  // 1) Terrain never rises above the paved band (sampled across the full width every 0.25 u).
  let worst = 0;
  let worstAt = "";
  const steps = Math.ceil(L.trail.length / 0.25);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (t > L.gorge.t0 - 0.003 && t < L.gorge.t1 + 0.003) continue;
    const p = L.trail.pointAt(t);
    const g = L.trail.tangentAt(t);
    for (let k = -1; k <= 1; k += 0.1) {
      const x = p.x - g.z * k * HALF_WIDTH;
      const z = p.z + g.x * k * HALF_WIDTH;
      const over = L.heightAt(x, z) - p.y;
      if (over > worst) {
        worst = over;
        worstAt = `t=${t.toFixed(4)} k=${k.toFixed(1)}`;
      }
    }
  }
  const ok = worst < 0.12;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} terrain above path band: max ${worst.toFixed(3)} at ${worstAt}`);
  // 2) No two legs of the trail come close enough for their cuts/walls to meet.
  let minSep = Infinity;
  for (let i = 0; i <= 600; i++) {
    const a = L.trail.pointAt(i / 600);
    for (let j = i + 30; j <= 600; j++) {
      const b = L.trail.pointAt(j / 600);
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < minSep && ((j - i) / 600) * L.trail.length > 40) minSep = d;
    }
  }
  const okSep = minSep > 2 * HALF_WIDTH + 8;
  if (!okSep) failures++;
  console.log(
    `${okSep ? "PASS" : "FAIL"} leg separation: min ${minSep.toFixed(1)} u (need > ${(2 * HALF_WIDTH + 8).toFixed(1)})`,
  );
  // 3) Retaining walls / curbs never intrude into any leg's band; andén walls stay off the path.
  const curbs = trailWallPlacements(L);
  let bad = 0;
  for (const w of curbs) {
    const q = L.trailQuery(w.x, w.z);
    if (q.d - w.halfWidth < HALF_WIDTH - 0.01) bad++;
  }
  const walls = L.terraceWalls();
  let badW = 0;
  for (let i = 0; i < walls.length; i += 6) {
    for (const f of [0, 0.5, 1]) {
      const x = (walls[i] as number) + ((walls[i + 2] as number) - (walls[i] as number)) * f;
      const z = (walls[i + 1] as number) + ((walls[i + 3] as number) - (walls[i + 1] as number)) * f;
      if (L.trailQuery(x, z).d < HALF_WIDTH + 1) badW++;
    }
  }
  if (bad || badW) failures++;
  console.log(
    `${bad || badW ? "FAIL" : "PASS"} walls off the band: ${curbs.length} curb/wall stones (${bad} intrude), ${walls.length / 6} andén wall segments (${badW} intrude)`,
  );
  // 4) Station plazas are level: height spread inside 0.9 × radius under 0.3.
  for (const pl of L.plazas) {
    if (pl.id === "summit") continue;
    let lo = Infinity;
    let hi = -Infinity;
    for (let a = 0; a < 72; a++)
      for (const f of [0, 0.3, 0.6, 0.9]) {
        const h = L.heightAt(
          pl.x + Math.cos((a / 72) * Math.PI * 2) * pl.r * f,
          pl.z + Math.sin((a / 72) * Math.PI * 2) * pl.r * f,
        );
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    const okP = hi - lo < 0.3;
    if (!okP) failures++;
    console.log(
      `${okP ? "PASS" : "FAIL"} plaza ${pl.id.padEnd(8)} r ${pl.r} level within 0.9r: spread ${(hi - lo).toFixed(3)}`,
    );
  }
  console.log(
    `stream: ${L.stream.pts.length} pts, crosses at t=${L.stream.t}, fall top y ${L.stream.fallTop.y.toFixed(1)}`,
  );
}

// Image
const W = 768;
const img = new Uint8Array(W * W * 3);
const px = (x: number, z: number) => [
  Math.round(((x + WORLD_HALF) / (WORLD_HALF * 2)) * W),
  Math.round(((z + WORLD_HALF) / (WORLD_HALF * 2)) * W),
];
for (let j = 0; j < W; j++)
  for (let i = 0; i < W; i++) {
    const x = (i / W) * WORLD_HALF * 2 - WORLD_HALF;
    const z = (j / W) * WORLD_HALF * 2 - WORLD_HALF;
    const o = (j * W + i) * 3;
    if (Math.hypot(x, z) > rimRadius(Math.atan2(z, x))) {
      img.set([40, 70, 80], o);
      continue;
    }
    const h = L.heightAt(x, z);
    const hx = L.heightAt(x + 0.5, z) - h;
    const shade = Math.max(0.35, Math.min(1.2, 0.85 - hx * 0.9));
    const band = Math.floor(h / 4) % 2 ? 1 : 0.92;
    let c = h < 0.6 ? [95, 184, 194] : h > 58 ? [240, 238, 230] : [127, 174, 106];
    if (L.walkable(x, z)) c = [200, 180, 150];
    img.set(
      c.map((v) => Math.min(255, v * shade * band)),
      o,
    );
  }
for (const s of STATIONS) {
  const p = L.stationPose(s.id);
  const [cx, cz] = px(p.position.x, p.position.z);
  for (let a = -3; a <= 3; a++)
    for (let b = -3; b <= 3; b++) {
      const o = ((cz + b) * W + cx + a) * 3;
      img.set(s.kind === "company" ? [196, 56, 63] : s.kind === "build" ? [221, 166, 60] : [52, 70, 166], o);
    }
}
// BMP (bottom-up rows, BGR)
const row = W * 3;
const buf = Buffer.alloc(54 + row * W);
buf.write("BM");
buf.writeUInt32LE(buf.length, 2);
buf.writeUInt32LE(54, 10);
buf.writeUInt32LE(40, 14);
buf.writeInt32LE(W, 18);
buf.writeInt32LE(W, 22);
buf.writeUInt16LE(1, 26);
buf.writeUInt16LE(24, 28);
for (let j = 0; j < W; j++)
  for (let i = 0; i < W; i++) {
    const s = (j * W + i) * 3;
    const d = 54 + (W - 1 - j) * row + i * 3;
    buf[d] = img[s + 2] as number;
    buf[d + 1] = img[s + 1] as number;
    buf[d + 2] = img[s] as number;
  }
writeFileSync(process.argv[2] ?? "layout.bmp", buf);
console.log("halfWidth", HALF_WIDTH);
if (failures) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
