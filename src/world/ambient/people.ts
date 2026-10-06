/**
 * People of the Andes along the Qhapaq Ñan (besides the chasqui NPCs):
 *  - campesinos working the andenes beside the trail by day (chakitaqlla, sowing, carrying a q'ipi, resting),
 *    walking home at dusk; at night a couple sits by a small fire (people/terraces.ts);
 *  - a small feria at the Avances tambo plaza: three stalls with vendors and a few shoppers; "E · Saludar"
 *    gets a short bilingual greeting (people/feria.ts);
 *  - children playing by the trailhead who scamper off when the traveler comes very close (people/kids.ts);
 *  - on Inti Raymi (calendar festivalOf()), dancers in festive dress circle the summit plaza (people/dancers.ts).
 *    Their crowd slots are reserved at load and the date is re-checked (festival/datewatch.ts), so they join
 *    when the festival starts mid-session and leave when it ends.
 *
 * Every person registers a Body in `creatures` (kinds "campesino", "vendor", "shopper", "child", "dancer"),
 * steers around bodies ahead and resolves overlaps. Rendering: per site, one InstancedMesh per body part
 * with per-instance palette colors (people/rig.ts) — about 8–15 draw calls per visible site, hidden by distance.
 * Low quality: fewer sites and people, shorter view distance.
 */
import "./people/people.css";
import * as THREE from "three";
import { festivalOf } from "../calendar";
import type { Ambient, CreateAmbient } from "../contract";
import type { WorldEnvExtra } from "../env";
import { on } from "../events";
import { dateWatch } from "./festival/datewatch";
import { createDancers, DANCE_RING, type DancerGroup } from "./people/dancers";
import { createFeria, type FeriaFrame } from "./people/feria";
import { createKids } from "./people/kids";
import { headcount, jumped } from "./people/logic";
import { ALL_PARTS, partSpecs, SHADOW_PARTS } from "./people/models";
import { Crowd, paletteMaterial } from "./people/rig";
import { createTerraceSite, findSite } from "./people/terraces";
import type { Ctx, Group } from "./people/types";

const TERRACE_SEEDS: Array<{ t: number; side: 1 | -1 }> = [
  { t: 0.05, side: -1 },
  { t: 0.195, side: 1 },
  { t: 0.305, side: -1 },
];
const FERIA_AT = "avances";
const KIDS_T = 0.036;

