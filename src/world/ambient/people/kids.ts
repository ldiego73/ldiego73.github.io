/**
 * Children playing on the grass by the trailhead: tag (one chases, the others dodge), kicking a woven ball
 * around, and hopping games. When the traveler comes very close they scamper off a few steps with a
 * little skip, look back and carry on. Day only.
 */
import * as THREE from "three";
import { fleeTarget, PLAY, within } from "./logic";
import { DARKS, MAN, type PartName, POLLERAS, PONCHOS, rng, SKINS, WEAVES, WOMAN } from "./models";
import { damp, Person } from "./person";
import type { Crowd, Palette } from "./rig";
import type { Ctx, Group } from "./types";

type Game = "tag" | "ball" | "hop";
const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;
const out = { x: 0, z: 0 };

export function createKids(
  env: Ctx["env"],
  crowd: Crowd,
  staticMat: THREE.Material,
  center: THREE.Vector3,
  area: number,
  n: number,
): Group {
  const R = rng(9001);
  const wears: PartName[][] = Array.from({ length: n }, (_, i) => (i % 2 ? [...MAN, "chullo"] : [...WOMAN]));
  const kids = wears.map((w, i) => {
    const boy = i % 2 === 1;
    const palette: Palette = [
      pick(R, SKINS),
      boy ? pick(R, PONCHOS) : pick(R, POLLERAS),
      pick(R, WEAVES),
      pick(R, DARKS),
    ];
    const p = new Person({
      kind: "child",
      crowd,
      idx: crowd.alloc(),
      wear: w,
      palette,
      scale: 0.6 + R() * 0.08,
      headScale: 1.3,
      radius: 0.26,
      seed: 5 + i * 11.3,
    });
    const a = (i / n) * Math.PI * 2;
    p.place(center.x + Math.cos(a) * area * 0.5, center.z + Math.sin(a) * area * 0.5);
    p.state = "play";
    return p;
  });

  // Woven ball (stripes in dyes).
  const ballGeo = new THREE.SphereGeometry(0.13, 10, 8);
  const cols = new Float32Array(ballGeo.getAttribute("position").count * 3);
  const pos = ballGeo.getAttribute("position");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 0.13;
    c.set(Math.abs(y) < 0.25 ? "#c4383f" : Math.abs(y) < 0.6 ? "#efe6d6" : "#dda63c");
    cols.set([c.r, c.g, c.b], i * 3);
  }
  ballGeo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  const ball = new THREE.Mesh(ballGeo, staticMat);
  ball.name = "people:ball";
  ball.castShadow = true;
  env.scene.add(ball);
  const bp = new THREE.Vector3(center.x, 0, center.z);
  const bv = new THREE.Vector2();
  let bvy = 0;
  let by = 0;

  let game: Game = "tag";
  let gameT = 14;
  let it = 0;
  let isDay: boolean | null = null;
  let frame = 0;
  let visibleNow = true;

  const clampArea = (p: { x: number; z: number }, r = area) => {
    const dx = p.x - center.x;
    const dz = p.z - center.z;
    const d = Math.hypot(dx, dz);
    if (d > r) {
      p.x = center.x + (dx / d) * r;
      p.z = center.z + (dz / d) * r;
    }
  };

  const group: Group = {
    name: "wawas",
    center,
    radius: area + 4,
    update(cx, visible) {
      const day = within(cx.time, PLAY[0], PLAY[1]);
      if (isDay === null || cx.jump) for (const k of kids) k.setActive(day);
      isDay = day;
      // Out to play / called home while the traveler isn't looking.
      if (frame++ % 15 === 0)
        for (const k of kids) if (k.active !== day && !cx.seen(k.x, k.y + 0.6, k.z, 80)) k.setActive(day);
      let anyone = false;
      for (const k of kids) anyone ||= k.active;
      ball.visible = anyone && visibleNow;
      if (visible !== visibleNow) {
        visibleNow = visible;
        if (!visible) for (const k of kids) k.hide();
        ball.visible = visible && anyone;
      }
      if (!visible || !anyone) return;
      const dt = cx.dt;
      gameT -= dt;
      if (gameT <= 0) {
        game = game === "tag" ? "ball" : game === "ball" ? "hop" : "tag";
        gameT = game === "hop" ? 9 : 16;
        it = (it + 1) % kids.length;
      }
      const ax = cx.avatar.x;
      const az = cx.avatar.z;
      const chaser = kids[it] as Person;
      // Ball: who is closest goes for it.
      let ballKid: Person | null = null;
      if (game === "ball") {
        let bd = Infinity;
        for (const k of kids) {
          const d = Math.hypot(k.x - bp.x, k.z - bp.z);
          if (d < bd && k.state === "play") {
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
        // The traveler comes very close: scamper off, giggling, then look back.
        if (k.state === "play" && da < 3.0) {
          fleeTarget(k.x, k.z, ax, az, center.x, center.z, area + 2.5, 3.5, out);
          k.tx = out.x;
          k.tz = out.z;
          k.state = "flee";
          k.timer = 2.2;
        }
        if (k.state === "flee") {
          const d = k.seek(k.tx, k.tz, 3.1, dt, 6);
          if (d < 0.4 || k.timer <= 0) {
            k.state = "peek";
            k.timer = 1.6;
          }
        } else if (k.state === "peek") {
          k.speed = damp(k.speed, 0, 8, dt);
          k.face(ax, az, dt, 6);
          k.resolve(0.5);
          if (k.timer <= 0) k.state = "play";
        } else if (game === "tag") {
          if (k === chaser && k.timer > 0) {
            // The new "it" counts a moment before giving chase.
            k.speed = damp(k.speed, 0, 8, dt);
            k.resolve(0.5);
          } else if (k === chaser) {
            // Chase the nearest other child.
            let best: Person | null = null;
            let bd = Infinity;
            for (const o of kids)
              if (o !== k) {
                const d = Math.hypot(o.x - k.x, o.z - k.z);
                if (d < bd) {
                  bd = d;
                  best = o;
                }
              }
            if (best) {
              k.seek(best.x, best.z, 2.6, dt, 5);
              if (bd < 0.7) {
                it = kids.indexOf(best);
                best.timer = 1.2;
              }
            }
          } else {
            const dc = Math.hypot(k.x - chaser.x, k.z - chaser.z);
            if (dc < 3.2) {
              fleeTarget(k.x, k.z, chaser.x, chaser.z, center.x, center.z, area, 2.5, out);
              k.seek(out.x, out.z, 2.4, dt, 5);
            } else {
              // Wander a little, bouncing on the spot.
              if (k.timer <= 0) {
                const a = (k.seed * 3.7 + cx.clock * 0.9) % (Math.PI * 2);
                k.tx = center.x + Math.cos(a) * area * 0.6;
                k.tz = center.z + Math.sin(a) * area * 0.6;
                k.timer = 2 + (k.seed % 2);
              }
              k.seek(k.tx, k.tz, 1.2, dt);
            }
          }
        } else if (game === "ball") {
          if (k === ballKid) {
            const d = k.seek(bp.x, bp.z, 2.3, dt, 5);
            if (d < 0.45 && by < 0.1) {
              // Kick toward a friend.
              const to = kids[(i + 1 + (Math.floor(cx.clock) % (kids.length - 1))) % kids.length] as Person;
              const dx = to.x - bp.x;
              const dz = to.z - bp.z;
              const l = Math.hypot(dx, dz) || 1;
              const sp = Math.min(5.5, 2 + l * 0.9);
              bv.set((dx / l) * sp, (dz / l) * sp);
              bvy = 1.6;
              k.timer = 0.4;
            }
          } else {
            // Keep a spot around the ball, facing it.
            const a = (i / kids.length) * Math.PI * 2 + cx.clock * 0.1;
            k.tx = center.x + Math.cos(a) * area * 0.55;
            k.tz = center.z + Math.sin(a) * area * 0.55;
            const d = k.seek(k.tx, k.tz, 1.6, dt);
            if (d < 0.5) k.face(bp.x, bp.z, dt, 6);
          }
        } else {
          // Hop: a ring that skips round together.
          const a = (i / kids.length) * Math.PI * 2 + cx.clock * 0.45;
          k.tx = center.x + Math.cos(a) * 1.7;
          k.tz = center.z + Math.sin(a) * 1.7;
          k.seek(k.tx, k.tz, 1.4, dt, 6);
        }
        clampArea(k, area + 3);
        k.body.x = k.x;
        k.body.z = k.z;
        k.y = env.extra.groundAt(k.x, k.z);
        // Pose.
        const b = k.bones;
        k.rest(cx.clock, cx.rm);
        k.gait(dt, cx.rm, 1.2);
        const playing = k.state !== "peek";
        if (!cx.rm && playing && (game === "hop" || k.state === "flee" || k.speed > 1.8)) {
          // Skips: a bounce on every step, arms up on the hop game.
          const h = Math.abs(Math.sin(k.phase)) * (game === "hop" && k.state === "play" ? 0.22 : 0.1);
          b.hips.position.y += h;
          if (game === "hop" && k.state === "play") {
            b.armL.rotation.set(-0.3, 0, 1.0);
            b.armR.rotation.set(-0.3, 0, -1.0);
          }
        }
        if (k.state === "peek") {
          // Giggle: shoulders bob, a hand to the mouth.
          b.armR.rotation.set(-2.1, 0, 0.5);
          if (!cx.rm) b.torso.rotation.x = 0.1 + Math.abs(Math.sin(cx.clock * 14)) * 0.08;
        }
        if (k === ballKid && k.timer > 0 && !cx.rm) b.legR.rotation.x = -0.9 * (k.timer / 0.4);
        k.commit();
      }
      // Ball physics: rolls with friction, hops a little, stays in the play area.
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
          // Bounce back toward the middle.
          const nx = dx / d;
          const nz = dz / d;
          const vn = bv.x * nx + bv.y * nz;
          if (vn > 0) bv.set(bv.x - 2 * vn * nx * 0.6, bv.y - 2 * vn * nz * 0.6);
          bp.x = center.x + nx * area;
          bp.z = center.z + nz * area;
        }
        ball.rotation.x += bv.y * dt * 6;
        ball.rotation.z -= bv.x * dt * 6;
      }
      ball.position.set(bp.x, env.extra.groundAt(bp.x, bp.z) + 0.13 + by, bp.z);
    },
    drawCalls: () => 1,
    people: () => kids.filter((k) => k.active).length,
    dispose() {
      for (const k of kids) k.dispose();
      ballGeo.dispose();
      ball.removeFromParent();
    },
  };
  return group;
}
