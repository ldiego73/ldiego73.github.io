/**
 * Perezosos (brown-throated three-toed sloths, Bradypus variegatus), hanging upside down under the limbs of
 * cecropias (cetico, their favourite tree): one beside the road between the regatón and the maloca, one
 * right beside the canopy walkway (its limb reaches over the rail, the sloth hangs at the height of the
 * deck), and on high quality a third past the palafitos. A sloth creeps along its limb hand over hand at a
 * few centimetres a second, then hangs still for a long while; when the traveler stops nearby it turns its
 * head toward them, very slowly. Day and night alike (sloths keep no hours). Reduced motion: even slower.
 *
 * The cecropias are brought by this module (wild/trees.ts) so the sloth hangs from a real branch: one static
 * merged mesh per site, drawn only within ~170 u of the camera (wild/kit.ts SiteProps). Rendering: the near
 * site's tree + one rig InstancedMesh for the sloths (flipped under the limb, frustum-culled as a whole) →
 * 1–2 draw calls. Bodies ("perezoso"): listed for queries, never solid (up in the tree).
 * Stamp `selva:fauna:perezoso` after a ~1.5 s good look within 14 u.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { type Body, creatures } from "../../creatures";
import { on } from "../../events";
import { GeoBuilder } from "../../flora/geom";
import { CANOPY_T } from "../contract";
import { devHook, FAUNA_FAR, idle, ramp, rootMatrix, SiteProps, Spotter, selvaOf } from "./wild/kit";
import { damp, nightAmount, rng, roadFrame, treeSites, wrapAngle } from "./wild/logic";
import { slothModel } from "./wild/mammals";
import { RigSet } from "./wild/rig";
import { cecropia, type LimbSeg, limbPoint } from "./wild/trees";

/** Stylized a little larger than life (≈ 0.9 u body) so the shaggy shape reads under its limb. */
const SCALE = 1.55;

