/**
 * The balsa de totora: the reed boat with a puma-head prow and a reed-mat sail that crosses the bay between the
 * Uros islands and Taquile (the lake's counterpart of the jungle's canoe, on the suyu runtime's ride hook,
 * ../../suyu/ride.ts). Two landings: a reed jetty off the far Uros island and a wooden pier from the shore below
 * Taquile (both raised decks, ../../decks.ts). "E · Subir a la balsa" at a landing's tip boards it: a short hop
 * aboard (`world:mount {riding, vehicle: "balsa"}`), then forward / back on the controls punts it ahead or
 * brakes and backs, the sides turn it (also at rest), Shift goes faster (keyboard, touch, gamepad). E or Esc
 * near either landing while slow steps off onto it. Landing at the other end earns `titicaca:ride:balsa`.
 *
 * One boat: it stays where it was left; when the traveler comes to the other landing while it is far away and
 * out of sight (> 70 u), the boatman has brought it over. The traveler stands on the deck pushing a long pole,
 * like the Uros punting through the reeds. The boat is a creatures body ("balsa"): solid while moored.
 *
 * Draw calls: the two landings and the hull are vertex-coloured meshes (three), the pole one more. Pure logic:
 * ./balsa/logic.ts; models: ./kit/totora.ts.
 */
