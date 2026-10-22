/**
 * Totora reed beds: clumps of tall green reeds standing in the shallow shelf along the shore and round the Uros
 * islands (the islands, their houses and their boats are built of this reed). One InstancedMesh of a clump
 * (a dozen tapered stalks, straw-coloured tips, a few dark seed heads), vertex-coloured, on the shared wind
 * (../../style-gl.ts `windSway`, mode "grass"): the stalks bend by height² downwind, and the altiplano's gust
 * fronts (../../style.ts `WIND.titicaca`, the gustiest world) roll across the beds as a visible wave; boats and
 * birds part them. Reduced motion is the wind's own (slow, constant sway, no gusts). The reeds stay off the ink
 * pass: a bed of stalks a few centimetres thick seen from the road is mostly silhouette, and inked it turns into
 * dark scribbles over the water (tried with the cel pass; the ichu, shorter and seen closer, keeps its ink).
 * Placement comes from ./placement.ts (pure).
 */
import * as THREE from "three";
import { mergeColored } from "../../merge-colors";
import { windSway } from "../../style-gl";
import { NO_OUTLINE_LAYER, type ToonCache } from "../../toon";
import type { TiticacaLayout } from "../layout";
import { reedSpots } from "./placement";

/** One clump: stalks of 1.6–2.6 u leaning a little outward, base at y 0 (the water line is ~0.4 u up). */
function clumpGeometry(): THREE.BufferGeometry {
  const parts: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color; matrix: THREE.Matrix4 }> = [];
  // Two segments up the stalk: the height² bend then curves it instead of tilting a straight stick (a third
  // segment read no better and cost ~150k more triangles across the beds).
  const stalk = new THREE.CylinderGeometry(0.02, 0.055, 1, 4, 2, true);
  stalk.translate(0, 0.5, 0);
  const tip = new THREE.ConeGeometry(0.03, 0.22, 4);
  tip.translate(0, 0.11, 0);
  const green = [new THREE.Color("#6f9a3c"), new THREE.Color("#5f8a36"), new THREE.Color("#86a84a")];
  const straw = new THREE.Color("#c9b46a");
  const seed = new THREE.Color("#6a4a2e");
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let s = 7;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + r() * 0.5;
    const rad = 0.08 + r() * 0.35;
    const h = 1.5 + r() * 1.1;
    const lean = 0.05 + rad * 0.35;
    e.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
    q.setFromEuler(e);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * rad, 0, Math.sin(a) * rad),
      q,
      new THREE.Vector3(1, h, 1),
    );
    parts.push({ geometry: stalk, color: (green[i % 3] as THREE.Color).clone(), matrix: m });
    // Straw top third.
    const top = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * rad, 0, Math.sin(a) * rad),
      q,
      new THREE.Vector3(0.7, h * 0.3, 0.7),
    );
    top.multiply(new THREE.Matrix4().makeTranslation(0, h / (h * 0.3) - 1, 0));
    if (i % 2 === 0) parts.push({ geometry: stalk, color: straw, matrix: top });
    if (i % 4 === 0) {
      const sh = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * rad, 0, Math.sin(a) * rad),
        q,
        new THREE.Vector3(1, 1, 1),
      );
      sh.multiply(new THREE.Matrix4().makeTranslation(0, h - 0.02, 0));
      parts.push({ geometry: tip, color: seed, matrix: sh });
    }
  }
  const g = mergeColored(parts) as THREE.BufferGeometry;
  stalk.dispose();
  tip.dispose();
  return g;
}

export interface Reeds {
  mesh: THREE.InstancedMesh;
  dispose(): void;
}

export function buildReeds(L: TiticacaLayout, toon: ToonCache, quality: "low" | "high"): Reeds {
  const spots = reedSpots(L, quality === "high" ? 1150 : 700);
  const geo = clumpGeometry();
  // Bend reference: the tallest stalks (~2.6 u). The amplitude keeps the tip's bend near the mountain ichu's
  // (≈ 0.14 × height at the base wind), so the gust crests (×3 here) visibly lay the beds over and let them go.
  const mat = windSway(toon.vertexToon(), { mode: "grass", height: 2.4, amp: 0.42 });
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  mesh.name = "titicaca-reeds";
  mesh.layers.set(NO_OUTLINE_LAYER);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(up, s.yaw);
    // Rooted on the lake bed, clamped so a clump is never buried too deep to show.
    p.set(s.x, Math.max(L.heightAt(s.x, s.z), L.level - 1.1), s.z);
    m.compose(p, q, sc.set(s.scale, s.scale * (0.9 + s.tall * 0.35), s.scale));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
