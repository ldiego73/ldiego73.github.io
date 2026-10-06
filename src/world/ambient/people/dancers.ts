/**
 * Inti Raymi at the summit plaza: dancers in festive dress (bright polleras, fringed monteras, chullos and
 * ponchos, white handkerchiefs) circle the ushnu in a ring with a skipping huayno step, turning on the spot
 * now and then. They keep to a ring between the pennant poles and the plaza edge, bending out of the way
 * of the traveler. Only on festival days (calendar.ts festivalOf()): people.ts builds them the first time the
 * festival is on (even mid-session) and `enable(false)` takes them out of the world when it ends.
 */
import type * as THREE from "three";
import { FESTIVE, MAN, type PartName, rng, SKINS, WEAVES, WOMAN } from "./models";
import { angleDamp, damp, Person } from "./person";
import type { Crowd, Palette } from "./rig";
import type { Ctx, Group } from "./types";

/** Ring radius around the summit plaza center (poles at 3.5, plaza edge 6.2). Bonfires belong outside it. */
export const DANCE_RING = 4.85;
const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;

/**
 * Festival dressing on the summit plaza (ambient/festival.ts, summit-local frame: +Z toward the trail):
 * bonfires flanking the ushnu and banner poles. The ring bends outward around them.
 * [local x, local z, clearance radius]
 */
const FESTIVAL_OBSTACLES: Array<[number, number, number]> = [
  [-5, 0.2, 0.95],
  [5, 0.2, 0.95],
  // Banner poles (festival/banners.ts): flags and hanging cloths.
  [-5.6, 3.2, 0.3],
  [5.6, 3.2, 0.3],
  [-3.7, 5.4, 0.3],
  [3.7, 5.4, 0.3],
];

/** Outward radial shift (≥ 0) that keeps a dancer at ring angle `u` clear of the obstacles. */
export function ringDetour(u: number, ring: number, obs: ReadonlyArray<{ a: number; r: number; s: number }>) {
  let off = 0;
  for (const o of obs) {
    let da = u - o.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const arc = Math.abs(da) * o.r;
    const k = Math.min(1, Math.max(0, (o.s + 1.2 - arc) / 0.8));
    if (k <= 0) continue;
    const need = o.r + o.s + 0.45 - ring;
    if (need > 0) off = Math.max(off, need * k * k * (3 - 2 * k));
  }
  return off;
}

export interface DancerGroup extends Group {
  /** Festival on/off: off hides every dancer and takes their bodies out of the world (no avoidance). */
  enable(on: boolean): void;
}

/**
 * `slots`: crowd slots reserved up front (the crowd is sized at load and can't grow), so the dancers can be
 * built whenever the festival starts. Without them, slots are allocated now.
 */
