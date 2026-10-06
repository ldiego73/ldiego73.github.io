/**
 * A tabletop C4 maquette that unfolds beside an artifact cord on the Q'eswachaka bridge.
 * Local frame (set by the caller): x = the trail tangent, y = up, z = to the climber's right; the origin
 * sits on the deck centerline at railing height. The board hangs outside the railing on `side` (+1 right,
 * -1 left) and swings up on a hinge; the diagram's flow runs outward from the railing (left → right on
 * screen for a climber) and its columns rise as Andean terraces, one step per C4 column.
 * Static parts merge per column (Kit); packets on the relations are one InstancedMesh.
 */
import * as THREE from "three";
import type { Artifact } from "../../../data/career";
import type { Lang, WorldEnv } from "../../contract";
import { flattenToonGroup, vertexToon } from "../../merge-colors";
import { C, DYE, Kit } from "../../props";
import { labelSprite, type Owned } from "../exhibits/label";
import { type C4Diagram, type C4Node, colX, labelText, type NodeKind } from "./diagrams";

export interface Maquette {
  group: THREE.Group;
  /** 0 folded (hidden) … 1 fully open. */
  set(progress: number): void;
  /** Packets along the relations (call while open). */
  update(t: number, camera?: THREE.PerspectiveCamera): void;
  dispose(): void;
}

const STEP = 0.24;
/** Largest display scale of a maquette (readable from the follow camera at ~9 u). */
export const MAQ_SCALE = 1.45;
/** Board depth across the flow (along the bridge) before scaling. */
export const BOARD_D = 1.3;
/** Board length along the flow before scaling. */
export const boardLength = (cols: number) => (cols >= 4 ? 2.3 : 1.95);
const ROW = 0.34;
const INK = "#3b2f28";

/** Node colors, shared with the panel legend. */
export function kindColor(kind: NodeKind, dye: string): string {
  switch (kind) {
    case "person":
      return C.cotton;
    case "container":
      return dye;
    case "gateway":
      return C.stoneDeep;
    case "queue":
      return DYE.turq;
    case "store":
      return DYE.alpaca;
    case "plugin":
      return DYE.indigo;
    default:
      return C.stoneDark;
  }
}

interface Size {
  /** Half extent along the flow, height. */
  hx: number;
  h: number;
}

const SIZE: Record<NodeKind, Size> = {
  person: { hx: 0.07, h: 0.24 },
  container: { hx: 0.16, h: 0.2 },
  gateway: { hx: 0.15, h: 0.34 },
  queue: { hx: 0.19, h: 0.15 },
  store: { hx: 0.11, h: 0.2 },
  plugin: { hx: 0.08, h: 0.05 },
  system: { hx: 0.11, h: 0.16 },
};

const ease = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

const _o = new THREE.Object3D();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);
const _w = new THREE.Vector3();

/**
 * Labels never grow past this fraction of the view height. From the follow camera (~8–9 u) a tag
 * covers ~3% of the height, so they keep their size there; only close-ups (camera pressed against the
 * board) shrink them instead of filling the screen.
 */
export const LABEL_MAX_FRAC = 0.045;

/** Scale factor (≤ 1) that caps a world-height `h` seen at distance `d` to `maxFrac` of the view height. */
export function labelCap(h: number, d: number, fovDeg: number, maxFrac = LABEL_MAX_FRAC): number {
  if (h <= 0) return 1;
  const view = 2 * Math.max(d, 1e-3) * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  return Math.min(1, (maxFrac * view) / h);
}

