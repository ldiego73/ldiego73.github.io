/**
 * Cloth of Haukaypata on the shared wind: the four suyu banners on tall poles round the usnu and the woollen
 * streamers on every punku's lintel (./unanchas/model.ts builds them all into one geometry). They give the
 * stone plaza colour and motion: the banners wave in the breeze and ripple harder when a gust front crosses
 * the plaza (the same gusts the ichu shows on the slopes), the streamers flutter over the doorways.
 *
 * Wind: style-gl.ts `windSway` in "cloth" mode with the `flex` weights (0 on the poles and pinned edges);
 * a twin depth material sways the same way, so the cast shadows wave with the cloth. Reduced motion is the
 * wind's own: a slow, gentle wave with no gusts.
 *
 * Draw calls: one (plus its ink and shadow passes). Colliders: the four poles.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { vertexToon } from "../../merge-colors";
import { windSway } from "../../style-gl";
import { buildCloth, poles } from "./unanchas/model";

/** Cloth amplitude over the style's default (the banners are big, the hub's breeze gentle). */
const AMP = 1.8;

export const create: CreateAmbient = (env): Ambient => {
  const geo = buildCloth();
  const mat = windSway(vertexToon(), { mode: "cloth", flex: true, amp: AMP });
  mat.side = THREE.DoubleSide;
  const depth = windSway(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), {
    mode: "cloth",
    flex: true,
    amp: AMP,
  });
  depth.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "cusco-unanchas";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.customDepthMaterial = depth;
  env.scene.add(mesh);
  for (const p of poles()) env.addCollider({ kind: "circle", x: p.x, z: p.z, r: 0.42 });
  return {
    update() {},
    dispose() {
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
      depth.dispose();
    },
  };
};
