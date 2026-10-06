/**
 * Campesinos on the andenes beside the trail. Each work site is one terrace tread (a flat contour strip,
 * found at runtime from the terrain) where a small team works the way it is still done in the highlands:
 * men turn the sod with the chakitaqlla (foot plough: plunge with the foot on the peg, lever back, step on)
 * while women follow sowing from a pouch, and another carries a q'ipi (a load wrapped in a lliclla) along
 * the terrace. Now and then someone sits down to rest. They arrive after sunrise and walk home at dusk,
 * appearing / leaving at the far end of the terrace while unseen. At night a couple sits by a small fire.
 */
import * as THREE from "three";
import { RISER_FROM, TERRACE_STEP } from "../../layout";
import { glowSprite } from "../../props";
import { alongTread, findTread, jumped, type Tread, WORK, within } from "./logic";
import { DARKS, hearth, MAN, type PartName, POLLERAS, PONCHOS, rng, SKINS, Static, WEAVES, WOMAN } from "./models";
import { damp, Person } from "./person";
import type { Crowd, Palette } from "./rig";
import type { Ctx, Group } from "./types";

type Role = "plough" | "sow" | "carry";

interface Worker {
  p: Person;
  role: Role;
  /** Arc position on the tread and working direction. */
  s: number;
  dir: 1 | -1;
  restIn: number;
  fire: number;
  /** Seconds waiting at the home end of the terrace. */
  wait: number;
}

const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;
const pt = { x: 0, z: 0, dx: 1, dz: 0 };
const scratch = new THREE.Vector3();

/** Terrace flat test: inside the level part of a step (not on the riser). */
function onFlat(h: number) {
  const k = h / TERRACE_STEP;
  const f = k - Math.floor(k);
  return f > 0.04 && f < RISER_FROM - 0.06;
}

export function findSite(env: Ctx["env"], t: number, side: 1 | -1): Tread | null {
  const tr = env.trail;
  const ex = env.extra;
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  let best: Tread | null = null;
  let bestScore = -Infinity;
  for (const dt of [0, 0.006, -0.006, 0.012, -0.012]) {
    tr.pointAt(t + dt, P);
    tr.tangentAt(t + dt, T);
    const rx = -T.z * side;
    const rz = T.x * side;
    for (const off of [6.5, 7.5, 8.5, 10, 11.5, 13]) {
      const x = P.x + rx * off;
      const z = P.z + rz * off;
      const h = env.heightAt(x, z);
      const dy = h - P.y;
      if (dy < -2.8 || dy > 3.4 || !onFlat(h)) continue;
      if (ex.trailDistance(x, z).d < tr.halfWidth + 3.2) continue;
      const ok = (qx: number, qz: number) =>
        ex.isGrass(qx, qz) && ex.trailDistance(qx, qz).d > tr.halfWidth + 2.6 && !ex.isWater(qx, qz);
      const tread = findTread(env.heightAt, ok, x, z, { maxLen: 15, minLen: 7, tol: 0.2 });
      if (!tread) continue;
      const score = tread.length - Math.abs(dy) * 1.2 - off * 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = tread;
      }
    }
  }
  return best;
}

