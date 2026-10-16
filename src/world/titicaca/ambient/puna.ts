/**
 * More altiplano life along the Collasuyu road (field guide: ../wildlife.ts; places: ../plan.ts):
 *  - A flock of sheep grazing on the puna south of the road, the shepherd's dog running round it now one way,
 *    now the other, stopping to sit and watch (the shepherdess spinning by them is a person of ./gente.ts).
 *    At night the sheep and the dog lie down where they are.
 *  - Andean geese (huallatas) grazing the shore meadow between the road and the water, in a loose group.
 *  - Puna ibises walking the wet grass by the water, probing it with their long curved bills.
 *  - Puna teals paddling in the reeds either side of the Uros boardwalk, now and then tipping up to feed.
 *  - Trout leaping now and then out of open water off the Uros islands and the Taquile pier (a splash ring
 *    where they fall back), when the traveler is within sight.
 *  - Guinea pigs (cuyes) scurrying about a low stone pen on Taquile's plaza.
 * By day; at night the birds rest (the geese sit, the ibises and teals stand still), the cuyes huddle and no
 * trout jumps. With prefers-reduced-motion the gaits are smaller and the trout jump less often. These animals
 * earn no passport stamp. They keep off the road (they live on open ground, on the water or in their pen), so
 * they need no bodies in the creatures registry. Groups far from the camera are neither updated nor drawn.
 * Draw calls: geese 2, ibises 2, teals 1, sheep 3, dog 3, cuyes 1 + their pen 1, trout 1 + splash rings 1.
 * Pure rules: ./fauna/logic.ts; models: ./fauna/puna-models.ts.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import type { TiticacaLayout } from "../layout";
import { CUY_PEN, DUCKS, GEESE, IBIS, LEVEL, SHEEP, TROUT } from "../plan";
import { reedFree } from "../scenery/placement";
import { damp, daylight, orbitPoint, rng, TAU, troutArc, turnToward, wanderTarget } from "./fauna/logic";
import {
  cuyGeometry,
  dogBodyGeometry,
  dogHeadGeometry,
  dogLegGeometry,
  gooseBodyGeometry,
  gooseNeckGeometry,
  ibisBodyGeometry,
  ibisNeckGeometry,
  sheepBodyGeometry,
  sheepHeadGeometry,
  sheepLegGeometry,
  tealGeometry,
  troutGeometry,
} from "./fauna/puna-models";
import { Build } from "./kit/build";

/** Groups farther than this from the camera are skipped. */
const FAR = 190;
const SHEEP_COATS = ["#ffffff", "#f1e8d6", "#ffffff", "#9b7a5c", "#ffffff", "#e8dcc6", "#4a403a", "#ffffff", "#f1e8d6"];
const CUY_COATS = ["#ffffff", "#e9c7a0", "#c7865a", "#ffffff", "#8a5a3a", "#f3e2c8"];