interface Sloth {
  limb: LimbSeg;
  u: number;
  uT: number;
  dir: 1 | -1;
  wait: number;
  phase: number;
  speed: number;
  headYaw: number;
  headPitch: number;
  x: number;
  y: number;
  z: number;
  body: Body;
}

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const R = rng(6007);
  const sloths: Sloth[] = [];
  /** One cecropia mesh per site, drawn only near the camera. */
  const props = new SiteProps(env, "selva-fauna-perezoso-cecropias");

  const clearOfTrunks = (x: number, z: number) =>
    !L.colliders.some((c) => c.kind === "circle" && Math.hypot(c.x - x, c.z - z) < c.r + 1.4);

  /** A cecropia at road t (lat band, side) whose hanging limb reaches toward the road; sloth on it. */
  const plant = (
    t0: number,
    t1: number,
    side: -1 | 1,
    lat0: number,
    lat1: number,
    hang: (x: number, z: number, y: number, t: number) => number,
    tipLat: number,
  ) => {
    const sites = treeSites(L, { t0, t1, n: 4, lat0, lat1, side, gap: 3, seed: Math.round(t0 * 1000) });
    const s = sites.find((p) => clearOfTrunks(p.x, p.z));
    if (!s) return;
    const f = roadFrame(L, s.t);
    const lat = Math.hypot(s.x - f.x, s.z - f.z);
    const dir = Math.atan2(f.x - s.x, f.z - s.z);
    const h = hang(s.x, s.z, s.y, s.t);
    const builder = new GeoBuilder();
    const tree = cecropia(builder, s.x, s.y, s.z, Math.max(9, h + 4.5), R, {
      hang: h,
      dir,
      reach: Math.max(2.4, lat - tipLat),
    });
    props.add(builder.build(), high);
    const limb = tree.limbs[0]!;
    sloths.push({
      limb,
      u: 0.55 + R() * 0.25,
      uT: 0.6,
      dir: 1,
      wait: 5 + R() * 20,
      phase: R(),
      speed: 0,
      headYaw: 0,
      headPitch: 0,
      x: 0,
      y: 0,
      z: 0,
      body: creatures.add("perezoso", 0.35, { solid: false }),
    });
  };
  // Road edge between the regatón and the maloca: limb at ~5 u over the forest floor, tip 4.6 u off the road.
  plant(0.22, 0.27, -1, 7.5, 10, () => 4, 4.6);
  // Beside the canopy walkway near its highest point: the limb at deck height + 1.7, tip just past the rail.
  // (Between the walkway ceibas on the forest side, t ≈ 0.852 and 0.879; the river-side one is at 0.866.)
  plant(
    CANOPY_T[0] + 0.032,
    CANOPY_T[0] + 0.04,
    -1,
    9,
    11,
    (_x, _z, y, t) => (L.canopyDeckAt(t) ?? y + 8) - y + 1.7,
    4.2,
  );
  if (high) plant(0.66, 0.7, 1, 7.5, 10, () => 3.8, 4.8);

  const model = slothModel();
  const set = new RigSet("selva-fauna-perezoso-body", model.geo, model.spec, sloths.length, ramp(env));
  const root = new THREE.Group();
  root.name = "selva-fauna-perezoso";
  root.add(set.mesh);
  root.add(props.group);
  env.scene.add(root);

  const spot = new Spotter(env, "perezoso", 14);
  let inside = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });
  const offDev = devHook("perezoso", () =>
    sloths.map((s) => [+s.x.toFixed(1), +s.y.toFixed(1), +s.z.toFixed(1), +s.u.toFixed(2)]),
  );
  const m4 = new THREE.Matrix4();
  const p = { x: 0, y: 0, z: 0 };

  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      set.rim.value = nightAmount(env.sky.time()) * 0.6;
      spot.begin();
      props.update(spot.view.cam);
      const slow = rm ? 0.6 : 1;
      let n = 0;
      for (const s of sloths) {
        const l = s.limb;
        const len = Math.hypot(l.bx - l.ax, l.by - l.ay, l.bz - l.az);
        // Creep toward the next spot on the limb, then hang still for a long while.
        let speed = 0;
        if (s.wait > 0) s.wait -= dt;
        else {
          const left = s.uT - s.u;
          if (Math.abs(left) * len < 0.02) {
            s.wait = 25 + R() * 35;
            s.uT = 0.38 + R() * 0.52;
          } else {
            speed = 0.03 * slow;
            s.dir = left > 0 ? 1 : -1;
            s.u += (s.dir * speed * dt) / len;
          }
        }
        s.speed = damp(s.speed, speed, 2, dt);
        // One slow reach per ~0.2 u of limb.
        s.phase = (s.phase + (s.speed * dt) / 0.2) % 1;
        limbPoint(l, s.u, p, -1);
        s.x = p.x;
        s.y = p.y;
        s.z = p.z;
        // Facing along the limb (toward the tip or the trunk), upside down under it.
        const dx = (l.bx - l.ax) * s.dir;
        const dz = (l.bz - l.az) * s.dir;
        const dy = (l.by - l.ay) * s.dir;
        const yaw = Math.atan2(dx, dz);
        const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
        // Head: a slow turn toward a traveler close by (mirrored: the sloth is upside down).
        const d = Math.hypot(s.x - avatar.x, s.z - avatar.z);
        const toAv = Math.atan2(avatar.x - s.x, avatar.z - s.z);
        const look = d < 9 ? -Math.max(-1.3, Math.min(1.3, wrapAngle(toAv - yaw))) : Math.sin(s.phase * 6.28) * 0.15;
        s.headYaw = damp(s.headYaw, look, 0.35 * slow, dt);
        s.headPitch = damp(s.headPitch, d < 9 ? 0.35 : -0.1, 0.3 * slow, dt);
        s.body.x = s.x;
        s.body.z = s.z;
        if (spot.view.dist(s.x, s.y, s.z) > FAUNA_FAR) continue;
        rootMatrix(m4, s.x, s.y, s.z, yaw, pitch, Math.PI, SCALE);
        set.set(n, m4, s.phase, 0.35 * Math.min(1, s.speed / 0.02), s.headYaw, s.headPitch, 0, 0, 0.12, -0.12);
        n++;
        spot.see(s.x, s.y - 0.4, s.z, avatar.x, avatar.z, 0.6);
      }
      set.commit(inside ? 0 : n);
      spot.end(dt);
    },
    dispose() {
      offInterior();
      offDev();
      for (const s of sloths) creatures.remove(s.body);
      set.dispose();
      props.dispose();
      root.removeFromParent();
    },
  };
};
