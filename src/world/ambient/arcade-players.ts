/**
 * Players in the arcade tambo (station "arcade"): a few young people in highland dress stand at the cabinets
 * with their hands on the controls (joystick circles, button taps, a small bob) and now and then celebrate a
 * win; one or two children watch over a player's shoulder and jump along. By day and evening the hall is
 * busy, late at night one or two night owls stay on under the lanterns, before dawn it is empty. They walk
 * in and out through the open front.
 *
 * Free space: players only take cabinets 0, 2, 6 and 8 (arcade-players/logic.ts), so the central cabinets
 * (3, 4, 5) and 1, 7 are always free; the aisle and the door are only crossed while walking. When the
 * traveler heads for an occupied cabinet's E spot (judged on where they will be in ~0.6 s, or when they walk
 * onto where someone stands) the player and the child watching step over to a waiting corner by the side
 * wall, watch the traveler play, and return once the traveler moves on.
 * Clicks are untouched (the content raycasts only its own hit roots).
 *
 * Every person registers a Body in `creatures` ("player", "child") through the shared Person class.
 * Rendering: one instanced mesh per body part (people/rig.ts Crowd): 11 meshes per pass (~+34 calls with the
 * color, shadow and ink passes) while the hall is in view, none when it is more than ~60 u from both camera
 * and traveler (45 on low quality; low also has fewer people: 2 players + 1 child by day, 1 at night).
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../contract";
import type { WorldEnvExtra } from "../env";
import { on } from "../events";
import { cabsFor, LOOK_AHEAD, nextCheer, type Roster, roster, shouldYield } from "./arcade-players/logic";
import { cheerPose, playPose, watchPose } from "./arcade-players/poses";
import { jumped } from "./people/logic";
import {
  DARKS,
  MAN,
  type PartName,
  POLLERAS,
  PONCHOS,
  partSpecs,
  SHADOW_PARTS,
  SKINS,
  WEAVES,
  WOMAN,
} from "./people/models";
import { damp, Person } from "./people/person";
import { Crowd, type Palette, paletteMaterial } from "./people/rig";

type State = "off" | "arrive" | "play" | "aside" | "back" | "leave";

interface Who {
  p: Person;
  kid: boolean;
  rank: number;
  /** Player this kid watches. */
  of: Who | null;
  /** Cabinet center, its E spot, where this person plays / watches, and where they wait aside (world). */
  cx: number;
  cz: number;
  sx: number;
  sz: number;
  hx: number;
  hz: number;
  ax: number;
  az: number;
  /** Lean side for the kid's peek (local x toward the player). */
  side: number;
  /** Walk in: outside, doorway, in front of the cabinet, home (x, z pairs). */
  path: Float32Array;
  wp: number;
  state: State;
  wait: number;
  cheer: number;
  round: number;
  next: number;
  asideT: number;
}

/** Arcade tambo layout (landmarks.ts buildArcade): open front at local z = 3.2. */
const FRONT_Z = 3.2;
const PLAYER_R = 0.26;
const KID_R = 0.24;
const TRAVELER_R = 0.42;
const CHEER_S = 1.8;

const OUTFITS: Array<{ wear: PartName[]; pal: (i: number) => Palette; scale: number }> = [
  { wear: [...MAN, "chullo"], pal: (i) => [SKINS[i % 8]!, PONCHOS[0]!, WEAVES[2]!, DARKS[1]!], scale: 0.98 },
  { wear: [...WOMAN, "montera"], pal: (i) => [SKINS[(i + 3) % 8]!, POLLERAS[1]!, WEAVES[0]!, DARKS[0]!], scale: 0.95 },
  { wear: [...MAN, "sombrero"], pal: (i) => [SKINS[(i + 5) % 8]!, PONCHOS[3]!, WEAVES[1]!, DARKS[2]!], scale: 1.02 },
  { wear: [...WOMAN], pal: (i) => [SKINS[(i + 1) % 8]!, POLLERAS[2]!, WEAVES[3]!, DARKS[4]!], scale: 0.93 },
];
const KID_OUTFITS: Array<{ wear: PartName[]; pal: Palette }> = [
  { wear: [...MAN, "chullo"], pal: [SKINS[4]!, PONCHOS[5]!, WEAVES[5]!, DARKS[3]!] },
  { wear: [...WOMAN], pal: [SKINS[6]!, POLLERAS[0]!, WEAVES[4]!, DARKS[1]!] },
];

