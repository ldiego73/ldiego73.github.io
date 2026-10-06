/**
 * Secret: the cave behind the waterfall. Above the stream crossing (trail t≈0.37) the waterfall drops off a
 * rock step ~13 u above the path. A discreet switchback of stepping stones leaves the trail on the left bank
 * (walkable via env.addWalkable) and climbs to a grotto under an overhang beside the fall, screened by its
 * own veil of water. Inside: dark stone, glowworm specks, petroglyphs (Inti, llamas, a spiral) and an old
 * khipu on a peg. Walking in stamps `egg:waterfall-cave`; next to the khipu "E · Explorar" shows a caption.
 * While inside, the roof is hidden and `world:interior` pulls the camera in. Ducks, pool and the main
 * waterfall (terrain.ts) are untouched. Placement: ./cave/placement.ts (pure, tested).
 */
import "./cave/cave.css";
import type * as THREE from "three";
import type { Ambient, CreateAmbient, L } from "../contract";
import type { WorldEnvExtra } from "../env";
import { emit, on } from "../events";
import { buildCave } from "./cave/models";
import { type Frame, planCave, toLocal } from "./cave/placement";

const LABEL: L = { es: "Cueva tras la cascada", en: "Cave behind the waterfall" };
const T_EXPLORE: L = { es: "E · Explorar", en: "E · Explore" };
const CAPTION: L = {
  es: "Un khipu viejo junto a petroglifos de llamas, un sol y una espiral. Alguien guardó aquí, en nudos, la cuenta del agua.",
  en: "An old khipu beside petroglyphs of llamas, a sun and a spiral. Someone kept the count of the water here, in knots.",
};
const EXPLORE_R = 1.9;
/** Hide the whole cave beyond this distance (it is small; the veil reads from the trail below). */
const DRAW_R = 120;

/** The cliff frame from terrain.ts's "waterfall-cliff" group, or an estimate from env.extra.stream. */
function findFrame(env: WorldEnvExtra): Frame {
  const cliff = env.scene.getObjectByName("waterfall-cliff");
  if (cliff) return { x: cliff.position.x, z: cliff.position.z, y: cliff.position.y, yaw: cliff.rotation.y };
  // fallBase = spring + dir · 1.2; the stream runs from there down to the crossing.
  const { fallBase, cross } = env.extra.stream;
  const dx = cross.x - fallBase.x;
  const dz = cross.z - fallBase.z;
  const l = Math.hypot(dx, dz) || 1;
  const sx = fallBase.x - (dx / l) * 1.2;
  const sz = fallBase.z - (dz / l) * 1.2;
  return { x: sx - (dx / l) * 0.2, z: sz - (dz / l) * 0.2, y: env.heightAt(sx, sz) - 0.15, yaw: Math.atan2(dx, dz) };
}

export const create: CreateAmbient = (env, hudRoot) => {
  const ex = env as WorldEnvExtra;
  if (!ex.extra) throw new Error("cave needs env.extra");
  const lang = env.lang;
  const rm = env.reducedMotion;
  const frame = findFrame(ex);
  const plan = planCave(frame, {
    heightAt: env.heightAt,
    halfWidth: env.trail.halfWidth,
    trailDistance: ex.extra.trailDistance,
    isWater: ex.extra.isWater,
  });
  for (const c of plan.walk) env.addWalkable({ kind: "circle", x: c.x, z: c.z, r: c.r });

  const cave = buildCave(env, frame, plan, { low: env.quality === "low" });
  cave.group.userData.walk = plan.walk;
  env.scene.add(cave.group);

  // ---------------------------------------------------------------- caption (aria-live), HUD look
  const layer = document.createElement("div");
  layer.className = "qn-hud kx-cave-layer";
  const caption = document.createElement("p");
  caption.className = "kx-cave-caption";
  caption.setAttribute("role", "status");
  caption.setAttribute("aria-live", "polite");
  caption.textContent = "";
  layer.append(caption);
  hudRoot.append(layer);
  let captionT = 0;

  // Another panel open (passport, a tambo, a dialog): no prompt while it is.
  let otherModal = false;
  const offModal = on("world:modal", (d) => {
    otherModal = !!d?.open;
  });

  // ---------------------------------------------------------------- frame
  const loc = { x: 0, z: 0 };
  const gcol = cave.glow.geometry.getAttribute("color") as THREE.BufferAttribute;
  const garr = gcol.array as Float32Array;
  let inside = false;
  let stamped = false;
  let nearKhipu = false;
  const box = plan.inside;

  const setInside = (v: boolean) => {
    if (v === inside) return;
    inside = v;
    cave.roof.visible = !v;
    emit("world:interior", { inside: v, id: "waterfall-cave" });
    if (v && !stamped) {
      stamped = true;
      emit("world:stamp", { id: "egg:waterfall-cave", kind: "egg", label: LABEL });
    }
  };

  const ambient: Ambient = {
    update(dt, avatar, t) {
      dt = Math.min(dt, 0.05);
      const far = Math.hypot(avatar.x - frame.x, avatar.z - frame.z) > DRAW_R;
      cave.group.visible = !far;
      if (far) {
        setInside(false);
        nearKhipu = false;
        return;
      }
      toLocal(frame, avatar.x, avatar.z, loc);
      setInside(loc.x > box.x0 && loc.x < box.x1 && loc.z > box.z0 && loc.z < box.z1);
      nearKhipu = inside && Math.hypot(avatar.x - cave.khipuAt.x, avatar.z - cave.khipuAt.z) < EXPLORE_R;

      // Glowworms: slow, independent twinkle (static under reduced motion).
      const n = cave.glowBase.length;
      for (let i = 0; i < n; i++) {
        const k = rm ? 0.75 : 0.55 + 0.45 * Math.sin(t * (0.6 + (i % 5) * 0.17) + (cave.glowBase[i] as number));
        garr[i * 3] = 0.55 * k;
        garr[i * 3 + 1] = 1.0 * k;
        garr[i * 3 + 2] = 0.82 * k;
      }
      gcol.needsUpdate = true;

      // Veil: scroll the streaks down; thin it out while the traveler is inside (camera looks through it).
      const vm = cave.veil.material;
      if (!rm && vm.map) vm.map.offset.y = (vm.map.offset.y + dt * 1.1) % 1;
      vm.opacity += ((inside ? 0.16 : 0.62) - vm.opacity) * (1 - Math.exp(-dt * 5));

      if (captionT > 0) {
        captionT -= dt;
        if (captionT <= 0) caption.classList.remove("is-on");
      }
    },
    prompt() {
      return nearKhipu && !otherModal ? T_EXPLORE[lang] : null;
    },
    interact() {
      if (!nearKhipu || otherModal) return false;
      caption.textContent = CAPTION[lang];
      caption.classList.remove("is-on");
      void caption.offsetWidth;
      caption.classList.add("is-on");
      captionT = 7;
      if (!stamped) {
        stamped = true;
        emit("world:stamp", { id: "egg:waterfall-cave", kind: "egg", label: LABEL });
      }
      return true;
    },
    dispose() {
      if (inside) emit("world:interior", { inside: false, id: "waterfall-cave" });
      offModal();
      layer.remove();
      cave.dispose();
    },
  };
  return ambient;
};
