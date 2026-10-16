/**
 * Players on the floating arcade (../arcade.ts): young people from the community at the outer cabinets of the
 * raft, hands on the controls (joystick circles, button taps, a small bob) and now and then celebrating a win,
 * a child peeking over the first player's shoulder and jumping along, and (high tier) a teenager leaning on
 * the side rail watching. The three middle cabinets always stay free for the traveler.
 *
 * The schedule and the poses are the mountain arcade tambo's (../../../ambient/arcade-players/logic.ts and
 * poses.ts, shared people helpers with no mountain-only imports): the raft is busy by day and evening, the
 * players stay on as night owls late at night (both on the high tier, one on low / phones), the child and the
 * watcher only by day; before dawn the raft is empty. People switch on and off only while unseen.
 *
 * Giving way: when the traveler heads for an occupied cabinet's "E · Jugar" spot (or walks onto where a
 * player stands) the player, and the child watching them, step over to a corner of the raft, watch the
 * traveler play, and return once the traveler moves on (arcade-players/logic.ts shouldYield). They have no
 * greeting of their own, so "E" on the raft is always the cabinet's.
 */
import * as THREE from "three";
import { LOOK_AHEAD, nextCheer, roster, shouldYield } from "../../../ambient/arcade-players/logic";
import { cheerPose, playPose, watchPose } from "../../../ambient/arcade-players/poses";
import { rng } from "../../../ambient/people/models";
import { damp, type Person } from "../../../ambient/people/person";
import type { Crowd, Palette } from "../../../ambient/people/rig";
import { cabPose, RAFT } from "../arcade/logic";
import { type Frame, lxOf, lzOf, wx, wz } from "../embarcadero/station";
import { BLOUSES, BOY, MAN, SHORTS, SKINS, SKIRTS, TEES, WOMAN } from "./models";
import type { Ctx, Group } from "./types";
import { villager } from "./villager";

type Role = "player" | "kid" | "watcher";

interface Who {
  p: Person;
  role: Role;
  /** Order of arrival (players: rank 0 is the night owl). */
  rank: number;
  /** Cabinet front direction (local) and its E spot (local), for giving way. */
  sx: number;
  sz: number;
  /** Where they play / watch (local) and the yaw they face there (world); where they wait aside (local). */
  hx: number;
  hz: number;
  hyaw: number;
  ax: number;
  az: number;
  aside: boolean;
  cheer: number;
  round: number;
  nextCheer: number;
}

/** The E spot sits 1.05 in front of a cabinet (../arcade.ts); players stand 0.72 in front. */
const SPOT = 1.05;
const STAND = 0.72;