export const create: CreateAmbient = (envIn): Ambient => {
  const env = envIn as WorldEnvExtra;
  let low = env.quality === "low";
  const offQ = on("world:quality", (d) => {
    low = d.quality === "low";
  });

  const mat = paletteMaterial(env.toon("#ffffff").gradientMap);
  const parts = new Set<PartName>([...MAN, ...WOMAN, "chullo", "montera", "sombrero"]);
  const crowd = new Crowd(partSpecs(parts), OUTFITS.length + KID_OUTFITS.length, mat, SHADOW_PARTS);
  crowd.group.name = "arcade-players:crowd";
  env.scene.add(crowd.group);

  const players: Who[] = OUTFITS.map((o, i) =>
    who(
      new Person({
        kind: "player",
        crowd,
        idx: crowd.alloc(),
        wear: o.wear,
        palette: o.pal(i * 3),
        scale: o.scale,
        radius: PLAYER_R,
        seed: 3 + i * 7.7,
      }),
      false,
      i,
      null,
    ),
  );
  const kids: Who[] = KID_OUTFITS.map((o, i) =>
    who(
      new Person({
        kind: "child",
        crowd,
        idx: crowd.alloc(),
        wear: o.wear,
        palette: o.pal,
        scale: 0.62 + i * 0.05,
        headScale: 1.3,
        radius: KID_R,
        seed: 41 + i * 5.3,
      }),
      true,
      i,
      players[i] ?? null,
    ),
  );
  const all = [...players, ...kids];

  // ------------------------------------------------------------ the hall (found once content has built it)
  let hall: THREE.Object3D | null = null;
  let look = 0;
  const center = new THREE.Vector3();
  const v = new THREE.Vector3();
  const findHall = () => {
    const g = env.scene.getObjectByName("arcade");
    if (!g) return false;
    const cabs = g.children.filter((c) => String(c.userData.spotId ?? "").startsWith("cab:"));
    if (!cabs.length) return false;
    g.updateMatrixWorld(true);
    const used = cabsFor(cabs.length);
    const toW = (o: THREE.Object3D, x: number, z: number) => {
      v.set(x, 0, z);
      o.localToWorld(v);
      return v;
    };
    for (const w of all) {
      const ci = used[w.rank];
      const cab = ci === undefined ? null : cabs[ci];
      if (!cab) {
        w.rank = 99; // not enough cabinets: never comes
        continue;
      }
      const out = Math.sign(cab.position.x) || 1;
      toW(cab, 0, 0);
      w.cx = v.x;
      w.cz = v.z;
      toW(cab, 0, 1.05);
      w.sx = v.x;
      w.sz = v.z;
      toW(cab, w.kid ? out * 0.15 : 0, w.kid ? 1.4 : 0.72);
      w.hx = v.x;
      w.hz = v.z;
      // Waiting corners by the side walls, clear of every cabinet's E spot, the aisle and the door.
      if (w.kid) toW(g, out * 4.85, 1.6);
      else toW(g, out * (w.rank < 2 ? 4.25 : 4.95), w.rank < 2 ? 1.35 : 0.45);
      w.ax = v.x;
      w.az = v.z;
      w.side = out;
      const P = w.path;
      toW(g, -0.8, FRONT_Z + 4.5);
      P[0] = v.x;
      P[1] = v.z;
      toW(g, -0.4, FRONT_Z - 1.2);
      P[2] = v.x;
      P[3] = v.z;
      toW(cab, w.kid ? out * 0.15 : 0, 2.0);
      P[4] = v.x;
      P[5] = v.z;
      P[6] = w.hx;
      P[7] = w.hz;
    }
    toW(g, 0, 0);
    center.copy(v);
    hall = g;
    return true;
  };

  // ------------------------------------------------------------ helpers
  const camPos = new THREE.Vector3();
  const seenV = new THREE.Vector3();
  const seen = (x: number, z: number, max: number) => {
    if (Math.hypot(x - camPos.x, z - camPos.z) > max) return false;
    seenV.set(x, env.extra.groundAt(x, z) + 0.8, z).project(env.camera);
    return seenV.z < 1 && Math.abs(seenV.x) < 1.15 && Math.abs(seenV.y) < 1.15;
  };
  const wants = (w: Who, r: Roster): boolean =>
    w.kid ? w.rank < r.kids && !!w.of && wants(w.of, r) : w.rank < r.players;
  const snap = (w: Who, want: boolean) => {
    w.p.setActive(want);
    w.state = want ? "play" : "off";
    w.wait = stagger(w);
    if (want) w.p.place(w.hx, w.hz, Math.atan2(w.cx - w.hx, w.cz - w.hz));
    w.cheer = 0;
  };
  const occupied = (w: Who) => w.state === "play" || w.state === "aside" || w.state === "back";

  const rost: Roster = { players: 0, kids: 0 };
  let lastTime = env.sky.time();
  let first = true;
  let visibleNow = false;
  let clock = 0;
  const avPrev = new THREE.Vector3(1e9, 0, 1e9);
  let avVx = 0;
  let avVz = 0;
  let slow = 0;

  const ambient: Ambient = {
    update(dtIn, avatar) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      if (!hall) {
        look -= dt;
        if (look > 0 || !findHall()) {
          if (look <= 0) look = 0.5;
          return;
        }
      }
      const time = env.sky.time();
      const jump = jumped(lastTime, time, dt);
      lastTime = time;
      const r = roster(time, low, rost);
      env.camera.getWorldPosition(camPos);
      const view = (low ? 45 : 60) + 7;
      const dCam = Math.hypot(center.x - camPos.x, center.z - camPos.z);
      const dAv = Math.hypot(center.x - avatar.x, center.z - avatar.z);
      const visible = Math.min(dCam, dAv) < view;

      if (first || jump || !visible) {
        // Far away (or the clock jumped): settle everyone where the schedule says, once a second.
        slow -= dt;
        if (first || jump || slow <= 0) {
          slow = 1;
          for (const w of all) snap(w, wants(w, r));
          first = false;
        }
        if (!visible) {
          avPrev.x = 1e9;
          if (visibleNow) for (const w of all) w.p.hide();
          visibleNow = false;
          crowd.flush();
          return;
        }
      }
      visibleNow = true;
      const rm = env.reducedMotion;
      // Where the traveler is heading (smoothed velocity), so people make room before they arrive.
      if (avPrev.x < 1e8) {
        const k = 1 - Math.exp(-8 * dt);
        avVx += ((avatar.x - avPrev.x) / Math.max(dt, 1e-3) - avVx) * k;
        avVz += ((avatar.z - avPrev.z) / Math.max(dt, 1e-3) - avVz) * k;
        if (Math.hypot(avVx, avVz) > 12) avVx = avVz = 0; // teleport
      }
      avPrev.copy(avatar);
      const aheadX = avatar.x + avVx * LOOK_AHEAD;
      const aheadZ = avatar.z + avVz * LOOK_AHEAD;

      for (const w of all) {
        const p = w.p;
        const want = wants(w, r);
        // Schedule: arrive through the door (when nobody is looking at it) or leave the same way.
        if (want && w.state === "off") {
          w.wait -= dt;
          if (w.wait <= 0) {
            const px = w.path[0]!;
            const pz = w.path[1]!;
            if (!seen(px, pz, 45) || w.wait < -25) {
              p.setActive(true);
              p.place(px, pz, Math.atan2(w.path[2]! - px, w.path[3]! - pz));
              w.state = "arrive";
              w.wp = 1;
            }
          }
        } else if (!want && w.state !== "off" && w.state !== "leave") {
          w.state = "leave";
          w.wp = 2;
          w.cheer = 0;
        }
        if (w.state === "off") continue;

        // Give way to the traveler at this cabinet (kids follow their player).
        if (occupied(w)) {
          const dSpot = Math.hypot(avatar.x - w.sx, avatar.z - w.sz);
          const dAhead = Math.hypot(aheadX - w.sx, aheadZ - w.sz);
          const dHome = Math.hypot(avatar.x - w.hx, avatar.z - w.hz);
          const radii = TRAVELER_R + (w.kid ? KID_R : PLAYER_R);
          const yieldNow =
            shouldYield(w.state === "aside", dSpot, dAhead, dHome, radii) || (!!w.of && w.of.state === "aside");
          if (yieldNow && w.state !== "aside") {
            w.state = "aside";
            w.asideT = 0;
            w.cheer = 0;
          } else if (!yieldNow && w.state === "aside" && w.asideT > 1.5) w.state = "back";
        }

        let still = false;
        if (w.state === "arrive" || w.state === "leave") {
          const tx = w.path[w.wp * 2]!;
          const tz = w.path[w.wp * 2 + 1]!;
          const d = p.seek(tx, tz, w.kid ? 1.3 : 1.1, dt);
          if (d < 0.35) {
            if (w.state === "arrive") {
              if (w.wp < 3) w.wp++;
              else w.state = "play";
            } else if (w.wp > 0) w.wp--;
            else {
              p.setActive(false);
              w.state = "off";
              w.wait = stagger(w);
              continue;
            }
          }
        } else if (w.state === "aside") {
          w.asideT += dt;
          const d = p.seek(w.ax, w.az, 2.2, dt, 8);
          if (d < 0.3) {
            still = true;
            // Watch the traveler at the cabinet.
            p.face(w.cx, w.cz, dt, 4);
          }
        } else {
          // play / back: hold the spot in front of the cabinet.
          const d = p.seek(w.hx, w.hz, 0.9, dt);
          if (d < 0.3) {
            if (w.state === "back") w.state = "play";
            still = true;
            p.face(w.cx, w.cz, dt, 6);
          }
        }
        if (still) p.speed = damp(p.speed, 0, 10, dt);

        // Celebrations (players at their cabinet).
        if (!w.kid && w.state === "play") {
          if (w.cheer > 0) w.cheer = Math.max(0, w.cheer - dt);
          else {
            w.next -= dt;
            if (w.next <= 0) {
              w.cheer = CHEER_S;
              w.next = nextCheer(p.seed, ++w.round);
            }
          }
        }

        // Pose.
        p.y = env.extra.groundAt(p.x, p.z);
        p.rest(clock, rm);
        const playing = still && w.state === "play" && p.speed < 0.15;
        p.gait(dt, rm);
        if (playing && !w.kid) {
          if (w.cheer > 0) cheerPose(p, clock, 1 - w.cheer / CHEER_S, rm);
          else playPose(p, clock, rm);
        } else if (playing && w.kid) {
          const of = w.of;
          const ex = of && of.state === "play" && of.cheer > 0 ? Math.sin((1 - of.cheer / CHEER_S) * Math.PI) : 0;
          watchPose(p, clock, w.side, ex, rm);
        }
        p.commit();
      }
      crowd.flush();
    },
    dispose() {
      offQ();
      for (const w of all) w.p.dispose();
      crowd.dispose();
      mat.dispose();
      if (import.meta.env?.DEV) delete (window as unknown as { __arcadePlayers?: unknown }).__arcadePlayers;
    },
  };

  if (import.meta.env?.DEV) {
    const debug = {
      people: () =>
        all.map((w) => ({
          kind: w.p.body.kind,
          state: w.state,
          x: +w.p.x.toFixed(2),
          z: +w.p.z.toFixed(2),
          home: [+w.hx.toFixed(2), +w.hz.toFixed(2)],
          spot: [+w.sx.toFixed(2), +w.sz.toFixed(2)],
        })),
      center: () => center.toArray(),
      drawCalls: () => crowd.drawCalls(),
    };
    (window as unknown as { __arcadePlayers?: typeof debug }).__arcadePlayers = debug;
  }
  return ambient;
};

/** Seconds before an empty slot walks in (players one after another, kids after their player). */
const stagger = (w: Who) => 2 + w.rank * 4 + (w.kid ? 3 : 0);

function who(p: Person, kid: boolean, rank: number, of: Who | null): Who {
  return {
    p,
    kid,
    rank,
    of,
    cx: 0,
    cz: 0,
    sx: 0,
    sz: 0,
    hx: 0,
    hz: 0,
    ax: 0,
    az: 0,
    side: 1,
    path: new Float32Array(8),
    wp: 0,
    state: "off",
    wait: 2 + rank * 4 + (kid ? 3 : 0),
    cheer: 0,
    round: 0,
    next: nextCheer(p.seed, 0) * 0.5,
    asideT: 0,
  };
}