export function buildMaquette(
  env: WorldEnv,
  d: C4Diagram,
  art: Artifact,
  o: { lang: Lang; side: 1 | -1; hingeZ: number; low: boolean; rm: boolean; scale?: number },
): Maquette {
  const dye = DYE[art.dye];
  const side = o.side;
  const L = boardLength(d.cols);
  const scale = o.scale ?? MAQ_SCALE;
  const D = BOARD_D;
  const group = new THREE.Group();
  group.name = `c4:${art.id}`;
  group.scale.setScalar(scale);
  // The hinge runs along the railing (local x = trail tangent); the board swings out over the gorge.
  const hinge = new THREE.Group();
  hinge.position.set(0, 0, (side * o.hingeZ) / scale);
  group.add(hinge);
  // Diagram space: x = flow (columns), z = rows. Turned so the flow runs outward, away from the deck,
  // which reads left → right on screen for a climber with the board on their right.
  const content = new THREE.Group();
  content.rotation.y = -side * (Math.PI / 2);
  content.position.z = side * (L / 2 + 0.04);
  hinge.add(content);
  const owned: Owned[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const names: string[] = [];

  // Board center (in hinge space) and helpers.
  const zc = 0;
  const xOf = (col: number) => colX(col, d.cols, L);
  const zOf = (row: number) => zc + row * ROW;
  const yOf = (col: number) => 0.03 + (col + 1) * STEP;
  const colW = (L - 0.3) / d.cols;

  // ---- board, terraces, braces (part of the hinge, static).
  const kb = new Kit(env);
  kb.box(L + 0.12, 0.05, D + 0.1, 0, -0.02, zc, C.wood);
  kb.box(0.05, 0.05, D + 0.14, L / 2 + 0.06, -0.02, zc, C.woodDark);
  for (let c = 0; c < d.cols; c++) {
    const x0 = xOf(c) - colW / 2 - (c === 0 ? 0.1 : 0);
    const x1 = L / 2;
    kb.box(x1 - x0, STEP, D - 0.04, (x0 + x1) / 2, 0.03 + c * STEP, zc, c % 2 ? C.stoneDark : C.stone);
  }
  // Two braces from under the board back to the railing posts.
  for (const bz of [-D * 0.36, D * 0.36]) {
    kb.stick(new THREE.Vector3(-L / 2 + L * 0.42, -0.04, bz), new THREE.Vector3(-L / 2, -0.45, bz), 0.025, C.woodDark);
  }
  // Each Kit build (one mesh per color) folds into one vertex-colored mesh: fewer draws per pass.
  const vMat = vertexToon();
  const board = kb.build(`c4-board-${art.id}`);
  flattenToonGroup(board, vMat);
  names.push(board.name);
  content.add(board);

  // ---- nodes, one rising group per column.
  const colGroups: THREE.Group[] = [];
  const kits: Kit[] = [];
  for (let c = 0; c < d.cols; c++) {
    const g = new THREE.Group();
    g.position.y = yOf(c);
    colGroups.push(g);
    content.add(g);
    kits.push(new Kit(env));
  }
  const head = new THREE.SphereGeometry(0.055, 10, 8);
  geos.push(head);
  const tops = new Map<string, number>();
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const nodeTop = (n: C4Node) => tops.get(n.id) ?? SIZE[n.kind].h;
  const place = (n: C4Node) => {
    const k = kits[n.col]!;
    const x = xOf(n.col);
    const z = zOf(n.row);
    const col = kindColor(n.kind, dye);
    const count = n.count ?? 1;
    const spread = n.kind === "system" ? 0.17 : 0.15;
    switch (n.kind) {
      case "person":
        for (let i = 0; i < count; i++) {
          const zz = z + (i - (count - 1) / 2) * spread;
          k.cyl(0.05, 0.07, 0.14, x, 0, zz, col, 8);
          k.add(head, C.adobe, x, 0.19, zz);
        }
        tops.set(n.id, 0.25);
        break;
      case "container":
        for (let i = count - 1; i >= 0; i--) {
          const zz = z + (i - (count - 1) / 2) * spread;
          const dx = i * 0.03;
          k.box(0.32, 0.2, 0.22, x - dx, 0, zz, col);
          k.box(0.26, 0.025, 0.16, x - dx, 0.2, zz, C.cotton);
        }
        tops.set(n.id, 0.23);
        break;
      case "gateway":
        k.box(0.3, 0.34, 0.42, x, 0, z, col);
        k.box(0.32, 0.06, 0.44, x, 0.22, z, dye);
        k.box(0.06, 0.2, 0.16, x - 0.15, 0, z, "#1f1a17");
        k.box(0.06, 0.2, 0.16, x + 0.15, 0, z, "#1f1a17");
        tops.set(n.id, 0.34);
        break;
      case "queue":
        // Horizontal tube along the flow (Kit.cyl centers at y + h/2, so lower y by h/2).
        k.cyl(0.075, 0.075, 0.38, x, 0.08 - 0.19, z, col, 10, 0, -Math.PI / 2);
        for (const ex of [-0.17, 0.17]) k.cyl(0.085, 0.085, 0.03, x + ex, 0.08 - 0.015, z, INK, 10, 0, -Math.PI / 2);
        k.box(0.06, 0.05, 0.06, x - 0.1, 0, z, C.woodDark);
        k.box(0.06, 0.05, 0.06, x + 0.1, 0, z, C.woodDark);
        tops.set(n.id, 0.16);
        break;
      case "store":
        k.cyl(0.11, 0.11, 0.18, x, 0, z, col, 12);
        k.cyl(0.112, 0.112, 0.02, x, 0.06, z, C.cotton, 12);
        k.cyl(0.112, 0.112, 0.02, x, 0.12, z, C.cotton, 12);
        tops.set(n.id, 0.19);
        break;
      case "plugin": {
        const host = n.on ? byId.get(n.on) : undefined;
        const y = host ? nodeTop(host) : 0;
        k.box(0.16, 0.04, 0.16, x, y, z, col);
        for (const s of [-0.05, 0, 0.05]) {
          k.box(0.025, 0.02, 0.2, x + s, y + 0.01, z, DYE.ochre);
          k.box(0.2, 0.02, 0.025, x, y + 0.01, z + s, DYE.ochre);
        }
        tops.set(n.id, y + 0.05);
        break;
      }
      default:
        for (let i = 0; i < count; i++) {
          const zz = z + (i - (count - 1) / 2) * spread;
          const dx = (i % 2) * 0.06;
          k.box(0.2, 0.13, 0.15, x + dx, 0, zz, col);
          k.box(0.22, 0.04, 0.17, x + dx, 0.13, zz, dye);
        }
        tops.set(n.id, 0.18);
    }
  };
  // Hosts before plugins (a chip sits on its host's top).
  for (const n of d.nodes) if (n.kind !== "plugin") place(n);
  for (const n of d.nodes) if (n.kind === "plugin") place(n);

  // Boundary: a dashed ink frame following the terraces of the columns it covers.
  let boundaryAt: THREE.Vector3 | null = null;
  if (d.boundary) {
    const ns = d.boundary.nodes.map((id) => byId.get(id)).filter((n): n is C4Node => !!n);
    const cmin = Math.min(...ns.map((n) => n.col));
    const cmax = Math.max(...ns.map((n) => n.col));
    const z0 = Math.min(...ns.map((n) => zOf(n.row))) - 0.24;
    const z1 = Math.max(...ns.map((n) => zOf(n.row))) + 0.24;
    for (let c = cmin; c <= cmax; c++) {
      const k = kits[c]!;
      const xa = xOf(c) - colW / 2 + 0.02;
      const xb = xOf(c) + colW / 2 - 0.02;
      for (let x = xa; x < xb - 0.04; x += 0.13)
        for (const z of [z0, z1]) k.box(0.08, 0.012, 0.025, x + 0.04, 0.002, z, INK);
      if (c === cmin || c === cmax)
        for (let z = z0; z < z1 - 0.04; z += 0.13)
          k.box(0.025, 0.012, 0.08, c === cmin ? xa : xb, 0.002, z + 0.04, INK);
    }
    boundaryAt = new THREE.Vector3(xOf(cmin) - colW / 2 + 0.05, yOf(cmin) + 0.02, z1);
  }

  colGroups.forEach((g, c) => {
    const built = kits[c]!.build(`c4-col-${art.id}-${c}`);
    flattenToonGroup(built, vMat);
    names.push(built.name);
    g.add(built);
  });

  // ---- relations: sticks with arrowheads (one merged group) + packets.
  const ke = new Kit(env);
  const edges: Array<[THREE.Vector3, THREE.Vector3]> = [];
  const cone = new THREE.ConeGeometry(0.035, 0.08, 6);
  geos.push(cone);
  for (const e of d.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const ya = yOf(a.col) + Math.min(0.1, nodeTop(a) * 0.5);
    const yb = yOf(b.col) + Math.min(0.1, nodeTop(b) * 0.5);
    const pa = new THREE.Vector3(xOf(a.col) + SIZE[a.kind].hx + 0.02, ya, zOf(a.row));
    const pb = new THREE.Vector3(xOf(b.col) - SIZE[b.kind].hx - 0.06, yb, zOf(b.row));
    if (b.kind === "system" || b.kind === "container") pb.x -= 0.03 * ((b.count ?? 1) - 1);
    ke.stick(pa, pb, 0.012, INK, 4);
    const dir = pb.clone().sub(pa).normalize();
    _q.setFromUnitVectors(_up, dir);
    _e.setFromQuaternion(_q);
    const tip = pb.clone().addScaledVector(dir, 0.02);
    ke.add(cone, INK, tip.x, tip.y, tip.z, _e.x, _e.y, _e.z);
    edges.push([pa, pb]);
  }
  const edgeGroup = ke.build(`c4-edges-${art.id}`);
  names.push(edgeGroup.name);
  content.add(edgeGroup);

  const nPk = o.low ? Math.min(4, edges.length) : edges.length;
  const pkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  geos.push(pkGeo);
  const packets = new THREE.InstancedMesh(pkGeo, env.toon("#ffffff"), Math.max(1, nPk));
  packets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  packets.frustumCulled = false;
  packets.count = nPk;
  const pkColor = new THREE.Color(DYE.ochre);
  for (let i = 0; i < nPk; i++) packets.setColorAt(i, pkColor);
  content.add(packets);

  // ---- labels (sprites): staggered heights within a column so neighbours never overlap.
  const labels: THREE.Sprite[] = [];
  /** Each label's built scale (x, y), so the close-up cap can shrink and restore it. */
  const baseScale: number[] = [];
  const mats: THREE.SpriteMaterial[] = [];
  const byCol = new Map<number, C4Node[]>();
  for (const n of d.nodes) {
    if (n.kind === "plugin") continue;
    const list = byCol.get(n.col) ?? [];
    list.push(n);
    byCol.set(n.col, list);
  }
  for (const [c, list] of byCol) {
    // Nearest row (to a climber) first: farther rows get the higher labels, so they never cover nearer ones.
    list.sort((a, b) => side * (b.row - a.row));
    list.forEach((n, i) => {
      const lab = labelSprite(env, labelText(n.label, o.lang), {
        h: list.length > 2 ? 0.14 : 0.17,
        stripe: kindColor(n.kind, dye),
      });
      owned.push(lab);
      // Two nodes: alternate heights; more: a staircase of labels (one level per row).
      const lift = list.length > 2 ? i * 0.22 : list.length > 1 && i % 2 === 1 ? 0.24 : 0;
      lab.sprite.position.set(xOf(c), yOf(c) + nodeTop(n) + 0.05 + lift, zOf(n.row));
      content.add(lab.sprite);
      labels.push(lab.sprite);
      mats.push(lab.sprite.material);
    });
  }
  for (const n of d.nodes) {
    if (n.kind !== "plugin") continue;
    const lab = labelSprite(env, labelText(n.label, o.lang), { h: 0.12, bg: "#232a5c", fg: "#ffffff" });
    owned.push(lab);
    // Beside the chip, below its host's label.
    lab.sprite.position.set(xOf(n.col) + 0.3, yOf(n.col) + nodeTop(n) - 0.12, zOf(n.row));
    content.add(lab.sprite);
    labels.push(lab.sprite);
    mats.push(lab.sprite.material);
  }
  if (d.boundary && boundaryAt) {
    const lab = labelSprite(env, d.boundary.label[o.lang], { h: 0.11, bg: C.paper, font: "mono" });
    owned.push(lab);
    lab.sprite.center.set(0, 0);
    lab.sprite.position.copy(boundaryAt);
    content.add(lab.sprite);
    labels.push(lab.sprite);
    mats.push(lab.sprite.material);
  }

  for (const s of labels) baseScale.push(s.scale.x, s.scale.y);

  let p = -1;
  const api: Maquette = {
    group,
    set(progress) {
      if (progress === p) return;
      p = progress;
      group.visible = p > 0.001;
      if (!group.visible) return;
      hinge.rotation.x = side * (Math.PI / 2) * (1 - ease(p / 0.35));
      for (let c = 0; c < colGroups.length; c++) {
        const k = ease((p - 0.3 - c * 0.08) / 0.3);
        const g = colGroups[c]!;
        g.visible = k > 0.001;
        g.scale.set(1, Math.max(0.001, k), 1);
      }
      const show = ease((p - 0.78) / 0.22);
      edgeGroup.visible = show > 0.05;
      packets.visible = show > 0.5;
      for (const m of mats) m.opacity = show;
      for (const s of labels) s.visible = show > 0.02;
    },
    update(t, camera) {
      // Cap the tags' on-screen size up close (scale feeds matrixWorld, which the ink-mask twins copy).
      if (camera && labels[0]?.visible) {
        for (let i = 0; i < labels.length; i++) {
          const s = labels[i]!;
          const h = baseScale[i * 2 + 1]! * scale;
          const k = labelCap(h, camera.position.distanceTo(s.getWorldPosition(_w)), camera.fov);
          s.scale.set(baseScale[i * 2]! * k, baseScale[i * 2 + 1]! * k, 1);
        }
      }
      if (!packets.visible) return;
      for (let i = 0; i < nPk; i++) {
        const [a, b] = edges[i]!;
        const u = o.rm ? 0.5 : (t * 0.55 + i * 0.37) % 1;
        _o.position.copy(a).lerp(b, u);
        _o.rotation.set(0, o.rm ? 0 : t * 2, 0);
        _o.scale.setScalar(Math.min(1, u / 0.12, (1 - u) / 0.12) + 0.001);
        _o.updateMatrix();
        packets.setMatrixAt(i, _o.matrix);
      }
      packets.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      group.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.isMesh && names.some((n) => m.name.startsWith(n))) m.geometry.dispose();
      });
      packets.dispose();
      vMat.dispose();
      for (const g of geos) g.dispose();
      for (const ow of owned) ow.dispose();
      group.removeFromParent();
    },
  };
  // Ink outlines skip the labels (sprites set it themselves); the packets keep their outline.
  api.set(0);
  return api;
}
