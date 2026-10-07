/**
 * The canoe (river shortcut between the embarcadero and the palafitos, CANOE_STRETCH): a dugout carved from
 * one trunk, with its paddle, moored beside a floating balsa jetty at the foot of steep bank stairs; a level
 * plank pier joins the stairs to the station's flat apron. The pier, the stair treads and the jetty are raised
 * decks at their real heights (../../decks.ts via station.ts addDeck), so the traveler walks down to the
 * jetty. "E · Subir a la canoa" on the jetty boards it: a short step into the canoe (`world:mount {riding,
 * vehicle: "canoe"}` + the runtime's ride hook, ../ride.ts), and the canoe paddles itself down the river along
 * `layout.canoe.path` at an easy pace; forward (W / joystick toward the bow) paddles faster, back (S) slower,
 * never reversing. At the far landing the traveler steps out onto that jetty (the ride pose's height is the
 * jetty's, so the runtime lands them on its deck), the mount ends and `selva:ride:canoe` is stamped (once);
 * the stairs lead back up. The trip works both ways. There is no getting off mid-river: E and Esc do nothing.
 *
 * One canoe: it stays where it was left, and when the traveler nears the other landing while the canoe is far
 * out of sight (> 70 u), the boatman brings it over, so whichever landing you reach has it waiting.
 * The canoe is a creatures body ("canoe"): solid while moored, not while ridden (it is part of the traveler).
 *
 * Draw calls: the two piers (one vertex-colored mesh each), the hull and the paddle (one each), all on one
 * shared vertex-toon material. Pure logic (route, speed, docks, trip states): ./canoe/logic.ts.
 */
