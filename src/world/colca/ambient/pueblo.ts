/**
 * A Collagua village on the rim (in the style of Yanque or Chivay): a paved plaza north of the road with a
 * stone fountain in the middle and flowering kantu bushes, houses of whitewashed adobe, bare adobe and
 * fieldstone round it (thatched, tiled or tin roofs), and on its north side the white colonial-Andean church:
 * a gabled nave, a tall facade with a carved sillar portal, two bell towers with domed tops and an atrium wall
 * with an arched gate. A carved sign names the village. Scenic only (its stamp is the station visit); the
 * villagers are ./gente.ts and the hummingbirds at the kantu ./picaflores.ts.
 *
 * Positions: ./pueblo/logic.ts (plaza frame: +z toward the road). One vertex-coloured mesh for all of it, one
 * sign. Houses, the church, the fountain and the bushes are colliders.
 */
import * as THREE from "three";
import type { CreateAmbient, L } from "../../contract";
import { vertexToon } from "../../merge-colors";
import type { SuyuEnv } from "../../suyu/contract";
import { signBoard, VKit } from "../kit";
import type { ColcaLayout } from "../layout";
import { CHURCH, FLOWERS, FOUNTAIN, HOUSES, toWorld } from "./pueblo/logic";

const S = {
  sign: { es: "PUEBLO COLLAGUA", en: "COLLAGUA VILLAGE" },
  sub: { es: "Iglesia y plaza · valle del Colca", en: "Church and plaza · Colca valley" },
} satisfies Record<string, L>;

