/**
 * Seabirds of the coast:
 *  - Peruvian pelicans flying in files low over the swell, up the coast near the shore and back further out,
 *    rising and falling together; off the Huanchaco beach one of them keeps diving: it climbs, folds, plunges
 *    into the sea with a splash, sits on the water and takes off again (./fauna/logic.ts `dive`); three more
 *    stand by the fish stall of the market, waiting for scraps;
 *  - Belcher's gulls circling over the market beach and standing on the sand by the boats;
 *  - the guano island offshore, white with the colony of guanay cormorants standing on it, and long lines of
 *    guanays flying low over the sea further out.
 *
 * Passport (bonus): `costa:fauna:pelicano` within PELICAN_R of a pelican, `costa:fauna:gaviota` within GULL_R of
 * a gull, `costa:fauna:guanay` within GUANO_R of the island's centre. Field guide: ../wildlife.ts.
 * Reduced motion: the birds hold still in the air (no flight paths, no dive); the colony stays.
 * The birds are the shared animals (../../characters/animals: continuous skinned bodies with feathered wings),
 * one flock per species; this module moves them and the flight state machine poses them from the motion
 * (soaring, gliding, flapping, taking off from the water, swimming, perching and preening).
 * The shared animals' night rim (characters/animals/night.ts) is set here once per frame for the whole coast.
 * Draw calls: pelicans, gulls and guanays (one instanced mesh per LOD in use each) and the splash.
 */
import * as THREE from "three";
import { CATALOG } from "../../../lib/passport";
import { prefetchAnimals } from "../../characters/animals/assets";
import { createHerd } from "../../characters/animals/crowd";
import { setAnimalNight } from "../../characters/animals/night";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { emit } from "../../events";
import { vertexToon } from "../../merge-colors";
import { paintStrength } from "../../style-gl";
import type { SuyuEnv } from "../../suyu/contract";
import type { CostaLayout } from "../layout";
import { BEACHES, STATION } from "../plan";
import { seaHeight } from "../scenery/waves";
import { circle, dive, nightAmount, prng, seen } from "./fauna/logic";
import { splash } from "./fauna/models";
import { toWorld } from "./huacas/logic";
import { STALLS } from "./huacas/market";

