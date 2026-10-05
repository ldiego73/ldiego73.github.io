import * as THREE from "three";
import type { Company } from "../data/career";
import { companyYears, khipuFor } from "./artifacts";
import type { Collider, Lang, WorldEnv } from "./contract";
import { buildKhipu, type KhipuModel } from "./cords";
import {
  C,
  canvasTex,
  circleAt,
  circlesAlong,
  DYE,
  drawBoard,
  FONT,
  fitFont,
  hashStr,
  Kit,
  makeTorch,
  offFontsReady,
  onFontsReady,
  redraw,
  rng,
  stoneWall,
  type Torch,
  thatchRoof,
  toonMapped,
} from "./props";

/**
 * Company tambo: a small Inca waystation of andesite blocks with battered walls, a trapezoidal
 * doorway and niches, an ichu hip roof; beside it the company's khipu on a wooden frame,
 * a carved sign with name + years and a torch that lights at dusk.
 * Local frame: origin at the plaza-facing center of the building, +Z toward the trail.
 */
export interface Tambo {
  group: THREE.Group;
  /** Local point (on the plaza) where the khipu reads best; content turns it into world space. */
  focus: THREE.Vector3;
  /** Local point in front of the tambo for the tour. */
  front: THREE.Vector3;
  khipu: KhipuModel;
  torch: Torch;
  colliders: Collider[];
  /** Hit targets for tap-to-read. */
  hits: THREE.Object3D[];
  relabel(lang: Lang): void;
  dispose(): void;
}

export function signTexture(title: string, sub: string, w = 512, h = 192) {
  const draw = (ctx: CanvasRenderingContext2D) => {
    drawBoard(ctx, w, h);
    ctx.fillStyle = "#2a1a10";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitFont(ctx, title.toUpperCase(), "800", FONT.display, 76, w - 48, "condensed ");
    ctx.fillText(title.toUpperCase(), w / 2, h * 0.42);
    ctx.font = `600 34px ${FONT.mono}`;
    ctx.fillStyle = "#3b2414";
    ctx.fillText(sub, w / 2, h * 0.76);
  };
  const tex = canvasTex(w, h, (ctx) => draw(ctx));
  const re = () => redraw(tex, draw);
  onFontsReady(re);
  return { tex, draw: re };
}