import * as THREE from "three";
import { CATALOG } from "../../../lib/passport";
import type { CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { emit, on } from "../../events";
import { Kit, rng } from "../../props";
import { CANOE_STRETCH, type SelvaEnv } from "../contract";
import { ride } from "../ride";
import {
  alongPath,
  angleLerp,
  boardPath,
  buildRoute,
  type DockGeo,
  dockGeo,
  idleEnd,
  type P3,
  paddleSpeed,
  pierPlan,
  routeAt,
  standPoint,
  stepTrip,
  type Trip,
  yawOf,
} from "./canoe/logic";
import {
  A,
  bake,
  balsaRaft,
  deck,
  disposeTree,
  dugout,
  railing,
  stairs,
  stairY,
  stationMaterial,
  stilt,
} from "./embarcadero/amazon";
import { addDeck, type Frame } from "./embarcadero/station";

const T_BOARD: L = { es: "E · Subir a la canoa", en: "E · Board the canoe" };
const STAMP = "selva:ride:canoe";
/** Prompt radius around the boarding spot on the jetty. */
const RANGE = 1.7;
/** Hull length/beam/depth. The rider sits a little aft of the middle, facing the bow. */
const HULL = { len: 4.6, w: 0.95, h: 0.45 };
const RIDER_AFT = 0.55;
/** Feet height below the river surface so the hips rest on the aft thwart (avatar hip pivot ≈ 0.56). */
const FEET_BELOW = 0.3;

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SelvaEnv;
  const lang = env.lang;
  const L = env.selva.layout;
  const level = L.river.level;
  const route = buildRoute(L.canoe.path);
  const pts = route.pts;
  const docks: [DockGeo, DockGeo] = [
    dockGeo(L, CANOE_STRETCH.fromStation, pts[0] as [number, number], 0),
    dockGeo(L, CANOE_STRETCH.toStation, pts[pts.length - 1] as [number, number], 1),
  ];
  const mat = stationMaterial();
  const root = new THREE.Group();
  root.name = "selva-canoe";
  env.scene.add(root);

  // ------------------------------------------------------------------ piers (one per landing)
  const unDeck: Array<() => void> = [];
  const pierGroups = docks.map((d) => {
    const rand = rng(0xca0e + d.end);
    const kit = new Kit(env);
    const g = new THREE.Group();
    g.name = `selva-pier-${d.station}`;
    g.position.set(d.head.x, d.y, d.head.z);
    g.rotation.y = Math.atan2(d.dir.x, d.dir.z);
    // Local frame: +Z out over the river, origin at the pier head, y 0 = apron height.
    const fr: Frame = { x: d.head.x, z: d.head.z, y: d.y, yaw: g.rotation.y, cos: 0, sin: 0 };
    fr.cos = Math.cos(fr.yaw);
    fr.sin = Math.sin(fr.yaw);
    const ground = (lx: number, lz: number) =>
      env.heightAt(d.head.x + lx * fr.cos + lz * fr.sin, d.head.z - lx * fr.sin + lz * fr.cos) - d.y;
    const P = pierPlan(d, level);
    const water = level - d.y;
    const stairA: [number, number] = [0, P.stairTop];
    const stairB: [number, number] = [0, P.foot - 0.2];
    // Level pier from the plaza to the stair top, on stilts down to the apron and the bank lip.
    deck(kit, rand, { x0: -0.75, x1: 0.75, z0: P.back, z1: P.stairTop, y: P.deckY, along: "x", joists: true });
    for (const z of [P.stairTop - 0.1, P.back * 0.5, P.back + 0.2])
      for (const x of [-0.7, 0.7]) stilt(kit, x, z, Math.min(ground(x, z), 0) - 1.2, P.deckY - 0.08, 0.07);
    stairs(kit, stairA, P.deckY, stairB, P.stairFootY, 1.2);
    // Stair posts down the bank and a handrail on the upstream side.
    for (let k = 0.2; k < 1; k += 0.27) {
      const z = P.stairTop + (stairB[1] - P.stairTop) * k;
      const y = P.deckY + (P.stairFootY - P.deckY) * k;
      stilt(kit, -0.62, z, Math.min(ground(-0.62, z), y) - 0.8, y - 0.1, 0.06);
      stilt(kit, 0.62, z, Math.min(ground(0.62, z), y) - 0.8, y - 0.1, 0.06);
    }
    railing(
      kit,
      [-0.66, P.stairTop],
      [-0.66, stairB[1] - 0.1],
      (_x, z) => P.deckY + ((P.stairFootY - P.deckY) * (z - P.stairTop)) / (stairB[1] - P.stairTop) - 0.05,
    );
    // Floating balsa jetty and its mooring posts.
    balsaRaft(kit, rand, { x0: -P.jetty.halfW, x1: P.jetty.halfW, z0: P.jetty.z0, z1: P.jetty.z1, y: P.jettyY });
    for (const x of [-1.25, 1.25]) kit.cyl(0.08, 0.1, 1.9, x, water - 1.2, P.foot + 1.45, A.woodDark, 6);
    // A bollard and a coil of rope at the stair top.
    kit.cyl(0.1, 0.12, 0.45, 0.55, P.deckY - 0.04, 0.45, A.woodDark, 6);
    kit.cyl(0.18, 0.18, 0.06, -0.45, P.deckY - 0.02, 0.35, A.rope, 10);
    g.add(bake(kit, `selva-pier-${d.station}`, mat));
    root.add(g);
    // Raised decks: the pier (its root overlaps the plaza, stepped onto from it), the treads, the jetty.
    unDeck.push(
      addDeck(fr, -0.75, P.back - 0.3, 0.75, P.stairTop, P.deckY, `canoe-pier-${d.end}`),
      addDeck(fr, -0.6, P.stairTop, 0.6, stairB[1], stairY(stairA, P.deckY, stairB, P.stairFootY)),
      addDeck(fr, -P.jetty.halfW, P.jetty.z0, P.jetty.halfW, P.jetty.z1, P.jettyY, `canoe-jetty-${d.end}`),
    );
    return g;
  });

  // ------------------------------------------------------------------ canoe + paddle
  const canoe = new THREE.Group();
  canoe.name = "selva-canoe-hull";
  {
    const kit = new Kit(env);
    dugout(kit, { x: 0, y: 0, z: 0, len: HULL.len, w: HULL.w, h: HULL.h, thwarts: 3 });
    // A carved bow knob and a line of paint along the gunwale.
    kit.cyl(0.05, 0.07, 0.18, 0, HULL.h * 0.75 + 0.04, HULL.len / 2 - 0.1, A.woodDark, 6);
    kit.box(0.04, 0.05, HULL.len * 0.6, HULL.w * 0.43, HULL.h * 0.62, 0, A.achiote);
    kit.box(0.04, 0.05, HULL.len * 0.6, -HULL.w * 0.43, HULL.h * 0.62, 0, A.achiote);
    canoe.add(bake(kit, "selva-canoe-hull", mat));
  }
  const paddle = new THREE.Group();
  {
    const kit = new Kit(env);
    kit.cyl(0.025, 0.025, 1.45, 0, -0.95, 0, A.plank, 5);
    kit.box(0.04, 0.5, 0.2, 0, -1.15, 0, A.wood);
    kit.box(0.12, 0.06, 0.05, 0, 0.47, 0, A.woodDark);
    paddle.add(bake(kit, "selva-canoe-paddle", mat));
  }
  canoe.add(paddle);
  root.add(canoe);
  const body = creatures.add("canoe", 1.1, { give: 0.2 });

  /** Moored pose at a landing: alongside the jetty, bow along the route. */
  const tmp = { x: 0, z: 0, tx: 1, tz: 0 };
  const mooredPose = (end: 0 | 1) => {
    const p = routeAt(route, end === 0 ? 0 : route.length, tmp);
    return { x: p.x, z: p.z, yaw: end === 0 ? yawOf(p.tx, p.tz) : yawOf(-p.tx, -p.tz) };
  };
  let at: 0 | 1 = 0;
  let trip: Trip = { kind: "moored", end: 0 };
  let cx = 0;
  let cz = 0;
  let cyaw = 0;
  const placeMoored = (end: 0 | 1) => {
    const m = mooredPose(end);
    cx = m.x;
    cz = m.z;
    cyaw = m.yaw;
    at = end;
  };
  placeMoored(0);

  const entry = CATALOG.find((s) => s.id === STAMP);
  let stamped = false;
  let modal = 0;
  let game = false;
  let near = -1;
  let stroke = 0;
  const offs = [
    on("world:modal", (d) => {
      modal = Math.max(0, modal + (d?.open ? 1 : -1));
    }),
    on("world:game", (d) => {
      game = !!d?.open;
    }),
  ];

  const seatOf = (x: number, z: number, yaw: number): [number, number] => [
    x - Math.sin(yaw) * RIDER_AFT,
    z - Math.cos(yaw) * RIDER_AFT,
  ];
  /** Boarding / landing spot on each jetty (feet height = the jetty's deck). */
  const stands = docks.map((d) => standPoint(d, level)) as [P3, P3];
  /** The step between `from` (on the jetty) and the seat of the canoe moored at `end`. */
  const walkFor = (end: 0 | 1, from: P3 = stands[end]): P3[] => {
    const m = mooredPose(end);
    const [sx, sz] = seatOf(m.x, m.z, m.yaw);
    return boardPath(from, [sx, level - FEET_BELOW, sz]);
  };
  let walk: P3[] = walkFor(0);
  const feet = new THREE.Vector3();

  const board = () => {
    trip = { kind: "boarding", end: at, u: 0 };
    walk = walkFor(at, [feet.x, feet.y, feet.z]);
    const d = docks[at];
    ride.pose.x = feet.x;
    ride.pose.y = feet.y;
    ride.pose.z = feet.z;
    ride.pose.yaw = Math.atan2(d.dir.x, d.dir.z);
    ride.active = true;
    emit("world:mount", { riding: true, speedMul: 1, seatHeight: 0, vehicle: "canoe" });
  };
  const land = (end: 0 | 1) => {
    const d = docks[end];
    const p = stands[end];
    ride.pose.x = p[0];
    ride.pose.y = p[1];
    ride.pose.z = p[2];
    ride.pose.yaw = Math.atan2(-d.dir.x, -d.dir.z);
    ride.active = false;
    emit("world:mount", { riding: false, speedMul: 1, seatHeight: 0 });
    if (!stamped && entry) {
      stamped = true;
      emit("world:stamp", { id: entry.id, kind: entry.kind, label: entry.label });
    }
  };

  const followWalk = (u: number, reverse: boolean) => {
    const p = alongPath(walk, reverse ? 1 - u : u);
    const q = alongPath(walk, Math.min(1, Math.max(0, (reverse ? 1 - u : u) + (reverse ? -0.04 : 0.04))));
    const dx = q[0] - p[0];
    const dz = q[2] - p[2];
    ride.pose.x = p[0];
    ride.pose.y = p[1];
    ride.pose.z = p[2];
    if (Math.hypot(dx, dz) > 1e-3) ride.pose.yaw = angleLerp(ride.pose.yaw, Math.atan2(dx, dz), 0.25);
    // The last stretch turns to face the bow (boarding) or the pier (landing is handled by the path).
    if (!reverse && u > 0.85) ride.pose.yaw = angleLerp(ride.pose.yaw, cyaw, 0.2);
  };

  return {
    update(dt, avatar, t) {
      dt = Math.min(dt, 0.05);
      feet.copy(avatar);
      const prev = trip;
      if (trip.kind === "riding") {
        const p = routeAt(route, trip.s, tmp);
        const dirX = p.tx * trip.dir;
        const dirZ = p.tz * trip.dir;
        const want = paddleSpeed({
          intentX: ride.intent.x,
          intentZ: ride.intent.z,
          running: ride.intent.running,
          dirX,
          dirZ,
          sinceStart: trip.dir === 1 ? trip.s : route.length - trip.s,
          toGo: trip.dir === 1 ? route.length - trip.s : trip.s,
        });
        trip = stepTrip(trip, dt, route.length, want);
      } else trip = stepTrip(trip, dt, route.length);

      if (prev.kind === "riding" && trip.kind === "landing") {
        placeMoored(trip.end);
        walk = walkFor(trip.end);
      }
      if (prev.kind === "landing" && trip.kind === "moored") land(trip.end);

      // Canoe and rider poses per state.
      if (trip.kind === "riding") {
        const p = routeAt(route, trip.s, tmp);
        cx = p.x;
        cz = p.z;
        const head = trip.dir === 1 ? yawOf(p.tx, p.tz) : yawOf(-p.tx, -p.tz);
        // Turning around at the start of a return trip takes a few seconds, not a frame.
        cyaw = angleLerp(cyaw, head, Math.min(1, dt * 1.4));
        const [sx, sz] = seatOf(cx, cz, cyaw);
        ride.pose.x = sx;
        ride.pose.y = level - FEET_BELOW;
        ride.pose.z = sz;
        ride.pose.yaw = cyaw;
        stroke += dt * (1.4 + trip.speed * 0.45);
      } else if (trip.kind === "boarding") followWalk(trip.u, false);
      else if (trip.kind === "landing") followWalk(trip.u, true);
      else {
        // Moored: maybe the boatman brings the canoe to the landing the traveler is heading for.
        const d0 = Math.hypot(avatar.x - docks[0].head.x, avatar.z - docks[0].head.z);
        const d1 = Math.hypot(avatar.x - docks[1].head.x, avatar.z - docks[1].head.z);
        const want = idleEnd({ at, d0, d1, dCanoe: Math.hypot(avatar.x - cx, avatar.z - cz) });
        if (want !== at) {
          placeMoored(want);
          trip = { kind: "moored", end: want };
        }
      }

      // Hull on the water: gentle bob and roll (still on reduced motion).
      const bob = env.reducedMotion ? 0 : Math.sin(t * 1.3 + cx * 0.1) * 0.03;
      canoe.position.set(cx, level - HULL.h * 0.25 + bob, cz);
      canoe.rotation.set(0, cyaw, 0);
      if (!env.reducedMotion) canoe.rotation.z = Math.sin(t * 0.9) * 0.025;
      // Paddle: lies across the thwarts when idle; alternate-side strokes while riding.
      if (trip.kind === "riding") {
        const side = Math.sin(stroke * 0.5) >= 0 ? 1 : -1;
        const sw = Math.sin(stroke * Math.PI);
        paddle.position.set(side * 0.18, HULL.h + 0.55, -RIDER_AFT + 0.35);
        paddle.rotation.set(-0.35 + sw * (env.reducedMotion ? 0.15 : 0.55), 0, side * 0.45);
      } else {
        paddle.position.set(0, HULL.h * 0.75 + 0.05, 0.4);
        paddle.rotation.set(Math.PI / 2, 0, 0);
      }
      body.x = cx;
      body.z = cz;
      body.solid = trip.kind === "moored";

      near = -1;
      if (trip.kind === "moored") {
        // On the jetty (not on the bank above it).
        const p = stands[at];
        if (Math.hypot(avatar.x - p[0], avatar.z - p[2]) <= RANGE && Math.abs(avatar.y - p[1]) < 0.6) near = at;
      }
      // Far from both landings and the canoe: hide the piers' details (cheap distance cull).
      const cam = env.camera.position;
      for (let i = 0; i < 2; i++) {
        const d = docks[i] as DockGeo;
        (pierGroups[i] as THREE.Group).visible = (cam.x - d.head.x) ** 2 + (cam.z - d.head.z) ** 2 < 200 ** 2;
      }
    },
    prompt() {
      if (modal > 0 || game || near < 0) return null;
      return T_BOARD[lang];
    },
    interact() {
      if (trip.kind !== "moored" || near < 0 || modal > 0 || game) return false;
      board();
      return true;
    },
    escape() {
      // No getting off mid-river; Esc stays with whatever panel wants it.
      return false;
    },
    dispose() {
      for (const off of offs) off();
      if (ride.active) {
        ride.active = false;
        emit("world:mount", { riding: false, speedMul: 1, seatHeight: 0 });
      }
      creatures.remove(body);
      for (const off of unDeck) off();
      disposeTree(root);
      mat.dispose();
    },
  };
};