interface Walker {
  x: number;
  z: number;
  yaw: number;
  tx: number;
  tz: number;
  pause: number;
  phase: number;
  walk: number;
  /** Head pitch target state 0 (up) … 1 (down: grazing, probing). */
  graze: number;
  seed: number;
}

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const L = env.suyu.layout as TiticacaLayout;
  const R = rng(0x9a0a);
  const high = env.quality === "high";
  const rmo = env.reducedMotion;
  const mat = vertexToon();
  const group = new THREE.Group();
  group.name = "titicaca-puna";
  const geos: THREE.BufferGeometry[] = [];
  const meshes: THREE.InstancedMesh[] = [];
  const inst = (geo: THREE.BufferGeometry, n: number, name: string, shadow = true, m: THREE.Material = mat) => {
    geos.push(geo);
    const mesh = new THREE.InstancedMesh(geo, m, Math.max(1, n));
    mesh.name = `titicaca-puna:${name}`;
    mesh.frustumCulled = false;
    mesh.castShadow = shadow;
    meshes.push(mesh);
    group.add(mesh);
    return mesh;
  };
  const tint = (mesh: THREE.InstancedMesh, coats: readonly string[], per = 1) => {
    const c = new THREE.Color();
    for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, c.set(coats[Math.floor(i / per) % coats.length] as string));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  // ------------------------------------------------------------------ places
  const shore = (x: number, z: number) => L.isGround(x, z) && L.landField(x, z) < 8;
  const wet = (x: number, z: number) => L.isGround(x, z) && L.landField(x, z) < 6;
  const puna = (x: number, z: number) => L.isGround(x, z) && !creatures.inKeepOut(x, z, 0.6);
  const reeds = (x: number, z: number) =>
    L.isWater(x, z) && LEVEL - L.heightAt(x, z) > 0.25 && L.landField(x, z) > -14 && reedFree(x, z);
  const deep = (x: number, z: number) => L.isWater(x, z) && L.landField(x, z) < -3 && reedFree(x, z);

  const flock = (home: { x: number; z: number; r: number }, n: number, ok: (x: number, z: number) => boolean) =>
    Array.from({ length: n }, (_, i): Walker => {
      const p = wanderTarget(home, R, ok);
      return {
        x: p.x,
        z: p.z,
        yaw: R() * TAU,
        tx: p.x,
        tz: p.z,
        pause: R() * 5,
        phase: R() * TAU,
        walk: 0,
        graze: R(),
        seed: i,
      };
    });

  /** Wander inside `home` (ok-checked): pause, pick a near target, walk there at `speed`. */
  const wander = (
    w: Walker,
    home: { x: number; z: number; r: number },
    ok: (x: number, z: number) => boolean,
    speed: number,
    step: number,
    dt: number,
  ) => {
    w.pause -= dt;
    if (w.pause <= 0 && Math.hypot(w.tx - w.x, w.tz - w.z) < 0.2) {
      const t = wanderTarget(
        { x: w.x, z: w.z, r: step },
        R,
        (x, z) => ok(x, z) && Math.hypot(x - home.x, z - home.z) < home.r,
      );
      w.tx = t.x;
      w.tz = t.z;
      w.pause = 2 + R() * 7;
    }
    const d = Math.hypot(w.tx - w.x, w.tz - w.z);
    const moving = d > 0.2 && w.pause <= 0;
    if (moving) {
      w.yaw = turnToward(w.yaw, Math.atan2(w.tx - w.x, w.tz - w.z), dt * 2.5);
      const nx = w.x + Math.sin(w.yaw) * speed * dt;
      const nz = w.z + Math.cos(w.yaw) * speed * dt;
      if (ok(nx, nz)) {
        w.x = nx;
        w.z = nz;
      } else {
        w.tx = w.x;
        w.tz = w.z;
      }
    }
    w.walk = damp(w.walk, moving ? 1 : 0, 5, dt);
    w.phase += dt * speed * 6 * w.walk * (rmo ? 0.5 : 1);
    return moving;
  };

  // ------------------------------------------------------------------ meshes
  const geese = flock(GEESE, high ? 6 : 4, shore);
  const gBody = inst(gooseBodyGeometry(), geese.length, "goose");
  const gNeck = inst(gooseNeckGeometry(), geese.length, "goose-neck");
  const ibises = flock(IBIS, high ? 6 : 4, wet);
  const iBody = inst(ibisBodyGeometry(), ibises.length, "ibis");
  const iNeck = inst(ibisNeckGeometry(), ibises.length, "ibis-neck");
  const perDuck = high ? 5 : 3;
  const teals = DUCKS.flatMap((home, k) => flock(home, perDuck, reeds).map((w) => ({ w, home, k })));
  const tMesh = inst(tealGeometry(), teals.length, "teal", false);
  const sheep = flock(SHEEP, high ? 9 : 6, puna);
  const sBody = inst(sheepBodyGeometry(), sheep.length, "sheep");
  const sHead = inst(sheepHeadGeometry(), sheep.length, "sheep-head");
  const sLeg = inst(sheepLegGeometry(), sheep.length * 4, "sheep-leg", false);
  tint(sBody, SHEEP_COATS);
  tint(sHead, SHEEP_COATS);
  tint(sLeg, SHEEP_COATS, 4);
  const dBody = inst(dogBodyGeometry(), 1, "dog");
  const dHead = inst(dogHeadGeometry(), 1, "dog-head");
  const dLeg = inst(dogLegGeometry(), 4, "dog-leg", false);
  const nCuy = high ? 6 : 4;
  const cuyes = flock({ x: CUY_PEN.x, z: CUY_PEN.z, r: CUY_PEN.r - 0.25 }, nCuy, () => true);
  const cMesh = inst(cuyGeometry(), nCuy, "cuy", false);
  tint(cMesh, CUY_COATS);
  const fish = inst(troutGeometry(), TROUT.length, "trout", false);
  const ringMat = new THREE.MeshBasicMaterial({
    color: "#f4f8fb",
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const rings = inst(new THREE.RingGeometry(0.82, 1, 24).rotateX(-Math.PI / 2), TROUT.length, "splash", false, ringMat);
  env.noOutline(rings);
  env.noOutline(fish);

  // The cuy pen: a low ring of fieldstones with a little alfalfa strewn inside.
  const pb = new Build();
  const py = env.suyu.groundAt(CUY_PEN.x, CUY_PEN.z);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const x = CUY_PEN.x + Math.cos(a) * (CUY_PEN.r + 0.12);
    const z = CUY_PEN.z + Math.sin(a) * (CUY_PEN.r + 0.12);
    pb.box(
      0.5,
      0.32 + (i % 3) * 0.05,
      0.26,
      x,
      env.suyu.groundAt(x, z) - 0.05,
      z,
      ["#9b8f7e", "#a89d8a", "#8d8272"][i % 3] as string,
      a + Math.PI / 2,
    );
  }
  for (let i = 0; i < 6; i++)
    pb.sph(
      0.12,
      0.03,
      0.08,
      CUY_PEN.x + Math.cos(i * 2.1) * 0.5,
      py + 0.01,
      CUY_PEN.z + Math.sin(i * 2.1) * 0.5,
      "#6f9a45",
      0,
    );
  const penGeo = pb.build();
  if (penGeo) {
    geos.push(penGeo);
    const pen = new THREE.Mesh(penGeo, mat);
    pen.name = "titicaca-puna:pen";
    pen.castShadow = true;
    group.add(pen);
  }
  env.addCollider({ kind: "circle", x: CUY_PEN.x, z: CUY_PEN.z, r: CUY_PEN.r + 0.3 });
  env.scene.add(group);

  // ------------------------------------------------------------------ pose helpers
  const m4 = new THREE.Matrix4();
  const root = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const vp = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const rs = new THREE.Vector3();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const setRoot = (x: number, y: number, z: number, yaw: number, pitch = 0, roll = 0) =>
    root.compose(vp.set(x, y, z), q.setFromEuler(e.set(pitch, yaw, roll, "YXZ")), one);
  /** root × translate(pivot) × rotX(pitch) into mesh[i]. */
  const pivot = (mesh: THREE.InstancedMesh, i: number, px: number, py: number, pz: number, pitch: number) => {
    tmp.makeRotationX(pitch);
    m4.makeTranslation(px, py, pz).multiply(tmp);
    mesh.setMatrixAt(i, out.copy(root).multiply(m4));
  };
  const SHEEP_HIPS: Array<[number, number]> = [
    [0.12, 0.24],
    [-0.12, 0.24],
    [0.12, -0.26],
    [-0.12, -0.26],
  ];
  const DOG_HIPS: Array<[number, number]> = [
    [0.07, 0.18],
    [-0.07, 0.18],
    [0.07, -0.18],
    [-0.07, -0.18],
  ];
  const legs = (
    mesh: THREE.InstancedMesh,
    i: number,
    hips: Array<[number, number]>,
    hy: number,
    w: Walker,
    lie: number,
  ) =>
    hips.forEach(([hx, hz], k) => {
      const diag = k === 0 || k === 3 ? 1 : -1;
      const swing = lie > 0.5 ? -1.45 : Math.sin(w.phase) * 0.55 * w.walk * diag * (rmo ? 0.5 : 1);
      pivot(mesh, i * 4 + k, hx, hy, hz, swing);
    });

  // Dog and trout state.
  const dog = {
    x: SHEEP.x,
    z: SHEEP.z + SHEEP.r + 2,
    yaw: 0,
    a: Math.PI / 2,
    dir: 1 as 1 | -1,
    sit: 0,
    timer: 6,
    phase: 0,
    walk: 0,
  };
  const jumps = TROUT.map(() => ({ timer: 3 + R() * 8, u: -1, x: 0, z: 0, yaw: 0, ring: -1, rx: 0, rz: 0 }));
  const camPos = new THREE.Vector3();
  let clock = 0;
  const far = (x: number, z: number) => Math.hypot(x - camPos.x, z - camPos.z) > FAR;

  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      env.camera.getWorldPosition(camPos);
      const day = daylight(env.sky.time()) > 0.3;

      // ----- geese
      const gFar = far(GEESE.x, GEESE.z);
      gBody.visible = gNeck.visible = !gFar;
      if (!gFar) {
        geese.forEach((w, i) => {
          const moving = day && wander(w, GEESE, shore, 0.45, 3, dt);
          w.graze = damp(w.graze, day && !moving ? 1 : 0, 1.5, dt);
          const sit = day ? 0 : 0.2;
          const bob = moving && !rmo ? Math.abs(Math.sin(w.phase)) * 0.02 : 0;
          setRoot(w.x, L.heightAt(w.x, w.z) - sit + bob, w.z, w.yaw, 0, moving && !rmo ? Math.sin(w.phase) * 0.06 : 0);
          gBody.setMatrixAt(i, root);
          const nod = rmo ? 0 : Math.sin(clock * 3 + i) * 0.08 * w.graze;
          pivot(gNeck, i, 0, 0.45, 0.2, day ? w.graze * 1.25 + nod : -0.25);
        });
        gBody.instanceMatrix.needsUpdate = true;
        gNeck.instanceMatrix.needsUpdate = true;
      }

      // ----- ibises: slow steps and quick probes into the wet grass
      const iFar = far(IBIS.x, IBIS.z);
      iBody.visible = iNeck.visible = !iFar;
      if (!iFar) {
        ibises.forEach((w, i) => {
          const moving = day && wander(w, IBIS, wet, 0.35, 2, dt);
          w.graze = damp(w.graze, day ? 1 : 0, 2, dt);
          setRoot(w.x, L.heightAt(w.x, w.z), w.z, w.yaw);
          iBody.setMatrixAt(i, root);
          const probe = rmo ? 0.2 : Math.max(0, Math.sin(clock * 2.6 + i * 1.9)) * 0.45;
          pivot(iNeck, i, 0, 0.48, 0.18, w.graze * (moving ? 0.9 : 1.15 + probe));
        });
        iBody.instanceMatrix.needsUpdate = true;
        iNeck.instanceMatrix.needsUpdate = true;
      }

      // ----- teals: paddle about the reeds, tip up to feed
      const tFar = DUCKS.every((d) => far(d.x, d.z));
      tMesh.visible = !tFar;
      if (!tFar) {
        teals.forEach(({ w, home }, i) => {
          if (day) wander(w, home, reeds, 0.3, 2.5, dt);
          const tip = day && !rmo ? Math.max(0, Math.sin(clock * 0.45 + i * 2.3) - 0.85) / 0.15 : 0;
          const bob = rmo ? 0 : Math.sin(clock * 1.7 + i) * 0.015;
          setRoot(w.x, LEVEL - 0.01 + bob, w.z, w.yaw, tip * 1.25);
          tMesh.setMatrixAt(i, root);
        });
        tMesh.instanceMatrix.needsUpdate = true;
      }

      // ----- sheep and the dog
      const sFar = far(SHEEP.x, SHEEP.z);
      for (const m of [sBody, sHead, sLeg, dBody, dHead, dLeg]) m.visible = !sFar;
      if (!sFar) {
        let cx = 0;
        let cz = 0;
        sheep.forEach((w, i) => {
          const moving = day && wander(w, SHEEP, puna, 0.55, 3.5, dt);
          w.graze = damp(w.graze, day && !moving ? 1 : 0.15, 1.5, dt);
          const lie = day ? 0 : 1;
          const bob = moving && !rmo ? Math.abs(Math.sin(w.phase)) * 0.025 : 0;
          setRoot(w.x, L.heightAt(w.x, w.z) - lie * 0.32 + bob, w.z, w.yaw);
          sBody.setMatrixAt(i, root);
          const chew = rmo ? 0 : Math.sin(clock * 4 + i) * 0.05 * w.graze;
          pivot(sHead, i, 0, 0.68, 0.36, lie ? 0.1 : w.graze * 1.0 - 0.15 + chew);
          legs(sLeg, i, SHEEP_HIPS, 0.44, w, lie);
          cx += w.x;
          cz += w.z;
        });
        cx /= sheep.length;
        cz /= sheep.length;
        // The dog: round the flock, now and then sitting to watch it, turning back at the odd moment.
        const spread = sheep.reduce((m, w) => Math.max(m, Math.hypot(w.x - cx, w.z - cz)), 0);
        let speed = 0;
        if (day) {
          dog.timer -= dt;
          if (dog.timer <= 0) {
            if (dog.sit > 0.5 || R() < 0.5) {
              dog.sit = dog.sit > 0.5 ? 0 : 1;
              dog.timer = dog.sit ? 3 + R() * 4 : 6 + R() * 8;
              if (!dog.sit && R() < 0.4) dog.dir = dog.dir === 1 ? -1 : 1;
            } else dog.timer = 4 + R() * 4;
          }
          if (dog.sit < 0.5) {
            dog.a += (dog.dir * 1.9 * dt) / Math.max(4, spread + 3);
            const t = orbitPoint(cx, cz, spread + 3, dog.a, dog.dir);
            if (!puna(t.x, t.z)) dog.dir = dog.dir === 1 ? -1 : 1;
            const d = Math.hypot(t.x - dog.x, t.z - dog.z);
            speed = Math.min(2.6, d * 2);
            if (d > 0.05) {
              dog.yaw = turnToward(dog.yaw, Math.atan2(t.x - dog.x, t.z - dog.z), dt * 6);
              const k = Math.min(1, (speed * dt) / d);
              dog.x += (t.x - dog.x) * k;
              dog.z += (t.z - dog.z) * k;
            }
          } else dog.yaw = turnToward(dog.yaw, Math.atan2(cx - dog.x, cz - dog.z), dt * 3);
        }
        dog.walk = damp(dog.walk, speed > 0.3 ? 1 : 0, 6, dt);
        dog.phase += dt * speed * 5 * (rmo ? 0.5 : 1);
        const down = day ? dog.sit * 0.12 : 0.24;
        setRoot(dog.x, L.heightAt(dog.x, dog.z) - down, dog.z, dog.yaw, day ? -dog.sit * 0.35 : 0);
        dBody.setMatrixAt(0, root);
        pivot(dHead, 0, 0, 0.52, 0.28, day ? -0.1 + dog.sit * 0.3 : 0.5);
        legs(dLeg, 0, DOG_HIPS, 0.36, { phase: dog.phase, walk: dog.walk } as Walker, day ? 0 : 1);
        for (const m of [sBody, sHead, sLeg, dBody, dHead, dLeg]) m.instanceMatrix.needsUpdate = true;
      }

      // ----- cuyes
      const cFar = far(CUY_PEN.x, CUY_PEN.z);
      cMesh.visible = !cFar;
      if (!cFar) {
        const home = { x: CUY_PEN.x, z: CUY_PEN.z, r: CUY_PEN.r - 0.25 };
        cuyes.forEach((w, i) => {
          if (day) {
            w.pause = Math.min(w.pause, 3);
            wander(w, home, () => true, rmo ? 0.4 : 1.1, 0.8, dt);
          } else {
            // Huddled together at the centre.
            const a = (i / cuyes.length) * TAU;
            w.x = damp(w.x, home.x + Math.cos(a) * 0.22, 1, dt);
            w.z = damp(w.z, home.z + Math.sin(a) * 0.22, 1, dt);
          }
          const nib = day && !rmo && w.walk < 0.2 ? Math.abs(Math.sin(clock * 9 + i)) * 0.012 : 0;
          setRoot(w.x, py + nib, w.z, w.yaw);
          cMesh.setMatrixAt(i, root);
        });
        cMesh.instanceMatrix.needsUpdate = true;
      }

      // ----- trout
      jumps.forEach((j, i) => {
        const s = TROUT[i] as (typeof TROUT)[number];
        const near = Math.hypot(avatar.x - s.x, avatar.z - s.z) < 110;
        if (j.u < 0) {
          j.timer -= dt;
          if (j.timer <= 0 && day && near) {
            const p = wanderTarget(s, R, deep);
            j.u = 0;
            j.x = p.x;
            j.z = p.z;
            j.yaw = R() * TAU;
          }
          if (j.timer <= 0 && j.u < 0) j.timer = 2 + R() * 4;
          fish.setMatrixAt(i, ZERO);
        } else {
          j.u += dt / 0.9;
          const a = troutArc(j.u);
          const x = j.x + Math.sin(j.yaw) * a.along;
          const z = j.z + Math.cos(j.yaw) * a.along;
          setRoot(x, LEVEL + a.y, z, j.yaw, -a.pitch);
          fish.setMatrixAt(i, a.y > -0.2 ? root : ZERO);
          if (j.u >= 1) {
            j.u = -1;
            j.timer = (rmo ? 18 : 6) + R() * 10;
            j.ring = 0;
            j.rx = x;
            j.rz = z;
          }
        }
        if (j.ring >= 0) {
          j.ring += dt / 1.3;
          const r = 0.25 + j.ring * 1.1;
          rings.setMatrixAt(i, root.compose(vp.set(j.rx, LEVEL + 0.03, j.rz), q.identity(), rs.set(r, 1, r)));
          if (j.ring >= 1) j.ring = -1;
        } else rings.setMatrixAt(i, ZERO);
      });
      fish.instanceMatrix.needsUpdate = true;
      rings.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const m of meshes) m.dispose();
      for (const g of geos) g.dispose();
      mat.dispose();
      ringMat.dispose();
      group.removeFromParent();
    },
  };
};