export function buildTambo(env: WorldEnv, company: Company, lang: Lang, id: string): Tambo {
  const group = new THREE.Group();
  group.name = `tambo:${id}`;
  const rand = rng(hashStr(id));
  const owned: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];

  // Asymmetric sizes per tambo.
  const w = 3.6 + rand() * 1.5;
  const d = 2.9 + rand() * 0.9;
  const h = 1.85 + rand() * 0.45;
  const t = 0.42; // wall thickness
  const z0 = -d - 0.6; // back wall z (building sits behind the plaza)
  const z1 = -0.6; // front wall z
  const doorW = 0.78 + rand() * 0.12;
  const doorH = Math.min(h - 0.35, 1.45);
  const doorX = (rand() - 0.5) * (w * 0.3);

  const kit = new Kit(env);
  // Stone plinth (terrace step) under the building; reaches below grade for slopes.
  kit.box(w + 1.0, 0.9, d + 1.0, 0, -0.75, (z0 + z1) / 2, C.stoneDark);
  kit.box(w + 0.7, 0.14, d + 0.7, 0, 0, (z0 + z1) / 2, C.stone);
  const y0 = 0.14;
  const batter = 0.015;
  // Back + sides
  stoneWall(kit, rand, -w / 2, z0, w / 2, z0, y0, h, t, { batter, inward: new THREE.Vector2(0, 1) });
  stoneWall(kit, rand, -w / 2, z0, -w / 2, z1, y0, h, t, { batter, inward: new THREE.Vector2(1, 0) });
  stoneWall(kit, rand, w / 2, z0, w / 2, z1, y0, h, t, { batter, inward: new THREE.Vector2(-1, 0) });
  // Front wall with a trapezoidal doorway (narrower at the top), built course by course.
  const courses = Math.round(h / 0.36);
  const ch = h / courses;
  for (let c = 0; c < courses; c++) {
    const y = y0 + c * ch;
    const inDoor = y + ch * 0.5 < y0 + doorH;
    const half = doorW / 2 - ((y - y0) / doorH) * 0.14;
    const segs: Array<[number, number]> = inDoor
      ? [
          [-w / 2, doorX - half],
          [doorX + half, w / 2],
        ]
      : [[-w / 2, w / 2]];
    for (const [a, b] of segs) {
      let s = a + (c % 2 ? -0.1 * rand() : 0);
      s = Math.max(a, s);
      while (s < b - 0.02) {
        const bl = Math.min(b - s, 0.4 + rand() * 0.5);
        kit.box(
          bl - 0.035,
          ch * (0.92 + rand() * 0.1),
          t - c * batter * 0.6,
          s + bl / 2,
          y,
          z1 - c * batter,
          rand() < 0.28 ? C.stoneDark : C.stone,
        );
        s += bl;
      }
    }
  }
  // Lintel: one long dressed stone over the door.
  kit.box(doorW + 0.5, 0.26, t + 0.06, doorX, y0 + doorH - 0.02, z1, C.stoneDark);
  // Dark interior seen through the door.
  kit.box(doorW - 0.05, doorH - 0.05, 0.05, doorX, y0, z1 - t / 2 + 0.02, "#2b2420");
  // Trapezoidal niches on the front wall (two, asymmetric).
  for (const nx of [-(w / 2) + 0.6 + rand() * 0.2, w / 2 - 0.65 - rand() * 0.2]) {
    if (Math.abs(nx - doorX) < doorW) continue;
    const ny = y0 + 0.75 + rand() * 0.2;
    const nw = 0.34;
    kit.box(nw, 0.5, 0.06, nx, ny, z1 + t / 2 - 0.02, "#4a433b");
    kit.box(nw + 0.14, 0.08, 0.08, nx, ny + 0.5, z1 + t / 2 - 0.01, C.stoneDark);
  }
  // Small side niche.
  kit.box(0.06, 0.42, 0.3, w / 2 + t / 2 - 0.02, y0 + 0.8, (z0 + z1) / 2, "#4a433b");
  // Wooden roof plate.
  kit.box(w + 0.2, 0.1, d + 0.2, 0, y0 + h, (z0 + z1) / 2, C.woodDark);
  thatchRoof(kit, rand, w, d, y0 + h + 0.08, 1.35 + rand() * 0.4, 0, (z0 + z1) / 2);
  // Clay pots and a bench by the door for the cozy diorama feel.
  const potX = doorX + (doorX > 0 ? -1 : 1) * (doorW / 2 + 0.55);
  kit.cyl(0.18, 0.12, 0.34, potX, y0, z1 + 0.42, C.adobe, 8);
  kit.cyl(0.1, 0.17, 0.1, potX, y0 + 0.32, z1 + 0.42, C.adobe, 8);
  kit.cyl(0.13, 0.09, 0.24, potX + 0.34, y0, z1 + 0.5, C.thatch, 8);
  // Rocks scattered around the plinth.
  for (let i = 0; i < 4; i++)
    kit.rock(0.18 + rand() * 0.2, (rand() - 0.5) * (w + 1.6), -0.05, z0 - 0.6 + rand() * 0.3, C.stoneDark, rand);
  group.add(kit.build(`tambo-${id}`));

  // Khipu frame to one side in front of the building, facing the trail.
  const side = rand() < 0.5 ? -1 : 1;
  const khipu = buildKhipu(env, khipuFor(company.id), hashStr(id) % 10);
  const kx = side * (w / 2 + 0.2);
  khipu.group.position.set(kx, 0, 0.9);
  khipu.group.scale.setScalar(1.25);
  khipu.group.rotation.y = -side * (0.18 + rand() * 0.12);
  group.add(khipu.group);

  // Carved sign on two posts at the plaza's trail edge, opposite side.
  const sign = signTexture(company.name, companyYears(company, lang));
  const signMat = toonMapped(env, sign.tex);
  owned.push(signMat);
  const signGroup = new THREE.Group();
  const sk = new Kit(env);
  sk.box(0.09, 1.25, 0.09, -0.62, 0, 0, C.woodDark);
  sk.box(0.09, 1.25, 0.09, 0.62, 0, 0, C.woodDark);
  sk.box(1.44, 0.6, 0.08, 0, 0.66, -0.01, C.wood);
  signGroup.add(sk.build("sign"));
  const signGeo = new THREE.PlaneGeometry(1.36, 0.51);
  geos.push(signGeo);
  const face = new THREE.Mesh(signGeo, signMat);
  face.position.set(0, 0.96, 0.035);
  signGroup.add(face);
  // Dye ribbon tied to the post: the company's cord color.
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.02), env.toon(DYE[company.dye]));
  geos.push(ribbon.geometry);
  ribbon.position.set(0.62, 0.95, 0.07);
  signGroup.add(ribbon);
  signGroup.position.set(-side * (w / 2 - 0.3), 0, 2.4);
  signGroup.rotation.y = side * 0.25;
  group.add(signGroup);

  // Torch on the frame side, between door and khipu.
  const torch = makeTorch(env, 1.55, hashStr(id));
  torch.group.position.set(side * (w / 2 - 0.45), 0, 0.35);
  group.add(torch.group);

  const focus = new THREE.Vector3(kx * 0.7, 0, 2.2);
  const front = new THREE.Vector3(kx * 0.45, 0, 2.6);

  // Colliders (world space) computed after content places the group; expose a builder.
  const colliders: Collider[] = [];
  const computeColliders = () => {
    colliders.length = 0;
    const r = 0.42;
    colliders.push(...circlesAlong(group, -w / 2, z0, w / 2, z0, r));
    colliders.push(...circlesAlong(group, -w / 2, z0, -w / 2, z1, r));
    colliders.push(...circlesAlong(group, w / 2, z0, w / 2, z1, r));
    colliders.push(...circlesAlong(group, -w / 2, z1, w / 2, z1, r));
    colliders.push(circleAt(group, kx - 0.9, 0.9, 0.22), circleAt(group, kx + 0.9, 0.9, 0.22));
    colliders.push(circleAt(group, side * (w / 2 - 0.45), 0.35, 0.18));
    colliders.push(circleAt(group, -side * (w / 2 - 0.3), 2.4, 0.3));
  };
  (group.userData as { computeColliders?: () => void }).computeColliders = computeColliders;

  return {
    group,
    focus,
    front,
    khipu,
    torch,
    colliders,
    hits: [khipu.group, signGroup],
    relabel(l) {
      offFontsReady(sign.draw);
      const s2 = signTexture(company.name, companyYears(company, l));
      signMat.map?.dispose();
      signMat.map = s2.tex;
      signMat.needsUpdate = true;
    },
    dispose() {
      offFontsReady(sign.draw);
      khipu.dispose();
      torch.dispose();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      for (const g of geos) g.dispose();
      for (const m of owned) {
        (m as THREE.MeshToonMaterial).map?.dispose();
        m.dispose();
      }
      group.removeFromParent();
    },
  };
}
