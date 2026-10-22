/**
 * Guacamayos: the macaws and parrots of the Antisuyu, by day.
 *  - Flyovers: noisy pairs and small flocks (two to three pairs, partners wingtip to wingtip) of scarlet
 *    (Ara macao) and blue-and-yellow macaws (Ara ararauna) cross the river and the road high above the
 *    canopy, a little ahead of the traveler, every half minute or so.
 *  - Emergent snags: two dead emergent trees stand over the forest (one on the river side between the
 *    embarcadero and the palafitos, one past the canopy walkway); a few pairs perch on their bare limbs,
 *    preening each other and turning their heads to watch. They take off when the traveler comes close and
 *    are back later (only while nobody is looking).
 *  - The collpa: the clay cliff across the river from the collpa viewpoint (geometry from ./collpa/spot.ts) is
 *    busy all day, fullest in the morning (collpaPresence in ./wild/logic.ts: 100 % from first light to
 *    ≈ 11 h, about 70 % through the afternoon, empty at night). A mixed flock of 48 birds (30 on low quality,
 *    collpaRoster): scarlet, blue-and-yellow, red-and-green (Ara chloropterus) and chestnut-fronted macaws
 *    (Ara severus) in pairs, mealy amazons (Amazona farinosa) in pairs, and tight little flocks of blue-headed
 *    parrots (Pionus menstruus), dusky-headed (Aratinga weddellii) and white-eyed parakeets (Psittacara
 *    leucophthalmus). Groups keep arriving over the cliff top or along the river, swoop out over the water
 *    and flare onto the clay; each bird stays a minute or two (biting the clay with a head bob, looking
 *    around, hopping along the wall with a flutter, squabbling with a neighbour, wings beating in place)
 *    and leaves with its partner or flock. Some sit upright on the green lip at the top of the cliff or on
 *    the fallen clay at the waterline, and a few pairs always circle over the river in front of the wall.
 *    Every minute or two (every few minutes with reduced motion) the whole flock panics, wheels out over the
 *    river and comes back to the wall. While the traveler is far away the wall is filled (and emptied)
 *    directly, so it is already crowded on arrival.
 * At night they roost: the snag birds sleep on their perches, the flyovers and the collpa flock are gone.
 *
 * Rendering: the shared animal core (wild/beasts.ts): one instanced flock per species (eight, each bird at
 * its own size: the collpa birds larger than life to read across the river) → ≤ 8 flocks (one draw per LOD in
 * use each, frustum-culled), plus one static mesh per snag (drawn within ~260 u). Species "macaw" in its
 * scarlet, blue-and-yellow and red-and-green coats and in the greens of the chestnut-fronted macaw and the
 * two long-tailed parakeets; species "parrot" (mealy, blue-headed) for the amazons. The flight state machine
 * takes the world's flight paths (height above the ground or the water, vertical speed); biting the clay is
 * the "graze" peck, a squabble a "shake".
 * Bodies ("guacamayo", creatures.ts): listed for the soundscape and queries, never solid (they live in the air,
 * on the snags and on the wall).
 * Stamp `selva:fauna:guacamayo` after a ~1.5 s good look: within ~34 u at the collpa (the wall is across
 * the river), ~26 u at the snags, ~30 u for a flyover overhead.
 */
import * as THREE from "three";
import {
  type Flight,
  flightEase,
  flightPoint,
  flightTangent,
  newFlight,
  planFlight,
  type Vec,
} from "../../ambient/birds/sim";
import { bpal } from "../../characters/animals/species/birds";
import type { Ambient, CreateAmbient } from "../../contract";
import { type Body, creatures, PARKED, park } from "../../creatures";
import { on } from "../../events";
import { GeoBuilder } from "../../flora/geom";
import { collpaCliff } from "./collpa/spot";
import { createBeasts } from "./wild/beasts";
import { FOLDED } from "./wild/birds";
import { devHook, idle, SiteProps, Spotter, selvaOf } from "./wild/kit";
import {
  type CollpaSpecies,
  collpaPresence,
  collpaRoster,
  damp,
  diurnal,
  rng,
  roadFrame,
  TAU,
  treeSites,
  turnToward,
  type WallSpot,
  wallSpotClear,
  wrapAngle,
} from "./wild/logic";
import { type HostTree, limbPoint, snag } from "./wild/trees";

type Mode = "away" | "perch" | "cling" | "fly" | "circle";
type Home = "flyover" | "snag" | "collpa";
/** Where a collpa bird sits: on the clay face, on the green lip at the top, or on the talus at the water. */
type Zone = "clay" | "lip" | "talus";
/** Collpa behaviour while on the wall. */
type Act = "bite" | "look" | "hop" | "squab";
/** Flight easing per leg: linear, in-out, ease-out (landing), ease-in (take-off). */
type Curve = 0 | 1 | 2 | 3;

/** Parrots and parakeets on the shared macaw body (palettes: back, head, bill, legs, belly, coverts, flight…). */
const green = (head: string, o: Partial<Parameters<typeof bpal>[0]> = {}) =>
  bpal({
    back: "#3f9a3a",
    head,
    bill: "#2a2420",
    legs: "#5a5048",
    belly: "#6ab84a",
    coverts: "#3f9a3a",
    flight: "#2a5ab0",
    tail: "#3f9a3a",
    face: head,
    accent: "#1e1a18",
    ...o,
  });

/**
 * Species: the core species ("macaw", "parrot"), its coat and the instance scale. A little larger than life so the flock reads
 * across the river at the collpa (~27 u); the small parrots are exaggerated more but stay clearly smaller than
 * the macaws.
 */