export function createDancers(
  env: Ctx["env"],
  crowd: Crowd,
  center: THREE.Vector3,
  yaw: number,
  n: number,
  slots?: readonly number[],
): DancerGroup {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const obstacles = FESTIVAL_OBSTACLES.map(([lx, lz, s]) => {
    const x = lx * cy + lz * sy;
    const z = -lx * sy + lz * cy;
    return { a: Math.atan2(z, x), r: Math.hypot(x, z), s };
  });
  const R = rng(624);
  const wears: PartName[][] = Array.from({ length: n }, (_, i) =>
    i % 2 ? [...MAN, "chullo", "panuelo"] : [...WOMAN, "montera-fiesta", "panuelo"],
  );
  const dancers = wears.map((w, i) => {
    const man = i % 2 === 1;
    const main = FESTIVE[(i * 2 + 1) % FESTIVE.length] as string;
    const palette: Palette = [
      pick(R, SKINS),
      main,
      pick(R, WEAVES),
      man ? "#1f1b2e" : (FESTIVE[(i + 3) % FESTIVE.length] as string),
    ];
    const p = new Person({
      kind: "dancer",
      crowd,
      idx: slots?.[i] ?? crowd.alloc(),
      wear: w,
      palette,
      scale: man ? 1.02 : 0.95,
      girth: 1.02,
      radius: 0.36,
      seed: 3 + i * 2.9,
    });
    p.u = (i / n) * Math.PI * 2;
    p.v = 0;
    p.setActive(true);
    return p;
  });
  const OMEGA = 0.2;
  let visibleNow = true;
  let enabled = true;

  const group: DancerGroup = {
    name: "inti-raymi",
    center,
    radius: DANCE_RING + 3,
    enable(on) {
      if (on === enabled) return;
      enabled = on;
      for (const p of dancers) {
        p.setActive(on);
        // Back on: snap onto the ring on the next update (no long walk in from where they left).
        if (on) p.state = "";
      }
      visibleNow = on;
    },
    update(c, visible) {
      if (!enabled) return;
      if (visible !== visibleNow) {
        visibleNow = visible;
        if (!visible) for (const p of dancers) p.hide();
      }
      if (!visible) return;
      const dt = c.dt;
      const ax = c.avatar.x - center.x;
      const az = c.avatar.z - center.z;
      const ar = Math.hypot(ax, az);
      const aa = Math.atan2(az, ax);
      for (const p of dancers) {
        p.u += OMEGA * dt * (c.rm ? 0.5 : 1);
        // Bend out of the traveler's way: shift the radius away from them when they stand on the ring.
        let da = aa - p.u;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        const close = Math.abs(da) * DANCE_RING < 2.2 && Math.abs(ar - DANCE_RING) < 1.4;
        const detour = ringDetour(p.u, DANCE_RING, obstacles);
        const off = close ? (ar > DANCE_RING ? Math.max(detour, 0) - 1.25 : 1.05 + detour) : detour;
        p.v = damp(p.v, off, 3, dt);
        const r = DANCE_RING + p.v;
        const tx = center.x + Math.cos(p.u) * r;
        const tz = center.z + Math.sin(p.u) * r;
        if (c.jump || p.state === "") {
          p.place(tx, tz);
          p.state = "dance";
        }
        p.seek(tx, tz, 1.6, dt, 6);
        // Facing: along the ring, with a full turn every few bars.
        const spinK = (c.clock * 0.13 + p.seed * 0.37) % 1;
        const spin = !c.rm && spinK > 0.9 ? ((spinK - 0.9) / 0.1) * Math.PI * 2 : 0;
        const along = Math.atan2(-Math.sin(p.u), Math.cos(p.u));
        p.yaw = angleDamp(p.yaw, along, 6, dt) + 0;
        p.y = env.extra.groundAt(p.x, p.z);
        // Huayno: quick step-hop on the beat, the handkerchief waves overhead.
        const b = p.bones;
        p.rest(c.clock, c.rm);
        const beat = c.clock * 2.4 * Math.PI + p.seed;
        const s = Math.sin(beat);
        const amp = c.rm ? 0.3 : 1;
        b.legL.rotation.x = Math.max(0, s) * -0.6 * amp;
        b.legR.rotation.x = Math.max(0, -s) * -0.6 * amp;
        b.hips.position.y = Math.abs(s) * 0.09 * amp;
        b.torso.rotation.z = s * 0.08 * amp;
        b.armR.rotation.set(-2.6 + Math.sin(beat * 0.5) * 0.35 * amp, 0, -0.35);
        b.armL.rotation.set(-0.5, 0, 0.55 + Math.max(0, s) * 0.2 * amp);
        b.head.rotation.z = -s * 0.06 * amp;
        const yaw = p.yaw;
        p.yaw = yaw + spin;
        p.commit();
        p.yaw = yaw;
      }
    },
    drawCalls: () => 0,
    people: () => (enabled ? dancers.length : 0),
    dispose() {
      for (const p of dancers) p.dispose();
    },
  };
  return group;
}
