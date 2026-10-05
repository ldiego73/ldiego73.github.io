import * as THREE from "three";
import { NEON } from "../core/neon";
import type { Stage } from "../core/stage";
import { addLights } from "../core/stage";
import { apis, type Comp, errOf, primary, type State } from "./state";

/** Ground positions (x, z). Top of the screen is -z. */
export const POS: Record<string, [number, number]> = {
  edge: [0, -8.2],
  lb: [0, -4.6],
  api0: [-4, -1.2],
  api1: [0, -1.2],
  api2: [4, -1.2],
  cache: [-4.6, 2.6],
  queue: [4.6, 2.6],
  db0: [-1.6, 4.4],
  db1: [1.6, 4.4],
};
const PLATE = [-5.7, -6.3, 5.7, 0.5];
const PER = 10;
const LVL = [NEON.lime, NEON.amber, NEON.red];

/** 0 healthy, 1 degraded, 2 failing. */
export const level = (c: Comp) => (c.down || c.restarting > 0 || errOf(c) > 0.3 ? 2 : c.fault || c.health < 70 ? 1 : 0);

interface Edge {
  pts: THREE.Vector3[];
  from: string;
  to: string;
  phase: number;
}
interface Node {
  lamp: THREE.Mesh;
  mat: THREE.MeshLambertMaterial;
  smoke: THREE.InstancedMesh;
  crown: THREE.Mesh;
  height: number;
  pop: number;
}
export interface View {
  update(s: State, sel: string, dt: number): void;
  screen(id: string): { x: number; y: number };
  above(id: string): { x: number; y: number };
  plate(): { x: number; y: number };
  pick(x: number, y: number): string | null;
  pop(id: string, kind: "fix" | "down" | "region"): void;
  dispose(): void;
}