const SPECIES: ReadonlyArray<{
  key: CollpaSpecies;
  /** Core species: the macaws and the long-tailed parakeets on the macaw body, the amazons on the parrot. */
  body: "macaw" | "parrot";
  coat: string | readonly string[];
  scale: number;
  /** Room a bird keeps on the wall (half its folded span, in the old models' scale). */
  room: number;
}> = [
  { key: "scarlet", body: "macaw", coat: "scarlet", scale: 1.45, room: 1.45 },
  { key: "blue", body: "macaw", coat: "blue-yellow", scale: 1.45, room: 1.45 },
  { key: "redgreen", body: "macaw", coat: "red-green", scale: 1.5, room: 1.5 },
  // Chestnut-fronted macaw (Ara severus): green, a chestnut forehead, red under the wing.
  {
    key: "chestnut",
    body: "macaw",
    coat: green("#4a8a3a", { face: "#f2ece0", collar: "#7a3a1e", accent: "#1e1a18" }),
    scale: 1.0,
    room: 1.0,
  },
  // The amazon parrots on the core's parrot (mealy amazon, blue-headed parrot).
  { key: "mealy", body: "parrot", coat: "mealy", scale: 1.5, room: 1.2 },
  { key: "bluehead", body: "parrot", coat: "blue-headed", scale: 1.25, room: 1.05 },
  // Dusky-headed parakeet: green, a grey-brown head.
  { key: "dusky", body: "macaw", coat: green("#7a7066", { flight: "#2a4a8a" }), scale: 0.55, room: 1.0 },
  // White-eyed parakeet: green, red flecks on the head and under the wing.
  {
    key: "whiteeye",
    body: "macaw",
    coat: green("#3f9a3a", { face: "#c8302a", flight: "#c8b030" }),
    scale: 0.55,
    room: 1.0,
  },
];
const SP = (k: CollpaSpecies) => SPECIES.findIndex((s) => s.key === k);
/**
 * Extra size at the collpa only: the wall is seen from across the river (~27 u), where life size makes even a
 * macaw a sliver of a few pixels. The snag and flyover macaws are seen closer and keep the base scale.
 */
const COLLPA_BOOST = 1.35;

interface Macaw extends WallSpot {
  sp: number;
  home: Home;
  mode: Mode;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  bank: number;
  f: Flight;
  curve: Curve;
  /** What happens when the flight ends. */
  next: Mode;
  /** Chained second leg (arrivals, departures, the panic loop) and its easing. */
  leg2: Flight | null;
  curve2: Curve;
  timer: number;
  headYaw: number;
  headPitch: number;
  headT: number;
  wing: number;
  fold: number;
  flap: number;
  /** Perch: snag index + limb + position along it. */
  tree: number;
  limb: number;
  lu: number;
  /** Partner index (−1 none) for snag and flyover pairs. */
  mate: number;
  /** Collpa: group index, spot zone, yaw offset from facing the wall, time left on the wall (or circling). */
  group: number;
  zone: Zone;
  yawOff: number;
  dwell: number;
  act: Act;
  actT: number;
  /** Hop: previous spot and progress 0..1; squabble: the other bird. */
  hu: number;
  hv: number;
  hopT: number;
  foe: number;
  /** Circling over the river: centre, radius, angle, angular speed, height. */
  ccx: number;
  ccz: number;
  cr: number;
  ca: number;
  cw: number;
  cy: number;
  /** Index in its flock (wild/beasts.ts), last height and vertical speed (flight state), last act shown. */
  k: number;
  py: number;
  vy: number;
  lastAct: Act;
  body: Body;
}

const SPEED = 9;
/** Body pitch clinging to the clay: nearly upright, belly to the wall, the long tail hanging below. */
const CLING_PITCH = -1.15;
/**
 * Favourite patches of the clay (u across the face, v as a fraction of the clay band): most birds crowd
 * around these, as at a real collpa, instead of spreading thinly over the whole face.
 */
