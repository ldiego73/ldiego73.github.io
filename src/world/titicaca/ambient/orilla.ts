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
 * solid bodies in the creatures registry. Draw calls: alpacas 3, llamas 3, vizcachas 3 + their rocks 1, frog 1.
 */
import * as THREE from "three";
import { CATALOG } from "../../../lib/passport";
import type { Ambient, CreateAmbient } from "../../contract";
import { type Body, creatures } from "../../creatures";
import { emit } from "../../events";
import { ALPACA, LLAMA, vizcachaParts } from "../../fauna-models";
import { mergeColored, vertexToon } from "../../merge-colors";
import { paintStrength } from "../../style-gl";
import type { SuyuEnv } from "../../suyu/contract";
import { FROG_SPOT, HERDS, LEVEL, SILLUSTANI, TAQUILE } from "../plan";
import { CamelidHerd } from "./fauna/camelids";
import { damp, daylight, frogSurface, LookTimer, rng, TAU, turnToward, wanderTarget } from "./fauna/logic";
import { frogGeometry } from "./fauna/models";

const ALPACA_COATS = ["#f4efe4", "#c8a27a", "#7a5a44", "#e6d5b8", "#3f3430", "#f4efe4", "#a8825f"];
const LLAMA_COATS = ["#fbf6ee", "#a8724a", "#5a463a", "#e0bf92", "#2f2724"];