export const create: CreateAmbient = (envIn, hudRoot): Ambient => {
  const env = envIn as WorldEnvExtra;
  const n = headcount(env.quality);
  let low = env.quality === "low";
  const offQ = on("world:quality", (d) => {
    low = d.quality === "low";
  });

  const ramp = env.toon("#ffffff").gradientMap;
  const mat = paletteMaterial(ramp);
  const staticMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });

  // ------------------------------------------------------------ bubble (vendor greetings)
  const layer = document.createElement("div");
  layer.className = "qn-hud qn-people-layer";
  layer.lang = env.lang;
  hudRoot.appendChild(layer);
  const bubbleEl = document.createElement("p");
  bubbleEl.className = "qn-people-bubble";
  bubbleEl.setAttribute("role", "status");
  bubbleEl.setAttribute("aria-live", "polite");
  layer.appendChild(bubbleEl);
  const bubbleAt = new THREE.Vector3();
  let bubbleT = 0;
  const showBubble = (text: string, at: THREE.Vector3) => {
    // The Quechua greeting (before the first "!" / ",") in italics.
    const m = /^(¡?[^!,]+[!,])(.*)$/.exec(text);
    bubbleEl.replaceChildren();
    if (m) {
      const i = document.createElement("i");
      i.lang = "qu";
      i.textContent = m[1] as string;
      bubbleEl.append(i, m[2] as string);
    } else bubbleEl.textContent = text;
    bubbleAt.copy(at);
    bubbleT = 4.8;
    bubbleEl.classList.add("is-on");
  };
  const proj = new THREE.Vector3();
  const placeBubble = () => {
    proj.copy(bubbleAt).project(env.camera);
    const w = hudRoot.clientWidth || innerWidth;
    const h = hudRoot.clientHeight || innerHeight;
    const on = proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05;
    bubbleEl.style.visibility = on ? "" : "hidden";
    const x = THREE.MathUtils.clamp(((proj.x + 1) / 2) * w, 160, w - 160);
    const y = THREE.MathUtils.clamp(((1 - proj.y) / 2) * h, 120, h - 40);
    bubbleEl.style.left = `${Math.round(x)}px`;
    bubbleEl.style.top = `${Math.round(y)}px`;
  };

  // ------------------------------------------------------------ groups
  const groups: Group[] = [];
  const festival = dateWatch(() => festivalOf() === "inti-raymi");
  // Dancer slots are always reserved: hidden instances cost nothing, and the festival can start mid-session.
  const total = n.sites * n.perSite + n.stalls + n.shoppers + n.children + n.dancers;
  const crowd = new Crowd(partSpecs(ALL_PARTS), total, mat, SHADOW_PARTS);
  const danceSlots = Array.from({ length: n.dancers }, () => crowd.alloc());
  env.scene.add(crowd.group);
  const trail = env.trail;
  const hw = trail.halfWidth;

  // Andenes.
  TERRACE_SEEDS.slice(0, n.sites).forEach((s, i) => {
    const tread = findSite(env, s.t, s.side);
    if (tread) groups.push(createTerraceSite(env, crowd, staticMat, tread, n.perSite, 17 + i * 31, i === 0));
  });

  // Children by the trailhead, on open grass across from the gate.
  {
    const P = new THREE.Vector3();
    const T = new THREE.Vector3();
    let best: THREE.Vector3 | null = null;
    let bestScore = -1;
    for (const dt of [0, 0.006, -0.006, 0.012]) {
      trail.pointAt(KIDS_T + dt, P);
      trail.tangentAt(KIDS_T + dt, T);
      for (const side of [-1, 1])
        for (const off of [hw + 5, hw + 6.5, hw + 8]) {
          const x = P.x - T.z * side * off;
          const z = P.z + T.x * side * off;
          let score = 0;
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            for (const r of [1.5, 3.5])
              if (env.extra.isGrass(x + Math.cos(a) * r, z + Math.sin(a) * r)) score += r > 2 ? 1 : 1.5;
          }
          if (side === -1) score += 2; // across from the gate's llamas
          if (score > bestScore) {
            bestScore = score;
            best = new THREE.Vector3(x, env.heightAt(x, z), z);
          }
        }
    }
    if (best) groups.push(createKids(env, crowd, staticMat, best, 4, n.children));
  }

  // Inti Raymi dancers at the summit plaza (same center as the summit content): built the first time the
  // festival is on, then switched on/off with the date.
  let dancers: DancerGroup | null = null;
  const syncDancers = () => {
    if (festival.on && !dancers) {
      const p1 = trail.pointAt(1);
      const tg = trail.tangentAt(1);
      const dir = new THREE.Vector3(tg.x, 0, tg.z).normalize();
      const center = p1.clone().addScaledVector(dir, 3.5);
      center.y = env.heightAt(center.x, center.z);
      const yaw = Math.atan2(p1.x - center.x, p1.z - center.z);
      dancers = createDancers(env, crowd, center, yaw, n.dancers, danceSlots);
      groups.push(dancers);
    } else dancers?.enable(festival.on);
  };
  syncDancers();

  // Feria: built once the tambo is in the scene (to put the stalls on the side away from its khipu frame).
  let feria: Group | null = null;
  let feriaWait = 0;
  const buildFeria = () => {
    const pose = env.stationPose(FERIA_AT);
    let side = -1;
    const tambo = env.scene.getObjectByName(`tambo:${FERIA_AT}`);
    if (tambo) {
      // The khipu frame is the scaled child standing in front of the building at one side.
      for (const ch of tambo.children)
        if (Math.abs(ch.scale.x - 1.25) < 0.01 && Math.abs(ch.position.z - 0.9) < 0.05)
          side = -Math.sign(ch.position.x) || -1;
    }
    const yaw = tambo ? tambo.rotation.y : pose.yaw;
    const frame: FeriaFrame = {
      x: tambo ? tambo.position.x : pose.position.x,
      z: tambo ? tambo.position.z : pose.position.z,
      yaw,
      side,
    };
    feria = createFeria(env, crowd, staticMat, frame, n.stalls, n.shoppers, showBubble);
    groups.push(feria);
  };

  // ------------------------------------------------------------ frame
  const camPos = new THREE.Vector3();
  const seenV = new THREE.Vector3();
  const ctx: Ctx = {
    env,
    dt: 0,
    clock: 0,
    time: env.sky.time(),
    jump: false,
    avatar: new THREE.Vector3(),
    rm: env.reducedMotion,
    low,
    seen(x, y, z, max = 70) {
      if (Math.hypot(x - camPos.x, z - camPos.z) > max) return false;
      seenV.set(x, y, z).project(env.camera);
      return seenV.z < 1 && Math.abs(seenV.x) < 1.15 && Math.abs(seenV.y) < 1.15;
    },
  };
  let lastTime = env.sky.time();

  const ambient: Ambient = {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      ctx.dt = dt;
      ctx.clock += dt;
      ctx.avatar.copy(avatar);
      ctx.low = low;
      const time = env.sky.time();
      ctx.jump = jumped(lastTime, time, dt);
      lastTime = time;
      ctx.time = time;
      env.camera.getWorldPosition(camPos);
      if (festival.step(dt)) syncDancers();
      if (!feria) {
        feriaWait += dt;
        if (env.scene.getObjectByName(`tambo:${FERIA_AT}`) || feriaWait > 6) buildFeria();
      }
      const view = low ? 70 : 105;
      for (const g of groups) {
        const d = Math.hypot(g.center.x - camPos.x, g.center.z - camPos.z) - g.radius;
        const da = Math.hypot(g.center.x - avatar.x, g.center.z - avatar.z) - g.radius;
        g.update(ctx, Math.min(d, da) < view);
      }
      crowd.flush();
      if (bubbleT > 0) {
        bubbleT -= dt;
        placeBubble();
        const far = Math.hypot(bubbleAt.x - avatar.x, bubbleAt.z - avatar.z) > 7;
        if (bubbleT <= 0 || far) {
          bubbleT = 0;
          bubbleEl.classList.remove("is-on");
        }
      }
      layer.classList.toggle("is-night", env.sky.isNight());
    },
    prompt() {
      for (const g of groups) {
        const p = g.prompt?.(ctx);
        if (p) return p;
      }
      return null;
    },
    interact() {
      for (const g of groups) if (g.prompt?.(ctx) && g.interact?.(ctx)) return true;
      return false;
    },
    dispose() {
      offQ();
      for (const g of groups) g.dispose();
      groups.length = 0;
      crowd.dispose();
      mat.dispose();
      staticMat.dispose();
      layer.remove();
    },
  };

  if (import.meta.env?.DEV) {
    const debug = {
      groups: () =>
        groups.map((g) => ({
          name: g.name,
          x: +g.center.x.toFixed(1),
          z: +g.center.z.toFixed(1),
          y: +g.center.y.toFixed(1),
          r: g.radius,
          people: g.people(),
          drawCalls: g.drawCalls(),
          points: g.points?.() ?? [],
        })),
      ring: DANCE_RING,
      drawCalls: () => crowd.drawCalls(),
    };
    (window as unknown as { __people?: typeof debug }).__people = debug;
  }
  return ambient;
};