const PELICAN_R = 35;
const GULL_R = 30;
const GUANO_R = 190;
const FILE = 6;
/** LOD distance multiplier for the guanays (the colony and the lines are 100–300 u offshore). */
const GUANAY_LOD = 2.5;

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const L = env.suyu.layout as CostaLayout;
  const rm = env.reducedMotion;
  const R = prng(0xa7e5);
  const root = new THREE.Group();
  root.name = "costa-aves";
  env.scene.add(root);
  const dummy = new THREE.Object3D();
  const sea = (x: number, z: number, t: number) => seaHeight(x, z, L.shoreX(z) - x, t);
  prefetchAnimals(["pelican", "gull", "guanay"]);
  /** A flock of one species (one instanced mesh per LOD), in the scene under this ambient's group. */
  const flock = (key: string, max: number, lodScale = 1) => {
    const h = createHerd(key, { max: Math.max(1, max), lodScale });
    h.group.name = `costa-aves:${key}`;
    root.add(h.group);
    return h;
  };
  /**
   * Climb rate of a flying bird from its last height (the flight state machine reads takeoff, glide and soar
   * from it): `last` holds one height per bird of a flock (NaN before its first frame).
   */
  const vyOf = (last: Float32Array, i: number, y: number, dt: number) => {
    const prev = last[i] as number;
    last[i] = y;
    return Number.isNaN(prev) || dt <= 0 ? 0 : (y - prev) / dt;
  };
  const heights = (n: number) => new Float32Array(Math.max(1, n)).fill(Number.NaN);

  // ------------------------------------------------------------------ pelicans in files
  const files = [
    { zc: 150, A: 150, sc: 46, B: 22, w: 0.045, ph: 0 },
    { zc: -150, A: 120, sc: 40, B: 18, w: 0.05, ph: 2.4 },
  ];
  // Pelicans by the fish stall.
  const mpose = env.stationPose(STATION.market);
  const mf = { x: mpose.position.x, z: mpose.position.z, y: 0, yaw: mpose.yaw };
  const fishStall = STALLS[0] as (typeof STALLS)[number];
  const standers = [
    [-1.6, 3.4, 0.4],
    [-2.6, 2.2, 1.2],
    [-0.4, 4.4, -0.6],
  ].map(([dx, dz, yaw]) => {
    const p = toWorld(mf, fishStall.x + (dx as number), fishStall.z + (dz as number));
    return { x: p.x, z: p.z, yaw: mf.yaw + fishStall.yaw + (yaw as number) };
  });
  const pelicans = flock("pelican", files.length * FILE + 1 + standers.length);
  const fileIds = Array.from({ length: files.length * FILE }, (_, i) => pelicans.add({ seed: 5 + i * 3 }));
  const diverId = pelicans.add({ seed: 77 });
  const standIds = standers.map((s, i) => {
    env.addCollider({ kind: "circle", x: s.x, z: s.z, r: 0.35 });
    return pelicans.add({ seed: 101 + i * 7 });
  });
  const pelicanPts: Array<{ x: number; z: number }> = [];
  const pelicanY = heights(fileIds.length + 1);
  // The diver off the Huanchaco beach.
  const sb = L.beachPoint(BEACHES.south);
  const diver = { x: sb.x - 34, z: sb.z + 12 };
  const splashGeo = splash();
  const splashMat = paintStrength(vertexToon(), 0);
  const splashMesh = new THREE.InstancedMesh(splashGeo, splashMat, 1);
  splashMesh.name = "costa-aves:splash";
  splashMesh.frustumCulled = false;
  splashMesh.visible = false;
  env.noOutline(splashMesh);
  root.add(splashMesh);

  // ------------------------------------------------------------------ gulls
  const gulls = Array.from({ length: env.quality === "high" ? 8 : 5 }, (_, i) => ({
    cx: sb.x - 6 + (R() - 0.5) * 16,
    cz: sb.z + (R() - 0.5) * 30,
    r: 6 + R() * 9,
    w: (0.25 + R() * 0.2) * (i % 2 ? 1 : -1),
    h: 7 + R() * 6,
    ph: R() * 6,
  }));
  // Bodies for the soundscape's calls (not solid: they are in the air).
  const gullBodies = gulls.map((g) => creatures.add("gaviota", 0.3, { solid: false, x: g.cx, z: g.cz }));
  const sitters = Array.from({ length: 5 }, () => {
    const x = sb.x - 1 - R() * 4;
    const z = sb.z + (R() - 0.5) * 22;
    return { x, z, yaw: R() * 6.28 };
  });
  const gullHerd = flock("gull", gulls.length + sitters.length);
  const gullIds = gulls.map((_, i) => gullHerd.add({ seed: 3 + i * 5 }));
  const sitIds = sitters.map((_, i) => gullHerd.add({ seed: 51 + i * 5 }));
  const gullY = heights(gulls.length);

  // ------------------------------------------------------------------ the guano island colony
  const isle = L.islets.find((i) => i.id === "guano");
  const colony: Array<{ x: number; y: number; z: number; yaw: number }> = [];
  if (isle) {
    const n = env.quality === "high" ? 110 : 70;
    for (let k = 0; k < n * 30 && colony.length < n; k++) {
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * isle.r * 0.85;
      const x = isle.x + Math.cos(a) * r;
      const z = isle.z + Math.sin(a) * r;
      const y = L.heightAt(x, z);
      if (y < 4) continue;
      colony.push({ x, y, z, yaw: R() * 6.28 });
    }
  }
  // Lines of guanays far out, flying north (a long ribbon, wrapping where nobody sees it).
  const LINES = 2;
  const PER = 16;
  // The island and the lines are far offshore: the guanays keep their detail (and stay drawn) further out.
  const guanays = flock("guanay", colony.length + (isle ? LINES * PER : 0), GUANAY_LOD);
  const colonyIds = colony.map((_, i) => guanays.add({ seed: 7 + i * 13 }));
  const lineIds = isle ? Array.from({ length: LINES * PER }, (_, i) => guanays.add({ seed: 501 + i * 3 })) : [];
  const lineY = heights(lineIds.length);

  // ------------------------------------------------------------------ stamps
  const stamp = (id: string) => {
    const e = CATALOG.find((c) => c.id === id);
    if (e) emit("world:stamp", { id: e.id, kind: e.kind, label: e.label });
  };
  const done = new Set<string>();
  let check = 0;
  const gullPts: Array<{ x: number; z: number }> = [...sitters];
  let first = true;

  return {
    update(dtIn, avatar, t) {
      const dt = Math.min(dtIn, 0.05);
      const tt = rm ? 0 : t;
      // The shared animals' moonlit rim (one uniform for every animal of the coast, set once per frame here).
      setAnimalNight(nightAmount(env.sky.time()));
      // Pelican files on their long loops, low over the swell.
      pelicanPts.length = 0;
      let k = 0;
      for (const f of files) {
        for (let i = 0; i < FILE; i++) {
          const th = f.ph + tt * f.w - i * 0.022;
          const z = f.zc + Math.cos(th) * f.A;
          const s = f.sc + Math.sin(th) * f.B;
          const x = L.shoreX(z) - s;
          const sy = sea(x, z, tt);
          const y = 2.2 + Math.sin(tt * 0.9 + f.ph) * 0.6 + sy * 0.5;
          // Direction of travel: d/dθ.
          const dz = -Math.sin(th) * f.A;
          const ds = Math.cos(th) * f.B;
          const yaw = Math.atan2(-ds, dz);
          const id = fileIds[k] as number;
          pelicans.set(id, x, y, z, yaw, {
            speed: rm ? 0 : Math.hypot(dz, ds) * f.w,
            rm,
            grounded: false,
            vy: vyOf(pelicanY, k++, y, dt),
            height: y - sy,
          });
          pelicanPts.push({ x, z });
        }
      }
      // The diver: glide high, plunge (wings folded back), sit on the water, take off again.
      const dv = rm ? { phase: "glide" as const, y: 9, u: 0 } : dive(tt);
      const a = tt * 0.25;
      const dx = diver.x + Math.cos(a) * (dv.phase === "glide" ? 8 : 0);
      const dz = diver.z + Math.sin(a) * (dv.phase === "glide" ? 8 : 0);
      const seaY = sea(dx, dz, tt);
      const dy = seaY + dv.y;
      pelicans.set(
        diverId,
        dx,
        dv.phase === "float" ? seaY - 0.05 : dy,
        dz,
        a + Math.PI / 2,
        {
          speed: dv.phase === "glide" && !rm ? 2 : dv.phase === "float" ? 0 : 3,
          rm,
          grounded: false,
          water: dv.phase === "float",
          // The flight state machine has no plunge: the folded "dive" pose (wings swept back), pitched nose down.
          under: dv.phase === "plunge",
          vy: vyOf(pelicanY, fileIds.length, dy, dt),
          height: dv.y,
        },
        { pitch: dv.phase === "plunge" ? 1.3 : dv.phase === "rise" ? -0.3 * (1 - dv.u) : 0 },
      );
      pelicanPts.push({ x: dx, z: dz });
      const splashing = dv.phase === "float" && dv.u < 0.25;
      splashMesh.visible = splashing;
      if (splashing) {
        dummy.position.set(dx, seaY - 0.1, dz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1.6 * (1 - dv.u * 3));
        dummy.updateMatrix();
        splashMesh.setMatrixAt(0, dummy.matrix);
        splashMesh.instanceMatrix.needsUpdate = true;
      }
      // The three by the fish stall, waiting for scraps.
      standers.forEach((s, i) => {
        pelicans.set(standIds[i] as number, s.x, L.groundAt(s.x, s.z), s.z, s.yaw, { speed: 0, rm, grounded: true });
        pelicanPts.push(s);
      });
      pelicans.update(dt, t, env.camera);
      // Gulls circling over the beach, and standing on the sand by the boats.
      gullPts.length = sitters.length;
      gulls.forEach((g, i) => {
        const c = circle(tt, g.r, g.w, g.ph);
        const x = g.cx + c.x;
        const z = g.cz + c.z;
        const y = g.h + Math.sin(tt * 1.1 + i) * 0.5;
        const id = gullIds[i] as number;
        gullHerd.set(id, x, y, z, c.yaw, {
          speed: rm ? 0 : Math.abs(g.r * g.w),
          rm,
          grounded: false,
          vy: vyOf(gullY, i, y, dt),
          height: y,
          turn: rm ? 0 : g.w,
        });
        gullPts.push({ x, z });
        const body = gullBodies[i];
        if (body) {
          body.x = x;
          body.z = z;
        }
      });
      sitters.forEach((s, i) => {
        gullHerd.set(sitIds[i] as number, s.x, Math.max(0.1, L.heightAt(s.x, s.z)), s.z, s.yaw, {
          speed: 0,
          rm,
          grounded: true,
        });
      });
      gullHerd.update(dt, t, env.camera);
      // The colony standing on the guano island; lines of guanays far out.
      if (isle) {
        if (first)
          colony.forEach((c, i) => {
            guanays.set(colonyIds[i] as number, c.x, c.y - 0.05, c.z, c.yaw, {
              speed: 0,
              rm,
              grounded: true,
              // One in eight holds its wings open to dry in the sun, as cormorants do.
              spread: i % 8 === 0 ? 1 : 0,
            });
          });
        let j = 0;
        for (let l = 0; l < LINES; l++) {
          for (let i = 0; i < PER; i++) {
            const span = 900;
            const z = ((((-tt * 9 - i * 2.4 - l * 330) % span) + span) % span) - span / 2;
            const s = 230 + l * 60 + Math.sin(i * 0.7 + l) * 2;
            const x = L.shoreX(Math.max(L.bounds.z0, Math.min(L.bounds.z1, z))) - s;
            const y = 1.6 + Math.sin(tt * 2 + i) * 0.15;
            const id = lineIds[j] as number;
            guanays.set(id, x, y, z, Math.PI, {
              speed: rm ? 0 : 9,
              rm,
              grounded: false,
              vy: vyOf(lineY, j++, y, dt),
              height: y,
            });
          }
        }
        guanays.update(dt, t, env.camera);
      }
      first = false;

      check += dt;
      if (check > 0.3) {
        check = 0;
        if (!done.has("pelicano") && seen(pelicanPts, avatar.x, avatar.z, PELICAN_R)) {
          done.add("pelicano");
          stamp("costa:fauna:pelicano");
        }
        if (!done.has("gaviota") && seen(gullPts, avatar.x, avatar.z, GULL_R)) {
          done.add("gaviota");
          stamp("costa:fauna:gaviota");
        }
        if (!done.has("guanay") && isle && Math.hypot(avatar.x - isle.x, avatar.z - isle.z) < GUANO_R) {
          done.add("guanay");
          stamp("costa:fauna:guanay");
        }
      }
    },
    dispose() {
      for (const b of gullBodies) creatures.remove(b);
      for (const h of [pelicans, gullHerd, guanays]) h.dispose();
      root.removeFromParent();
      splashGeo.dispose();
      splashMat.dispose();
    },
  };
};
