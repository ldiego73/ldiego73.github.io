/**
 * Static set of the Cusco hub (SuyuDef.createScenery): the valley ground (./scenery/ground.ts), the stone
 * architecture of the plaza, the streets and Sacsayhuamán (./scenery/buildings.ts, three merged meshes), the
 * ring of apus (./scenery/backdrop.ts) and the native plants on the slopes (./scenery/flora.ts). Everything is
 * vertex-coloured toon, so the whole set is about eight draw calls (plus the ink pass). The plants sway with
 * the shared wind (./scenery/flora.ts); the stone does not move. The gates, the khipu, banners, people and
 * animals are ambients.
 *
 * Gold: the plaza mesh's material lets the Qorikancha's gold (the band, the disc of Inti, the usnu's seat
 * stones) glow a little in the cel light (`goldGlow`): no extra mesh, the gold is recognised by its vertex
 * colour, the only strongly saturated warm colour in the set. The glow fades to a faint gleam at night.
 */
import * as THREE from "three";
import type { Quality } from "../engine";
import { vertexToon } from "../merge-colors";
import type { SuyuScenery } from "../suyu/contract";
import type { ToonCache } from "../toon";
import type { CuscoLayout } from "./layout";
import { buildBackdrop } from "./scenery/backdrop";
import { buildArchitecture } from "./scenery/buildings";
import { buildFlora } from "./scenery/flora";
import { buildGround } from "./scenery/ground";

/**
 * Vertex colours that are gold (linear: red above 0.42 and more than nine times the blue: GOLD #e8b631 and
 * GOLD_DARK #c48d1f in ./scenery/buildings.ts; thatch, adobe and stone all fall short) get an emissive lift
 * plus a sheen toward grazing angles, so the metal reads bright against the cel-shaded ashlar.
 */
function goldGlow(mat: THREE.MeshToonMaterial, day: { value: number }): THREE.MeshToonMaterial {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGoldDay = day;
    sh.fragmentShader = `uniform float uGoldDay;\n${sh.fragmentShader}`.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      #ifdef USE_COLOR
      {
        vec3 kg = vColor.rgb;
        float kGold = step(0.42, kg.r) * step(kg.b * 9.0, kg.r);
        float kSheen = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0);
        totalEmissiveRadiance += kg * kGold * (0.04 + uGoldDay * (0.18 + 0.4 * kSheen));
      }
      #endif`,
    );
  };
  mat.customProgramCacheKey = () => "cusco-gold";
  return mat;
}

export function createCuscoScenery(layout: CuscoLayout, toon: ToonCache, quality: Quality): SuyuScenery {
  const group = new THREE.Group();
  group.name = "cusco-scenery";
  const ground = buildGround(layout, toon);
  group.add(ground.mesh);
  const arch = buildArchitecture(layout);
  const mat = vertexToon();
  const goldDay = { value: 1 };
  const plazaMat = goldGlow(vertexToon(), goldDay);
  const meshes = (["plaza", "streets", "far"] as const).map((k) => {
    const m = new THREE.Mesh(arch[k], k === "plaza" ? plazaMat : mat);
    m.name = `cusco-${k}`;
    m.castShadow = k !== "far";
    m.receiveShadow = true;
    group.add(m);
    return m;
  });
  const apus = buildBackdrop(toon, layout.heightAt);
  group.add(apus.mesh);
  const flora = buildFlora(layout, toon, quality);
  group.add(flora.group);
  return {
    group,
    update() {},
    setNight(night) {
      goldDay.value = 1 - night;
    },
    dispose() {
      ground.dispose();
      for (const m of meshes) m.geometry.dispose();
      mat.dispose();
      plazaMat.dispose();
      apus.dispose();
      flora.dispose();
    },
  };
}