export function createTerraceSite(
  env: Ctx["env"],
  crowd: Crowd,
  staticMat: THREE.Material,
  tread: Tread,
  n: number,
  seed: number,
  withFire: boolean,
): Group {
  const R = rng(seed);
  const roles: Role[] =
    n >= 4 ? ["plough", "sow", "plough", "carry"] : n === 3 ? ["plough", "sow", "carry"] : ["plough", "sow"];
  const wears: PartName[][] = roles.map((role, i) => {
    const man = role === "plough";
    const hat: PartName = man ? (R() < 0.75 ? "chullo" : "sombrero") : i % 2 ? "montera" : "sombrero";
    const extra: PartName[] = role === "plough" ? ["chakitaqlla"] : role === "sow" ? ["pouch"] : ["bundle"];
    return [...(man ? MAN : WOMAN), hat, ...extra];
  });
  const mid = new THREE.Vector3();
  alongTread(tread, tread.length / 2, pt);
  mid.set(pt.x, tread.y, pt.z);

  const workers: Worker[] = roles.map((role, i) => {
    const man = role === "plough";
    const palette: Palette = [
      pick(R, SKINS),
      man ? pick(R, PONCHOS) : pick(R, POLLERAS),
      pick(R, WEAVES),
      pick(R, DARKS),
    ];
    const p = new Person({
      kind: "campesino",
      crowd,
      idx: crowd.alloc(),
      wear: wears[i] as PartName[],
      palette,
      scale: man ? 1.0 + R() * 0.06 : 0.93 + R() * 0.05,
      girth: man ? 1.05 : 1,
      radius: 0.36,
      seed: seed * 7 + i * 13.7,
    });
    const span = tread.length - 1.6;
    return {
      p,
      role,
      s: 0.8 + (span * (i + 0.5)) / roles.length,
      dir: i % 2 ? -1 : 1,
      restIn: 25 + R() * 50,
      fire: -1,
      wait: 0,
    } as Worker;
  });

  // Home end: the end of the tread farther from the trail (people come and go there).
  alongTread(tread, 0, pt);
  const d0 = env.extra.trailDistance(pt.x, pt.z).d;
  alongTread(tread, tread.length, pt);
  const d1 = env.extra.trailDistance(pt.x, pt.z).d;
  const homeS = d1 > d0 ? tread.length : 0;

  // Night: a small hearth at the home end where the first two sit.
  let fireGroup: THREE.Group | null = null;
  let flames: THREE.Mesh[] = [];
  let glow: THREE.Sprite | null = null;
  let staticGeo: THREE.BufferGeometry | null = null;
  const fireS = Math.abs(homeS - 1.8);
  const fire = new THREE.Vector3();
  if (withFire) {
    alongTread(tread, fireS, pt);
    fire.set(pt.x, env.heightAt(pt.x, pt.z), pt.z);
    const s = new Static();
    hearth(s, new THREE.Matrix4().makeTranslation(fire.x, fire.y, fire.z));
    staticGeo = s.build();
    const hm = new THREE.Mesh(staticGeo, staticMat);
    hm.name = "people:hearth";
    fireGroup = new THREE.Group();
    fireGroup.add(hm);
    const fl = new THREE.Group();
    fl.position.copy(fire);
    const fm = env.toon("#ffb35c", { emissive: "#ff8a3d", emissiveIntensity: 1.6 });
    const fm2 = env.toon("#ffe08a", { emissive: "#ffd36b", emissiveIntensity: 1.8 });
    const cone = new THREE.ConeGeometry(1, 1, 6);
    flames = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(cone, i === 2 ? fm2 : fm);
      m.position.set(i === 0 ? 0.08 : i === 1 ? -0.08 : 0, 0.25, i === 1 ? 0.05 : 0);
      m.scale.set(i === 2 ? 0.09 : 0.14, i === 2 ? 0.3 : 0.42, i === 2 ? 0.09 : 0.14);
      fl.add(m);
      return m;
    });
    glow = glowSprite(env, "#ffb35c", 2.6);
    glow.position.y = 0.45;
    fl.add(glow);
    env.noOutline(fl);
    fireGroup.add(fl);
    fl.name = "people:flames";
    env.scene.add(fireGroup);
    workers[0]!.fire = 0;
    if (workers[1]) workers[1].fire = 1;
  }

  const workSpot = (w: Worker) => {
    const lo = 0.8;
    const hi = tread.length - 0.8;
    w.s = Math.max(lo, Math.min(hi, w.s));
    return alongTread(tread, w.s, pt);
  };
  const firePlace = (w: Worker) => {
    // Sit on either side of the hearth, along the tread, facing it.
    alongTread(tread, fireS + (w.fire === 0 ? -0.95 : 0.95), pt);
    return pt;
  };

  let wasWork: boolean | null = null;
  let lastTime = -1;
  let frame = 0;

  const snap = (w: Worker, work: boolean) => {
    const p = w.p;
    if (work) {
      p.setActive(true);
      workSpot(w);
      p.place(pt.x, pt.z, Math.atan2(pt.dx * w.dir, pt.dz * w.dir));
      p.state = "work";
    } else if (w.fire >= 0) {
      p.setActive(true);
      firePlace(w);
      p.place(pt.x, pt.z, Math.atan2(fire.x - pt.x, fire.z - pt.z));
      p.state = "fire";
    } else {
      p.setActive(false);
      p.state = "home";
    }
  };

  const stepWorker = (w: Worker, c: Ctx) => {
    const p = w.p;
    const dt = c.dt;
    const b = p.bones;
    const work = within(c.time, WORK[0], WORK[1]);
    p.timer -= dt;
    switch (p.state) {
      case "home": {
        alongTread(tread, homeS, pt);
        if (work && !c.seen(pt.x, tread.y + 1, pt.z, 60)) {
          p.setActive(true);
          p.place(pt.x, pt.z);
          p.state = "toWork";
        } else if (!work && w.fire >= 0) {
          p.setActive(true);
          p.place(pt.x, pt.z);
          p.state = "toFire";
        }
        return;
      }
      case "toWork": {
        workSpot(w);
        if (p.seek(pt.x, pt.z, 1.15, dt) < 0.3) p.state = "work";
        if (!work) p.state = w.fire >= 0 ? "toFire" : "toHome";
        break;
      }
      case "toHome": {
        alongTread(tread, homeS, pt);
        const d = p.seek(pt.x, pt.z, 1.15, dt);
        // At the end of the terrace: leave once unseen (or after a while, even if watched).
        w.wait = d < 0.35 ? w.wait + dt : 0;
        if (work) p.state = "toWork";
        else if (w.wait > 0 && (!c.seen(p.x, p.y + 1, p.z, 60) || w.wait > 20)) {
          p.setActive(false);
          p.state = "home";
          return;
        }
        break;
      }
      case "toFire": {
        firePlace(w);
        if (p.seek(pt.x, pt.z, 1.1, dt) < 0.2) p.state = "fire";
        if (work) p.state = "toWork";
        break;
      }
      case "fire": {
        p.speed = 0;
        p.face(fire.x, fire.z, dt, 3);
        p.resolve(0.2);
        if (work) p.state = "toWork";
        break;
      }
      case "rest": {
        p.speed = 0;
        if (p.timer <= 0) {
          p.state = "work";
          w.restIn = 35 + R() * 50;
        }
        if (!work) p.state = w.fire >= 0 ? "toFire" : "toHome";
        break;
      }
      default: {
        // work
        if (!work) {
          p.state = w.fire >= 0 ? "toFire" : "toHome";
          break;
        }
        w.restIn -= dt;
        if (w.restIn <= 0) {
          p.state = "rest";
          p.timer = 9 + R() * 8;
          // Sit facing the valley (toward the trail side).
          const q = env.extra.trailDistance(p.x, p.z);
          const tp = env.trail.pointAt(q.t, scratch);
          p.v = Math.atan2(tp.x - p.x, tp.z - p.z);
          break;
        }
        if (w.role === "plough") {
          // Stroke: plunge (0–0.35), lever (0.35–0.65), step on (0.65–1).
          const k = (c.clock * 0.4 + p.seed) % 1;
          if (k > 0.65) w.s += w.dir * (0.32 / (0.35 / 0.4)) * dt;
          if (w.s <= 0.9 || w.s >= tread.length - 0.9) {
            w.dir = w.s <= 0.9 ? 1 : -1;
          }
          workSpot(w);
          p.seek(pt.x, pt.z, 0.6, dt, 8);
          p.yaw = Math.atan2(pt.dx * w.dir, pt.dz * w.dir);
          p.speed = 0;
        } else if (w.role === "sow") {
          // Follow the plough partner a step and a half behind.
          const lead = workers[workers.indexOf(w) - 1];
          if (lead && lead.p.state === "work") {
            w.dir = lead.dir;
            w.s = lead.s - lead.dir * 1.6;
          }
          workSpot(w);
          const d = p.seek(pt.x, pt.z, 0.9, dt);
          if (d < 0.3) p.yaw = Math.atan2(pt.dx * w.dir, pt.dz * w.dir);
          if (lead && lead.p.state === "rest" && p.state === "work") {
            p.state = "rest";
            p.timer = lead.p.timer;
            p.v = lead.p.v;
          }
        } else {
          // Carry the q'ipi from one end of the terrace to the other, pausing at the ends.
          if (p.timer > 0) {
            p.speed = damp(p.speed, 0, 6, dt);
          } else {
            w.s += w.dir * 0.85 * dt;
            if (w.s <= 0.9 || w.s >= tread.length - 0.9) {
              w.dir = w.s <= 0.9 ? 1 : -1;
              p.timer = 3 + R() * 3;
            }
            workSpot(w);
            p.seek(pt.x, pt.z, 1.4, dt);
          }
        }
      }
    }
    p.y = env.extra.groundAt(p.x, p.z);
    animate(w, c, b);
  };

  const animate = (w: Worker, c: Ctx, b: Person["bones"]) => {
    const p = w.p;
    const rm = c.rm;
    p.rest(c.clock, rm);
    const st = p.state;
    if (st === "fire") {
      p.sit(c.clock, rm, 0.05);
      b.armL.rotation.set(-0.9, 0, 0.3);
      b.armR.rotation.set(-0.9, 0, -0.3);
      p.commit();
      return;
    }
    if (st === "rest") {
      p.yaw = Math.atan2(Math.sin(p.v), Math.cos(p.v));
      p.sit(c.clock, rm);
      p.commit();
      return;
    }
    p.gait(c.dt, rm, w.role === "carry" ? 0.5 : 1);
    if (w.role === "carry" && p.state !== "home") {
      // Hands at the knot on the chest, leaning into the load.
      b.armL.rotation.set(-1.25, 0, -0.35);
      b.armR.rotation.set(-1.25, 0, 0.35);
      b.torso.rotation.x += 0.22;
      if (p.timer > 0 && !rm) b.torso.rotation.x += Math.sin(c.clock * 2 + p.seed) * 0.05;
    }
    if (st === "work" && w.role === "plough") {
      const k = rm ? 0.5 : (c.clock * 0.4 + p.seed) % 1;
      const plunge = k < 0.35 ? Math.sin((k / 0.35) * Math.PI) : 0;
      const lever = k >= 0.35 && k < 0.65 ? Math.sin(((k - 0.35) / 0.3) * Math.PI) : 0;
      const stepK = k >= 0.65 ? (k - 0.65) / 0.35 : 0;
      b.tool.position.set(-0.1, 0, 0.5 + lever * 0.05);
      b.tool.rotation.x = -0.32 + plunge * 0.12 - lever * 0.32;
      // Right foot on the peg pushes down; the body levers back on the handle.
      b.legR.rotation.x = -0.55 * plunge + Math.sin(stepK * Math.PI) * 0.35;
      b.legL.rotation.x = -Math.sin(stepK * Math.PI) * 0.3;
      b.hips.position.y = plunge * 0.04;
      b.torso.rotation.x = 0.28 - lever * 0.32 + plunge * 0.08;
      b.armR.rotation.set(-0.95 - lever * 0.2, 0, 0.12);
      b.armL.rotation.set(-1.15 - lever * 0.15, 0, -0.18);
      b.head.rotation.x = 0.2;
    } else if (w.role === "plough") {
      // Shaft over the shoulder when walking to / from the terrace.
      b.tool.position.set(-0.32, 0.95, -0.35);
      b.tool.rotation.set(-0.55, 0, 0.15);
      b.armR.rotation.set(-2.35, 0, 0.2);
    }
    if (st === "work" && w.role === "sow" && p.speed < 0.2) {
      const k = rm ? 0.3 : (c.clock * 0.55 + p.seed) % 1;
      b.torso.rotation.x = 0.55 + Math.sin(k * Math.PI * 2) * 0.06;
      b.head.rotation.x = -0.15;
      b.armL.rotation.set(-0.7, 0, 0.1);
      // Dip into the pouch, then cast the seed in an arc low over the furrow.
      b.armR.rotation.set(k < 0.4 ? -0.4 - k * 0.8 : -0.72 + Math.sin(((k - 0.4) / 0.6) * Math.PI) * -0.75, 0, -0.25);
      b.legL.rotation.x = -0.25;
      b.legR.rotation.x = 0.2;
    }
    p.commit();
  };

  let visibleNow = true;
  const group: Group = {
    name: "andenes",
    center: mid,
    radius: tread.length / 2 + 4,
    update(c, visible) {
      const work = within(c.time, WORK[0], WORK[1]);
      const jump = lastTime >= 0 && jumped(lastTime, c.time, c.dt);
      lastTime = c.time;
      if (wasWork === null || jump || c.jump) for (const w of workers) snap(w, work);
      wasWork = work;
      if (visible !== visibleNow) {
        visibleNow = visible;
        if (!visible) for (const w of workers) w.p.hide();
        if (fireGroup) fireGroup.visible = visible;
      }
      if (!visible) {
        // Far away: keep the schedule (cheap) every ~0.5 s.
        if (frame++ % 30 === 0) for (const w of workers) if ((w.p.state === "work") !== work) snap(w, work);
        return;
      }
      for (const w of workers) {
        if (!w.p.active && w.p.state !== "home") w.p.state = "home";
        if (w.p.active || w.p.state === "home") stepWorker(w, c);
      }
      if (flames.length) {
        const night = !work;
        const fl = flames[0]!.parent as THREE.Object3D;
        fl.visible = night;
        if (night && !c.rm) {
          flames.forEach((m, i) => {
            const f = 1 + Math.sin(c.clock * (9 + i * 3.1) + i) * 0.14 + Math.sin(c.clock * 23 + i * 2) * 0.06;
            m.scale.y = (i === 2 ? 0.3 : 0.42) * f;
          });
          if (glow) (glow.material as THREE.SpriteMaterial).opacity = 0.7 + Math.sin(c.clock * 11) * 0.08;
        }
      }
    },
    drawCalls: () => (fireGroup ? 2 : 0),
    points: () => workers.map((w) => ({ x: w.p.x, z: w.p.z })),
    people: () => workers.filter((w) => w.p.active).length,
    dispose() {
      for (const w of workers) w.p.dispose();
      staticGeo?.dispose();
      if (flames[0]) flames[0].geometry.dispose();
      if (glow) (glow.material as THREE.Material).dispose();
      fireGroup?.removeFromParent();
    },
  };
  return group;
}