export function createRaftPlayers(
  env: Ctx["env"],
  crowd: Crowd,
  f: Frame,
  cabinets: number,
  n: { players: number; kids: number; watcher: boolean },
): Group {
  const R = rng(0xa4ca);
  const ground = env.selva.groundAt;
  const people: Who[] = [];
  const toWorldYaw = (ly: number) => f.yaw + ly;
  // Rank 0 at the last cabinet (the night owl), rank 1 at the first; the middle ones stay free.
  const cabs = [cabinets - 1, 0].slice(0, Math.min(n.players, cabinets > 1 ? 2 : 1));
  cabs.forEach((ci, rank) => {
    const c = cabPose(ci, cabinets);
    const fx = Math.sin(c.yaw);
    const fz = Math.cos(c.yaw);
    const woman = rank === 1;
    const sk = SKIRTS[(rank * 3) % SKIRTS.length] as readonly [string, string];
    const palette: Palette = woman
      ? [SKINS[3] as string, sk[0], sk[1], BLOUSES[rank * 2] as string]
      : [SKINS[0] as string, TEES[2] as string, TEES[3] as string, SHORTS[0] as string];
    const p = villager({
      kind: "player",
      crowd,
      idx: crowd.alloc(),
      wear: woman ? WOMAN : MAN,
      palette,
      scale: 0.9 + R() * 0.05,
      radius: 0.3,
      seed: 11 + rank * 9.3,
    });
    // Aside: the raft's front corner on the cabinet's side, clear of the roof posts and the boardwalk landing.
    const side = Math.sign(c.x) || 1;
    people.push({
      p,
      role: "player",
      rank,
      sx: c.x + fx * SPOT,
      sz: c.z + fz * SPOT,
      hx: c.x + fx * STAND,
      hz: c.z + fz * STAND,
      hyaw: toWorldYaw(c.yaw + Math.PI),
      ax: side * 2.7,
      az: RAFT.z1 - 0.75,
      aside: false,
      cheer: 0,
      round: 0,
      nextCheer: nextCheer(p.seed, 0),
    });
  });
  const lead = people[0];
  if (lead && n.kids > 0) {
    // The child stands behind the night owl's shoulder, on the raft's inner side.
    const c = cabPose(cabinets - 1, cabinets);
    const fx = Math.sin(c.yaw);
    const fz = Math.cos(c.yaw);
    const inward = -(Math.sign(c.x) || 1);
    const hx = lead.hx + fx * 0.5 + fz * inward * 0.45;
    const hz = lead.hz + fz * 0.5 - fx * inward * 0.45;
    const p = villager({
      kind: "child",
      crowd,
      idx: crowd.alloc(),
      wear: BOY,
      palette: [SKINS[5] as string, SHORTS[2] as string, "#e8b631", TEES[1] as string],
      scale: 0.62,
      headScale: 1.3,
      radius: 0.24,
      seed: 5.5,
    });
    people.push({
      p,
      role: "kid",
      rank: 0,
      sx: lead.sx,
      sz: lead.sz,
      hx,
      hz,
      hyaw: toWorldYaw(Math.atan2(lead.hx - hx, lead.hz - hz)),
      ax: lead.ax - Math.sign(lead.ax) * 0.75,
      az: lead.az - 0.15,
      aside: false,
      cheer: 0,
      round: 0,
      nextCheer: 0,
    });
  }
  if (n.watcher) {
    // A teenager leaning on the left side rail, watching the row of cabinets.
    const hx = RAFT.x0 + 0.5;
    const hz = -8.6;
    const p = villager({
      kind: "child",
      crowd,
      idx: crowd.alloc(),
      wear: WOMAN,
      palette: [SKINS[1] as string, SKIRTS[1]?.[0] ?? "#2b3550", SKIRTS[1]?.[1] ?? "#efe3c8", BLOUSES[1] as string],
      scale: 0.8,
      headScale: 1.1,
      radius: 0.28,
      seed: 3.3,
    });
    people.push({
      p,
      role: "watcher",
      rank: 0,
      sx: 1e5,
      sz: 1e5,
      hx,
      hz,
      hyaw: toWorldYaw(Math.atan2(0 - hx, -10.8 - hz)),
      ax: hx,
      az: hz,
      aside: false,
      cheer: 0,
      round: 0,
      nextCheer: 0,
    });
  }
  for (const w of people) {
    const x = wx(f, w.hx, w.hz);
    const z = wz(f, w.hx, w.hz);
    w.p.place(x, z, w.hyaw);
    w.p.y = ground(x, z);
  }

  const want = { players: 0, kids: 0 };
  let frame = 0;
  let shown = true;
  const last = new THREE.Vector3(1e5, 0, 1e5);
  const vel = { x: 0, z: 0 };
  const wants = (w: Who) =>
    w.role === "player"
      ? w.rank < want.players
      : w.role === "kid"
        ? want.kids > 0 && w.rank < want.players
        : want.kids > 0;

  const pose = (w: Who, c: Ctx) => {
    const p = w.p;
    const dt = c.dt;
    const tx = wx(f, w.aside ? w.ax : w.hx, w.aside ? w.az : w.hz);
    const tz = wz(f, w.aside ? w.ax : w.hx, w.aside ? w.az : w.hz);
    const d = p.seek(tx, tz, 0.9, dt, 5);
    p.y = ground(p.x, p.z);
    p.rest(c.clock, c.rm);
    p.gait(dt, c.rm);
    const settled = d < 0.3 && p.speed < 0.25;
    if (!settled) {
      p.commit();
      return;
    }
    if (w.aside) {
      // Waiting in the corner, watching the traveler play.
      p.face(c.avatar.x, c.avatar.z, dt, 4);
      if (w.role === "kid") watchPose(p, c.clock, 0, 0, c.rm);
    } else {
      p.yaw = damp(p.yaw, w.hyaw, 6, dt);
      if (w.role === "player") {
        if (w.cheer > 0) cheerPose(p, c.clock, 1 - w.cheer / 1.8, c.rm);
        else playPose(p, c.clock, c.rm);
      } else if (w.role === "kid") {
        const excited = lead && lead.cheer > 0 ? Math.min(1, lead.cheer) : 0;
        watchPose(p, c.clock, 1, excited, c.rm);
      } else {
        // The watcher leans back on the rail, arms folded, head following the games.
        p.bones.torso.rotation.x = -0.12;
        p.bones.armL.rotation.set(-1.2, 0, -0.9);
        p.bones.armR.rotation.set(-1.2, 0, 0.9);
        if (!c.rm) p.bones.head.rotation.y = Math.sin(c.clock * 0.4 + p.seed) * 0.35;
      }
    }
    p.commit();
  };

  return {
    name: "raft",
    center: new THREE.Vector3(wx(f, 0, -9.5), f.y, wz(f, 0, -9.5)),
    radius: 6,
    update(c, visible) {
      roster(c.time, false, want);
      want.players = Math.min(want.players, cabs.length);
      if (frame++ % 15 === 0 || c.jump)
        for (const w of people) {
          const on = wants(w);
          if (w.p.active !== on && (c.jump || !c.seen(w.p.x, w.p.y + 0.8, w.p.z, 90))) {
            w.p.setActive(on);
            if (on) {
              w.aside = false;
              w.p.place(wx(f, w.hx, w.hz), wz(f, w.hx, w.hz), w.hyaw);
            }
          }
        }
      // Traveler's pace, for judging where they will be in LOOK_AHEAD seconds.
      if (c.dt > 0) {
        vel.x = damp(vel.x, (c.avatar.x - last.x) / c.dt, 8, c.dt);
        vel.z = damp(vel.z, (c.avatar.z - last.z) / c.dt, 8, c.dt);
        if (Math.abs(vel.x) > 50 || Math.abs(vel.z) > 50) vel.x = vel.z = 0;
      }
      last.copy(c.avatar);
      const lx = lxOf(f, c.avatar.x, c.avatar.z);
      const lz = lzOf(f, c.avatar.x, c.avatar.z);
      const fx = lxOf(f, c.avatar.x + vel.x * LOOK_AHEAD, c.avatar.z + vel.z * LOOK_AHEAD);
      const fz = lzOf(f, c.avatar.x + vel.x * LOOK_AHEAD, c.avatar.z + vel.z * LOOK_AHEAD);
      for (const w of people) {
        if (!w.p.active) continue;
        if (w.role === "player") {
          const dSpot = Math.hypot(lx - w.sx, lz - w.sz);
          const dAhead = Math.hypot(fx - w.sx, fz - w.sz);
          const dHome = Math.hypot(lx - w.hx, lz - w.hz);
          w.aside = shouldYield(w.aside, dSpot, dAhead, dHome, 0.3 + 0.35);
          w.cheer = Math.max(0, w.cheer - c.dt);
          w.nextCheer -= c.dt;
          if (w.nextCheer <= 0 && !w.aside) {
            w.cheer = 1.8;
            w.round++;
            w.nextCheer = nextCheer(w.p.seed, w.round);
          }
        } else if (w.role === "kid") {
          w.aside = lead?.aside ?? false;
        }
        w.p.body.x = w.p.x;
        w.p.body.z = w.p.z;
      }
      if (visible !== shown) {
        shown = visible;
        if (!visible) for (const w of people) w.p.hide();
      }
      if (!visible) return;
      for (const w of people) if (w.p.active) pose(w, c);
    },
    people: () => people.filter((w) => w.p.active).length,
    points: () => people.map((w) => ({ x: w.p.x, z: w.p.z })),
    dispose() {
      for (const w of people) w.p.dispose();
    },
  };
}
