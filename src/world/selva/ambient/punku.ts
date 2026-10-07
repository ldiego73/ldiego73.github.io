/**
 * Return punku: a large trapezoidal Inca stone doorway straddling the jungle road at its west end (arrival.ts
 * PUNKU_T). Near it, the prompt "E · Back to the Qhapaq Ñan" travels to the mountain page (travel.ts), which
 * lands at the tinkuy via `?from=selva`. The mountain page is prefetched when the traveler walks close.
 *
 * Built from a few merged, vertex-coloured toon parts (one draw call for the stone) plus a faint shimmering
 * veil inside the opening (no outline). The two jambs are circle colliders; the opening between them stays on
 * the walkable road band.
 */
import * as THREE from "three";
import type { CreateAmbient } from "../../contract";
import { mergeColored, vertexToon } from "../../merge-colors";
import { prefetchWorld, travelTo } from "../../travel";
import { PUNKU_PROMPT_R, PUNKU_T } from "../arrival";
import type { SelvaEnv } from "../contract";

const COPY = {
  es: { prompt: "E · Volver al Qhapaq Ñan" },
  en: { prompt: "E · Back to the Qhapaq Ñan" },
} as const;

/** Jamb centre distance from the road axis; the road half width is 2.6, so the opening is ~3.4 u wide. */
const JAMB_X = 2.45;
const HEIGHT = 4.6;
const PREFETCH_R = 30;

/** A box whose top face is narrowed toward the opening (inner side leans in: the Inca trapezoid). */
function jamb(side: -1 | 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1.25, HEIGHT, 1.5, 1, 1, 1);
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) <= 0) continue;
    const x = p.getX(i);
    // Top: 0.3 narrower, shifted toward the doorway axis.
    p.setX(i, x * 0.76 - side * 0.32);
    p.setZ(i, p.getZ(i) * 0.9);
  }
  g.computeVertexNormals();
  g.translate(side * JAMB_X, HEIGHT / 2, 0);
  return g;
}

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SelvaEnv;
  const lang = env.lang;
  const p = env.trail.pointAt(PUNKU_T);
  const tg = env.trail.tangentAt(PUNKU_T).setY(0).normalize();
  const ground = env.selva ? env.selva.groundAt(p.x, p.z) : env.heightAt(p.x, p.z);
  const yaw = Math.atan2(tg.x, tg.z);

  const group = new THREE.Group();
  group.name = "selva-punku";
  group.position.set(p.x, ground, p.z);
  group.rotation.y = yaw;

  const stone = new THREE.Color("#9a8f74");
  const stoneDark = new THREE.Color("#7f7660");
  const moss = new THREE.Color("#5f7d3e");
  const gold = new THREE.Color("#d9a63a");
  const lintel = new THREE.BoxGeometry(JAMB_X * 2 + 1.3, 0.95, 1.7);
  lintel.translate(0, HEIGHT + 0.42, 0);
  const cap = new THREE.BoxGeometry(JAMB_X * 2 + 0.5, 0.35, 1.3);
  cap.translate(0, HEIGHT + 1.07, 0);
  const sill = new THREE.BoxGeometry(JAMB_X * 2 + 2.2, 0.14, 2.4);
  sill.translate(0, 0.02, 0);
  // Moss cushions on the lintel and at the jamb feet (it is the jungle after all).
  const mossTop = new THREE.BoxGeometry(1.6, 0.18, 1.2);
  mossTop.translate(-1.1, HEIGHT + 1.3, 0.05);
  const mossFoot = new THREE.BoxGeometry(1.0, 0.3, 1.0);
  mossFoot.translate(JAMB_X + 0.55, 0.15, 0.5);
  // Inti disc carved on both faces of the lintel.
  const disc = new THREE.CylinderGeometry(0.36, 0.36, 1.78, 18);
  disc.rotateX(Math.PI / 2);
  disc.translate(0, HEIGHT + 0.42, 0);
  const geo = mergeColored([
    { geometry: jamb(-1), color: stone },
    { geometry: jamb(1), color: stone },
    { geometry: lintel, color: stoneDark },
    { geometry: cap, color: stone },
    { geometry: sill, color: stoneDark },
    { geometry: mossTop, color: moss },
    { geometry: mossFoot, color: moss },
    { geometry: disc, color: gold },
  ]);
  for (const g of [lintel, cap, sill, mossTop, mossFoot, disc]) g.dispose();
  const stoneMat = vertexToon();
  const body = new THREE.Mesh(geo ?? new THREE.BufferGeometry(), stoneMat);
  body.name = "selva-punku-stone";
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // The veil: a trapezoid of warm light inside the opening that breathes slowly.
  const shape = new THREE.Shape();
  const bw = JAMB_X - 0.62;
  const tw = bw - 0.42;
  shape.moveTo(-bw, 0.1);
  shape.lineTo(bw, 0.1);
  shape.lineTo(tw, HEIGHT - 0.05);
  shape.lineTo(-tw, HEIGHT - 0.05);
  shape.closePath();
  const veilGeo = new THREE.ShapeGeometry(shape);
  const veilMat = new THREE.MeshBasicMaterial({
    color: "#ffd98a",
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: true,
  });
  const veil = new THREE.Mesh(veilGeo, veilMat);
  veil.name = "selva-punku-veil";
  env.noOutline(veil);
  group.add(veil);
  env.scene.add(group);

  // Jambs are solid; the opening between them is the road itself.
  for (const s of [-1, 1]) {
    // Local +X maps to (cos yaw, -sin yaw) in world x/z.
    const x = p.x + Math.cos(yaw) * s * JAMB_X;
    const z = p.z - Math.sin(yaw) * s * JAMB_X;
    env.addCollider({ kind: "circle", x, z, r: 0.72 });
  }

  const center = new THREE.Vector3(p.x, ground, p.z);
  let near = false;
  let prefetched = false;
  let phase = 0;
  let night = env.sky.isNight();
  const offSky = env.sky.onChange(() => {
    night = env.sky.isNight();
  });

  return {
    update(dt, avatar) {
      const dx = avatar.x - center.x;
      const dz = avatar.z - center.z;
      const d = Math.hypot(dx, dz);
      near = d < PUNKU_PROMPT_R;
      if (!prefetched && d < PREFETCH_R) {
        prefetched = true;
        prefetchWorld(lang, "qhapaq");
      }
      if (!env.reducedMotion) phase += dt;
      // Brighter at night (it is the lamp of the road's west end) and when the traveler stands in front of it.
      const base = night ? 0.34 : 0.2;
      veilMat.opacity = base + (near ? 0.12 : 0) + 0.06 * Math.sin(phase * 1.6);
    },
    prompt: () => (near ? COPY[lang].prompt : null),
    interact() {
      if (!near) return false;
      travelTo(lang, "selva", "qhapaq");
      return true;
    },
    dispose() {
      offSky();
      env.scene.remove(group);
      geo?.dispose();
      stoneMat.dispose();
      veilGeo.dispose();
      veilMat.dispose();
    },
  };
};