export function createView(stage: Stage, s0: State, reduced: boolean): View {
  const { scene, camera } = stage;
  const cam = camera as THREE.PerspectiveCamera;
  addLights(scene);
  scene.background = new THREE.Color(NEON.void);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const matte = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const tmp = new THREE.Object3D();
  const col = new THREE.Color();
  // Batch every static voxel by palette role, including the floor and all paths.
  const batches = new Map<string, THREE.Matrix4[]>();
  const block = (color: string, x: number, y: number, z: number, w = 1, h = 1, d = 1) => {
    tmp.position.set(x, y, z);
    tmp.scale.set(w, h, d);
    tmp.updateMatrix();
    if (!batches.has(color)) batches.set(color, []);
    batches.get(color)!.push(tmp.matrix.clone());
  };
  for (let x = -6; x <= 6; x++) for (let z = -9; z <= 6; z++) block(NEON.floor, x, -0.25, z, 0.97, 0.5, 0.97);

  const [px0, pz0, px1, pz1] = PLATE;
  const border = new THREE.Group();
  const borderMat = matte(NEON.grid);
  for (const [x, z, w, d] of [
    [0, pz0, px1 - px0, 0.16],
    [0, pz1, px1 - px0, 0.16],
    [px0, (pz0 + pz1) / 2, 0.16, pz1 - pz0],
    [px1, (pz0 + pz1) / 2, 0.16, pz1 - pz0],
  ]) {
    const m = new THREE.Mesh(cube, borderMat);
    m.position.set(x, 0.09, z);
    m.scale.set(w, 0.18, d);
    border.add(m);
  }
  scene.add(border);

  const edges: Edge[] = [];
  const pathCells = new Set<string>();
  const cord = (from: string, to: string) => {
    const [ax, az] = POS[from];
    const [bx, bz] = POS[to];
    const pts: THREE.Vector3[] = [];
    const segment = (x0: number, z0: number, x1: number, z1: number) => {
      const steps = Math.round((Math.abs(x1 - x0) + Math.abs(z1 - z0)) / 0.2);
      for (let i = 0; i <= steps; i++) {
        const t = steps ? i / steps : 0;
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        pts.push(new THREE.Vector3(x, 0.3, z));
        const key = `${x.toFixed(2)},${z.toFixed(2)}`;
        if (!pathCells.has(key)) {
          pathCells.add(key);
          block(NEON.grid, x, 0.07, z, 0.19, 0.14, 0.19);
        }
      }
    };
    segment(ax, az, bx, az);
    segment(bx, az, bx, bz);
    edges.push({ pts, from, to, phase: edges.length / 19 });
  };
  cord("edge", "lb");
  for (const a of ["api0", "api1", "api2"]) {
    cord("lb", a);
    for (const t of ["cache", "queue", "db0", "db1"]) cord(a, t);
  }
  cord("queue", "db0");
  cord("queue", "db1");
  cord("db0", "db1");

  const nodes = new Map<string, Node>();
  for (const c of s0.comps) {
    const [x, z] = POS[c.id];
    const b = (dx: number, y: number, dz: number, w: number, h: number, d: number, color = NEON.grid as string) =>
      block(color, x + dx, y, z + dz, w, h, d);
    let height = 1.4;
    if (c.kind === "lb") {
      height = 2.4;
      for (let i = 0; i < 3; i++) {
        b(0, 0.4 + i * 0.8, 0, 1.2, 0.76, 1.2);
        b(0, 0.4 + i * 0.8, 0.61, 0.7, 0.2, 0.08, NEON.ink);
      }
    } else if (c.kind === "db") {
      // Rounded voxel footprint with square corners cut from each layer.
      for (let i = 0; i < 3; i++) {
        for (let row = -2; row <= 2; row++) {
          const radius = Math.abs(row) === 2 ? 1 : 2;
          for (let column = -radius; column <= radius; column++) {
            b(column * 0.28, 0.21 + i * 0.48, row * 0.28, 0.28, 0.42, 0.28);
            b(column * 0.28, 0.45 + i * 0.48, row * 0.28, 0.28, 0.06, 0.28, NEON.ink);
          }
        }
      }
    } else if (c.kind === "queue") {
      height = 0.95;
      b(0, 0.3, 0, 2, 0.4, 0.9);
      for (let i = 0; i < 7; i++) b(-0.84 + i * 0.28, 0.54, 0, 0.22, 0.12, 0.8, NEON.floor);
      for (const dx of [-0.65, 0.4]) b(dx, 0.78, 0, 0.4, 0.4, 0.4, NEON.ink);
    } else if (c.kind === "cache") {
      height = 1;
      b(0, 0.4, 0, 1.6, 0.8, 1);
      b(0, 0.86, 0, 1.64, 0.2, 1.04, NEON.floor);
      b(0, 0.65, 0.55, 0.24, 0.34, 0.12, NEON.ink);
    } else if (c.kind === "api") {
      b(0, 0.7, 0, 1.25, 1.4, 1.25);
      for (const dx of [-0.5, 0.5]) b(dx, 0.7, 0.64, 0.16, 1.4, 0.08, NEON.floor);
      for (const y of [0.12, 1.28]) b(0, y, 0.64, 1.25, 0.16, 0.08, NEON.floor);
      b(0, 0.7, 0.66, 0.36, 0.36, 0.08, NEON.ink);
    } else {
      height = 1.2;
      for (const dx of [-0.55, 0.55]) {
        b(dx, 0.7, 0, 0.8, 0.65, 0.5);
        b(dx, 0.23, 0, 0.2, 0.3, 0.2);
        b(dx, 0.12, 0, 0.7, 0.12, 0.4);
        b(dx, 0.7, 0.26, 0.6, 0.4, 0.06, NEON.ink);
      }
    }
    b(-0.65, height + 0.22, 0, 0.12, 0.65, 0.12, NEON.ink);
    const mat = matte(NEON.lime);
    const lamp = new THREE.Mesh(cube, mat);
    lamp.position.set(x - 0.4, height + 0.5, z);
    lamp.scale.set(0.48, 0.3, 0.2);
    const smoke = new THREE.InstancedMesh(cube, matte(NEON.dim), 3);
    smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    smoke.visible = false;
    smoke.frustumCulled = false;
    const crown = new THREE.Mesh(cube, matte(NEON.cyan));
    crown.position.set(x, height + 0.12, z);
    crown.scale.set(0.4, 0.2, 0.4);
    crown.visible = false;
    scene.add(lamp, smoke, crown);
    nodes.set(c.id, { lamp, mat, smoke, crown, height, pop: 0 });
  }
  for (const [color, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(cube, matte(color), matrices.length);
    matrices.forEach((matrix, i) => {
      mesh.setMatrixAt(i, matrix);
    });
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
  const parts = new THREE.InstancedMesh(cube, matte(NEON.ink), edges.length * PER);
  const health = new THREE.InstancedMesh(cube, matte(NEON.ink), s0.comps.length * 10);
  for (const mesh of [parts, health]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const selection = new THREE.Group();
  for (const [x, z, w, d] of [
    [0, -0.95, 2, 0.14],
    [0, 0.95, 2, 0.14],
    [-0.95, 0, 0.14, 2],
    [0.95, 0, 0.14, 2],
  ]) {
    const m = new THREE.Mesh(cube, matte(NEON.cyan));
    m.position.set(x, 0.16, z);
    m.scale.set(w, 0.12, d);
    selection.add(m);
  }
  scene.add(selection);

  const target = new THREE.Vector3(0, 0, -1.6);
  const corners = [-6.6, 6.6].flatMap((x) =>
    [-9.6, 6.6].flatMap((z) => [0, 3.2].map((y) => new THREE.Vector3(x, y, z))),
  );
  const dir = new THREE.Vector3(0, 1.15, 1).normalize();
  stage.onResize(() => {
    let dist = 24;
    for (let k = 0; k < 4; k++) {
      cam.position.copy(dir).multiplyScalar(dist).add(target);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let m = 0;
      for (const c of corners) {
        const p = c.clone().project(cam);
        m = Math.max(m, Math.abs(p.x) / 0.96, Math.abs(p.y - 0.06) / 0.86);
      }
      dist *= 0.35 + 0.65 * m;
    }
    cam.position.copy(dir).multiplyScalar(dist).add(target);
    cam.lookAt(target);
    cam.updateMatrixWorld();
  });

  const flowOn = (s: State, e: Edge): number => {
    const f = s.flow;
    const P = primary(s).id;
    const total = f.api.reduce((a, b) => a + b, 0) || 1;
    const share = (id: string) => f.api[apis(s).findIndex((a) => a.id === id)] / total;
    if (e.from === "edge") return (f.demand + f.retry) / 1600;
    if (e.from === "lb") return f.api[Number(e.to[3])] / 600;
    if (e.from.startsWith("api")) {
      const k = share(e.from);
      if (e.to === "cache") return (f.cacheHit * k) / 400;
      if (e.to === "queue") return (f.queue * k) / 150;
      return e.to === P ? (f.db * k) / 300 : 0;
    }
    if (e.from === "queue") return e.to === P ? f.queue / 300 : 0;
    return 0.25;
  };

  let clock = 0;
  let plateFlash = 0;
  const update = (s: State, selId: string, dt: number) => {
    clock += dt;
    const P = primary(s).id;
    const byId = new Map(s.comps.map((c) => [c.id, c]));
    const lv = (id: string) => {
      const c = byId.get(id)!;
      return c.breaker ? 0 : level(c);
    };
    let i = 0;
    for (const e of edges) {
      const replica = (e.to === "db0" || e.to === "db1") && e.to !== P && e.from !== "db0";
      const f = flowOn(s, e);
      let l = Math.max(lv(e.from), lv(e.to));
      if (e.from === "edge" && s.flow.lb < s.flow.demand + s.flow.retry - 1) l = 2;
      const idle = replica || f <= 0.02;
      const n = idle ? (e.from === "db0" ? 1 : 0) : l === 2 ? 3 : Math.max(1, Math.round(Math.min(1, f) * PER));
      for (let k = 0; k < PER; k++, i++) {
        tmp.scale.setScalar(k < n ? 0.18 : 0);
        let u = (k / Math.max(1, n) + (reduced ? 0 : clock * (l === 2 ? 0.22 : l === 1 ? 0.4 : 0.55)) + e.phase) % 1;
        if (l === 2) u *= 0.55;
        tmp.position.copy(e.pts[Math.floor(u * (e.pts.length - 1))]);
        tmp.updateMatrix();
        parts.setMatrixAt(i, tmp.matrix);
        parts.setColorAt(i, col.set(l ? LVL[l] : NEON.ink));
      }
    }
    parts.instanceMatrix.needsUpdate = true;
    if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
    s.comps.forEach((c, index) => {
      const n = nodes.get(c.id)!;
      const l = level(c);
      const [x, z] = POS[c.id];
      n.mat.color.set(LVL[l]);
      n.pop = Math.max(0, n.pop - dt * 3);
      n.lamp.position.y = n.height + 0.5 + (!reduced && n.pop > 0.5 ? 0.15 : 0);
      n.crown.visible = c.kind === "db" && c.id === P;
      n.smoke.visible = l === 2 || (!!c.fault && c.health < 35);
      for (let k = 0; k < 3; k++) {
        const step = reduced ? k : (Math.floor(clock * 3) + k) % 4;
        tmp.position.set(x + (k - 1) * 0.25, n.height + 0.75 + step * 0.35, z - 0.15);
        tmp.scale.setScalar(0.18 + step * 0.04);
        tmp.updateMatrix();
        n.smoke.setMatrixAt(k, tmp.matrix);
      }
      n.smoke.instanceMatrix.needsUpdate = true;
      for (let k = 0; k < 10; k++) {
        tmp.position.set(x - 0.81 + k * 0.18, 0.16, z + 1.12);
        tmp.scale.set(0.14, 0.16, 0.22);
        tmp.updateMatrix();
        health.setMatrixAt(index * 10 + k, tmp.matrix);
        health.setColorAt(index * 10 + k, col.set(k < Math.ceil(Math.max(0, c.health) / 10) ? LVL[l] : NEON.floor));
      }
    });
    health.instanceMatrix.needsUpdate = true;
    if (health.instanceColor) health.instanceColor.needsUpdate = true;
    plateFlash = Math.max(0, plateFlash - dt);
    borderMat.color.set(byId.get("lb")!.fault === "region" ? NEON.red : plateFlash > 0 ? NEON.lime : NEON.grid);
    selection.position.set(POS[selId][0], 0, POS[selId][1]);
  };
  const proj = new THREE.Vector3();
  const toPx = (x: number, y: number, z: number) => {
    proj.set(x, y, z).project(cam);
    return { x: ((proj.x + 1) / 2) * stage.size.w, y: ((1 - proj.y) / 2) * stage.size.h };
  };
  return {
    update,
    screen(id) {
      const [x, z] = POS[id];
      return id === "lb" || id === "edge" ? toPx(x + 1.4, 0.6, z + 0.2) : toPx(x, 0, z + 1.5);
    },
    above: (id) => toPx(POS[id][0], nodes.get(id)!.height + 1, POS[id][1]),
    plate: () => toPx(px0 + 0.3, 0, pz1 - 0.2),
    pick(x, y) {
      let best: string | null = null;
      let bd = Math.max(44, stage.size.w * 0.09) ** 2;
      for (const id of Object.keys(POS)) {
        const p = toPx(POS[id][0], 0.6, POS[id][1]);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) [best, bd] = [id, d];
      }
      return best;
    },
    pop(id, kind) {
      if (reduced) return;
      const n = nodes.get(id);
      if (n) n.pop = 1;
      if (kind === "region") plateFlash = 1;
    },
    // Stage disposal owns all scene geometry and materials.
    dispose() {},
  };
}
