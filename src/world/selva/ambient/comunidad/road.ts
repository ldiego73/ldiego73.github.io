/**
 * Travellers on the road: small parties (logic.ts PARTIES: couples carrying a green banana bunch on the
 * shoulder and a woven palm basket on the back, a mother with her child, a man alone, two young men) walking
 * the road in both directions over long stretches, on their right-hand side. They walk a whole stretch of
 * road (logic.ts ROAD_SPANS: everything but the canopy walkway and the very ends) and turn back at its end
 * after a short pause, so the road always has people coming and going.
 *
 * Coming and going: a party that has drifted far behind or ahead of the traveler (beyond the people's view
 * distance, where it is not drawn) and is off screen is brought back into play just past the view distance,
 * ahead of or behind the traveler, walking toward them (logic.ts respawnT). One party at a time, every few
 * seconds, so they come into view one by one out of the haze down the road and the road never empties,
 * wherever the traveler is; nobody ever appears or vanishes on screen.
 *
 * When the traveler comes toward them they step aside to the edge of the road, turn and nod (a wave when
 * greeted), and carry on once the traveler has passed (logic.ts shouldGiveWay). They steer around every body
 * on the way (the mule, animals crossing) through the shared creatures registry. By night they are home
 * (switched off while unseen).
 *
 * Cost: far parties are not drawn and walk on a cheap schedule (no steering, no pose); everyone is in the
 * one community crowd (one InstancedMesh per body part).
 */
import * as THREE from "three";
import { rng } from "../../../ambient/people/models";
import { damp, type Person } from "../../../ambient/people/person";
import type { Crowd, Palette } from "../../../ambient/people/rig";
import { asideOf, atSpanEnd, greeting, isOut, laneOf, partiesFor, respawnT, shouldGiveWay, spanAt } from "./logic";
import {
  type AmazonPart,
  BOY,
  CUSHMAS,
  GIRL,
  MAN,
  RIBBONS,
  SHORTS,
  SKINS,
  SKIRTS,
  STRIPES,
  TEES,
  WOMAN,
} from "./models";
import type { Ctx, Greeter, Group } from "./types";
import { shoulderPose, strapPose, villager, wavePose } from "./villager";

interface Party {
  /** Road t of the party, walking direction, the stretch it walks (logic.ts ROAD_SPANS index). */
  t: number;
  dir: 1 | -1;
  span: number;
  pause: number;
  members: Walker[];
}

interface Walker {
  p: Person;
  party: Party;
  /** Lane slot (0 inside, 1 beside the partner). */
  k: number;
  child: boolean;
  load: "bananas" | "basket" | "none";
  yielding: boolean;
  wave: number;
  greetN: number;
}

const REACH = 2.2;
const SPEED = 1.15;
/** Seconds between two parties brought back into play. */
const RECYCLE_EVERY = 4;
/** Road distance (u) kept between parties brought back into play. */
const SPACING = 24;
const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;