const HOT: ReadonlyArray<readonly [number, number]> = [
  [-0.52, 0.4],
  [0.04, 0.55],
  [0.5, 0.35],
];

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const lv = L.river.level;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const R = rng(7717);

  // ---- the collpa wall (built by the collpa station; we only read its geometry)
  const cliff = collpaCliff(L);
  const clay = cliff.clayV;
  const halfW = cliff.width / 2;
  const faceH = cliff.top - cliff.base;
  const mid = cliff.point(0, 0.5);
  const n0 = cliff.normalAt(0);
  /** Along the wall (left ↔ right as seen from the viewpoint). */
  const tx = n0.z;
  const tz = -n0.x;
  const wallAt = (u: number, v: number, out: Vec, off = 0.14) => {
    const p = cliff.point(u, v);
    const n = cliff.normalAt(u);
    out.x = p.x + n.x * off;
    out.y = p.y;
    out.z = p.z + n.z * off;
    return out;
  };
  /** World position of a collpa bird's spot (clay face, the overhang lip, or the talus at the water). */
  const spotAt = (m: Macaw, out: Vec, lift = 0) => {
    if (m.zone === "clay") return wallAt(m.cu, m.cv, out, 0.14 + lift);
    // Lip boxes stand ~0.35 u proud of the face top, their tops ~0.3 u above it (collpa.ts buildCliff); the
    // talus blocks sit ~0.55–0.95 u out from the foot, their tops ~0.7–1 u above the face base.
    const lip = m.zone === "lip";
    const p = cliff.point(m.cu, lip ? 1 : 0);
    const n = cliff.normalAt(m.cu);
    const off = lip ? 0.5 : 0.8;
    out.x = p.x + n.x * off;
    out.z = p.z + n.z * off;
    out.y = lip ? cliff.top + 0.34 + lift : cliff.base + 0.98 + lift;
    return out;
  };

  // ---- emergent snags
  const snags: HostTree[] = [];
  /** One mesh per snag, drawn only near the camera (they stand above the canopy: a longer reach). */
  const props = new SiteProps(env, "selva-fauna-guacamayo-snags", 260);
  const snagSpots: Array<[number, number]> = [
    [0.5, 0.53],
    [0.895, 0.93],
  ];
  for (const [t0, t1] of snagSpots) {
    const s = treeSites(L, { t0, t1, n: 1, lat0: 12, lat1: 18, side: 1, gap: 4, seed: 31 + Math.round(t0 * 100) });
    const site = s[0];
    if (!site) continue;
    if (L.colliders.some((c) => c.kind === "circle" && Math.hypot(c.x - site.x, c.z - site.z) < c.r + 1.5)) continue;
    const builder = new GeoBuilder();
    snags.push(snag(builder, site.x, site.y, site.z, 24 + R() * 4, R));
    props.add(builder.build(), false);
  }

  // ---- population
  const roster = collpaRoster(high);
  const nSnag = snags.length * (high ? 4 : 2);
  const nFly = high ? 6 : 4;
  const birds: Macaw[] = [];
  const mk = (sp: number, home: Home): Macaw => ({
    sp,
    home,
    mode: "away",
    x: PARKED,
    y: 0,
    z: PARKED,
    yaw: 0,
    pitch: 0,
    bank: 0,
    f: newFlight(),
    curve: 1,
    next: "away",
    leg2: null,
    curve2: 1,
    timer: R() * 5,
    headYaw: 0,
    headPitch: 0,
    headT: R() * 2,
    wing: FOLDED,
    fold: 1,
    flap: R() * TAU,
    tree: 0,
    limb: 0,
    lu: 0.5,
    cu: 0,
    cv: 0,
    // Clearance about half the folded span (macaws sit ~0.9 u apart, parakeets ~0.55 u).
    rad: 0.32 * (SPECIES[sp]?.room ?? 1) * (home === "collpa" ? COLLPA_BOOST : 1),
    held: false,
    mate: -1,
    group: -1,
    zone: "clay",
    yawOff: 0,
    dwell: 0,
    act: "bite",
    actT: R() * 3,
    hu: 0,
    hv: 0,
    hopT: 1,
    foe: -1,
    ccx: 0,
    ccz: 0,
    cr: 6,
    ca: 0,
    cw: 1,
    k: 0,
    py: 0,
    vy: 0,
    lastAct: "look",
    cy: 0,
    body: creatures.add("guacamayo", 0.4, { solid: false, x: PARKED, z: PARKED }),
  });
  /** Collpa groups (member indices): pairs and little flocks that arrive and leave together. */
  const groups: number[][] = [];
  for (const g of roster) {
    const ids: number[] = [];
    for (let k = 0; k < g.size; k++) {
      const m = mk(SP(g.sp), "collpa");
      m.group = groups.length;
      ids.push(birds.length);
      birds.push(m);
    }
    groups.push(ids);
  }
  const nCollpa = birds.length;
  const SCARLET = SP("scarlet");
  const BLUE = SP("blue");
  for (let i = 0; i < nSnag; i++) {
    const b = mk(i % 4 >= 2 ? BLUE : SCARLET, "snag");
    b.tree = Math.floor(i / (high ? 4 : 2));
    b.mate = i % 2 === 0 ? birds.length + 1 : birds.length - 1;
    birds.push(b);
  }
  const flyStart = birds.length;
  for (let i = 0; i < nFly; i++) {
    // Flyover pairs share a species (macaws fly with their partner).
    const b = mk(Math.floor(i / 2) % 3 === 1 ? BLUE : SCARLET, "flyover");
    b.mate = i % 2 === 0 ? birds.length + 1 : birds.length - 1;
    birds.push(b);
  }
  // One flock per species at the collpa (drawn larger), one per species for the snags and flyovers.
  // One flock per species (the collpa birds drawn larger than the snag and flyover macaws).
  const sizes = SPECIES.map(() => 0);
  for (const b of birds) b.k = sizes[b.sp]!++;
  const sets = SPECIES.map((sp, i) => createBeasts(env, sp.body, sizes[i]!, { variants: [sp.coat], shadows: false }));
  const root = new THREE.Group();
  root.name = "selva-fauna-guacamayo";
  for (const s of sets) root.add(s.group);
  root.add(props.group);
  env.scene.add(root);

  const spot = new Spotter(env, "guacamayo", 26);
  const offDev = devHook("guacamayo", () => ({
    view: [cliff.view.x, cliff.view.z],
    wall: [mid.x, mid.z],
    snags: snags.map((t) => [+t.x.toFixed(1), +t.top.toFixed(1), +t.z.toFixed(1)]),
    counts: Object.fromEntries(
      SPECIES.map((s, i) => [
        s.key,
        birds.filter((m) => m.home === "collpa" && m.sp === i && m.mode !== "away").length,
      ]),
    ),
    modes: Object.fromEntries(
      ["cling", "fly", "circle", "away"].map((k) => [
        k,
        birds.filter((m) => m.home === "collpa" && m.mode === k).length,
      ]),
    ),
    birds: birds
      .filter((m) => m.mode !== "away")
      .map((m) => [m.home, m.mode, +m.x.toFixed(1), +m.y.toFixed(1), +m.z.toFixed(1)]),
  }));
  let inside = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });

  const a: Vec = { x: 0, y: 0, z: 0 };
  const b2: Vec = { x: 0, y: 0, z: 0 };
  const c3: Vec = { x: 0, y: 0, z: 0 };
  const tan: Vec = { x: 0, y: 0, z: 0 };
  let flyTimer = 6;
  const panicGap = () => (rm ? 170 + R() * 120 : 60 + R() * 70);
  let panicTimer = 40 + R() * 40;
  let arriveTimer = 0;
  let overTimer = 0;
  let circleTimer = 4;
  let trackT = 0;
  let trackLast = -1;
  let trackDir = 1;
  let trackClock = 1;
  let clock = 0;
  /** Birds kept circling over the river in front of the wall (pairs). */
  const nCircle = high ? 4 : 2;

  // ---- collpa helpers
  /**
   * Picks a free spot for `m` and holds it: near `near`'s spot (within `spread` of the half width) for
   * partners and flock mates, anywhere otherwise. Zones: mostly the clay face, some lip and talus spots.
   */
  const pickSpot = (m: Macaw, near: Macaw | null, spread = 0.08) => {
    if (near) m.zone = near.zone;
    else {
      const r = R();
      m.zone = r < 0.13 ? "lip" : r < 0.21 ? "talus" : "clay";
    }
    const v0 = clay[0] + 0.05;
    const v1 = clay[1] - 0.04;
    const fixedV = m.zone === "lip" ? 1 : m.zone === "talus" ? 0 : -1;
    for (let k = 0; k < 28; k++) {
      const s = spread * (1 + k * 0.08);
      // Free birds go to a favourite patch most of the time (a rough bell around it), now and then anywhere.
      const hot = fixedV < 0 && !near && R() < 0.8 ? HOT[Math.floor(R() * HOT.length)]! : null;
      const grow = 1 + k * 0.06;
      const u = near
        ? near.cu + (R() - 0.5) * 2 * s
        : hot
          ? hot[0] + (R() + R() + R() - 1.5) * 0.16 * grow
          : -0.88 + R() * 1.76;
      const v =
        fixedV >= 0
          ? fixedV
          : near
            ? near.cv + (R() - 0.5) * 2 * s * (halfW / faceH)
            : hot
              ? v0 + (v1 - v0) * (hot[1] + (R() + R() - 1) * 0.3 * grow)
              : v0 + R() * (v1 - v0);
      if (u < -0.9 || u > 0.9 || (fixedV < 0 && (v < v0 || v > v1))) continue;
      if (wallSpotClear(u, v, m.rad, birds, halfW, faceH, m)) {
        m.cu = u;
        m.cv = v;
        m.held = true;
        m.yawOff = (R() - 0.5) * (m.zone === "clay" ? 1.3 : 1.8);
        return;
      }
    }
    // Crowded: anywhere on the clay (an overlap now and then is better than a bird with nowhere to go).
    m.zone = "clay";
    m.cu = -0.85 + R() * 1.7;
    m.cv = v0 + R() * (v1 - v0);
    m.held = true;
    m.yawOff = (R() - 0.5) * 1.3;
  };
  const settle = (m: Macaw) => {
    m.mode = "cling";
    m.dwell = 50 + R() * 80;
    m.act = "bite";
    m.actT = 1 + R() * 3;
    m.hopT = 1;
    m.foe = -1;
  };
  /** Far point over the forest behind the cliff, or up / down the river (start / end of arrivals and departures). */
  const farPoint = (out: Vec) => {
    const side = R() < 0.5 ? -1 : 1;
    if (R() < 0.5) {
      const p = cliff.point(0, 1);
      out.x = p.x - n0.x * 40 + tx * side * (30 + R() * 30);
      out.z = p.z - n0.z * 40 + tz * side * (30 + R() * 30);
      out.y = cliff.top + 14 + R() * 8;
    } else {
      const along = side * (55 + R() * 25);
      const off = 6 + R() * 16;
      out.x = mid.x + tx * along + n0.x * off;
      out.z = mid.z + tz * along + n0.z * off;
      out.y = cliff.top + 2 + R() * 8;
    }
    return out;
  };
  /** A point out over the river in front of `m`'s spot (the swoop before landing, the turn after take-off). */
  const overRiver = (m: Macaw, out: Vec, dist: number, up: number) => {
    spotAt(m, out);
    const n = cliff.normalAt(m.cu);
    out.x += n.x * dist + tx * (R() - 0.5) * 6;
    out.z += n.z * dist + tz * (R() - 0.5) * 6;
    out.y += up;
    return out;
  };
  const fly = (m: Macaw, from: Vec, to: Vec, next: Mode, arc = 0.12, lift = 2, speed = SPEED, curve: Curve = 1) => {
    planFlight(m.f, from, to, speed * (0.9 + R() * 0.2), arc, lift);
    m.mode = "fly";
    m.next = next;
    m.leg2 = null;
    m.curve = curve;
  };
  /** Chains a second leg after the current flight. */
  const chain = (m: Macaw, from: Vec, to: Vec, speed: number, arc: number, lift: number, curve: Curve) => {
    m.leg2 = planFlight(newFlight(), from, to, speed * (0.9 + R() * 0.2), arc, lift);
    m.curve2 = curve;
  };
  const here = (m: Macaw, out: Vec) => {
    out.x = m.x;
    out.y = m.y;
    out.z = m.z;
    return out;
  };
  const place = (m: Macaw, p: Vec) => {
    m.x = p.x;
    m.y = p.y;
    m.z = p.z;
  };
  /**
   * Lands `m` on its (already held) spot from `from`: a swoop out over the river, then the flare onto the
   * spot. The landing leg is eased out at half speed, so it starts at full speed and brakes to the wall.
   */
  const landFrom = (m: Macaw, from: Vec, delay: number, curve: Curve = 0) => {
    overRiver(m, b2, 5 + R() * 4, 1 + R() * 1.5);
    fly(m, from, b2, "cling", 0.06, 1, SPEED, curve);
    spotAt(m, c3);
    chain(m, b2, c3, SPEED * 0.5, 0.05, 0.4, 2);
    m.timer = delay;
  };
  const circlePoint = (m: Macaw, ang: number, out: Vec) => {
    out.x = m.ccx + (tx * Math.cos(ang) + n0.x * Math.sin(ang)) * m.cr;
    out.z = m.ccz + (tz * Math.cos(ang) + n0.z * Math.sin(ang)) * m.cr;
    out.y = m.cy + Math.sin(ang * 2) * 0.8;
    return out;
  };
  /** Starts circling over the river in front of the wall (beside `lead`, on the same loop, when given). */
  const startCircle = (m: Macaw, lead: Macaw | null, from: Vec, delay: number, curve: Curve = 0) => {
    if (lead) {
      m.ccx = lead.ccx;
      m.ccz = lead.ccz;
      m.cr = lead.cr + 0.9;
      m.cw = lead.cw;
      m.ca = lead.ca - 0.1 * Math.sign(lead.cw);
      m.cy = lead.cy + 0.4;
    } else {
      const p = cliff.point((R() - 0.5) * 1.2, 0.5);
      const off = 9 + R() * 5;
      m.ccx = p.x + n0.x * off;
      m.ccz = p.z + n0.z * off;
      m.cr = 5 + R() * 4;
      m.cw = ((R() < 0.5 ? -1 : 1) * SPEED * 0.75) / m.cr;
      m.ca = R() * TAU;
      m.cy = cliff.top - 1.5 + R() * 4.5;
    }
    m.held = false;
    m.dwell = 10 + R() * 18;
    circlePoint(m, m.ca, b2);
    fly(m, from, b2, "circle", 0.1, 1, SPEED, curve);
    m.timer = delay;
  };
  /** Puts `m` straight onto its held spot, settled (filling the wall while the traveler is far). */
  const seatNow = (m: Macaw) => {
    spotAt(m, c3);
    place(m, c3);
    const n = cliff.normalAt(m.cu);
    m.yaw = (m.zone === "clay" ? Math.atan2(-n.x, -n.z) : Math.atan2(n.x, n.z)) + m.yawOff;
    m.pitch = m.zone === "clay" ? CLING_PITCH : 0;
    m.bank = 0;
    m.wing = FOLDED;
    m.fold = 1;
    m.leg2 = null;
    settle(m);
  };
  const arriveGroup = (g: number, instant: boolean) => {
    const ids = groups[g]!;
    const lead = birds[ids[0]!]!;
    farPoint(a);
    // Some pairs circle over the river a while before they land.
    const circleFirst = !instant && ids.length === 2 && R() < 0.3;
    for (let k = 0; k < ids.length; k++) {
      const m = birds[ids[k]!]!;
      if (instant) {
        pickSpot(m, k === 0 ? null : lead, ids.length > 2 ? 0.05 : 0.045);
        seatNow(m);
        m.dwell *= 0.35 + R() * 0.65; // a filled wall is mid-visit, not all arriving at once
        continue;
      }
      // Flock mates fly in a loose bunch behind the leader.
      b2.x = a.x + (R() - 0.5) * 3;
      b2.y = a.y + (R() - 0.5) * 2;
      b2.z = a.z + (R() - 0.5) * 3;
      place(m, b2);
      if (circleFirst) startCircle(m, k ? lead : null, here(m, c3), k * 0.4);
      else {
        pickSpot(m, k === 0 ? null : lead, ids.length > 2 ? 0.05 : 0.045);
        landFrom(m, here(m, c3), k * (0.25 + R() * 0.3));
      }
    }
  };
  const leave = (m: Macaw, delay: number) => {
    m.held = false;
    here(m, a);
    overRiver(m, b2, 6 + R() * 5, 2 + R() * 2);
    fly(m, a, b2, "away", 0.08, 0.8, SPEED * 0.5, 3);
    chain(m, b2, farPoint(c3), SPEED, 0.1, 1.5, 0);
    m.timer = delay;
  };
  /** Distance between two birds' wall spots in world units. */
  const spotDist = (p: Macaw, q: Macaw) => Math.hypot((p.cu - q.cu) * halfW, (p.cv - q.cv) * faceH);

  const startFlyover = () => {
    // A crossing over the road a little ahead of the traveler, high above the canopy, river side ↔ forest.
    const ahead = 15 + R() * 25;
    const t = Math.max(0.03, Math.min(0.97, trackT + (trackDir * ahead) / L.trail.length));
    const f = roadFrame(L, t);
    const dir = R() < 0.5 ? 1 : -1;
    const y = f.y + 18 + R() * 7;
    const pairs = high ? 1 + Math.floor(R() * 3) : 1 + Math.floor(R() * 2);
    const along = (R() - 0.5) * 30;
    for (let p = 0; p < pairs; p++) {
      for (let k = 0; k < 2; k++) {
        const m = birds[flyStart + p * 2 + k];
        if (m?.mode !== "away") continue;
        const lag = p * 3.5 + k * 0.6;
        const side = (k ? 1.1 : -0.2) + p * 0.8;
        a.x = f.x + f.rx * dir * (55 + lag) + f.tx * (along + side);
        a.z = f.z + f.rz * dir * (55 + lag) + f.tz * (along + side);
        a.y = y + p * 0.8 + k * 0.3;
        b2.x = f.x - f.rx * dir * (60 - lag) + f.tx * (along + side + (R() - 0.5) * 6);
        b2.z = f.z - f.rz * dir * (60 - lag) + f.tz * (along + side);
        b2.y = y + (R() - 0.5) * 4;
        place(m, a);
        fly(m, a, b2, "away", 0.04, 0, SPEED, 0);
        // Straight crossing at an even pace (the duration spans the lag so partners stay side by side).
        m.f.dur = Math.hypot(b2.x - a.x, b2.z - a.z) / SPEED;
      }
    }
  };

  const perchOnSnag = (m: Macaw, instant: boolean) => {
    const tr = snags[m.tree];
    if (!tr) return;
    m.limb = Math.floor(R() * tr.limbs.length);
    // The mate sits beside its partner on the same limb.
    const mate = m.mate >= 0 ? birds[m.mate] : undefined;
    if (mate && mate.mode === "perch" && mate.tree === m.tree) {
      m.limb = mate.limb;
      m.lu = Math.min(0.95, mate.lu + 0.12);
    } else m.lu = 0.45 + R() * 0.45;
    const l = tr.limbs[m.limb]!;
    limbPoint(l, m.lu, a, 1);
    if (instant) {
      place(m, a);
      m.mode = "perch";
      m.yaw = Math.atan2(l.bz - l.az, -(l.bx - l.ax)) + (R() < 0.5 ? 0 : Math.PI);
    } else {
      here(m, b2);
      fly(m, b2, a, "perch", 0.15, 1);
    }
  };

  // The snag pairs are already up there when the traveler arrives.
  for (const m of birds) if (m.home === "snag") perchOnSnag(m, true);

  const curveAt = (c: Curve, u: number) =>
    c === 0 ? u : c === 1 ? flightEase(u) : c === 2 ? 1 - (1 - u) * (1 - u) : u * u;

  /** One frame of a collpa bird on its spot: pose against the wall (or upright on a ledge) and its little acts. */
  const clingStep = (m: Macaw, i: number, dt: number, mot: number) => {
    const n = cliff.normalAt(m.cu);
    const onClay = m.zone === "clay";
    // Hop: slide from the old spot to the new one with a small arc away from the wall.
    let lift = 0;
    if (m.hopT < 1) {
      m.hopT = Math.min(1, m.hopT + dt / 0.55);
      lift = Math.sin(m.hopT * Math.PI) * 0.35;
    }
    if (m.act === "squab") lift = 0.12 + Math.sin(clock * 9 + i) * 0.06;
    if (m.hopT < 1) {
      const k = m.hopT * m.hopT * (3 - 2 * m.hopT);
      const u = m.cu;
      const v = m.cv;
      m.cu = m.hu + (u - m.hu) * k;
      m.cv = m.hv + (v - m.hv) * k;
      spotAt(m, a, lift);
      m.cu = u;
      m.cv = v;
    } else spotAt(m, a, lift);
    place(m, a);
    const face = onClay ? Math.atan2(-n.x, -n.z) : Math.atan2(n.x, n.z);
    m.yaw = turnToward(m.yaw, face + m.yawOff, 6 * dt);
    // Upright against the wall, belly to the clay; level on a ledge.
    m.pitch = damp(m.pitch, onClay ? CLING_PITCH : 0, 6, dt);
    m.bank = damp(m.bank, 0, 6, dt);

    m.actT -= dt;
    if (m.actT <= 0) {
      if (m.act === "squab") {
        // End of a squabble: this one gives way with a hop, the other calms down.
        const o = birds[m.foe];
        if (o && o.act === "squab" && o.foe === i) {
          o.act = "look";
          o.actT = 1 + R() * 2;
          o.foe = -1;
        }
        m.foe = -1;
        m.act = "hop";
      } else {
        const r = R();
        m.act = r < 0.5 ? "bite" : r < 0.74 ? "look" : r < (rm ? 0.94 : 0.88) ? "hop" : "squab";
      }
      m.actT = m.act === "bite" ? 2 + R() * 4 : m.act === "look" ? 1.2 + R() * 2.5 : 0.6;
      if (m.act === "hop") {
        // A short shuffle to a free spot nearby (stays put when there is none).
        const ou = m.cu;
        const ov = m.cv;
        const oz = m.zone;
        pickSpot(m, m, 0.07);
        if (m.zone !== oz || Math.abs(m.cu - ou) > 0.25) {
          m.zone = oz;
          m.cu = ou;
          m.cv = ov;
        } else {
          m.hu = ou;
          m.hv = ov;
          m.hopT = 0;
          m.flap = 0;
        }
      } else if (m.act === "squab") {
        // Squabble with the nearest calm neighbour on the clay (lifted off the wall, wings beating, heads jabbing).
        let best = -1;
        let bd = 1.8;
        for (let j = 0; j < nCollpa; j++) {
          const o = birds[j]!;
          if (j === i || o.mode !== "cling" || o.act === "squab" || o.zone !== m.zone || o.hopT < 1) continue;
          const d = spotDist(m, o);
          if (d < bd) {
            bd = d;
            best = j;
          }
        }
        const o = birds[best];
        if (o && onClay) {
          m.foe = best;
          o.foe = i;
          o.act = "squab";
          m.actT = 1.2 + R() * 1.4;
          o.actT = m.actT + 0.3;
        } else {
          m.act = "bite";
          m.actT = 2 + R() * 3;
        }
      }
    }
    // Wings: folded; a flutter while hopping; beating in place while squabbling.
    m.flap += dt * 12 * mot;
    if (m.act === "squab") {
      m.wing = rm ? 0.5 + Math.sin(m.flap * 1.5) * 0.25 : 0.5 + Math.sin(m.flap * 2.4) * 0.5;
      m.fold = damp(m.fold, 0.25, 12, dt);
    } else if (m.hopT < 1) {
      m.wing = 0.55 + Math.sin(m.flap * 3) * (rm ? 0.2 : 0.4);
      m.fold = damp(m.fold, 0.3, 12, dt);
    } else {
      m.wing = damp(m.wing, FOLDED, 10, dt);
      m.fold = damp(m.fold, 1, 12, dt);
    }
  };

  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      clock += dt;
      const time = env.sky.time();
      const day = diurnal(time) > 0.5;
      const collpaK = collpaPresence(time);
      const mot = rm ? 0.6 : 1;
      trackClock += dt;
      if (trackClock > 0.4) {
        trackClock = 0;
        trackT = L.trail.nearestT(avatar.x, avatar.z);
        if (trackLast >= 0 && Math.abs(trackT - trackLast) > 0.0004) trackDir = trackT > trackLast ? 1 : -1;
        trackLast = trackT;
      }
      spot.begin();
      props.update(spot.view.cam);

      // ---- flyovers
      flyTimer -= dt;
      if (flyTimer <= 0 && day && !inside) {
        startFlyover();
        flyTimer = 22 + R() * 26;
      }

      // ---- collpa: keep the flock near the wanted size (arrivals by group, departures when over it)
      const want = Math.round(collpaK * nCollpa);
      let present = 0;
      let circling = 0;
      let onWall = 0;
      for (let i = 0; i < nCollpa; i++) {
        const m = birds[i]!;
        if (m.mode !== "away") present++;
        if (m.mode === "circle") circling++;
        if (m.mode === "cling") onWall++;
      }
      // Far from the collpa (out of sight and earshot) the wall fills and empties directly.
      const far = Math.hypot(avatar.x - cliff.view.x, avatar.z - cliff.view.z) > 80;
      arriveTimer -= dt;
      if (present < want && (far || arriveTimer <= 0)) {
        // A random eligible group that fits (all away and rested); as many as needed at once while far.
        for (let tries = far ? 60 : 6; tries > 0 && present < want; tries--) {
          const g = Math.floor(R() * groups.length);
          const ids = groups[g]!;
          if (present + ids.length > want + 1) continue;
          if (!ids.every((j) => birds[j]!.mode === "away" && (far || birds[j]!.timer <= 0))) continue;
          arriveGroup(g, far);
          present += ids.length;
          arriveTimer = 0.5 + R() * 1.2;
          if (!far) break;
        }
      }
      // Too many for the hour: one bird (and its mates) leaves every second or two; all at once while far.
      let over = present - want;
      overTimer -= dt;
      let evict = -1;
      if (over > 0 && !far && overTimer <= 0) {
        overTimer = 0.8 + R() * 1.2;
        for (let k = 0; k < 8 && evict < 0; k++) {
          const j = Math.floor(R() * nCollpa);
          if (birds[j]!.mode === "cling") evict = j;
        }
      }
      panicTimer -= dt;
      const panic = panicTimer <= 0 && onWall > 5 && !far;
      if (panicTimer <= 0) panicTimer = panicGap();
      // A pair from the wall takes to the air now and then, so a few birds always circle over the river
      // (straight onto the loop while far).
      circleTimer -= dt;
      if ((circleTimer <= 0 || far) && circling < nCircle && collpaK > 0.3) {
        circleTimer = 3 + R() * 4;
        {
          const ids = groups[Math.floor(R() * groups.length)]!;
          if (ids.length === 2 && ids.every((j) => birds[j]!.mode === "cling" && birds[j]!.act !== "squab")) {
            const lead = birds[ids[0]!]!;
            for (let k = 0; k < ids.length; k++) {
              const m = birds[ids[k]!]!;
              startCircle(m, k ? lead : null, here(m, a), k * 0.4, 3);
              if (far) {
                m.mode = "circle";
                m.timer = 0;
                place(m, circlePoint(m, m.ca, a));
                circling++;
              }
            }
          }
        }
      }

      for (let i = 0; i < birds.length; i++) {
        const m = birds[i]!;
        if (m.home === "collpa") {
          if (far && m.mode === "fly") {
            // Nobody watching: flights in progress end at once (landed, or gone).
            if (m.next === "cling") seatNow(m);
            else if (m.next === "circle") {
              m.mode = "circle";
              place(m, circlePoint(m, m.ca, a));
            } else {
              m.mode = "away";
              m.held = false;
              m.timer = 0;
              park(m.body);
              m.x = PARKED;
              continue;
            }
          }
          if (m.mode === "away") m.timer -= dt;
          else if (m.mode === "cling") {
            m.dwell -= dt;
            const leaving = m.dwell <= 0 || i === evict || (far && over > 0) || collpaK <= 0.01;
            if (leaving && far) {
              over--;
              m.mode = "away";
              m.held = false;
              m.timer = 0;
              park(m.body);
              m.x = PARKED;
              continue;
            }
            if (leaving && m.act !== "squab") {
              // The partner or flock mates go too, a beat later (most of the time).
              leave(m, 0);
              for (const j of groups[m.group]!) {
                const o = birds[j]!;
                if (o !== m && o.mode === "cling" && o.act !== "squab" && R() < 0.85) leave(o, 0.3 + R() * 1.2);
              }
            } else if (panic && R() < 0.85) {
              // Panic loop: out over the river, wheel, and back to (another spot on) the wall.
              m.held = false;
              here(m, a);
              const n = cliff.normalAt(m.cu);
              b2.x = m.x + n.x * (12 + R() * 8) + tx * (R() - 0.5) * 20;
              b2.z = m.z + n.z * (12 + R() * 8) + tz * (R() - 0.5) * 20;
              b2.y = cliff.top + 4 + R() * 6;
              fly(m, a, b2, "cling", 0.15, 1, SPEED * 0.55, 3);
              pickSpot(m, null);
              spotAt(m, c3);
              chain(m, b2, c3, SPEED * 0.5, 0.15, 1.5, 2);
              m.timer = R() * 0.6; // they go up in a ragged burst
              m.act = "look";
              m.foe = -1;
              m.hopT = 1;
            }
          } else if (m.mode === "circle") {
            m.dwell -= dt;
            if (m.dwell <= 0 || collpaK <= 0.01) {
              here(m, a);
              if (collpaK <= 0.01) fly(m, a, farPoint(b2), "away", 0.1, 2, SPEED, 0);
              else {
                // Done circling: land (beside the partner when it already picked its spot).
                let lead: Macaw | null = null;
                for (const j of groups[m.group]!) if (birds[j] !== m && birds[j]!.held) lead = birds[j]!;
                pickSpot(m, lead, 0.045);
                landFrom(m, a, 0);
              }
            }
          }
        } else if (m.home === "snag") {
          if (m.mode === "away") {
            // Back on the snag when nobody is looking from close by.
            const tr = snags[m.tree];
            m.timer -= dt;
            if (tr && m.timer <= 0 && Math.hypot(tr.x - avatar.x, tr.z - avatar.z) > 45) {
              const seen = spot.view.sees(tr.x, tr.top, tr.z, 4);
              if (!seen) perchOnSnag(m, true);
              else m.timer = 3;
            }
          } else if (m.mode === "perch") {
            // Horizontal distance: the pairs sit 20+ u up, a traveler passing right by the trunk flushes them.
            const dh = Math.hypot(m.x - avatar.x, m.z - avatar.z);
            if ((dh < 14 && day) || inside) {
              // Flush: off over the forest, away from the traveler; the mate follows a beat later.
              here(m, a);
              const ax = m.x - avatar.x;
              const az = m.z - avatar.z;
              const al = Math.hypot(ax, az) || 1;
              b2.x = m.x + (ax / al) * 70 + (R() - 0.5) * 20;
              b2.z = m.z + (az / al) * 70 + (R() - 0.5) * 20;
              b2.y = m.y + 4 + R() * 6;
              fly(m, a, b2, "away", 0.05, 2);
              m.timer = 25 + R() * 30;
            }
          }
        }

        // ---- per-mode motion
        switch (m.mode) {
          case "away":
            continue;
          case "fly": {
            if (m.timer > 0) {
              m.timer -= dt;
              break;
            }
            m.f.u += dt / m.f.dur;
            const u = Math.min(1, m.f.u);
            const e = m.home === "flyover" ? u : curveAt(m.curve, u);
            flightPoint(m.f, e, a);
            flightTangent(m.f, e, tan);
            const hl = Math.hypot(tan.x, tan.z);
            const yawT = hl > 1e-4 ? Math.atan2(tan.x, tan.z) : m.yaw;
            const turn = wrapAngle(yawT - m.yaw);
            m.yaw = turnToward(m.yaw, yawT, 5 * dt);
            m.bank = damp(m.bank, Math.max(-0.6, Math.min(0.6, -turn * 3)), 4, dt);
            m.pitch = damp(m.pitch, 0.55 - Math.atan2(tan.y, Math.max(0.1, hl)) * 0.6, 6, dt);
            m.x = a.x;
            m.y = a.y + Math.sin(clock * 3 + m.flap) * 0.08;
            m.z = a.z;
            // Landing (the last leg's end): wings up and beating fast, the body tipping upright to the wall.
            const landing = !m.leg2 && u > 0.75 && (m.next === "cling" || m.next === "perch");
            m.flap += dt * (landing ? 16 : 11) * mot;
            m.wing = rm ? 0.3 + Math.sin(m.flap) * 0.35 : Math.sin(m.flap) * 0.8 + 0.08;
            m.fold = damp(m.fold, landing ? 0.35 : 0, 10, dt);
            if (landing && m.home === "collpa") m.pitch = damp(m.pitch, -0.5, 8, dt);
            if (u >= 1) {
              if (m.leg2) {
                m.f = m.leg2;
                m.leg2 = null;
                m.curve = m.curve2;
              } else {
                m.mode = m.next;
                if (m.mode === "away") {
                  park(m.body);
                  m.x = PARKED;
                  m.held = false;
                  m.timer = m.home === "snag" ? 25 + R() * 30 : m.home === "collpa" ? 3 + R() * 10 : 0;
                  continue;
                }
                if (m.mode === "cling") settle(m);
                else m.timer = 1 + R() * 3;
              }
            }
            break;
          }
          case "circle": {
            m.ca += m.cw * dt * mot;
            circlePoint(m, m.ca, a);
            if (Math.hypot(a.x - m.x, a.z - m.z) > 1e-4)
              m.yaw = turnToward(m.yaw, Math.atan2(a.x - m.x, a.z - m.z), 6 * dt);
            place(m, a);
            m.bank = damp(m.bank, m.cw > 0 ? -0.45 : 0.45, 3, dt);
            m.pitch = damp(m.pitch, 0.45, 4, dt);
            m.flap += dt * 10 * mot;
            // Flap, then glide a little on set wings.
            const glide = Math.sin(clock * 0.9 + m.cr) > 0.5;
            m.wing = glide
              ? damp(m.wing, 0.05, 6, dt)
              : rm
                ? 0.3 + Math.sin(m.flap) * 0.35
                : Math.sin(m.flap) * 0.8 + 0.08;
            m.fold = damp(m.fold, 0, 8, dt);
            break;
          }
          case "perch": {
            const tr = snags[m.tree];
            if (tr) {
              limbPoint(tr.limbs[m.limb]!, m.lu, a, 1);
              place(m, a);
            }
            m.pitch = damp(m.pitch, 0, 6, dt);
            m.bank = damp(m.bank, 0, 6, dt);
            m.wing = damp(m.wing, FOLDED, 8, dt);
            m.fold = damp(m.fold, 1, 8, dt);
            break;
          }
          case "cling":
            clingStep(m, i, dt, mot);
            break;
        }

        // Heads: preen, look around, bite clay at the wall, jab at a rival, watch a close traveler.
        m.headT -= dt;
        if (m.headT <= 0) m.headT = 0.6 + R() * 2.4;
        let hy = 0;
        let hp = 0;
        if (m.mode === "cling") {
          if (m.act === "squab") {
            const o = birds[m.foe];
            hy = o ? Math.max(-1.2, Math.min(1.2, wrapAngle(Math.atan2(o.x - m.x, o.z - m.z) - m.yaw))) : 0;
            hp = -0.15 + Math.sin(clock * 14 + i) * 0.15;
          } else if (m.act === "bite" && m.zone !== "lip") {
            // Biting the clay: quick pecks into the wall (or the fallen clay), a pause, again.
            const peck = Math.sin(clock * (rm ? 4 : 7) + i * 1.7);
            hp = 0.35 + (peck > 0 ? peck * 0.55 : 0);
            hy = Math.sin(clock * 0.6 + i) * 0.25;
          } else {
            hy = Math.sin(m.headT * 2.5 + i) * 0.9;
            hp = -0.1 + Math.sin(m.headT * 1.7) * 0.2;
          }
        } else if (m.mode === "perch") {
          const d = Math.hypot(m.x - avatar.x, m.z - avatar.z);
          if (!day) {
            hy = 2.4; // asleep: head turned back into the shoulder
            hp = 0.3;
          } else if (d < 30) {
            hy = Math.max(-1.3, Math.min(1.3, wrapAngle(Math.atan2(avatar.x - m.x, avatar.z - m.z) - m.yaw)));
            hp = -0.2;
          } else {
            const mate = m.mate >= 0 ? birds[m.mate] : undefined;
            if (mate && mate.mode === "perch" && Math.sin(clock * 0.4 + m.tree) > 0.3) {
              // Allopreening: lean toward the partner.
              hy = Math.max(-1.2, Math.min(1.2, wrapAngle(Math.atan2(mate.x - m.x, mate.z - m.z) - m.yaw)));
              hp = 0.5;
            } else {
              hy = Math.sin(m.headT * 3 + m.lu * 7) * 0.9;
              hp = Math.sin(m.headT * 2) * 0.3;
            }
          }
        }
        m.headYaw = damp(m.headYaw, hy, rm ? 3 : 9, dt);
        m.headPitch = damp(m.headPitch, hp, rm ? 3 : 12, dt);
        m.body.solid = false;
        m.body.x = m.x;
        m.body.z = m.z;
        const near = m.home === "collpa" ? 34 : m.home === "snag" ? 26 : 30;
        if (m.mode !== "fly" || m.home === "flyover" || m.f.u > 0.3)
          spot.see(m.x, m.y, m.z, avatar.x, avatar.z, 0.7, near);
      }

      // ---- draw: the flight state machine reads the world's flight (height above the ground or the water,
      // vertical speed); clinging and perched birds stand; a peck at the clay, a squabble, sleep at night.
      for (const s of sets) s.begin();
      for (const m of birds) {
        m.vy = dt > 0 ? damp(m.vy, (m.y - m.py) / dt, 8, dt) : m.vy;
        m.py = m.y;
        if (inside || m.mode === "away" || spot.view.dist(m.x, m.y, m.z) > 220) continue;
        const set = sets[m.sp]!;
        if (m.mode === "cling" && m.act !== m.lastAct) {
          if (m.act === "bite" && m.zone !== "lip") set.play(m.k, "graze", m.actT);
          else if (m.act === "squab") set.play(m.k, "shake", m.actT);
        }
        m.lastAct = m.mode === "cling" ? m.act : "look";
        const air = m.mode === "fly" || m.mode === "circle";
        const below = Math.max(lv, L.heightAt(m.x, m.z));
        set.put(
          m.k,
          m.x,
          m.y,
          m.z,
          m.yaw,
          {
            speed: air ? 9 : m.mode === "cling" && m.hopT < 1 ? 1 : 0,
            rm,
            look: m.mode === "perch" && !day ? undefined : m.headYaw,
            quiet: !day,
            grounded: !air,
            vy: air ? m.vy : 0,
            height: air ? Math.max(0, m.y - below) : 0,
            turn: air ? -m.bank * 2 : 0,
          },
          { scale: SPECIES[m.sp]!.scale * (m.home === "collpa" ? COLLPA_BOOST : 1) },
        );
      }
      for (const s of sets) s.end(dt, clock, env.camera);
      spot.end(dt);
    },
    dispose() {
      offInterior();
      offDev();
      for (const m of birds) creatures.remove(m.body);
      for (const s of sets) s.dispose();
      props.dispose();
      root.removeFromParent();
    },
  };
};
