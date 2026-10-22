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
 * Draw calls: gliding pelicans, standing pelicans, splash, gliding gulls, standing gulls, the colony, flying
 * guanays (one instanced mesh each); all noOutline-free toon (they are small).
 */
import * as THREE from "three";
import { CATALOG } from "../../../lib/passport";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { emit } from "../../events";
import { vertexToon } from "../../merge-colors";
import { paintStrength } from "../../style-gl";
import type { SuyuEnv } from "../../suyu/contract";
import type { CostaLayout } from "../layout";
import { BEACHES, STATION } from "../plan";
import { seaHeight } from "../scenery/waves";
import { circle, dive, prng, seen } from "./fauna/logic";
import { cormorantFly, cormorantStand, gullGlide, gullStand, pelicanGlide, pelicanStand, splash } from "./fauna/models";
import { toWorld } from "./huacas/logic";
import { STALLS } from "./huacas/market";

const PELICAN_R = 35;
const GULL_R = 30;
const GUANO_R = 190;
const FILE = 6;

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const L = env.suyu.layout as CostaLayout;
  const rm = env.reducedMotion;
  const R = prng(0xa7e5);
  // Birds: no world-space paint sliding over moving bodies.
  const mat = paintStrength(vertexToon(), 0);
  const root = new THREE.Group();
  root.name = "costa-aves";
  env.scene.add(root);
  const dummy = new THREE.Object3D();
  const geos: THREE.BufferGeometry[] = [];
  const inst = (geo: THREE.BufferGeometry, n: number, name: string, shadow = false) => {
    geos.push(geo);
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    m.name = name;
    m.count = n;
    m.frustumCulled = false;
    m.castShadow = shadow;
    root.add(m);
    return m;
  };
  const sea = (x: number, z: number, t: number) => seaHeight(x, z, L.shoreX(z) - x, t);

  // ------------------------------------------------------------------ pelicans in files
  const files = [
    { zc: 150, A: 150, sc: 46, B: 22, w: 0.045, ph: 0 },
    { zc: -150, A: 120, sc: 40, B: 18, w: 0.05, ph: 2.4 },
  ];
  const glideMesh = inst(pelicanGlide(), files.length * FILE + 1, "costa-aves:pelicans");
  const pelicanPts: Array<{ x: number; z: number }> = [];
  // The diver off the Huanchaco beach.
  const sb = L.beachPoint(BEACHES.south);
  const diver = { x: sb.x - 34, z: sb.z + 12 };
  const splashMesh = inst(splash(), 1, "costa-aves:splash");
  splashMesh.visible = false;
  env.noOutline(splashMesh);
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
  const standMesh = inst(pelicanStand(), standers.length, "costa-aves:pelicans-standing", true);
  standers.forEach((s, i) => {
    dummy.position.set(s.x, L.groundAt(s.x, s.z), s.z);
    dummy.rotation.set(0, s.yaw, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    standMesh.setMatrixAt(i, dummy.matrix);
    env.addCollider({ kind: "circle", x: s.x, z: s.z, r: 0.35 });
  });
  standMesh.instanceMatrix.needsUpdate = true;

  // ------------------------------------------------------------------ gulls
  const gulls = Array.from({ length: env.quality === "high" ? 8 : 5 }, (_, i) => ({
    cx: sb.x - 6 + (R() - 0.5) * 16,
    cz: sb.z + (R() - 0.5) * 30,
    r: 6 + R() * 9,
    w: (0.25 + R() * 0.2) * (i % 2 ? 1 : -1),
    h: 7 + R() * 6,
    ph: R() * 6,
  }));
  const gullMesh = inst(gullGlide(), gulls.length, "costa-aves:gulls");
  // Bodies for the soundscape's calls (not solid: they are in the air).
  const gullBodies = gulls.map((g) => creatures.add("gaviota", 0.3, { solid: false, x: g.cx, z: g.cz }));
  const sitters = Array.from({ length: 5 }, () => {
    const x = sb.x - 1 - R() * 4;
    const z = sb.z + (R() - 0.5) * 22;
    return { x, z, yaw: R() * 6.28 };
  });
  const gullSit = inst(gullStand(), sitters.length, "costa-aves:gulls-standing");
  sitters.forEach((s, i) => {
    dummy.position.set(s.x, Math.max(0.1, L.heightAt(s.x, s.z)), s.z);
    dummy.rotation.set(0, s.yaw, 0);
    dummy.scale.setScalar(1.1);
    dummy.updateMatrix();
    gullSit.setMatrixAt(i, dummy.matrix);
  });
  gullSit.instanceMatrix.needsUpdate = true;

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
  const colonyMesh = inst(cormorantStand(), colony.length, "costa-aves:guanay-colony");
  colony.forEach((c, i) => {
    dummy.position.set(c.x, c.y - 0.05, c.z);
    dummy.rotation.set(0, c.yaw, 0);
    dummy.scale.setScalar(1.6);
    dummy.updateMatrix();
    colonyMesh.setMatrixAt(i, dummy.matrix);
  });
  colonyMesh.instanceMatrix.needsUpdate = true;
  // Lines of guanays far out, flying north (a long ribbon, wrapping where nobody sees it).
  const LINES = 2;
  const PER = 16;
  const flyMesh = inst(cormorantFly(), LINES * PER, "costa-aves:guanay-lines");

  // ------------------------------------------------------------------ stamps
  const stamp = (id: string) => {
    const e = CATALOG.find((c) => c.id === id);
    if (e) emit("world:stamp", { id: e.id, kind: e.kind, label: e.label });
  };
  const done = new Set<string>();
  let check = 0;
  const gullPts: Array<{ x: number; z: number }> = [...sitters];

  return {
    update(dtIn, avatar, t) {
      const dt = Math.min(dtIn, 0.05);
      const tt = rm ? 0 : t;
      // Pelican files on their long loops.
      pelicanPts.length = 0;
      let k = 0;
      for (const f of files) {
        for (let i = 0; i < FILE; i++) {
          const th = f.ph + tt * f.w - i * 0.022;
          const z = f.zc + Math.cos(th) * f.A;
          const s = f.sc + Math.sin(th) * f.B;
          const x = L.shoreX(z) - s;
          const y = 2.2 + Math.sin(tt * 0.9 + f.ph) * 0.6 + sea(x, z, tt) * 0.5;
          // Direction of travel: d/dθ.
          const dz = -Math.sin(th) * f.A;
          const ds = Math.cos(th) * f.B;
          const yaw = Math.atan2(-ds, dz);
          dummy.position.set(x, y, z);
          dummy.rotation.set(0, yaw, Math.sin(tt * 0.7 + i) * 0.08);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          glideMesh.setMatrixAt(k++, dummy.matrix);
          pelicanPts.push({ x, z });
        }
      }
      // The diver.
      const dv = rm ? { phase: "glide" as const, y: 9, u: 0 } : dive(tt);
      const a = tt * 0.25;
      const dx = diver.x + Math.cos(a) * (dv.phase === "glide" ? 8 : 0);
      const dz = diver.z + Math.sin(a) * (dv.phase === "glide" ? 8 : 0);
      const floatY = sea(dx, dz, tt) + 0.15;
      dummy.position.set(dx, Math.max(floatY, floatY + dv.y), dz);
      dummy.rotation.set(dv.phase === "plunge" ? 1.3 : dv.phase === "rise" ? -0.3 : 0, a + Math.PI / 2, 0);
      // Wings folded in the plunge (narrower), tucked while floating.
      dummy.scale.set(dv.phase === "plunge" ? 0.35 : dv.phase === "float" ? 0.45 : 1, 1, 1);
      dummy.updateMatrix();
      glideMesh.setMatrixAt(k++, dummy.matrix);
      pelicanPts.push({ x: dx, z: dz });
      glideMesh.instanceMatrix.needsUpdate = true;
      const splashing = dv.phase === "float" && dv.u < 0.25;
      splashMesh.visible = splashing;
      if (splashing) {
        dummy.position.set(dx, floatY - 0.1, dz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1.6 * (1 - dv.u * 3));
        dummy.updateMatrix();
        splashMesh.setMatrixAt(0, dummy.matrix);
        splashMesh.instanceMatrix.needsUpdate = true;
      }
      for (const s of standers) pelicanPts.push(s);
      // Gulls.
      gullPts.length = sitters.length;
      gulls.forEach((g, i) => {
        const c = circle(tt, g.r, g.w, g.ph);
        const x = g.cx + c.x;
        const z = g.cz + c.z;
        dummy.position.set(x, g.h + Math.sin(tt * 1.1 + i) * 0.5, z);
        dummy.rotation.set(0, c.yaw, Math.sign(g.w) * -0.35);
        dummy.scale.setScalar(1.2);
        dummy.updateMatrix();
        gullMesh.setMatrixAt(i, dummy.matrix);
        gullPts.push({ x, z });
        const body = gullBodies[i];
        if (body) {
          body.x = x;
          body.z = z;
        }
      });
      gullMesh.instanceMatrix.needsUpdate = true;
      // Guanay lines far out.
      if (isle) {
        let j = 0;
        for (let l = 0; l < LINES; l++) {
          for (let i = 0; i < PER; i++) {
            const span = 900;
            const z = ((((-tt * 9 - i * 2.4 - l * 330) % span) + span) % span) - span / 2;
            const s = 230 + l * 60 + Math.sin(i * 0.7 + l) * 2;
            const x = L.shoreX(Math.max(L.bounds.z0, Math.min(L.bounds.z1, z))) - s;
            dummy.position.set(x, 1.6 + Math.sin(tt * 2 + i) * 0.15, z);
            dummy.rotation.set(0, Math.PI, 0);
            dummy.scale.setScalar(1.4);
            dummy.updateMatrix();
            flyMesh.setMatrixAt(j++, dummy.matrix);
          }
        }
        flyMesh.instanceMatrix.needsUpdate = true;
      }

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
      root.removeFromParent();
      for (const g of geos) g.dispose();
      mat.dispose();
    },
  };
};