import * as THREE from "three";
import { CATALOG } from "../../../lib/passport";
import type { Ambient, CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { decks } from "../../decks";
import { emit, on } from "../../events";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import { ride } from "../../suyu/ride";
import { LEVEL } from "../plan";
import {
  type Boat,
  canSail,
  type Dock,
  dockingEnd,
  docks as dockList,
  type End,
  earnsRideStamp,
  idleEnd,
  pierY,
  stepBoat,
} from "./balsa/logic";
import { Build, frameAt } from "./kit/build";
import { balsaBoat, REED } from "./kit/totora";

const T_BOARD: L = { es: "E · Subir a la balsa", en: "E · Board the reed boat" };
const T_LAND: L = { es: "E · Bajar aquí", en: "E · Get off here" };
const STAMP = "titicaca:ride:balsa";
/** Prompt radius round the boarding spot. */
const RANGE = 2;
/** Deck of the boat above the water (the traveler's feet while aboard). */
const DECK = LEVEL + 0.62;
/** Seconds of the hop aboard / ashore. */
const HOP = 0.55;

type Trip =
  | { kind: "moored"; end: End }
  | { kind: "boarding"; end: End; u: number }
  | { kind: "riding" }
  | { kind: "landing"; end: End; u: number };

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const lang = env.lang;
  const ds = dockList(env.heightAt(52, 9) + 0.05);
  const sailable = (x: number, z: number) => canSail(x, z, ds);
  const group = new THREE.Group();
  group.name = "titicaca-balsa";
  const mat = vertexToon();

  // ------------------------------------------------------------------ landings
  const unDeck: Array<() => void> = [];
  const pierMeshes: THREE.Mesh[] = [];
  for (const d of ds) {
    const b = new Build();
    const yaw = Math.atan2(d.dir[0], d.dir[1]);
    const len = Math.hypot(d.tip[0] - d.root[0], d.tip[1] - d.root[1]);
    b.frame = frameAt(d.root[0], 0, d.root[1], yaw);
    const yAt = (lz: number) => pierY(d, d.root[0] + d.dir[0] * lz, d.root[1] + d.dir[1] * lz);
    if (d.end === 0) {
      // Reed jetty: bundles like the boardwalk, posts at its end, a mooring post.
      const n = Math.ceil(len / 1.5);
      for (let i = 0; i < n; i++) {
        const lz = (i + 0.5) * (len / n);
        for (const lx of [-0.6, 0, 0.6])
          b.bundle(len / n + 0.3, 0.26, lx, yAt(lz) - 0.15, lz, i % 2 ? REED.straw : REED.dark, 0, 0, 0.62);
      }
      for (const lx of [-1.2, 1.2]) b.cyl(0.08, 0.09, 2.2, lx, -1, len - 0.3, REED.wood, 6);
    } else {
      // Wooden pier: planks across two stringers on posts, a stone footing on the shore.
      for (let lz = 0.2; lz < len; lz += 0.42)
        b.box(2.2, 0.08, 0.36, 0, yAt(lz) - 0.08, lz, lz % 1.26 < 0.42 ? "#8a5a35" : "#9a6a40");
      for (const lx of [-0.8, 0.8]) {
        b.box(0.16, 0.18, len, lx, Math.min(yAt(0), yAt(len)) - 0.3, len / 2, "#5e3b22");
        for (let lz = 1.5; lz < len; lz += 3) b.cyl(0.1, 0.12, 2.2, lx * 1.2, yAt(lz) - 2.1, lz, "#5e3b22", 6);
      }
      b.box(3, 0.7, 2, 0, yAt(0) - 0.75, -0.4, "#8f877b");
    }
    // Mooring post with a coil of rope at the tip.
    b.cyl(0.12, 0.14, 1.1, 0.7, yAt(len) - 0.3, len - 0.6, REED.wood, 6);
    b.cyl(0.22, 0.22, 0.08, -0.6, yAt(len) - 0.04, len - 0.9, "#b89a62", 10);
    b.frame = null;
    const g = b.build();
    if (g) {
      const m = new THREE.Mesh(g, mat);
      m.name = `titicaca-pier-${d.end}`;
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      pierMeshes.push(m);
    }
    unDeck.push(
      decks.add({
        shape: {
          kind: "obox",
          x: (d.root[0] + d.tip[0]) / 2,
          z: (d.root[1] + d.tip[1]) / 2,
          yaw,
          halfW: d.halfW,
          halfD: len / 2 + 0.2,
        },
        y: (x, z) => pierY(d, x, z),
        id: `balsa-pier-${d.end}`,
      }),
    );
  }

  // ------------------------------------------------------------------ the boat and its pole
  const hull = new THREE.Group();
  hull.name = "titicaca-balsa-hull";
  {
    const b = new Build();
    balsaBoat(b, 1, true);
    const g = b.build();
    if (g) {
      const m = new THREE.Mesh(g, mat);
      m.name = "titicaca-balsa:hull";
      m.castShadow = true;
      hull.add(m);
    }
  }
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 4.6, 5).translate(0, -1.6, 0),
    env.toon("#7a5233"),
  );
  pole.name = "titicaca-balsa:pole";
  hull.add(pole);
  group.add(hull);
  env.scene.add(group);
  const body = creatures.add("balsa", 1.6, { give: 0.2 });

  // ------------------------------------------------------------------ state
  const entry = CATALOG.find((s) => s.id === STAMP);
  let stamped = false;
  let trip: Trip = { kind: "moored", end: 0 };
  let boat: Boat = { x: ds[0].moor.x, z: ds[0].moor.z, yaw: ds[0].moor.yaw, v: 0, w: 0 };
  let boardedAt: End = 0;
  let at: End = 0;
  let modal = 0;
  let game = false;
  let near = false;
  let dock: End | null = null;
  let punt = 0;
  const offs = [
    on("world:modal", (d) => {
      modal = Math.max(0, modal + (d?.open ? 1 : -1));
    }),
    on("world:game", (d) => {
      game = !!d?.open;
    }),
  ];
  const moorAt = (end: End) => {
    const d = ds[end] as Dock;
    boat = { x: d.moor.x, z: d.moor.z, yaw: d.moor.yaw, v: 0, w: 0 };
    at = end;
  };
  const standY = (d: Dock) => pierY(d, d.stand.x, d.stand.z);
  /** Where the rider stands on the deck: a little aft of the middle. */
  const deckSpot = () => ({ x: boat.x - Math.sin(boat.yaw) * 0.9, z: boat.z - Math.cos(boat.yaw) * 0.9 });
  /** The traveler's feet (last frame) and where the hop aboard starts. */
  const feet = new THREE.Vector3();
  const from = { x: 0, y: 0, z: 0 };

  const land = (end: End) => {
    const d = ds[end] as Dock;
    ride.pose.x = d.stand.x;
    ride.pose.y = standY(d);
    ride.pose.z = d.stand.z;
    ride.pose.yaw = Math.atan2(-d.dir[0], -d.dir[1]);
    ride.active = false;
    emit("world:mount", { riding: false, speedMul: 1, seatHeight: 0 });
    at = end;
    if (!stamped && entry && earnsRideStamp(boardedAt, end)) {
      stamped = true;
      emit("world:stamp", { id: entry.id, kind: entry.kind, label: entry.label });
    }
  };

  return {
    update(dtIn, avatar, t) {
      const dt = Math.min(dtIn, 0.05);
      feet.copy(avatar);
      if (trip.kind === "riding") {
        const intent = modal > 0 || game ? { x: 0, z: 0, running: false } : ride.intent;
        boat = stepBoat(boat, intent, dt, sailable);
        if (Math.abs(boat.v) > 0.15 || Math.hypot(intent.x, intent.z) > 0.1) punt += dt * (1 + Math.abs(boat.v) * 0.3);
        const s = deckSpot();
        ride.pose.x = s.x;
        ride.pose.y = DECK;
        ride.pose.z = s.z;
        ride.pose.yaw = boat.yaw;
      } else if (trip.kind === "boarding" || trip.kind === "landing") {
        trip.u = Math.min(1, trip.u + dt / HOP);
        const s = deckSpot();
        const d = ds[trip.end] as Dock;
        const a = trip.kind === "boarding" ? from : { x: s.x, y: DECK, z: s.z };
        const bpt =
          trip.kind === "boarding" ? { x: s.x, y: DECK, z: s.z } : { x: d.stand.x, y: standY(d), z: d.stand.z };
        const u = trip.u;
        ride.pose.x = a.x + (bpt.x - a.x) * u;
        ride.pose.z = a.z + (bpt.z - a.z) * u;
        // A little hop arc.
        ride.pose.y = a.y + (bpt.y - a.y) * u + Math.sin(u * Math.PI) * 0.45;
        ride.pose.yaw = trip.kind === "boarding" ? boat.yaw : Math.atan2(bpt.x - a.x, bpt.z - a.z);
        if (u >= 1) {
          if (trip.kind === "boarding") trip = { kind: "riding" };
          else {
            const end = trip.end;
            trip = { kind: "moored", end };
            land(end);
          }
        }
      } else {
        // Moored: maybe the boatman brings it to the landing the traveler walks up to.
        const d0 = Math.hypot(avatar.x - ds[0].stand.x, avatar.z - ds[0].stand.z);
        const d1 = Math.hypot(avatar.x - ds[1].stand.x, avatar.z - ds[1].stand.z);
        const want = idleEnd({ at, d0, d1, dBoat: Math.hypot(avatar.x - boat.x, avatar.z - boat.z) });
        if (want !== at) {
          moorAt(want);
          trip = { kind: "moored", end: want };
        }
      }

      // Hull on the water: a gentle bob and roll (still with reduced motion), a slight pitch when punting.
      const rm = env.reducedMotion;
      const bob = rm ? 0 : Math.sin(t * 1.2 + boat.x * 0.1) * 0.04;
      hull.position.set(boat.x, LEVEL - 0.08 + bob, boat.z);
      hull.rotation.set(
        rm ? 0 : Math.sin(t * 0.8) * 0.012 - boat.v * 0.004,
        boat.yaw,
        rm ? 0 : Math.sin(t * 0.9 + 1) * 0.02,
      );
      // The pole: pushed down astern while riding (a slow punting stroke), stowed along the deck otherwise.
      if (trip.kind === "riding") {
        const k = (punt % 2) / 2;
        const sw = rm ? 0.3 : Math.sin(k * Math.PI * 2);
        pole.position.set(-0.55, 2.4, -0.9 - sw * 0.6);
        pole.rotation.set(0.3 + sw * 0.35, 0, 0.12);
      } else {
        pole.position.set(0.55, 0.85, 1.6);
        pole.rotation.set(Math.PI / 2 - 0.05, 0, 0);
      }
      body.x = boat.x;
      body.z = boat.z;
      body.solid = trip.kind === "moored";

      dock = trip.kind === "riding" ? dockingEnd(boat, ds) : null;
      near = false;
      if (trip.kind === "moored") {
        const d = ds[at] as Dock;
        near = Math.hypot(avatar.x - d.stand.x, avatar.z - d.stand.z) <= RANGE && Math.abs(avatar.y - standY(d)) < 0.7;
      }
      // Far from both landings and the boat: hide the landings' details.
      const cam = env.camera.position;
      ds.forEach((d, i) => {
        const m = pierMeshes[i];
        if (m) m.visible = (cam.x - d.tip[0]) ** 2 + (cam.z - d.tip[1]) ** 2 < 260 ** 2;
      });
    },
    prompt() {
      if (modal > 0 || game) return null;
      if (trip.kind === "riding") return dock !== null ? T_LAND[lang] : null;
      return near ? T_BOARD[lang] : null;
    },
    interact() {
      if (modal > 0 || game) return false;
      if (trip.kind === "riding") {
        const end = dockingEnd(boat, ds);
        if (end === null) return false;
        // Glide alongside, then hop ashore.
        const d = ds[end] as Dock;
        boat = { ...boat, x: d.moor.x, z: d.moor.z, yaw: d.moor.yaw, v: 0, w: 0 };
        trip = { kind: "landing", end, u: 0 };
        return true;
      }
      if (trip.kind !== "moored" || !near) return false;
      boardedAt = at;
      from.x = ride.pose.x = feet.x;
      from.z = ride.pose.z = feet.z;
      from.y = ride.pose.y = feet.y;
      ride.pose.yaw = boat.yaw;
      ride.active = true;
      trip = { kind: "boarding", end: at, u: 0 };
      emit("world:mount", { riding: true, speedMul: 1, seatHeight: 0, vehicle: "balsa" });
      return true;
    },
    escape() {
      if (trip.kind !== "riding" || modal > 0 || game) return false;
      const end = dockingEnd(boat, ds);
      if (end === null) return false;
      const d = ds[end] as Dock;
      boat = { ...boat, x: d.moor.x, z: d.moor.z, yaw: d.moor.yaw, v: 0, w: 0 };
      trip = { kind: "landing", end, u: 0 };
      return true;
    },
    dispose() {
      for (const off of offs) off();
      if (ride.active) {
        ride.active = false;
        emit("world:mount", { riding: false, speedMul: 1, seatHeight: 0 });
      }
      creatures.remove(body);
      for (const u of unDeck) u();
      for (const m of pierMeshes) m.geometry.dispose();
      hull.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      mat.dispose();
      group.removeFromParent();
    },
  };
};
