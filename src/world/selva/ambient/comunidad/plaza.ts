/**
 * Children playing on the palafitos plaza, between the station board and the boardwalk: a kick-about with a
 * worn rubber ball, then a round of tag. When the traveler comes very close they scamper off a few steps,
 * giggle, look back and carry on (the same reaction as the mountain's children: people/logic.ts fleeTarget).
 * They keep to a circle on the open apron, clear of the porches (whose "E" spots stay free). Day only.
 */
import * as THREE from "three";
import { fleeTarget } from "../../../ambient/people/logic";
import { rng } from "../../../ambient/people/models";
import type { Npc } from "../../../ambient/people/npc";
import { damp } from "../../../ambient/people/person";
import type { HumanCrowd } from "../../../characters/crowd";
import { isOut } from "./logic";
import type { Ctx, Group } from "./types";
import { reveal, villager } from "./villager";

type Game = "ball" | "tag";
type Person = Npc;
const out = { x: 0, z: 0 };

export function createPlazaKids(
  env: Ctx["env"],
  crowd: HumanCrowd,
  staticMat: THREE.Material,
  center: THREE.Vector3,
  area: number,
  n: number,
): Group {
  const R = rng(5150);
  const ground = env.selva.groundAt;
  const kids = Array.from({ length: n }, (_, i) => {
    const p = villager(crowd, {
      kind: "child",
      who: i % 2 === 0 ? "boy" : "girl",
      r: R,
      radius: 0.26,
      seed: 7 + i * 13.1,
    });
    p.lookRange = 0;
    const a = (i / n) * Math.PI * 2;
    p.place(center.x + Math.cos(a) * area * 0.5, center.z + Math.sin(a) * area * 0.5);
    p.state = "play";
    return p;
  });

  // A worn rubber ball: white with two blue bands.
  const ballGeo = new THREE.SphereGeometry(0.14, 12, 8);
  const pos = ballGeo.getAttribute("position");
  const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 0.14;
    c.set(Math.abs(Math.abs(y) - 0.45) < 0.14 ? "#2f6fb5" : "#ece6da");
    cols.set([c.r, c.g, c.b], i * 3);
  }
  ballGeo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  const ball = new THREE.Mesh(ballGeo, staticMat);
  ball.name = "comunidad:ball";
  ball.castShadow = true;
  ball.visible = false;
  env.scene.add(ball);
  const bp = new THREE.Vector3(center.x, 0, center.z);
  const bv = new THREE.Vector2();
  let bvy = 0;
  let by = 0;

  let game: Game = "ball";
  let gameT = 18;
  let it = 0;
  let isDay: boolean | null = null;
  let frame = 0;
  let visibleNow = true;

  const clampArea = (p: { x: number; z: number }, r: number) => {
    const dx = p.x - center.x;
    const dz = p.z - center.z;
    const d = Math.hypot(dx, dz);
    if (d > r) {
      p.x = center.x + (dx / d) * r;
      p.z = center.z + (dz / d) * r;
    }
  };

  return {
    name: "plaza-kids",
    center,
    radius: area + 4,
    update(cx, visible) {
      const day = isOut("play", cx.time);
      if (isDay === null || cx.jump) for (const k of kids) k.setActive(day);
      isDay = day;
      // Out to play / called home while the traveler isn't looking.
      if (frame++ % 15 === 0)
        for (const k of kids) if (k.active !== day && !cx.seen(k.x, k.y + 0.6, k.z, 80)) k.setActive(day);
      let anyone = false;
      for (const k of kids) anyone ||= k.active;
      if (visible !== visibleNow) {
        visibleNow = visible;
        for (const k of kids) {
          if (!visible) k.hide();
          else reveal(k);
        }
      }
      ball.visible = visible && anyone;
      if (!visible || !anyone) return;
      const dt = cx.dt;
      gameT -= dt;
      if (gameT <= 0) {
        game = game === "ball" ? "tag" : "ball";
        gameT = game === "tag" ? 12 : 20;
        it = (it + 1) % kids.length;
      }
      const ax = cx.avatar.x;
      const az = cx.avatar.z;
      const chaser = kids[it] as Person;
      let ballKid: Person | null = null;
      if (game === "ball") {
        let bd = Number.POSITIVE_INFINITY;
        for (const k of kids) {
          const d = Math.hypot(k.x - bp.x, k.z - bp.z);
          if (k.active && d < bd && k.state === "play") {
            bd = d;
            ballKid = k;
          }
        }
      }
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i] as Person;
        if (!k.active) continue;
        k.timer -= dt;
        const da = Math.hypot(k.x - ax, k.z - az);
        if (k.state === "play" && da < 2.8) {
          fleeTarget(k.x, k.z, ax, az, center.x, center.z, area + 1.5, 3.2, out);
          k.tx = out.x;
          k.tz = out.z;
          k.state = "flee";
          k.timer = 2.0;
        }
        if (k.state === "flee") {
          const d = k.seek(k.tx, k.tz, 3.0, dt, 6);
          if (d < 0.4 || k.timer <= 0) {
            k.state = "peek";
            k.timer = 1.5;
          }
        } else if (k.state === "peek") {
          k.speed = damp(k.speed, 0, 8, dt);
          k.face(ax, az, dt, 6);
          k.resolve(0.5);
          if (k.timer <= 0) k.state = "play";
        } else if (game === "tag") {
          if (k === chaser && k.timer > 0) {
            k.speed = damp(k.speed, 0, 8, dt);
            k.resolve(0.5);
          } else if (k === chaser) {
            let best: Person | null = null;
            let bd = Number.POSITIVE_INFINITY;
            for (const o of kids)
              if (o !== k && o.active) {
                const d = Math.hypot(o.x - k.x, o.z - k.z);
                if (d < bd) {
                  bd = d;
                  best = o;
                }
              }
            if (best) {
              k.seek(best.x, best.z, 2.5, dt, 5);
              if (bd < 0.7) {
                it = kids.indexOf(best);
                best.timer = 1.2;
              }
            }
          } else {
            const dc = Math.hypot(k.x - chaser.x, k.z - chaser.z);
            if (dc < 3) {
              fleeTarget(k.x, k.z, chaser.x, chaser.z, center.x, center.z, area, 2.4, out);
              k.seek(out.x, out.z, 2.3, dt, 5);
            } else {
              if (k.timer <= 0) {
                const a = (k.seed * 3.7 + cx.clock * 0.9) % (Math.PI * 2);
                k.tx = center.x + Math.cos(a) * area * 0.6;
                k.tz = center.z + Math.sin(a) * area * 0.6;
                k.timer = 2 + (k.seed % 2);
              }
              k.seek(k.tx, k.tz, 1.2, dt);
            }
          }
        } else if (k === ballKid) {
          const d = k.seek(bp.x, bp.z, 2.3, dt, 5);
          if (d < 0.45 && by < 0.1) {
            // Kick it to a friend.
            const to = kids[(i + 1 + (Math.floor(cx.clock) % Math.max(1, kids.length - 1))) % kids.length] as Person;
            const dx = to.x - bp.x;
            const dz = to.z - bp.z;
            const l = Math.hypot(dx, dz) || 1;
            const sp = Math.min(5, 2 + l * 0.9);
            bv.set((dx / l) * sp, (dz / l) * sp);
            bvy = 1.4;
            k.timer = 0.4;
          }
        } else {
          // Keep a spot round the ball, facing it.
          const a = (i / kids.length) * Math.PI * 2 + cx.clock * 0.12;
          k.tx = center.x + Math.cos(a) * area * 0.6;
          k.tz = center.z + Math.sin(a) * area * 0.6;
          const d = k.seek(k.tx, k.tz, 1.6, dt);
          if (d < 0.5) k.face(bp.x, bp.z, dt, 6);
        }
        clampArea(k, area + 1);
        k.body.x = k.x;
        k.body.z = k.z;
        k.y = ground(k.x, k.z);
        // Pose: running about, a giggle when peeking back at the traveler, a kick at the ball.
        if (k.state === "peek") {
          k.anim.act("giggle", { side: i % 2 ? 1 : -1 });
          k.lookRange = 8;
        } else {
          k.lookRange = 0;
          if (k === ballKid && k.timer > 0) k.anim.act("kick", { fade: 0.1, side: 1 });
          else if (k.anim.action !== "kick") k.anim.act("none");
        }
        k.commit(cx);
      }
      // Ball: rolls with friction, hops a little, bounces back off the edge of the play area.
      if (game === "ball" || by > 0 || bv.lengthSq() > 0.01) {
        bp.x += bv.x * dt;
        bp.z += bv.y * dt;
        bvy -= 9.8 * dt;
        by = Math.max(0, by + bvy * dt);
        if (by === 0) {
          bvy = Math.abs(bvy) > 1.2 ? -bvy * 0.35 : 0;
          bv.multiplyScalar(Math.exp(-1.6 * dt));
        }
        const dx = bp.x - center.x;
        const dz = bp.z - center.z;
        const d = Math.hypot(dx, dz);
        if (d > area) {
          const nx = dx / d;
          const nz = dz / d;
          const vn = bv.x * nx + bv.y * nz;
          if (vn > 0) bv.set(bv.x - 2 * vn * nx * 0.6, bv.y - 2 * vn * nz * 0.6);
          bp.x = center.x + nx * area;
          bp.z = center.z + nz * area;
        }
        if (!cx.rm) {
          ball.rotation.x += bv.y * dt * 6;
          ball.rotation.z -= bv.x * dt * 6;
        }
      }
      ball.position.set(bp.x, ground(bp.x, bp.z) + 0.14 + by, bp.z);
    },
    people: () => kids.filter((k) => k.active).length,
    points: () => [{ x: center.x, z: center.z }],
    dispose() {
      for (const k of kids) k.dispose();
      ballGeo.dispose();
      ball.removeFromParent();
    },
  };
}
