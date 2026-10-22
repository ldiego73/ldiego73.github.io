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
 * By day; at night the birds rest (asleep on the ground or the water), the cuyes huddle and no trout jumps.
 * With prefers-reduced-motion the gaits are smaller and the trout jump less often. These animals earn no
 * passport stamp. They keep off the road (they live on open ground, on the water or in their pen), so they need
 * no bodies in the creatures registry. Groups far from the camera are neither updated nor drawn.
 * Every animal is the shared animal core's (../../characters/animals: one skinned body each, a herd = one
 * instanced draw per LOD, gaits and idles from the speed this ambient gives them), loaded off the main thread
 * (./fauna/herds.ts); a little size spread per animal through the herd pose's scale. The teals tip up and the
 * trout arc nose first through the pose's pitch. Draw calls: one per herd per LOD in use (geese, ibises, teals,
 * sheep, dog, cuyes, trout), the cuy pen 1, the splash rings 1. Pure rules: ./fauna/logic.ts.
 */
import * as THREE from "three";
import type { Herd } from "../../characters/animals/crowd";
import { bpal } from "../../characters/animals/species/birds";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import type { TiticacaLayout } from "../layout";
import { CUY_PEN, DUCKS, GEESE, IBIS, LEVEL, SHEEP, TROUT } from "../plan";
import { reedFree } from "../scenery/placement";
import { lazyHerds } from "./fauna/herds";
import { damp, daylight, orbitPoint, rng, TAU, troutArc, turnToward, wanderTarget } from "./fauna/logic";
import { Build } from "./kit/build";

/** Groups farther than this from the camera are skipped. */
const FAR = 190;
/** Coats (the core's variants), in turn: mostly white sheep, a few black-faced, brown or black. */
const SHEEP_COATS = ["white", "white", "black-face", "white", "brown", "white", "black", "white", "black-face"];
const CUY_COATS = ["tricolor", "cream", "brown", "piebald"];
/**
 * The core's duck in the puna teal's colours (Spatula puna: barred brown flanks, a black cap over white
 * cheeks, the pale blue bill).
 */
const PUNA_TEAL = bpal({
  back: "#8f7352",
  head: "#f2efe6",
  face: "#1f1d1c",
  bill: "#7fb2df",
  legs: "#5a5048",
  belly: "#a7865f",
  coverts: "#6e5a43",
  flight: "#2a6a5a",
  tail: "#5a4836",
});
/** Teals float this far below the surface line (their feet origin sits under the water). */
const TEAL_SINK = 0.05;

