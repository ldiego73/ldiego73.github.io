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
import type { Npc } from "../../../ambient/people/npc";
import { damp } from "../../../ambient/people/person";
import type { HumanCrowd } from "../../../characters/crowd";
import type { HeldProps } from "../../../characters/props";
import { BLOUSES, pick, SKIRTS, type Who } from "./dress";
import { asideOf, atSpanEnd, greeting, isOut, laneOf, partiesFor, respawnT, shouldGiveWay, spanAt } from "./logic";
import type { Ctx, Greeter, Group } from "./types";
import { villager } from "./villager";

interface Party {
  /** Road t of the party, walking direction, the stretch it walks (logic.ts ROAD_SPANS index). */
  t: number;
  dir: 1 | -1;
  span: number;
  pause: number;
  members: Walker[];
}

interface Walker {
  p: Npc;
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
export function createWalkers(env: Ctx["env"], crowd: HumanCrowd, props: HeldProps, n: number): Group {
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
      // Men in the cushma (a feather crown on the one walking unladen), women in blouse and kené skirt, young
      // men in a tee and shorts, children.
      const who: Who = child
        ? boy
          ? "boy"
          : "girl"
        : role === "youth"
          ? "youth"
          : man
            ? load === "none"
              ? "crown"
              : "man"
            : "woman";
      const sk = pick(R, SKIRTS);
      const p = villager(crowd, {
        kind: child ? "child" : "walker",
        who,
        r: R,
        ...(who === "woman" ? { skirt: sk, top: pick(R, BLOUSES) } : {}),
        radius: child ? 0.26 : 0.34,
        seed: 41 + i * 7.9,
      });
      if (load === "bananas") p.hold(props, "bananas");
      if (load === "basket") p.hold(props, "basket-back", pick(R, ["#8a6633", "#c4383f", "#2a9d8f"]));
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
    // Pose: the walk follows the speed; a banana bunch steadied on the shoulder, hands on the basket's straps
    // (leaning into the load), a wave when greeted, a nod while waiting at the edge.
    const a = p.anim;
    if (w.wave > 0) {
      w.wave -= dt;
      a.act("wave", { side: w.load === "bananas" ? -1 : 1 });
    } else if (w.load === "bananas") a.act("carry-shoulder", { side: 1 });
    else if (w.load === "basket") a.act("carry-back");
    else if (w.yielding && p.speed < 0.3) {
      // A small bow once, then they wait with hands clasped.
      if (w.child) a.act("hands-back");
      else if (a.action !== "greet" && a.action !== "hands-clasp") a.act("greet", { next: "hands-clasp" });
    } else a.act("none");
    p.lookRange = w.yielding ? 7 : 4;
    p.commit(c);
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
