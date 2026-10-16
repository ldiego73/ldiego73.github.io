/**
 * The punku at the start of the Kuntisuyu road (t 0, the east end of the rim): a trapezoidal Inca stone
 * doorway straddling the road, the way back to Qusqu. Near it, "E · Volver a Qusqu" travels to the Cusco hub
 * (../../travel.ts `travelTo`, which lands at the hub's Kuntisuyu gate through `?from=colca`); the hub's page
 * is prefetched when the traveler walks close. A carved sign on the road side names the road.
 *
 * One vertex-coloured mesh for the stone and one sign. The jambs are circle colliders; the opening stays on
 * the road band.
 */
import * as THREE from "three";
import type { CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { vertexToon } from "../../merge-colors";
import { prefetchWorld, travelTo } from "../../travel";
import { signBoard, VKit } from "../kit";
import { roadAt } from "../plan";

const COPY = {
  es: { prompt: "E · Volver a Qusqu", sign: "QUSQU", sub: "Camino del Kuntisuyu" },
  en: { prompt: "E · Back to Qusqu", sign: "QUSQU", sub: "The Kuntisuyu road" },
} as const;

const JAMB_X = 2.5;
const HEIGHT = 4.6;
const PROMPT_R = 3.6;
const PREFETCH_R = 30;

export const create: CreateAmbient = (env) => {
  const lang = env.lang;
  const r = roadAt(0);
  const ground = env.heightAt(r.x, r.z);
  const yaw = Math.atan2(r.dx, r.dz);
  const stone = "#a79b86";
  const dark = "#857a68";
  const kit = new VKit().at(r.x, ground, r.z, yaw);
  for (const side of [-1, 1]) {
    // Jambs: blocks in courses, leaning in toward the opening (the Inca trapezoid).
    for (let c = 0; c < 6; c++) {
      const h = HEIGHT / 6;
      const lean = (c / 6) * 0.35;
      kit.box(1.3 - c * 0.04, h - 0.02, 1.5, side * (JAMB_X + 0.1 - lean), c * h, 0, c % 2 ? stone : dark);
    }
  }
  kit.box(JAMB_X * 2 + 1.3, 0.9, 1.7, 0, HEIGHT, 0, dark);
  kit.box(JAMB_X * 2 + 0.6, 0.35, 1.3, 0, HEIGHT + 0.9, 0, stone);
  kit.box(JAMB_X * 2 + 2.4, 0.14, 2.4, 0, 0, 0, dark);
  // A condor carved on the lintel (both faces): body and spread wings in relief.
  for (const f of [-1, 1]) {
    kit.box(1.6, 0.12, 0.08, 0, HEIGHT + 0.45, f * 0.88, "#6b604f");
    kit.box(0.2, 0.32, 0.08, 0, HEIGHT + 0.3, f * 0.88, "#6b604f");
  }
  const geo = kit.build();
  const mat = vertexToon();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "colca-punku";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  env.scene.add(mesh);

  // Sign beside the road, just inside the punku, facing the traveler walking back.
  const sign = signBoard(env.toon as (c: string) => THREE.Material, {
    w: 2.3,
    title: COPY[lang].sign,
    sub: COPY[lang].sub,
  });
  const right = { x: -r.dz, z: r.dx };
  const sx = r.x + r.dx * 3.2 + right.x * (JAMB_X + 1.7);
  const sz = r.z + r.dz * 3.2 + right.z * (JAMB_X + 1.7);
  sign.mesh.position.set(sx, env.heightAt(sx, sz) + 1.3, sz);
  sign.mesh.rotation.y = yaw;
  env.scene.add(sign.mesh);
  const postGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.4, 6);
  const posts = new THREE.InstancedMesh(postGeo, env.toon("#5e3b22"), 2);
  const m = new THREE.Matrix4();
  for (const [i, dx] of [-0.85, 0.85].entries()) {
    const px = sx + Math.cos(yaw) * dx;
    const pz = sz - Math.sin(yaw) * dx;
    posts.setMatrixAt(i, m.makeTranslation(px, env.heightAt(px, pz) + 0.6, pz));
  }
  posts.name = "colca-punku:posts";
  env.scene.add(posts);

  for (const side of [-1, 1]) {
    const x = r.x + right.x * side * (JAMB_X + 0.1);
    const z = r.z + right.z * side * (JAMB_X + 0.1);
    env.addCollider({ kind: "circle", x, z, r: 0.75 });
  }
  const keep = creatures.keepOut(r.x, r.z, 4);

  let near = false;
  let busy = false;
  let prefetched = false;
  return {
    update(_dt, avatar) {
      const dx = avatar.x - r.x;
      const dz = avatar.z - r.z;
      const d = Math.hypot(dx, dz);
      // Only from the road side (in front, along the road's direction).
      near = !busy && d < PROMPT_R && dx * r.dx + dz * r.dz > -0.8;
      if (!prefetched && d < PREFETCH_R) {
        prefetched = true;
        prefetchWorld(lang, "cusco");
      }
    },
    prompt: () => (near ? COPY[lang].prompt : null),
    interact() {
      if (!near) return false;
      busy = true;
      travelTo(lang, "colca", "cusco");
      return true;
    },
    dispose() {
      creatures.removeKeepOut(keep);
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
      sign.mesh.removeFromParent();
      sign.dispose();
      posts.removeFromParent();
      posts.dispose();
      postGeo.dispose();
    },
  };
};
