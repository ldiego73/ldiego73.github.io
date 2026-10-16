/**
 * The caballito de totora ride: a reed boat drawn up on the sand below the Huanchaco market (the south beach)
 * and the beach past the headland (the north beach), with the fishermen's boats standing upright on both
 * beaches to dry and three fishermen kneeling on theirs beyond the surf.
 *
 * "E · Subir al caballito" by the beached boat launches it through the shallows and hands it to the traveler
 * (`world:mount {riding, vehicle: "caballito"}` + the runtime's ride hook, ../../suyu/ride.ts): the stick turns
 * and paddles it with inertia (./caballito/logic.ts, the jungle canoe's feel), a breaking crest shoves it toward
 * the beach, and it rides up and down on the very waves the sea draws (../scenery/waves.ts), pitching and
 * rolling with their slope. It stays on the water of the bay between the two beaches, round the headland and
 * its sea lion rocks. Near either beach, slowly, "E · Bajar en la playa" (or Esc) runs it up the sand and the
 * traveler steps off; reaching the other beach earns `costa:ride:caballito`. When the traveler walks to the
 * beach the boat is not at, and it is far out of sight, it is waiting there (another fisherman brought it).
 * Reduced motion: no bobbing or pitching (the sea is still too), the ride itself works the same.
 *
 * Draw calls: the boat, the paddle, the drying boats (instanced), the fishermen's boats (instanced).
 */
