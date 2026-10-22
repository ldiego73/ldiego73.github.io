/**
 * Life on the shore (field guide: ../wildlife.ts):
 *  - Alpacas and llamas grazing on the puna by the road, each herd in its own patch (../plan.ts HERDS):
 *    they wander a few metres at a time, put their heads down to graze, look up, and step away from a traveler
 *    who walks into the herd. At night they lie down where they are.
 *  - Vizcachas sitting on boulders on Sillustani's hill and Taquile's slopes, looking about; when the traveler
 *    comes near one hops off behind its rock and only comes back some seconds later. By day.
 *  - The giant Titicaca water frog: it lives on the lake bed; in the reeds west of the Taquile pier it comes up
 *    for a few seconds now and then (more often when someone waits nearby), its baggy olive back and bulging
 *    eyes just above the water. Rare.
 * A good look earns the bonus stamps `titicaca:fauna:alpaca`, `…:llama`, `…:vizcacha`, `…:rana`. Animals are
 * solid bodies in the creatures registry. They are the shared animal core's (../../characters/animals: one
 * skinned body per animal, a herd = one instanced draw per LOD, gaits and idles from the speed this ambient
 * gives them), loaded off the main thread (./fauna/herds.ts). Draw calls: one per herd per LOD in use (alpacas,
 * llamas, vizcachas), the vizcachas' rocks 1, the frog 1.
 */