interface Walker {
  x: number;
  z: number;
  yaw: number;
  tx: number;
  tz: number;
  pause: number;
  walk: number;
  /** Seconds to the next grazing / probing / sleeping bout. */
  bout: number;
  /** Size spread (herd pose scale). */
  scale: number;
  id: number;
}

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const L = env.suyu.layout as TiticacaLayout;
  const R = rng(0x9a0a);
  const high = env.quality === "high";
  const rmo = env.reducedMotion;
  const group = new THREE.Group();
  group.name = "titicaca-puna";
  const herds = lazyHerds(group);

  // ------------------------------------------------------------------ places
  const shore = (x: number, z: number) => L.isGround(x, z) && L.landField(x, z) < 8;
  const wet = (x: number, z: number) => L.isGround(x, z) && L.landField(x, z) < 6;
  const puna = (x: number, z: number) => L.isGround(x, z) && !creatures.inKeepOut(x, z, 0.6);
  const reeds = (x: number, z: number) =>
    L.isWater(x, z) && LEVEL - L.heightAt(x, z) > 0.25 && L.landField(x, z) > -14 && reedFree(x, z);
  const deep = (x: number, z: number) => L.isWater(x, z) && L.landField(x, z) < -3 && reedFree(x, z);

  const flock = (
    home: { x: number; z: number; r: number },
    n: number,
    ok: (x: number, z: number) => boolean,
    spread = 0.12,
  ) =>
    Array.from({ length: n }, (): Walker => {
      const p = wanderTarget(home, R, ok);
      return {
        x: p.x,
        z: p.z,
        yaw: R() * TAU,
        tx: p.x,
        tz: p.z,
        pause: R() * 5,
        walk: 0,
        bout: R() * 4,
        scale: 1 - spread / 2 + R() * spread,
        id: -1,
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
    return moving;
  };

  // ------------------------------------------------------------------ the animals
  const geese = flock(GEESE, high ? 6 : 4, shore);
  const ibises = flock(IBIS, high ? 6 : 4, wet);
  const perDuck = high ? 5 : 3;
  const teals = DUCKS.flatMap((home) => flock(home, perDuck, reeds).map((w) => ({ w, home })));
  const sheep = flock(SHEEP, high ? 9 : 6, puna, 0.16);
  const nCuy = high ? 6 : 4;
  const cuyes = flock({ x: CUY_PEN.x, z: CUY_PEN.z, r: CUY_PEN.r - 0.25 }, nCuy, () => true, 0.2);
  const addAll =
    (list: Walker[], coats = 1, seed0 = 1) =>
    (h: Herd) => {
      list.forEach((w, i) => {
        w.id = h.add({ seed: seed0 + i * 7, variant: i % coats });
      });
    };
  herds.herd("goose", { max: geese.length }, addAll(geese));
  herds.herd("ibis", { max: ibises.length }, addAll(ibises, 1, 5));
  herds.herd(
    "duck",
    { max: teals.length, variants: [PUNA_TEAL], shadows: false },
    addAll(
      teals.map((t) => t.w),
      1,
      41,
    ),
  );
  herds.herd("sheep", { max: sheep.length, variants: SHEEP_COATS }, addAll(sheep, SHEEP_COATS.length, 9));
  herds.herd("cuy", { max: nCuy, variants: CUY_COATS, shadows: false }, addAll(cuyes, CUY_COATS.length, 9));
  let dogId = -1;
  herds.herd("dog", { max: 1, variants: ["tan"] }, (h) => {
    dogId = h.add({ seed: 4 });
  });
  const troutIds: number[] = [];
  herds.herd("trout", { max: TROUT.length, shadows: false }, (h) => {
    for (let i = 0; i < TROUT.length; i++) troutIds.push(h.add({ seed: 21 + i }));
  });

  const ringMat = new THREE.MeshBasicMaterial({
    color: "#f4f8fb",
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ringGeo = new THREE.RingGeometry(0.82, 1, 24).rotateX(-Math.PI / 2);
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, TROUT.length);
  rings.name = "titicaca-puna:splash";
  rings.frustumCulled = false;
  group.add(rings);
  env.noOutline(rings);

  // The cuy pen: a low ring of fieldstones with a little alfalfa strewn inside.
  const penMat = vertexToon();
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
    const pen = new THREE.Mesh(penGeo, penMat);
    pen.name = "titicaca-puna:pen";
    pen.castShadow = true;
    group.add(pen);
  }
  env.addCollider({ kind: "circle", x: CUY_PEN.x, z: CUY_PEN.z, r: CUY_PEN.r + 0.3 });
  env.scene.add(group);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const vp = new THREE.Vector3();
  const rs = new THREE.Vector3();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < TROUT.length; i++) rings.setMatrixAt(i, ZERO);

  // Dog and trout state.
  const dog = {
    x: SHEEP.x,
    z: SHEEP.z + SHEEP.r + 2,
    yaw: 0,
    a: Math.PI / 2,
    dir: 1 as 1 | -1,
    sit: 0,
    timer: 6,
    speed: 0,
  };
  const jumps = TROUT.map(() => ({ timer: 3 + R() * 8, u: -1, x: 0, z: 0, yaw: 0, ring: -1, rx: 0, rz: 0 }));
  const camPos = new THREE.Vector3();
  let clock = 0;
  const far = (x: number, z: number) => Math.hypot(x - camPos.x, z - camPos.z) > FAR;

  /** Grazing / probing bouts while standing by day, sleep at night (`bout` is the timer). */
  const bouts = (
    h: Herd,
    w: Walker,
    moving: boolean,
    day: boolean,
    dt: number,
    feed: "graze" | "chew",
    len: number,
  ) => {
    w.bout -= dt;
    if (w.bout > 0 || moving || w.walk > 0.1) return;
    if (day) {
      h.play(w.id, feed, len);
      w.bout = len + 1 + R() * 4;
    } else {
      h.play(w.id, "sleep", 30);
      w.bout = 28;
    }
  };

  const ambient: Ambient = {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      env.camera.getWorldPosition(camPos);
      const day = daylight(env.sky.time()) > 0.3;

      // ----- geese: a few steps, heads down grazing the short grass; asleep on the ground at night
      const gh = herds.get("goose");
      if (gh) {
        const on = !far(GEESE.x, GEESE.z);
        for (const w of geese) {
          if (!on) {
            gh.hide(w.id);
            continue;
          }
          const moving = day && wander(w, GEESE, shore, 0.45, 3, dt);
          bouts(gh, w, moving, day, dt, "graze", 4);
          gh.set(
            w.id,
            w.x,
            L.heightAt(w.x, w.z),
            w.z,
            w.yaw,
            { speed: 0.45 * w.walk, rm: rmo, grounded: true, vy: 0, height: 0, quiet: !day },
            { scale: w.scale },
          );
        }
      }

      // ----- ibises: slow steps and quick probes into the wet grass
      const ih = herds.get("ibis");
      if (ih) {
        const on = !far(IBIS.x, IBIS.z);
        for (const w of ibises) {
          if (!on) {
            ih.hide(w.id);
            continue;
          }
          const moving = day && wander(w, IBIS, wet, 0.35, 2, dt);
          bouts(ih, w, moving, day, dt, "graze", 2.5);
          ih.set(
            w.id,
            w.x,
            L.heightAt(w.x, w.z),
            w.z,
            w.yaw,
            { speed: 0.35 * w.walk, rm: rmo, grounded: true, vy: 0, height: 0, quiet: !day },
            { scale: w.scale },
          );
        }
      }

      // ----- teals: paddle about the reeds, tip up to feed (tail up, head under)
      const th = herds.get("duck");
      if (th) {
        const on = DUCKS.some((d) => !far(d.x, d.z));
        teals.forEach(({ w, home }, i) => {
          if (!on) {
            th.hide(w.id);
            return;
          }
          if (day) wander(w, home, reeds, 0.3, 2.5, dt);
          const tip = day && !rmo ? Math.max(0, Math.sin(clock * 0.45 + i * 2.3) - 0.85) / 0.15 : 0;
          const bob = rmo ? 0 : Math.sin(clock * 1.7 + i) * 0.015;
          th.set(
            w.id,
            w.x,
            LEVEL - TEAL_SINK + bob,
            w.z,
            w.yaw,
            { speed: 0.3 * w.walk, rm: rmo, grounded: false, water: true, vy: 0, height: 0, quiet: !day },
            { scale: w.scale, pitch: tip * 1.2 },
          );
        });
      }

      // ----- sheep and the dog
      const sh = herds.get("sheep");
      const dh = herds.get("dog");
      const sOn = !far(SHEEP.x, SHEEP.z);
      if (sh) {
        let cx = 0;
        let cz = 0;
        for (const w of sheep) {
          if (!sOn) {
            sh.hide(w.id);
            continue;
          }
          const moving = day && wander(w, SHEEP, puna, 0.55, 3.5, dt);
          bouts(sh, w, moving, true, dt, "graze", 5);
          sh.set(
            w.id,
            w.x,
            L.heightAt(w.x, w.z),
            w.z,
            w.yaw,
            { speed: 0.55 * w.walk, rm: rmo, mode: day ? "auto" : "sleep", quiet: !day },
            { scale: w.scale },
          );
          cx += w.x;
          cz += w.z;
        }
        if (sOn && dh && dogId >= 0) {
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
          dog.speed = damp(dog.speed, speed, 6, dt);
          dh.set(dogId, dog.x, L.heightAt(dog.x, dog.z), dog.z, dog.yaw, {
            speed: dog.speed,
            rm: rmo,
            mode: !day ? "sleep" : dog.sit > 0.5 ? "sit" : "auto",
            look: dog.sit > 0.5 ? 0 : undefined,
          });
        } else if (dh && dogId >= 0) dh.hide(dogId);
      }

      // ----- cuyes
      const ch = herds.get("cuy");
      if (ch) {
        const on = !far(CUY_PEN.x, CUY_PEN.z);
        const home = { x: CUY_PEN.x, z: CUY_PEN.z, r: CUY_PEN.r - 0.25 };
        const sp = rmo ? 0.4 : 1.1;
        cuyes.forEach((w, i) => {
          if (!on) {
            ch.hide(w.id);
            return;
          }
          if (day) {
            w.pause = Math.min(w.pause, 3);
            wander(w, home, () => true, sp, 0.8, dt);
          } else {
            // Huddled together at the centre.
            const a = (i / cuyes.length) * TAU;
            w.x = damp(w.x, home.x + Math.cos(a) * 0.22, 1, dt);
            w.z = damp(w.z, home.z + Math.sin(a) * 0.22, 1, dt);
          }
          ch.set(
            w.id,
            w.x,
            py,
            w.z,
            w.yaw,
            { speed: day ? sp * w.walk : 0, rm: rmo, mode: day ? "auto" : "sleep" },
            { scale: w.scale },
          );
        });
      }

      // ----- trout: out of the water nose first, arcing over and back in
      const fh = herds.get("trout");
      jumps.forEach((j, i) => {
        const s = TROUT[i] as (typeof TROUT)[number];
        const id = troutIds[i];
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
          if (fh && id !== undefined) fh.hide(id);
        } else {
          j.u += dt / 0.9;
          const a = troutArc(j.u);
          const x = j.x + Math.sin(j.yaw) * a.along;
          const z = j.z + Math.cos(j.yaw) * a.along;
          if (fh && id !== undefined) {
            if (a.y > -0.2)
              fh.set(id, x, LEVEL + a.y, z, j.yaw, { speed: 1.5, rm: rmo, porpoise: false }, { pitch: -a.pitch });
            else fh.hide(id);
          }
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
          rings.setMatrixAt(i, m4.compose(vp.set(j.rx, LEVEL + 0.03, j.rz), q.identity(), rs.set(r, 1, r)));
          if (j.ring >= 1) j.ring = -1;
        } else rings.setMatrixAt(i, ZERO);
      });
      rings.instanceMatrix.needsUpdate = true;
      herds.update(dt, clock, env.camera);
    },
    dispose() {
      herds.dispose();
      rings.dispose();
      ringGeo.dispose();
      penGeo?.dispose();
      ringMat.dispose();
      penMat.dispose();
      group.removeFromParent();
    },
  };
  if (import.meta.env?.DEV)
    (window as unknown as { __puna?: unknown }).__puna = { drawCalls: () => herds.drawCalls() + 2 };
  return ambient;
};