interface Grazer {
  x: number;
  z: number;
  yaw: number;
  tx: number;
  tz: number;
  pause: number;
  phase: number;
  walk: number;
  graze: number;
  body: Body;
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
        phase: R() * TAU,
        walk: 0,
        graze: R(),
        body: creatures.add(kind, r, { x: p.x, z: p.z, give: 0.6 }),
      };
    });
  const alpacas = herd(HERDS.alpacas, high ? 7 : 5, "alpaca", 0.5);
  const llamas = herd(HERDS.llamas, high ? 5 : 4, "llama", 0.55);
  const alpacaMesh = new CamelidHerd("titicaca-alpacas", ALPACA, ALPACA_COATS, alpacas.length);
  const llamaMesh = new CamelidHerd("titicaca-llamas", LLAMA, LLAMA_COATS, llamas.length);
  group.add(alpacaMesh.group, llamaMesh.group);

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
    return { x, z, top: y + 0.95, yaw: R() * TAU, look: 0, hide: 0, away: 0, seen: false };
  });
  const rocksGeo = mergeColored(rockParts);
  rockGeo.dispose();
  // The animals move (no world-space painted blotches on them); the vizcachas' rocks keep the paint.
  const vmat = paintStrength(vertexToon(), 0);
  const rockMat = vertexToon();
  if (rocksGeo) {
    const rm = new THREE.Mesh(rocksGeo, rockMat);
    rm.name = "titicaca-orilla:rocks";
    rm.castShadow = true;
    group.add(rm);
  }
  const vp = vizcachaParts();
  const vizBody = mergeColored([{ geometry: vp.body, color: new THREE.Color("#a39b8e") }]);
  const vizHead = mergeColored([
    { geometry: vp.head, color: new THREE.Color("#a39b8e") },
    { geometry: vp.eyes, color: new THREE.Color("#1f1a17") },
  ]);
  const vizTail = mergeColored([{ geometry: vp.tail, color: new THREE.Color("#3f3832") }]);
  for (const g of [vp.body, vp.head, vp.eyes, vp.tail]) g.dispose();
  const nV = Math.max(1, vizcachas.length);
  const vBody = new THREE.InstancedMesh(vizBody ?? new THREE.BufferGeometry(), vmat, nV);
  const vHead = new THREE.InstancedMesh(vizHead ?? new THREE.BufferGeometry(), vmat, nV);
  const vTail = new THREE.InstancedMesh(vizTail ?? new THREE.BufferGeometry(), vmat, nV);
  for (const [m, nm] of [
    [vBody, "body"],
    [vHead, "head"],
    [vTail, "tail"],
  ] as const) {
    m.name = `titicaca-vizcachas:${nm}`;
    m.frustumCulled = false;
    m.castShadow = nm !== "tail";
    group.add(m);
  }

  // ------------------------------------------------------------------ the frog
  const frog = new THREE.Mesh(frogGeometry(), vmat);
  frog.name = "titicaca-orilla:frog";
  frog.position.set(FROG_SPOT.x, LEVEL - 0.4, FROG_SPOT.z);
  frog.rotation.y = 2.4;
  frog.visible = false;
  group.add(frog);
  env.scene.add(group);

  const looks = {
    alpaca: new LookTimer(1.4),
    llama: new LookTimer(1.4),
    vizcacha: new LookTimer(1.2),
    rana: new LookTimer(1.2),
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3(1.25, 1.25, 1.25);
  const hm = new THREE.Matrix4();
  const hq = new THREE.Quaternion();
  const out = new THREE.Matrix4();
  const ONE = new THREE.Vector3(1, 1, 1);
  const tailM = new THREE.Matrix4().makeTranslation(vp.tailPivot.x, vp.tailPivot.y, vp.tailPivot.z);
  let clock = 0;
  const rmo = env.reducedMotion;

  const stepHerd = (
    list: Grazer[],
    mesh: CamelidHerd,
    home: { x: number; z: number; r: number },
    dt: number,
    avatar: THREE.Vector3,
    day: boolean,
    id: "alpaca" | "llama",
  ) => {
    let seen = false;
    list.forEach((g, i) => {
      const dAv = Math.hypot(avatar.x - g.x, avatar.z - g.z);
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
          } else g.tx = g.x;
        }
        g.walk = damp(g.walk, moving ? 1 : 0, 5, dt);
        if (!rmo) g.phase += dt * sp * 4.5 * g.walk;
        // Graze while standing, heads up when someone comes close.
        g.graze = damp(g.graze, !moving && dAv > 9 ? 1 : 0, 1.5, dt);
      } else {
        g.walk = damp(g.walk, 0, 5, dt);
      }
      g.body.x = g.x;
      g.body.z = g.z;
      mesh.set(i, {
        x: g.x,
        y: L.heightAt(g.x, g.z),
        z: g.z,
        yaw: g.yaw,
        phase: g.phase,
        walk: g.walk,
        graze: g.graze * (0.8 + (rmo ? 0 : 0.15 * Math.sin(clock * 0.9 + i))),
        lying: !day,
      });
      if (dAv < 18 && onScreen(g.x, L.heightAt(g.x, g.z) + 1, g.z)) seen = true;
    });
    mesh.commit();
    if (looks[id].update(dt, seen)) stamp(`titicaca:fauna:${id}`);
  };

  return {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      const day = daylight(env.sky.time()) > 0.3;
      stepHerd(alpacas, alpacaMesh, HERDS.alpacas, dt, avatar, day, "alpaca");
      stepHerd(llamas, llamaMesh, HERDS.llamas, dt, avatar, day, "llama");

      // ----- vizcachas
      let vSeen = false;
      vizcachas.forEach((z, i) => {
        const dAv = Math.hypot(avatar.x - z.x, avatar.z - z.z);
        if (z.hide <= 0 && dAv < 7.5 && day) z.hide = 9 + R() * 6;
        z.hide = Math.max(0, z.hide - dt);
        // Hop behind the rock (away from the traveler) and shrink out of sight; back when the timer runs out.
        z.away = damp(z.away, z.hide > 0 || !day ? 1 : 0, z.hide > 0 ? 6 : 2, dt);
        const a = Math.atan2(z.z - avatar.z, z.x - avatar.x);
        const hx = z.x + Math.cos(a) * z.away * 1.8;
        const hz = z.z + Math.sin(a) * z.away * 1.8;
        const hy = z.top - z.away * 0.9 + Math.sin(z.away * Math.PI) * 0.5;
        if (!rmo && z.away < 0.05) z.look = Math.sin(clock * 0.6 + i * 2) * 0.9 + Math.sin(clock * 2.3 + i) * 0.15;
        const sc = 1.3 * (1 - THREE.MathUtils.smoothstep(z.away, 0.75, 1));
        q.setFromEuler(e.set(0, z.yaw, 0));
        m4.compose(v.set(hx, hy, hz), q, s.setScalar(sc));
        vBody.setMatrixAt(i, m4);
        hm.compose(vp.headPivot, hq.setFromEuler(e.set(0, z.look, 0)), ONE);
        vHead.setMatrixAt(i, out.copy(m4).multiply(hm));
        vTail.setMatrixAt(i, out.copy(m4).multiply(tailM));
        if (z.away < 0.2 && dAv < 16 && onScreen(hx, hy + 0.3, hz)) vSeen = true;
      });
      vBody.instanceMatrix.needsUpdate = true;
      vHead.instanceMatrix.needsUpdate = true;
      vTail.instanceMatrix.needsUpdate = true;
      if (looks.vizcacha.update(dt, vSeen)) stamp("titicaca:fauna:vizcacha");

      // ----- the frog
      const dFrog = Math.hypot(avatar.x - FROG_SPOT.x, avatar.z - FROG_SPOT.z);
      const up = frogSurface(clock, dFrog < 18);
      frog.visible = up > 0.01;
      frog.position.y = LEVEL - 0.42 + up * 0.36 + (rmo ? 0 : Math.sin(clock * 1.7) * 0.01);
      if (looks.rana.update(dt, up > 0.5 && dFrog < 14 && onScreen(FROG_SPOT.x, LEVEL, FROG_SPOT.z)))
        stamp("titicaca:fauna:rana");
    },
    dispose() {
      for (const g of [...alpacas, ...llamas]) creatures.remove(g.body);
      alpacaMesh.dispose();
      llamaMesh.dispose();
      for (const m of [vBody, vHead, vTail]) m.dispose();
      vizBody?.dispose();
      vizHead?.dispose();
      vizTail?.dispose();
      rocksGeo?.dispose();
      frog.geometry.dispose();
      vmat.dispose();
      rockMat.dispose();
      group.removeFromParent();
    },
  };
};
