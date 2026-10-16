/**
 * Sillustani: the chullpas, funerary towers of the Qolla lords, on a hill above the road (a scenic stop and a
 * bonus find, `titicaca:station:sillustani`, stamped by the runtime when the traveler reaches the hilltop).
 * Four towers of fitted stone that widen as they rise, with a cornice band and a small doorway facing the
 * sunrise (east); one stands half-ruined, its courses fallen at its foot. A ring of upright stones on the
 * hilltop and a painted board that names the place. No owner content here: the board explains the chullpas.
 *
 * Draw calls: one vertex-coloured mesh, one board. The towers and the ring stones are colliders.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { vertexToon } from "../../merge-colors";
import { FONT } from "../../props";
import type { SuyuEnv } from "../../suyu/contract";
import { Build } from "./kit/build";
import { buildBoards, paperBoard } from "./kit/signs";

const COPY = {
  title: { es: "SILLUSTANI", en: "SILLUSTANI" },
  sub: { es: "Chullpas: torres funerarias de los señores qolla", en: "Chullpas: funerary towers of the Qolla lords" },
} satisfies Record<string, L>;

/** Towers: offset from the plaza centre, height, base radius, ruined. */
const TOWERS: ReadonlyArray<[number, number, number, number, boolean]> = [
  [-5.5, -5.5, 8.5, 1.6, false],
  [3.5, -7, 10.5, 1.9, false],
  [7.5, 1.5, 6.5, 1.4, false],
  [-7.5, 3.5, 4.2, 1.7, true],
];

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const lang = env.lang;
  const pl = env.suyu.layout.plazas.find((p) => p.id === "sillustani");
  if (!pl) return { update() {}, dispose() {} };
  const b = new Build();
  const stones = ["#b8ae9c", "#a9a08e", "#c3b9a6"];
  const y0 = pl.y;
  for (const [ox, oz, h, r0, ruin] of TOWERS) {
    const x = pl.x + ox;
    const z = pl.z + oz;
    const base = Math.min(y0, env.heightAt(x, z)) - 0.4;
    // Courses of dressed stone, each a little wider than the one below (the chullpa's inverted taper).
    const courses = Math.round(h / 0.55);
    for (let k = 0; k < courses; k++) {
      const u = k / courses;
      const r = r0 * (1 + 0.22 * u);
      b.cyl(r * 1.005, r, 0.53, x, base + k * 0.55, z, stones[k % 3] as string, 18);
    }
    const top = base + courses * 0.55;
    if (!ruin) {
      // Cornice band and a domed cap.
      b.cyl(r0 * 1.32, r0 * 1.25, 0.32, x, top, z, "#9d9483", 18);
      b.cyl(r0 * 0.4, r0 * 1.2, 0.5, x, top + 0.32, z, "#a9a08e", 18);
    } else {
      // Fallen blocks at the foot.
      for (let i = 0; i < 9; i++) {
        const a = i * 0.8 + 0.4;
        b.box(
          0.7,
          0.45,
          0.5,
          x + Math.cos(a) * (r0 + 0.9 + (i % 3) * 0.5),
          base + 0.2,
          z + Math.sin(a) * (r0 + 0.9),
          stones[i % 3] as string,
          a,
        );
      }
    }
    // A small doorway facing east (+x), as on the real towers.
    b.box(0.08, 0.7, 0.55, x + r0 + 0.02, Math.max(base + 0.4, y0 - 0.1), z, "#2a221c");
    env.addCollider({ kind: "circle", x, z, r: r0 + 0.35 });
  }
  // The ring of upright stones (a sun circle) on the hilltop.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const x = pl.x + 1 + Math.cos(a) * 4.2;
    const z = pl.z + 2 + Math.sin(a) * 3.4;
    if (Math.abs(a - Math.PI / 2) < 0.4) continue; // a gap toward the road
    b.box(0.5, 0.8 + (i % 3) * 0.15, 0.4, x, env.heightAt(x, z) - 0.15, z, stones[i % 3] as string, a);
    env.addCollider({ kind: "circle", x, z, r: 0.35 });
  }
  const geo = b.build();
  const mat = vertexToon();
  const group = new THREE.Group();
  group.name = "titicaca-sillustani";
  if (geo) {
    const m = new THREE.Mesh(geo, mat);
    m.name = "titicaca-sillustani:stone";
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  // Board at the top of the path, facing the road.
  const q = env.suyu.layout.trailQuery(pl.x, pl.z);
  const rp = env.trail.pointAt(q.t);
  const yaw = Math.atan2(rp.x - pl.x, rp.z - pl.z);
  const bx = pl.x + Math.sin(yaw) * (pl.r - 1.5) + Math.cos(yaw) * 2.6;
  const bz = pl.z + Math.cos(yaw) * (pl.r - 1.5) - Math.sin(yaw) * 2.6;
  const board = buildBoards(
    env,
    "titicaca-sillustani:board",
    1,
    512,
    200,
    (ctx, _i, cw, ch) => {
      paperBoard(ctx, cw, ch, "#8f877b");
      ctx.fillStyle = "#1f1a17";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 50px ${FONT.display}`;
      ctx.fillText(COPY.title[lang], cw / 2, ch * 0.4);
      let px = 24;
      ctx.font = `600 ${px}px ${FONT.body}`;
      while (ctx.measureText(COPY.sub[lang]).width > cw - 50 && px > 12) ctx.font = `600 ${--px}px ${FONT.body}`;
      ctx.fillText(COPY.sub[lang], cw / 2, ch * 0.7);
    },
    [{ i: 0, w: 2.4, h: 0.94, x: bx, y: env.heightAt(bx, bz) + 1.3, z: bz, yaw }],
  );
  group.add(board.mesh);
  const b2 = new Build();
  for (const s of [-1, 1])
    b2.cyl(
      0.06,
      0.07,
      1.4,
      bx + Math.cos(yaw) * s * 1.05,
      env.heightAt(bx, bz) - 0.1,
      bz - Math.sin(yaw) * s * 1.05,
      "#5e3b22",
      5,
    );
  const postGeo = b2.build();
  if (postGeo) group.add(new THREE.Mesh(postGeo, mat));
  env.addCollider({ kind: "circle", x: bx, z: bz, r: 1.2 });
  env.scene.add(group);
  const keep = creatures.keepOut(pl.x, pl.z, pl.r + 4);
  return {
    update() {},
    dispose() {
      creatures.removeKeepOut(keep);
      board.dispose();
      geo?.dispose();
      postGeo?.dispose();
      mat.dispose();
      group.removeFromParent();
    },
  };
};