import * as THREE from "three";
import { CATALOG } from "../../../lib/passport";
import type { Animal } from "../../characters/animals/animal";
import type { Herd } from "../../characters/animals/crowd";
import { setAnimalNight } from "../../characters/animals/night";
import type { Ambient, CreateAmbient } from "../../contract";
import { type Body, creatures } from "../../creatures";
import { emit } from "../../events";
import { mergeColored, vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import { FROG_SPOT, HERDS, LEVEL, SILLUSTANI, TAQUILE } from "../plan";
import { lazyHerds } from "./fauna/herds";
import { damp, daylight, frogSurface, LookTimer, rng, TAU, turnToward, wanderTarget, wrapAngle } from "./fauna/logic";

/** Coats (the core's variants), picked in turn: mostly white and fawn alpacas, a few brown, grey and black. */
const ALPACA_COATS = ["white", "fawn", "brown", "white", "black", "grey", "fawn"];
const LLAMA_COATS = ["white", "brown", "black", "cafe", "spotted"];

interface Grazer {
  x: number;
  z: number;
  yaw: number;
  tx: number;
  tz: number;
  pause: number;
  speed: number;
  /** Seconds to the next grazing bout. */
  graze: number;
  /** Size spread (herd pose scale). */
  scale: number;
  body: Body;
  id: number;
}

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const L = env.suyu.layout;
  const R = rng(0x0a11a);
  const high = env.quality === "high";
  const cam = env.camera;
  const ndc = new THREE.Vector3();
  const onScreen = (x: number, y: number, z: number) => {
    ndc.set(x, y, z).project(cam);
    return ndc.z < 1 && Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.9;
  };
  const stamp = (id: string) => {
    const entry = CATALOG.find((c) => c.id === id);
    if (entry) emit("world:stamp", { id: entry.id, kind: entry.kind, label: entry.label });
  };
  const group = new THREE.Group();
  group.name = "titicaca-orilla";

  // ------------------------------------------------------------------ herds
  const ok = (x: number, z: number) => L.isGround(x, z) && !creatures.inKeepOut(x, z, 0.6);
  const herd = (home: { x: number; z: number; r: number }, n: number, kind: string, r: number): Grazer[] =>
    Array.from({ length: n }, () => {
      const p = wanderTarget(home, R, ok);
      return {
        x: p.x,
        z: p.z,
        yaw: R() * TAU,
        tx: p.x,
        tz: p.z,
        pause: R() * 6,
        speed: 0,
        graze: R() * 3,
        scale: 0.92 + R() * 0.14,
        body: creatures.add(kind, r, { x: p.x, z: p.z, give: 0.6 }),
        id: -1,
      };
    });
  const alpacas = herd(HERDS.alpacas, high ? 7 : 5, "alpaca", 0.5);
  const llamas = herd(HERDS.llamas, high ? 5 : 4, "llama", 0.55);
  const herds = lazyHerds(group);
  herds.herd("alpaca", { max: alpacas.length, variants: ALPACA_COATS }, (h) =>
    alpacas.forEach((g, i) => {
      g.id = h.add({ seed: 3 + i * 7, variant: i % ALPACA_COATS.length });
    }),
  );
  // The shore llamas graze free: no tassels in their ears, no packs.
  herds.herd("llama", { max: llamas.length, variants: LLAMA_COATS, features: { tika: false } }, (h) =>
    llamas.forEach((g, i) => {
      g.id = h.add({ seed: 5 + i * 9, variant: i % LLAMA_COATS.length });
    }),
  );

  // ------------------------------------------------------------------ vizcachas on their rocks
  const rockSpots: Array<[number, number]> = [];
  for (let k = 0; k < 400 && rockSpots.length < (high ? 6 : 4); k++) {
    const base =
      k % 2
        ? { x: SILLUSTANI.x, z: SILLUSTANI.z, r: SILLUSTANI.r + 10 }
        : { x: TAQUILE.x - 18, z: TAQUILE.z - 6, r: 12 };
    const a = R() * TAU;
    const rr = base.r * (0.55 + R() * 0.45);
    const x = base.x + Math.cos(a) * rr;
    const z = base.z + Math.sin(a) * rr;
    if (!L.isGround(x, z) || creatures.inKeepOut(x, z, 1.5)) continue;
    if (rockSpots.some(([px, pz]) => Math.hypot(px - x, pz - z) < 6)) continue;
    rockSpots.push([x, z]);
  }
  const rockParts: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color; matrix: THREE.Matrix4 }> = [];
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const vizcachas = rockSpots.map(([x, z], i) => {
    const y = L.heightAt(x, z);
    rockParts.push({
      geometry: rockGeo,
      color: new THREE.Color(i % 2 ? "#9d9483" : "#8a8172"),
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(x, y + 0.2, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, i, 0.1)),
        new THREE.Vector3(1.3, 0.85, 1.1),
      ),
    });
    env.addCollider({ kind: "circle", x, z, r: 1.3 });
    // `top`: the rock's crown, where it sits; `px, pz, py`: where it is drawn this frame (for its hop speed).
    return { x, z, top: y + 0.95, yaw: R() * TAU, look: 0, hide: 0, away: 0, px: x, pz: z, speed: 0, id: -1 };
  });
  const rocksGeo = mergeColored(rockParts);
  rockGeo.dispose();
  const rockMat = vertexToon();
  if (rocksGeo) {
    const rm = new THREE.Mesh(rocksGeo, rockMat);
    rm.name = "titicaca-orilla:rocks";
    rm.castShadow = true;
    group.add(rm);
  }
  if (vizcachas.length)
    herds.herd("vizcacha", { max: vizcachas.length }, (h) =>
      vizcachas.forEach((v, i) => {
        v.id = h.add({ seed: 7 + i * 13 });
      }),
    );

  // ------------------------------------------------------------------ the frog
  let frog: Animal | null = null;
  herds.one("frog", { variant: "titicaca", lod: 1, seed: 3 }, (a) => {
    frog = a;
    a.group.name = "titicaca-orilla:frog";
    a.group.position.set(FROG_SPOT.x, LEVEL - 0.4, FROG_SPOT.z);
    a.group.rotation.y = 2.4;
    a.group.visible = false;
  });
  env.scene.add(group);

  const looks = {
    alpaca: new LookTimer(1.4),
    llama: new LookTimer(1.4),
    vizcacha: new LookTimer(1.2),
    rana: new LookTimer(1.2),
  };
  let clock = 0;
  const rmo = env.reducedMotion;

  const stepHerd = (
    list: Grazer[],
    h: Herd | null,
    home: { x: number; z: number; r: number },
    dt: number,
    avatar: THREE.Vector3,
    day: boolean,
    id: "alpaca" | "llama",
  ) => {
    let seen = false;
    for (const g of list) {
      const dAv = Math.hypot(avatar.x - g.x, avatar.z - g.z);
      let want = 0;
      let look: number | undefined;
      if (day) {
        g.pause -= dt;
        if (dAv < 4.5) {
          // Step away from the traveler.
          const a = Math.atan2(g.z - avatar.z, g.x - avatar.x);
          const nx = g.x + Math.cos(a) * 4;
          const nz = g.z + Math.sin(a) * 4;
          if (ok(nx, nz)) {
            g.tx = nx;
            g.tz = nz;
            g.pause = 0;
          }
        } else if (g.pause <= 0 && Math.hypot(g.tx - g.x, g.tz - g.z) < 0.3) {
          const t = wanderTarget(
            { x: g.x, z: g.z, r: 4 },
            R,
            (x, z) => ok(x, z) && Math.hypot(x - home.x, z - home.z) < home.r,
          );
          g.tx = t.x;
          g.tz = t.z;
          g.pause = 3 + R() * 8;
        }
        const d = Math.hypot(g.tx - g.x, g.tz - g.z);
        const moving = d > 0.3 && g.pause <= 0;
        const sp = dAv < 4.5 ? 1.6 : 0.7;
        if (moving) {
          g.yaw = turnToward(g.yaw, Math.atan2(g.tx - g.x, g.tz - g.z), dt * 2.4);
          const nx = g.x + Math.sin(g.yaw) * sp * dt;
          const nz = g.z + Math.cos(g.yaw) * sp * dt;
          if (ok(nx, nz)) {
            g.x = nx;
            g.z = nz;
            want = sp;
          } else g.tx = g.x;
        }
        // Graze while standing; heads up, watching, when someone comes close.
        if (dAv < 9) look = THREE.MathUtils.clamp(wrapAngle(Math.atan2(avatar.x - g.x, avatar.z - g.z) - g.yaw), -1, 1);
        else if (!moving && h && g.id >= 0) {
          g.graze -= dt;
          if (g.graze <= 0) {
            h.play(g.id, "graze", 4 + R() * 5);
            g.graze = 6 + R() * 6;
          }
        }
      }
      g.speed = damp(g.speed, want, 5, dt);
      g.body.x = g.x;
      g.body.z = g.z;
      const y = L.heightAt(g.x, g.z);
      // At night they lie down where they are (the kush, legs folded under), asleep.
      if (h && g.id >= 0)
        h.set(
          g.id,
          g.x,
          y,
          g.z,
          g.yaw,
          { speed: g.speed, rm: rmo, look, mode: day ? "auto" : "sleep" },
          { scale: g.scale },
        );
      if (dAv < 18 && onScreen(g.x, y + 1, g.z)) seen = true;
    }
    if (looks[id].update(dt, seen)) stamp(`titicaca:fauna:${id}`);
  };

  if (import.meta.env?.DEV)
    (window as unknown as { __orilla?: unknown }).__orilla = {
      vizcachas: () => vizcachas.map((v) => [+v.x.toFixed(1), +v.z.toFixed(1)]),
      drawCalls: () => herds.drawCalls() + 1,
    };
  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      const light = daylight(env.sky.time());
      const day = light > 0.3;
      // The moon-blue rim on every animal of the core (shared by all the lake's fauna ambients).
      setAnimalNight(1 - light);
      stepHerd(alpacas, herds.get("alpaca"), HERDS.alpacas, dt, avatar, day, "alpaca");
      stepHerd(llamas, herds.get("llama"), HERDS.llamas, dt, avatar, day, "llama");

      // ----- vizcachas
      const vh = herds.get("vizcacha");
      let vSeen = false;
      vizcachas.forEach((z, i) => {
        const dAv = Math.hypot(avatar.x - z.x, avatar.z - z.z);
        if (z.hide <= 0 && dAv < 7.5 && day) z.hide = 9 + R() * 6;
        z.hide = Math.max(0, z.hide - dt);
        // Hop down behind the rock (away from the traveler), out of sight; back when the timer runs out.
        z.away = damp(z.away, z.hide > 0 || !day ? 1 : 0, z.hide > 0 ? 6 : 2, dt);
        const a = Math.atan2(z.z - avatar.z, z.x - avatar.x);
        const hx = z.x + Math.cos(a) * z.away * 1.8;
        const hz = z.z + Math.sin(a) * z.away * 1.8;
        const hy = z.top - z.away * 0.95 + Math.sin(z.away * Math.PI) * 0.4;
        const step = Math.hypot(hx - z.px, hz - z.pz);
        z.px = hx;
        z.pz = hz;
        z.speed = damp(z.speed, dt > 0 ? step / dt : 0, 8, dt);
        if (!rmo && z.away < 0.05) z.look = Math.sin(clock * 0.6 + i * 2) * 0.9 + Math.sin(clock * 2.3 + i) * 0.15;
        // Moving away it faces where it hops; sitting on the rock it keeps its own heading.
        const yaw = z.away > 0.05 && z.hide > 0 ? Math.atan2(Math.cos(a), Math.sin(a)) : z.yaw;
        if (vh && z.id >= 0) {
          if (z.away > 0.92) vh.hide(z.id);
          else
            vh.set(z.id, hx, hy, hz, yaw, {
              speed: z.away > 0.05 ? z.speed : 0,
              rm: rmo,
              look: z.away < 0.05 ? z.look : undefined,
              mode: z.away < 0.05 ? "sit" : "auto",
            });
        }
        if (z.away < 0.2 && dAv < 16 && onScreen(hx, hy + 0.3, hz)) vSeen = true;
      });
      if (looks.vizcacha.update(dt, vSeen)) stamp("titicaca:fauna:vizcacha");

      // ----- the frog
      const dFrog = Math.hypot(avatar.x - FROG_SPOT.x, avatar.z - FROG_SPOT.z);
      const up = frogSurface(clock, dFrog < 18);
      const f = frog as Animal | null;
      if (f) {
        // Its back and eyes just out of the water, sinking back to the lake bed in between.
        f.group.position.y = LEVEL - 0.3 + up * 0.24 + (rmo ? 0 : Math.sin(clock * 1.7) * 0.01);
        if (up > 0.01) {
          f.autoLod(env.camera);
          f.update(dt, clock, { speed: 0, rm: rmo, mode: "swim" });
        } else f.group.visible = false;
      }
      if (looks.rana.update(dt, up > 0.5 && dFrog < 14 && onScreen(FROG_SPOT.x, LEVEL, FROG_SPOT.z)))
        stamp("titicaca:fauna:rana");
      herds.update(dt, clock, env.camera);
    },
    dispose() {
      for (const g of [...alpacas, ...llamas]) creatures.remove(g.body);
      herds.dispose();
      rocksGeo?.dispose();
      rockMat.dispose();
      group.removeFromParent();
    },
  };
};