export function createWalkers(env: Ctx["env"], crowd: Crowd, n: number): Group {
  const R = rng(2626);
  const L = env.selva.layout;
  const trail = L.trail;
  const ground = env.selva.groundAt;
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const len = trail.length;
  const walkers: Walker[] = [];
  const parties: Party[] = [];
  const plan = partiesFor(n);
  plan.forEach((who, pi) => {
    // Spread over the first stretch at the start, alternating directions; recycling brings them near later.
    const t0 = 0.08 + (0.7 * (pi + 0.5)) / plan.length;
    const party: Party = { t: t0, dir: pi % 2 ? -1 : 1, span: spanAt(t0), pause: 0, members: [] };
    parties.push(party);
    who.forEach((role, k) => {
      const i = walkers.length;
      const man = role === "man" || role === "youth";
      const child = role === "child";
      const load: Walker["load"] = child
        ? "none"
        : role === "woman"
          ? "basket"
          : role === "youth"
            ? k === 0
              ? "bananas"
              : "none"
            : pi % 2
              ? "none"
              : "bananas";
      const boy = R() < 0.5;
      const wear: AmazonPart[] = child ? [...(boy ? BOY : GIRL)] : man ? [...MAN] : [...WOMAN];
      if (load === "bananas") wear.push("a:bananas");
      if (load === "basket") wear.push("a:basket");
      if (role === "man" && load === "none") wear.push("a:crown");
      const cushma = pick(R, CUSHMAS);
      const sk = pick(R, SKIRTS);
      const palette: Palette = child
        ? boy
          ? [pick(R, SKINS), pick(R, SHORTS), pick(R, RIBBONS), pick(R, TEES)]
          : [pick(R, SKINS), sk[0], sk[1], pick(R, TEES)]
        : role === "youth"
          ? // Young men in a tee and shorts-length cushma colours.
            [pick(R, SKINS), pick(R, TEES), pick(R, STRIPES), pick(R, SHORTS)]
          : man
            ? [pick(R, SKINS), cushma, cushma === "#d8cbb0" ? (STRIPES[0] as string) : (STRIPES[2] as string), cushma]
            : [
                pick(R, SKINS),
                sk[0],
                sk[1],
                pick(R, RIBBONS) === sk[1] ? "#c2456b" : pick(R, ["#c2456b", "#2a9d8f", "#e07a3a", "#7a3d8f"]),
              ];
      const p = villager({
        kind: child ? "child" : "walker",
        crowd,
        idx: crowd.alloc(),
        wear,
        palette,
        scale: child ? 0.6 + R() * 0.06 : man ? 0.96 + R() * 0.06 : 0.92 + R() * 0.05,
        ...(child ? { headScale: 1.3 } : {}),
        radius: child ? 0.26 : 0.34,
        seed: 41 + i * 7.9,
      });
      const w: Walker = { p, party, k, child, load, yielding: false, wave: 0, greetN: i };
      party.members.push(w);
      walkers.push(w);
    });
  });

  const lateral = (t: number, off: number, out: { x: number; z: number }) => {
    trail.pointAt(t, P);
    trail.tangentAt(t, T);
    const l = Math.hypot(T.x, T.z) || 1;
    // Side +1 normal of the road (-tangent.z, tangent.x).
    out.x = P.x + (-T.z / l) * off;
    out.z = P.z + (T.x / l) * off;
    return out;
  };
  const spot = { x: 0, z: 0 };
  const placeParty = (pt: Party) => {
    for (const w of pt.members) {
      lateral(pt.t, laneOf(pt.dir, w.k), spot);
      w.p.place(spot.x, spot.z, Math.atan2(T.x * pt.dir, T.z * pt.dir));
      w.p.y = ground(spot.x, spot.z);
    }
  };
  for (const pt of parties) placeParty(pt);

  let isDay: boolean | null = null;
  let frame = 0;
  let near: Walker | null = null;
  let recycleT = 0;
  let recycleSide: 1 | -1 = 1;
  const head = new THREE.Vector3();

  const step = (w: Walker, c: Ctx) => {
    const p = w.p;
    const pt = w.party;
    const dt = c.dt;
    trail.tangentAt(pt.t, T);
    const tl = Math.hypot(T.x, T.z) || 1;
    const fx = (T.x / tl) * pt.dir;
    const fz = (T.z / tl) * pt.dir;
    w.yielding = shouldGiveWay(p.x, p.z, fx, fz, c.avatar.x, c.avatar.z, w.yielding);
    if (w.yielding) {
      // Step to the edge on the right and let the traveler pass, facing them.
      lateral(trail.nearestT(p.x, p.z), asideOf(pt.dir), spot);
      const d = p.seek(spot.x, spot.z, 1.0, dt, 6);
      if (d < 0.35) p.face(c.avatar.x, c.avatar.z, dt, 5);
    } else if (pt.pause > 0) {
      p.speed = damp(p.speed, 0, 6, dt);
      p.resolve(0.5);
    } else {
      // Follow the lane a couple of units ahead of the party's t (steering bends round anything in the way).
      const ahead = pt.t + (pt.dir * 2) / len;
      lateral(ahead, laneOf(pt.dir, w.k), spot);
      p.seek(spot.x, spot.z, SPEED * 1.1, dt, 3);
    }
    p.y = ground(p.x, p.z);
    p.body.x = p.x;
    p.body.z = p.z;
    // Pose.
    p.rest(c.clock, c.rm);
    p.gait(dt, c.rm, w.load === "none" ? 1 : 0.5);
    if (w.load === "bananas") shoulderPose(p);
    if (w.load === "basket") {
      strapPose(p);
      p.bones.torso.rotation.x += 0.12;
    }
    if (w.wave > 0) {
      w.wave -= dt;
      wavePose(p, c.clock, c.rm);
    } else if (w.yielding && p.speed < 0.3 && !c.rm) {
      // A small nod while waiting.
      p.bones.head.rotation.x = Math.max(0, Math.sin(c.clock * 2 + p.seed)) * 0.25;
    }
    p.commit();
  };

  /** Moves a party's road t on (the party walks at SPEED unless paused, or held up by a member giving way). */
  const advance = (pt: Party, dt: number, held: boolean) => {
    if (pt.pause > 0) {
      pt.pause -= dt;
      if (pt.pause <= 0) pt.dir = pt.dir === 1 ? -1 : 1;
      return;
    }
    if (held) return;
    pt.t += (pt.dir * SPEED * dt) / len;
    if (atSpanEnd(pt.t, pt.dir, pt.span)) pt.pause = 3 + (parties.indexOf(pt) % 3);
  };

  const farFrom = (pt: Party, c: Ctx, max: number) =>
    pt.members.every((w) => Math.hypot(w.p.x - c.camera.x, w.p.z - c.camera.z) > max);

  return {
    name: "walkers",
    center: new THREE.Vector3(),
    radius: 1e6,
    update(c) {
      const day = isOut("road", c.time);
      if (isDay === null || c.jump) for (const w of walkers) w.p.setActive(day);
      isDay = day;
      if (frame++ % 15 === 0)
        for (const w of walkers) if (w.p.active !== day && !c.seen(w.p.x, w.p.y + 0.8, w.p.z, 90)) w.p.setActive(day);
      const drawn = c.view + 30;
      // Bring one far, unseen party back into play just past the view distance (ahead / behind, alternating).
      recycleT -= c.dt;
      if (day && recycleT <= 0) {
        recycleT = RECYCLE_EVERY;
        const avatarT = trail.nearestT(c.avatar.x, c.avatar.z);
        const reach = (drawn + 30) / len;
        let far: Party | null = null;
        let worst = reach;
        for (const pt of parties) {
          const d = Math.abs(pt.t - avatarT);
          if (d > worst && farFrom(pt, c, drawn + 20)) {
            worst = d;
            far = pt;
          }
        }
        if (far) {
          const pt = far;
          // Just past the view distance, or further out when another party already walks there (spaced
          // ~SPACING apart, so they come into view one by one instead of in a procession).
          let at: ReturnType<typeof respawnT> = null;
          for (let j = 0; j < 4 && !at; j++) {
            const cand = respawnT(avatarT, (drawn + 8 + j * SPACING + R() * 6) / len, recycleSide);
            if (cand && parties.every((o) => o === pt || Math.abs(o.t - cand.t) * len > SPACING * 0.8)) at = cand;
          }
          recycleSide = recycleSide === 1 ? -1 : 1;
          if (at) {
            const keep = { t: pt.t, span: pt.span, dir: pt.dir };
            pt.t = at.t;
            pt.span = at.span;
            pt.dir = at.dir;
            pt.pause = 0;
            placeParty(pt);
            // Only if the new place is really out of sight (a long straight could show it): else undo.
            if (pt.members.some((w) => c.seen(w.p.x, w.p.y + 0.8, w.p.z, drawn))) {
              Object.assign(pt, keep);
              placeParty(pt);
            }
          }
        }
      }
      near = null;
      let best = REACH;
      for (const pt of parties) {
        if (!pt.members[0]?.p.active) continue;
        if (farFrom(pt, c, drawn)) {
          // Far: keep walking on a cheap schedule (no steering, no pose), hidden.
          advance(pt, c.dt, false);
          for (const w of pt.members) w.p.hide();
          placeParty(pt);
          continue;
        }
        // Near: the party's t follows its first member (who steers); the others keep up beside them.
        const lead = pt.members[0] as Walker;
        const held = pt.members.some((w) => w.yielding);
        advance(pt, c.dt, held);
        for (const w of pt.members) {
          step(w, c);
          const d = Math.hypot(w.p.x - c.avatar.x, w.p.z - c.avatar.z);
          if (d < best) {
            best = d;
            near = w;
          }
        }
        // Keep the party's t from running ahead of where its leader actually is (bends, giving way).
        const lt = trail.nearestT(lead.p.x, lead.p.z);
        if (Math.abs(lt - pt.t) * len > 2.5) pt.t = lt + (pt.dir * 2.5) / len;
      }
    },
    greeter(): Greeter | null {
      if (!near) return null;
      const w = near;
      head.set(w.p.x, w.p.y + (w.child ? 1.2 : 1.85), w.p.z);
      return {
        head,
        text: greeting("walker", w.greetN),
        greet() {
          w.wave = 2.2;
          w.greetN++;
        },
      };
    },
    people: () => walkers.filter((w) => w.p.active).length,
    points: () => walkers.map((w) => ({ x: w.p.x, z: w.p.z })),
    dev: {
      /** Parties' road t (screenshots). */
      parties: () => parties.map((pt) => ({ t: pt.t, dir: pt.dir, n: pt.members.length })),
    },
    dispose() {
      for (const w of walkers) w.p.dispose();
    },
  };
}
