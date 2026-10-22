/**
 * The altiplano's small things, all static: ichu (puna bunch grass) tufts and boulders as two InstancedMeshes,
 * the pirca stone walls round the chacras and a few adobe farmhouses with thatched roofs, merged into one
 * vertex-coloured mesh. Three draw calls (plus the ink pass). Placement: ./placement.ts and ./fields.ts.
 *
 * The ichu rides the shared wind (../../style-gl.ts `windSway`, mode "grass"): the altiplano's gust fronts sweep
 * the puna as a wave of bending tufts, and the traveler, the llama and the herds part it. Ink-aware, so it takes
 * the ink like the mountain's ichu.
 */
import * as THREE from "three";
import { mergeColored } from "../../merge-colors";
import { windSway } from "../../style-gl";
import type { ToonCache } from "../../toon";
import type { TiticacaLayout } from "../layout";
import { HOUSES } from "../plan";
import { parcelEdges } from "./fields";
import { grassSpots, rng, rockSpots } from "./placement";

/** One ichu tuft: thin blades fanning out from a tight base, ochre with paler tips. */
function tuftGeometry(): THREE.BufferGeometry {
  const blade = new THREE.ConeGeometry(0.06, 1, 3, 1, true);
  blade.translate(0, 0.5, 0);
  const parts: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color; matrix: THREE.Matrix4 }> = [];
  const cols = [new THREE.Color("#c9ad62"), new THREE.Color("#b89d55"), new THREE.Color("#ddc47c")];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + (i % 3) * 0.4;
    const lean = 0.25 + (i % 4) * 0.12;
    e.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
    q.setFromEuler(e);
    const h = 0.55 + ((i * 7) % 5) * 0.09;
    parts.push({
      geometry: blade,
      color: cols[i % 3] as THREE.Color,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05),
        q,
        new THREE.Vector3(1, h, 1),
      ),
    });
  }
  const g = mergeColored(parts) as THREE.BufferGeometry;
  blade.dispose();
  return g;
}

function instanced(
  name: string,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  spots: ReturnType<typeof grassSpots>,
  y: (x: number, z: number) => number,
  tint?: (i: number) => THREE.Color,
) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  mesh.name = name;
  mesh.count = spots.length;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  spots.forEach((sp, i) => {
    q.setFromAxisAngle(up, sp.yaw);
    p.set(sp.x, y(sp.x, sp.z), sp.z);
    m.compose(p, q, s.set(sp.scale, sp.scale * (0.8 + sp.tall * 0.5), sp.scale));
    mesh.setMatrixAt(i, m);
    if (tint) mesh.setColorAt(i, tint(i));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Pirca walls along the chacras near the road, and the farmhouses: one merged vertex-coloured geometry. */
function buildWallsAndHouses(L: TiticacaLayout): THREE.BufferGeometry | null {
  const parts: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color; matrix: THREE.Matrix4 }> = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const stones = [new THREE.Color("#a39a8a"), new THREE.Color("#8f877b"), new THREE.Color("#b5ab98")];
  const R = rng(0x91c4);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const add = (
    geo: THREE.BufferGeometry,
    color: THREE.Color,
    x: number,
    y: number,
    z: number,
    yaw: number,
    sx: number,
    sy: number,
    sz: number,
  ) => {
    q.setFromAxisAngle(up, yaw);
    parts.push({
      geometry: geo,
      color,
      matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)),
    });
  };
  // Walls: only within reach of the eye from the road (a band south of it), skipping paths.
  for (const [x, z, yaw] of parcelEdges(-400, -80, 400, 190, 1.05)) {
    if (L.trailQuery(x, z).d < 5 || !L.isGround(x, z)) continue;
    const y = L.heightAt(x, z);
    const h = 0.45 + R() * 0.25;
    add(box, stones[Math.floor(R() * 3)] as THREE.Color, x, y + h / 2 - 0.05, z, yaw + (R() - 0.5) * 0.3, 0.95, h, 0.5);
  }
  // Farmhouses: adobe walls, thatched hip roof, a dark doorway facing the lake.
  const roof = new THREE.ConeGeometry(0.75, 1, 4, 1);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 0.5, 0);
  const adobe = new THREE.Color("#b98a5e");
  const adobeDark = new THREE.Color("#a5774f");
  const thatch = new THREE.Color("#c4a25c");
  const door = new THREE.Color("#3a2a1e");
  for (const hs of HOUSES) {
    const y = L.heightAt(hs.x, hs.z);
    const w = 3.6 + R() * 1.2;
    const d = 2.8 + R() * 0.8;
    const c = Math.cos(hs.yaw);
    const s = Math.sin(hs.yaw);
    add(box, R() < 0.5 ? adobe : adobeDark, hs.x, y + 1.0, hs.z, hs.yaw, w, 2.4, d);
    add(roof, thatch, hs.x, y + 2.2, hs.z, hs.yaw, w * 1.02, 1.5, d * 1.1);
    // Doorway on the +z face (local), toward the lake for most houses.
    add(box, door, hs.x + s * (d / 2 + 0.01), y + 0.75, hs.z + c * (d / 2 + 0.01), hs.yaw, 0.8, 1.5, 0.05);
    // A low corral wall beside it.
    for (let k = 0; k < 7; k++) {
      const lx = w / 2 + 1.2 + (k % 4) * 0.9;
      const lz = -1.4 + Math.floor(k / 4) * 2.8;
      add(
        box,
        stones[k % 3] as THREE.Color,
        hs.x + c * lx + s * lz,
        y + 0.25,
        hs.z - s * lx + c * lz,
        hs.yaw,
        0.9,
        0.55,
        0.45,
      );
    }
  }
  const geo = mergeColored(parts);
  box.dispose();
  roof.dispose();
  return geo;
}

export function buildFlora(L: TiticacaLayout, toon: ToonCache, quality: "low" | "high") {
  const group = new THREE.Group();
  group.name = "titicaca-flora";
  const tuft = tuftGeometry();
  // Tufts stand 0.55–0.9 u: the reference height and amplitude give the tip the mountain ichu's bend at the base
  // wind, and the gust crests nearly lay it down (the puna's signature).
  const grassMat = windSway(toon.vertexToon(), { mode: "grass", height: 0.8, amp: 0.55 });
  const grass = instanced("titicaca-ichu", tuft, grassMat, grassSpots(L, quality === "high" ? 2600 : 1400), L.heightAt);
  grass.receiveShadow = true;
  const rockGeo = new THREE.IcosahedronGeometry(0.6, 0);
  const rp = rockGeo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < rp.count; i++) rp.setY(i, rp.getY(i) * 0.6 + 0.12);
  rockGeo.computeVertexNormals();
  const rockMat = toon.toon("#ffffff").clone();
  const rc = [new THREE.Color("#9d9483"), new THREE.Color("#8a8172"), new THREE.Color("#ada290")];
  const rocks = instanced(
    "titicaca-rocks",
    rockGeo,
    rockMat,
    rockSpots(L, quality === "high" ? 320 : 180),
    L.heightAt,
    (i) => rc[i % 3] as THREE.Color,
  );
  rocks.castShadow = true;
  group.add(grass, rocks);
  const wallsGeo = buildWallsAndHouses(L);
  const wallMat = toon.vertexToon();
  if (wallsGeo) {
    const walls = new THREE.Mesh(wallsGeo, wallMat);
    walls.name = "titicaca-pircas";
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);
  }
  return {
    group,
    dispose() {
      tuft.dispose();
      rockGeo.dispose();
      rockMat.dispose();
      wallsGeo?.dispose();
    },
  };
}