const WALL = { white: "#efe9dc", adobe: "#c69d74", stone: "#a49580" } as const;
const ROOF = { thatch: "#b48a4a", tin: "#9ba1a4", tile: "#b5603f" } as const;
const WHITE = "#f2ede3";
const SILLAR = "#dcc7a2";

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SuyuEnv;
  const layout = env.suyu.layout as ColcaLayout;
  const lang = env.lang;
  const pl = layout.plaza("pueblo");
  const road = layout.trail.pointAt(layout.trail.nearestT(pl.x, pl.z));
  const yaw = Math.atan2(road.x - pl.x, road.z - pl.z);
  const frame = { x: pl.x, z: pl.z, yaw };
  const y0 = env.heightAt(pl.x, pl.z);
  let seed = 0x9ab1;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const k = new VKit().at(pl.x, y0, pl.z, yaw);

  // ------------------------------------------------------------------ plaza
  k.cyl(pl.r + 0.3, pl.r + 0.6, 0.4, 0, -0.38, 0, "#b9ab92", 32);
  for (let r = 2.2; r < pl.r; r += 2)
    for (let a = 0; a < Math.PI * 2; a += 1.6 / r)
      k.box(1.5, 0.05, 1.1, Math.sin(a) * r, 0.0, Math.cos(a) * r, rand() < 0.5 ? "#c7b89c" : "#ad9e85", a);
  // Fountain: round stone basin, a column and a small bowl on top.
  k.cyl(FOUNTAIN.r, FOUNTAIN.r + 0.1, 0.7, FOUNTAIN.x, 0, FOUNTAIN.z, "#a89c88", 16);
  k.cyl(FOUNTAIN.r - 0.25, FOUNTAIN.r - 0.25, 0.05, FOUNTAIN.x, 0.62, FOUNTAIN.z, "#5f9fa8", 16);
  k.cyl(0.22, 0.28, 1.8, FOUNTAIN.x, 0.6, FOUNTAIN.z, "#b7ab96", 8);
  k.cyl(0.6, 0.3, 0.3, FOUNTAIN.x, 2.3, FOUNTAIN.z, "#b7ab96", 10);
  // Kantu bushes (green mounds dotted with magenta-red bell flowers).
  for (const [x, z] of FLOWERS) {
    k.sphere(1.0, x, 0.55, z, "#5d7f45", 1, 0.8, 8);
    k.sphere(0.7, x + 0.4, 0.95, z - 0.2, "#6a8c4c", 1, 0.8, 7);
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2;
      k.cyl(
        0.08,
        0.02,
        0.22,
        x + Math.cos(a) * 0.85,
        0.5 + rand() * 0.8,
        z + Math.sin(a) * 0.85,
        i % 3 ? "#c8325a" : "#e2a43a",
        5,
      );
    }
  }

  // ------------------------------------------------------------------ church
  const cz = CHURCH.z;
  const front = cz + CHURCH.d / 2;
  k.box(CHURCH.w, CHURCH.h, CHURCH.d, 0, -0.5, cz, WHITE);
  // Gabled roof: two slabs meeting on the ridge, clay tile.
  const half = CHURCH.w / 2 + 0.5;
  const pitch = 0.5;
  for (const sx of [-1, 1])
    k.box(
      half / Math.cos(pitch) + 0.2,
      0.3,
      CHURCH.d + 0.6,
      (sx * half) / 2,
      CHURCH.h - 0.6 + (half / 2) * Math.tan(pitch),
      cz,
      ROOF.tile,
      0,
      0,
      -sx * pitch,
    );
  // Facade: a taller white wall with a stepped top, the carved sillar portal, the door and a choir window.
  k.box(CHURCH.w + 1, CHURCH.facade, 1.2, 0, -0.5, front + 0.3, WHITE);
  k.box(4.2, 1.6, 1.25, 0, CHURCH.facade - 0.5, front + 0.3, WHITE);
  k.box(4.6, 7.2, 0.35, 0, -0.2, front + 0.95, SILLAR);
  k.box(2.0, 3.6, 0.2, 0, 0, front + 1.12, "#4a3324");
  k.cyl(1.0, 1.0, 0.2, 0, 3.2, front + 1.12, "#4a3324", 12, Math.PI / 2);
  for (const sx of [-1, 1]) {
    // Paired columns and niches carved in the portal.
    k.cyl(0.18, 0.2, 5.4, sx * 1.6, 0, front + 1.15, "#cbb38c", 8);
    k.cyl(0.18, 0.2, 5.4, sx * 2.05, 0, front + 1.15, "#cbb38c", 8);
    k.box(0.5, 0.8, 0.1, sx * 1.82, 5.8, front + 1.15, "#8a6d4c");
  }
  k.box(1.0, 1.0, 0.1, 0, 6.2, front + 1.15, "#3b2b20");
  k.box(0.14, 1.1, 0.14, 0, CHURCH.facade + 1.1, front + 0.3, "#cfc8ba");
  k.box(0.6, 0.14, 0.14, 0, CHURCH.facade + 1.6, front + 0.3, "#cfc8ba");
  // Bell towers on both sides of the facade: shaft, belfry with arched openings, dome, lantern and cross.
  for (const sx of [-1, 1]) {
    const tx = sx * (CHURCH.w / 2 + 1.6);
    const tz = front - 1;
    k.box(3.4, CHURCH.towers - 3, 3.4, tx, -0.5, tz, WHITE);
    k.box(3.0, 2.6, 3.0, tx, CHURCH.towers - 3.5, tz, WHITE);
    for (const [ox, oz] of [
      [0, 1.52],
      [1.52, 0],
      [-1.52, 0],
      [0, -1.52],
    ] as const)
      k.box(ox ? 0.1 : 1.0, 1.5, oz ? 0.1 : 1.0, tx + ox, CHURCH.towers - 3.1, tz + oz, "#3a2a20");
    k.box(3.5, 0.3, 3.5, tx, CHURCH.towers - 0.9, tz, SILLAR);
    k.sphere(1.45, tx, CHURCH.towers - 0.6, tz, WHITE, 0.5, 1, 10);
    k.cyl(0.35, 0.35, 0.7, tx, CHURCH.towers + 0.8, tz, WHITE, 8);
    k.box(0.1, 0.8, 0.1, tx, CHURCH.towers + 1.5, tz, "#cfc8ba");
    k.box(0.45, 0.1, 0.1, tx, CHURCH.towers + 1.95, tz, "#cfc8ba");
    // A bell in the opening facing the plaza.
    k.sphere(0.35, tx, CHURCH.towers - 2.1, tz + 1.2, "#8f6b2c", 0.5, 1.2, 8);
  }
  // Atrium: a low white wall in front of the church with an arched gate toward the plaza.
  const az = front + 3.2;
  for (const sx of [-1, 1]) {
    k.box(5.6, 1.4, 0.5, sx * 4.6, -0.3, az, WHITE);
    k.box(0.5, 1.4, 4.0, sx * 7.4, -0.3, az - 2.2, WHITE);
    k.box(0.6, 3.0, 0.6, sx * 1.4, -0.3, az, WHITE);
  }
  k.box(3.4, 0.7, 0.6, 0, 2.4, az, WHITE);
  k.cyl(0.9, 0.9, 0.6, 0, 2.2, az, WHITE, 10, Math.PI / 2);
  // Atrium floor (raised a step).
  k.box(14.8, 0.3, 4.0, 0, -0.3, az - 2.2, "#c9bda6");

  // ------------------------------------------------------------------ houses
  for (const h of HOUSES) {
    const w = WALL[h.wall];
    const c = Math.cos(h.yaw);
    const s = Math.sin(h.yaw);
    // Local helper for the house's own frame (its door faces +z, toward the plaza).
    const at = (lx: number, lz: number) => ({ x: h.x + lx * c + lz * s, z: h.z - lx * s + lz * c });
    k.box(h.w, h.h + 0.5, h.d, h.x, -0.5, h.z, w, h.yaw);
    // Pitched roof (two slabs) over the long side.
    const rh = h.w / 2 + 0.35;
    for (const sx of [-1, 1]) {
      const p = at((sx * rh) / 2, 0);
      k.box(
        rh / Math.cos(0.55) + 0.15,
        0.22,
        h.d + 0.6,
        p.x,
        h.h + (rh / 2) * Math.tan(0.55) - 0.15,
        p.z,
        ROOF[h.roof],
        h.yaw,
        0,
        -sx * 0.55,
      );
    }
    // Gable fill under the ridge (the roof slabs hide its sloped edges).
    k.box(h.w * 0.55, rh * Math.tan(0.55) * 0.75, h.d - 0.1, h.x, h.h, h.z, w, h.yaw);
    const door = at(0.6, h.d / 2 + 0.02);
    k.box(1.0, 2.0, 0.08, door.x, 0, door.z, "#5a3b26", h.yaw);
    const win = at(-1.4, h.d / 2 + 0.02);
    k.box(0.8, 0.7, 0.08, win.x, 1.3, win.z, "#3a2c22", h.yaw);
    if (h.wall !== "stone") {
      // A painted plinth band at the foot of whitewashed and adobe walls.
      const b = at(0, h.d / 2 + 0.01);
      k.box(h.w, 0.5, 0.05, b.x, 0, b.z, h.wall === "white" ? "#3f6f8c" : "#8c4a3a", h.yaw);
    }
  }

  const geo = k.build();
  const mat = vertexToon();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "colca-pueblo";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  env.scene.add(mesh);

  const sign = signBoard(env.toon as (c: string) => THREE.Material, { w: 2.6, title: S.sign[lang], sub: S.sub[lang] });
  const sp = toWorld(frame, -6, pl.r - 0.8);
  sign.mesh.position.set(sp.x, y0 + 1.15, sp.z);
  sign.mesh.rotation.y = yaw;
  env.scene.add(sign.mesh);

  // Colliders (world): houses as circles along their length, the fountain, the bushes, the church block.
  for (const h of HOUSES) {
    const n = Math.max(1, Math.round(h.w / 2.2));
    for (let i = 0; i < n; i++) {
      const lx = -h.w / 2 + ((i + 0.5) / n) * h.w;
      const p = toWorld(frame, h.x + lx * Math.cos(h.yaw), h.z - lx * Math.sin(h.yaw));
      env.addCollider({ kind: "circle", ...p, r: Math.max(h.d, 2.2) / 2 + 0.2 });
    }
  }
  env.addCollider({ kind: "circle", ...toWorld(frame, FOUNTAIN.x, FOUNTAIN.z), r: FOUNTAIN.r + 0.15 });
  for (const [x, z] of FLOWERS) env.addCollider({ kind: "circle", ...toWorld(frame, x, z), r: 1.1 });
  env.addCollider({ kind: "circle", ...toWorld(frame, -6, pl.r - 0.8), r: 0.35 });

  return {
    update() {},
    dispose() {
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
      sign.mesh.removeFromParent();
      sign.dispose();
    },
  };
};