import * as THREE from "three";
import { CATALOG } from "../../../lib/passport";
import type { Ambient, CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { emit, on } from "../../events";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import { ride } from "../../suyu/ride";
import { rng } from "../kit";
import type { CostaLayout } from "../layout";
import { BEACHES } from "../plan";
import { crest, seaHeight } from "../scenery/waves";
import { type Boat, dockingEnd, earnsStamp, idleLanding, type Landing, stepBoat, type Water } from "./caballito/logic";
import { boatGeometry, fishingBoatGeometry, paddleGeometry } from "./caballito/model";

const T_BOARD: L = { es: "E · Subir al caballito", en: "E · Board the reed boat" };
const T_LAND: L = { es: "E · Bajar en la playa", en: "E · Land on the beach" };
const STAMP = "costa:ride:caballito";
const RANGE = 2.6;
/** How far out the ride area reaches (offshore distance) and past each beach along the coast. */
const OUT = 95;
const PAST = 28;

type Phase =
  | { kind: "moored"; at: 0 | 1 }
  | { kind: "launch"; at: 0 | 1; u: number }
  | { kind: "riding" }
  | { kind: "landing"; at: 0 | 1; u: number; from: { x: number; z: number; yaw: number } };

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const lang = env.lang;
  const L = env.suyu.layout as CostaLayout;
  const rm = env.reducedMotion;
  const root = new THREE.Group();
  root.name = "costa-caballito";
  env.scene.add(root);
  const mat = vertexToon();

  // ------------------------------------------------------------------ landings
  const landingAt = (t: number): Landing & { yaw: number; nx: number; nz: number } => {
    const p = L.beachPoint(t);
    // Seaward normal of the coast here.
    const dsx = L.shoreX(p.z + 2) - L.shoreX(p.z - 2);
    const l = Math.hypot(4, dsx) || 1;
    const nx = -4 / l;
    const nz = dsx / l;
    return {
      x: p.x - nx * 2.2,
      z: p.z - nz * 2.2,
      bx: p.x + nx * 9,
      bz: p.z + nz * 9,
      yaw: Math.atan2(nx, nz),
      nx,
      nz,
    };
  };
  const landings = [landingAt(BEACHES.south), landingAt(BEACHES.north)] as const;
  const zMin = Math.min(landings[0].z, landings[1].z) - PAST;
  const zMax = Math.max(landings[0].z, landings[1].z) + PAST;
  const time = { t: 0 };
  const sOf = (x: number, z: number) => L.shoreX(z) - x;
  const water: Water = {
    ok(x, z) {
      if (z < zMin || z > zMax || sOf(x, z) > OUT) return false;
      if (landings.some((l) => Math.hypot(x - l.bx, z - l.bz) < 3.5)) return true;
      // Afloat: past the swash on the sand, over the seabed, clear of the rocks.
      if (sOf(x, z) < 3 || L.heightAt(x, z) > -0.08) return false;
      return !L.islets.some((i) => Math.hypot(x - i.x, z - i.z) < i.r * 1.15);
    },
    shore(x, z) {
      const s = sOf(x, z);
      if (s > 50 || s < -2) return null;
      const dsx = L.shoreX(z + 2) - L.shoreX(z - 2);
      const l = Math.hypot(4, dsx) || 1;
      return { x: 4 / l, z: -dsx / l };
    },
    crest: (x, z) => (rm ? 0 : crest(z, sOf(x, z), time.t)),
  };
  const seaY = (x: number, z: number) => (rm ? 0 : seaHeight(x, z, sOf(x, z), time.t));
  /** Beached pose at a landing: on the wet sand, bow to the sea. */
  const beached = (i: 0 | 1) => {
    const l = landings[i];
    const x = l.x + l.nx * 2.6;
    const z = l.z + l.nz * 2.6;
    return { x, z, yaw: l.yaw, y: Math.max(L.heightAt(x, z), 0) + 0.02 };
  };

  // ------------------------------------------------------------------ the rideable boat
  const boatGeo = boatGeometry();
  const boat = new THREE.Mesh(boatGeo, mat);
  boat.name = "costa-caballito:boat";
  boat.castShadow = true;
  root.add(boat);
  const paddleGeo = paddleGeometry();
  const paddle = new THREE.Mesh(paddleGeo, mat);
  paddle.name = "costa-caballito:paddle";
  boat.add(paddle);
  const body = creatures.add("caballito", 1, { give: 0.2 });

  // ------------------------------------------------------------------ drying boats (standing upright)
  const R = rng(0xcaba);
  const dry: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  landings.forEach((l, li) => {
    const n = li === 0 ? 6 : 3;
    // Along the shore (perpendicular to the seaward normal), on the dry sand behind the landing.
    const ax = -l.nz;
    const az = l.nx;
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * 0.85 + (li === 0 ? 7 : -6);
      const x = l.x - l.nx * 2.5 + ax * off;
      const z = l.z - l.nz * 2.5 + az * off;
      const y = L.heightAt(x, z);
      // Bow up, leaning back against a cane rack, a little jitter.
      e.set(-Math.PI / 2 + 0.28 + (R() - 0.5) * 0.08, l.yaw + Math.PI + (R() - 0.5) * 0.3, (R() - 0.5) * 0.1, "YXZ");
      q.setFromEuler(e);
      dry.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 1.45, z), q, new THREE.Vector3(1, 1, 1)));
      env.addCollider({ kind: "circle", x, z, r: 0.45 });
    }
  });
  const dryMesh = new THREE.InstancedMesh(boatGeo, mat, dry.length);
  dryMesh.name = "costa-caballito:drying";
  for (const [i, m] of dry.entries()) dryMesh.setMatrixAt(i, m);
  dryMesh.instanceMatrix.needsUpdate = true;
  dryMesh.computeBoundingSphere();
  dryMesh.castShadow = true;
  root.add(dryMesh);
  // Their cane racks: a rail on two posts behind each group.
  const rackGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 5);
  const racks: THREE.Matrix4[] = [];
  landings.forEach((l, li) => {
    const ax = -l.nz;
    const az = l.nx;
    const n = li === 0 ? 6 : 3;
    const c = li === 0 ? 7 : -6;
    const half = (n * 0.85) / 2 + 0.4;
    const bx = l.x - l.nx * 3.6;
    const bz = l.z - l.nz * 3.6;
    for (const s of [-half, half]) {
      const x = bx + ax * (c + s);
      const z = bz + az * (c + s);
      racks.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, L.heightAt(x, z) + 1.1, z),
          q.identity(),
          new THREE.Vector3(1, 2.2, 1),
        ),
      );
    }
    const mx = bx + ax * c;
    const mz = bz + az * c;
    e.set(0, Math.atan2(ax, az), Math.PI / 2, "YXZ");
    racks.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(mx, L.heightAt(mx, mz) + 2.1, mz),
        new THREE.Quaternion().setFromEuler(e),
        new THREE.Vector3(1, half * 2 + 0.4, 1),
      ),
    );
  });
  const rackMat = env.toon("#8a6a3a");
  const rackMesh = new THREE.InstancedMesh(rackGeo, rackMat, racks.length);
  for (const [i, m] of racks.entries()) rackMesh.setMatrixAt(i, m);
  rackMesh.instanceMatrix.needsUpdate = true;
  rackMesh.computeBoundingSphere();
  rackMesh.name = "costa-caballito:racks";
  root.add(rackMesh);

  // ------------------------------------------------------------------ fishermen beyond the surf
  const fishGeo = fishingBoatGeometry("#d8d2c4");
  const fishers = Array.from({ length: env.quality === "high" ? 4 : 3 }, (_, i) => ({
    cx: landings[0].bx + landings[0].nx * (34 + i * 9) + -landings[0].nz * (i * 14 - 18),
    cz: landings[0].bz + landings[0].nz * (34 + i * 9) + landings[0].nx * (i * 14 - 18),
    r: 6 + i * 2.5,
    w: (0.05 + i * 0.012) * (i % 2 ? 1 : -1),
    ph: i * 1.9,
  }));
  const fishMesh = new THREE.InstancedMesh(fishGeo, mat, fishers.length);
  fishMesh.name = "costa-caballito:fishermen";
  fishMesh.frustumCulled = false;
  fishMesh.castShadow = true;
  root.add(fishMesh);

  // ------------------------------------------------------------------ state
  const entry = CATALOG.find((s) => s.id === STAMP);
  let stamped = false;
  let phase: Phase = { kind: "moored", at: 0 };
  let boarded: 0 | 1 = 0;
  let b: Boat = { ...beached(0), vx: 0, vz: 0 };
  let near = false;
  let dock: number | null = null;
  let stroke = 0;
  let modal = 0;
  const offs = [
    on("world:modal", (d) => {
      modal = Math.max(0, modal + (d?.open ? 1 : -1));
    }),
  ];
  const place = (i: 0 | 1) => {
    const p = beached(i);
    b = { x: p.x, z: p.z, yaw: p.yaw, vx: 0, vz: 0 };
    phase = { kind: "moored", at: i };
  };
  place(0);

  const board = () => {
    if (phase.kind !== "moored") return;
    boarded = phase.at;
    phase = { kind: "launch", at: phase.at, u: 0 };
    ride.pose.x = b.x;
    ride.pose.z = b.z;
    ride.pose.y = beached(boarded).y + 0.3;
    ride.pose.yaw = b.yaw;
    ride.active = true;
    emit("world:mount", { riding: true, speedMul: 1, seatHeight: 0, vehicle: "caballito" });
  };
  const finishLanding = (i: 0 | 1) => {
    const l = landings[i];
    ride.pose.x = l.x;
    ride.pose.z = l.z;
    ride.pose.y = L.heightAt(l.x, l.z);
    ride.pose.yaw = l.yaw + Math.PI;
    ride.active = false;
    emit("world:mount", { riding: false, speedMul: 1, seatHeight: 0 });
    place(i);
    if (!stamped && entry && earnsStamp(boarded, i)) {
      stamped = true;
      emit("world:stamp", { id: entry.id, kind: entry.kind, label: entry.label });
    }
  };
  const startLanding = () => {
    if (phase.kind !== "riding") return false;
    const i = dockingEnd(b, landings);
    if (i === null) return false;
    phase = { kind: "landing", at: i as 0 | 1, u: 0, from: { x: b.x, z: b.z, yaw: b.yaw } };
    return true;
  };

  const dummy = new THREE.Object3D();
  const angleLerp = (a: number, c: number, k: number) => {
    let d = c - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
  };
  /** Pitch and roll from the wave slope under the hull. */
  const tilt = (x: number, z: number, yaw: number) => {
    if (rm) return { pitch: 0, roll: 0 };
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const bow = seaY(x + fx * 1.4, z + fz * 1.4);
    const stern = seaY(x - fx * 1.4, z - fz * 1.4);
    const port = seaY(x - fz * 0.5, z + fx * 0.5);
    const star = seaY(x + fz * 0.5, z - fx * 0.5);
    return { pitch: Math.atan2(stern - bow, 2.8) * 0.8, roll: Math.atan2(port - star, 1) * 0.5 };
  };

  // Dev hook (screenshots on slow software GL): put the boat somewhere on the water while riding.
  if (import.meta.env?.DEV)
    (window as Window & { __caballito?: unknown }).__caballito = {
      place(x: number, z: number, yaw: number) {
        if (phase.kind === "riding") b = { x, z, yaw, vx: 0, vz: 0 };
      },
      state: () => ({ phase: phase.kind, b, dock, landings }),
    };

  return {
    update(dtIn, avatar, t) {
      const dt = Math.min(dtIn, 0.05);
      time.t = rm ? 0 : t;
      let y = 0;
      if (phase.kind === "moored") {
        const p = beached(phase.at);
        y = p.y;
        near = modal === 0 && Math.hypot(avatar.x - b.x, avatar.z - b.z) < RANGE;
        // The boat comes round to the beach the traveler is heading for (out of sight).
        const want = idleLanding({
          at: phase.at,
          d0: Math.hypot(avatar.x - landings[0].x, avatar.z - landings[0].z),
          d1: Math.hypot(avatar.x - landings[1].x, avatar.z - landings[1].z),
          dBoat: Math.hypot(avatar.x - b.x, avatar.z - b.z),
        }) as 0 | 1;
        if (want !== phase.at) place(want);
        boat.rotation.set(0.04, b.yaw, 0);
      } else if (phase.kind === "launch") {
        // Pushed out through the shallows to the dock point, bow to the sea.
        phase.u = Math.min(1, phase.u + dt / 1.4);
        const l = landings[phase.at];
        const p = beached(phase.at);
        const k = phase.u * phase.u * (3 - 2 * phase.u);
        b.x = p.x + (l.bx - p.x) * k;
        b.z = p.z + (l.bz - p.z) * k;
        y = Math.max(seaY(b.x, b.z), L.heightAt(b.x, b.z) + 0.02);
        if (phase.u >= 1) {
          phase = { kind: "riding" };
          b.vx = Math.sin(b.yaw) * 1.2;
          b.vz = Math.cos(b.yaw) * 1.2;
        }
        near = false;
      } else if (phase.kind === "riding") {
        const intent = modal > 0 ? { x: 0, z: 0, running: false } : ride.intent;
        b = stepBoat(water, b, intent, dt);
        y = seaY(b.x, b.z);
        if (Math.hypot(intent.x, intent.z) > 0.08) stroke += dt * (1.4 + Math.hypot(intent.x, intent.z) * 1.6);
        dock = dockingEnd(b, landings);
        near = false;
      } else {
        // Landing: run up onto the sand, then step off.
        phase.u = Math.min(1, phase.u + dt / 1.3);
        const p = beached(phase.at);
        const k = phase.u * phase.u * (3 - 2 * phase.u);
        b.x = phase.from.x + (p.x - phase.from.x) * k;
        b.z = phase.from.z + (p.z - phase.from.z) * k;
        b.yaw = angleLerp(phase.from.yaw, p.yaw, k);
        y = Math.max(seaY(b.x, b.z) * (1 - k), L.heightAt(b.x, b.z) + 0.02);
        if (phase.u >= 1) finishLanding(phase.at);
      }

      // Boat transform (the hull's waterline at y).
      const tl = phase.kind === "moored" ? { pitch: 0.04, roll: 0 } : tilt(b.x, b.z, b.yaw);
      boat.position.set(b.x, y + 0.05, b.z);
      boat.rotation.set(tl.pitch, b.yaw, tl.roll, "YXZ");
      // Rider: standing a little aft of amidships, on the reeds.
      if (ride.active) {
        const fx = Math.sin(b.yaw);
        const fz = Math.cos(b.yaw);
        ride.pose.x = b.x - fx * 0.55;
        ride.pose.z = b.z - fz * 0.55;
        ride.pose.y = y + 0.32;
        ride.pose.yaw = b.yaw;
      }
      // Paddle: alternate strokes while paddling, across the hull otherwise.
      if (ride.active && phase.kind === "riding" && stroke > 0) {
        const side = Math.sin(stroke * 0.5) >= 0 ? 1 : -1;
        const sw = Math.sin(stroke * Math.PI);
        paddle.position.set(side * 0.35, 1.55, -0.2);
        paddle.rotation.set(-0.3 + sw * (rm ? 0.12 : 0.5), 0, side * 0.35);
      } else {
        paddle.position.set(0.05, 0.42, -0.2);
        paddle.rotation.set(Math.PI / 2, 0, 0.1);
      }
      body.x = b.x;
      body.z = b.z;
      body.solid = phase.kind === "moored";

      // Fishermen beyond the surf: slow circles, riding the swell.
      fishers.forEach((f, i) => {
        const a = f.ph + t * f.w * (rm ? 0 : 1);
        const x = f.cx + Math.cos(a) * f.r;
        const z = f.cz + Math.sin(a) * f.r;
        const yaw = Math.atan2(-Math.sin(a), Math.cos(a)) * Math.sign(f.w || 1) + (f.w < 0 ? Math.PI : 0);
        const tt = tilt(x, z, yaw);
        dummy.position.set(x, seaY(x, z) + 0.05, z);
        dummy.rotation.set(tt.pitch, yaw, tt.roll, "YXZ");
        dummy.updateMatrix();
        fishMesh.setMatrixAt(i, dummy.matrix);
      });
      fishMesh.instanceMatrix.needsUpdate = true;
    },
    prompt() {
      if (modal > 0) return null;
      if (phase.kind === "riding") return dock !== null ? T_LAND[lang] : null;
      return phase.kind === "moored" && near ? T_BOARD[lang] : null;
    },
    interact() {
      if (modal > 0) return false;
      if (phase.kind === "riding") return startLanding();
      if (phase.kind !== "moored" || !near) return false;
      board();
      return true;
    },
    escape() {
      if (modal > 0) return false;
      return startLanding();
    },
    dispose() {
      if (import.meta.env?.DEV) delete (window as Window & { __caballito?: unknown }).__caballito;
      for (const off of offs) off();
      if (ride.active) {
        ride.active = false;
        emit("world:mount", { riding: false, speedMul: 1, seatHeight: 0 });
      }
      creatures.remove(body);
      root.removeFromParent();
      boatGeo.dispose();
      paddleGeo.dispose();
      fishGeo.dispose();
      rackGeo.dispose();
      mat.dispose();
    },
  };
};
