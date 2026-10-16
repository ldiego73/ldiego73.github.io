/**
 * Braziers of Haukaypata: stone fire bowls at the four corners of the usnu's first tier and either side of
 * the Qorikancha's doorway. By day they hold embers; at night they burn: a flickering flame cone and a warm
 * additive glow each (still with prefers-reduced-motion), so the plaza reads at night.
 *
 * Draw calls: bowls one vertex-coloured mesh, flames one instanced mesh; the glows (one sprite each) only at
 * night. The bowls are colliders.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { flattenToonGroup, vertexToon } from "../../merge-colors";
import { glowSprite, Kit } from "../../props";
import { QORIKANCHA, USNU } from "../plan";

/** Brazier spots (x, y of the floor, z). */
function spots(): Array<{ x: number; y: number; z: number }> {
  const t = USNU.tiers[0];
  const c = t.half - 0.55;
  const out: Array<{ x: number; y: number; z: number }> = [
    { x: USNU.x - c, y: t.top, z: USNU.z - c },
    { x: USNU.x + c, y: t.top, z: USNU.z - c },
    { x: USNU.x + c, y: t.top, z: USNU.z + c },
    { x: USNU.x - c, y: t.top, z: USNU.z + c },
  ];
  const fx = QORIKANCHA.x - QORIKANCHA.thick / 2 - 1.3;
  out.push({ x: fx, y: 0, z: QORIKANCHA.z - 3.3 }, { x: fx, y: 0, z: QORIKANCHA.z + 3.3 });
  return out;
}

export const create: CreateAmbient = (env): Ambient => {
  const at = spots();
  const k = new Kit(env);
  for (const p of at) {
    k.cyl(0.22, 0.3, 0.55, p.x, p.y, p.z, "#8c867b", 7);
    k.cyl(0.42, 0.24, 0.26, p.x, p.y + 0.55, p.z, "#6f6a62", 8);
    k.cyl(0.36, 0.36, 0.04, p.x, p.y + 0.79, p.z, "#3a2c24", 8);
  }
  const bowls = k.build("cusco-braziers");
  const mat = vertexToon();
  flattenToonGroup(bowls, mat);
  env.scene.add(bowls);
  for (const p of at) env.addCollider({ kind: "circle", x: p.x, z: p.z, r: 0.45 });

  const flameGeo = new THREE.ConeGeometry(0.26, 0.7, 7);
  flameGeo.translate(0, 0.35, 0);
  const flameMat = env.toon("#ffb35c", { emissive: "#ff8a3d", emissiveIntensity: 1.1 }).clone();
  const flames = new THREE.InstancedMesh(flameGeo, flameMat, at.length);
  flames.name = "cusco-braziers:flames";
  env.noOutline(flames);
  env.scene.add(flames);
  const glows = at.map((p) => {
    const s = glowSprite(env, "#ffb35c", 3);
    s.position.set(p.x, p.y + 1.25, p.z);
    s.visible = false;
    env.scene.add(s);
    return s;
  });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let night: boolean | null = null;

  const pose = (t: number, lit: boolean) => {
    at.forEach((p, i) => {
      const f = lit
        ? env.reducedMotion
          ? 1
          : 1 + Math.sin(t * 9 + i * 1.9) * 0.12 + Math.sin(t * 17 + i) * 0.06
        : 0.35;
      sc.set(lit ? 1 : 0.8, f, lit ? 1 : 0.8);
      v.set(p.x, p.y + 0.8, p.z);
      m.compose(v, q, sc);
      flames.setMatrixAt(i, m);
    });
    flames.instanceMatrix.needsUpdate = true;
  };
  pose(0, false);

  return {
    update(_dt, _avatar, t) {
      const n = env.sky.isNight();
      if (n !== night) {
        night = n;
        for (const s of glows) s.visible = n;
        pose(t, n);
      }
      if (n && !env.reducedMotion) {
        pose(t, true);
        glows.forEach((s, i) => {
          s.scale.setScalar(3 + Math.sin(t * 6.1 + i * 2.3) * 0.25);
        });
      }
    },
    dispose() {
      bowls.removeFromParent();
      bowls.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      mat.dispose();
      flames.removeFromParent();
      flames.dispose();
      flameGeo.dispose();
      flameMat.dispose();
      for (const s of glows) {
        s.removeFromParent();
        (s.material as THREE.SpriteMaterial).dispose();
      }
    },
  };
};
