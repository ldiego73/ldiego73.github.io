import * as THREE from "three";
import type { CordSpec } from "./artifacts";
import type { WorldEnv } from "./contract";
import { C, DYE, Kit } from "./props";

/**
 * A company's khipu on a wooden frame: the primary cord along the bar, one pendant per stage
 * (extra stages and education hang as subsidiaries off the main pendant), knots per stage knot:
 * single knots for shipped things, long knots (stacked turns) for digits of a metric.
 * On approach the knots light up one by one (warm emissive + a small pulse).
 */
export interface KhipuModel {
  group: THREE.Group;
  knotCount: number;
  /** Advance the light-up toward `lit` (true near the tambo). */
  update(dt: number, t: number, lit: boolean): void;
  dispose(): void;
}

const SINGLE = 0.12;
const TURN = 0.036;

function knotSpan(n: number) {
  return n > 1 ? n * TURN + 0.07 : SINGLE;
}

export function cordLength(knots: CordSpec["knots"]) {
  return Math.max(
    0.9,
    knots.reduce((a, k) => a + knotSpan(k.n), 0.32),
  );
}

export function buildKhipu(env: WorldEnv, specs: CordSpec[], seed = 1): KhipuModel {
  const group = new THREE.Group();
  group.name = "khipu";
  const geos: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];
  const litMats = new Map<string, THREE.MeshToonMaterial>();
  const litMat = (color: string) => {
    let m = litMats.get(color);
    if (!m) {
      m = env.toon(color).clone();
      m.emissive = new THREE.Color(C.torch);
      m.emissiveIntensity = 0.75;
      litMats.set(color, m);
      owned.push(m);
    }
    return m;
  };

  const subs = specs.filter((s) => s.kind === "sub").length;
  const barW = 1.15 + subs * 0.32;
  const barY = 2.15;

  // Frame: two posts on stone footings, a bar with a little straw canopy.
  const kit = new Kit(env);
  for (const s of [-1, 1]) {
    kit.box(0.34, 0.22, 0.34, (s * barW) / 2, 0, 0, C.stoneDark);
    kit.box(0.12, barY + 0.25, 0.12, (s * barW) / 2, 0.15, 0, C.wood, 0, 0, s * 0.02);
  }
  kit.box(barW + 0.4, 0.11, 0.13, 0, barY, 0, C.woodDark);
  kit.box(barW + 0.7, 0.05, 0.62, 0, barY + 0.42, -0.08, C.thatch, 0, 0.14);
  kit.box(barW + 0.5, 0.06, 0.5, 0, barY + 0.47, -0.1, C.straw, 0, 0.1);
  group.add(kit.build("khipu-frame"));

  // Primary cord along the bar (cotton), with wraps.
  const primaryGeo = new THREE.CylinderGeometry(0.035, 0.035, barW + 0.2, 6);
  primaryGeo.rotateZ(Math.PI / 2);
  geos.push(primaryGeo);
  const primary = new THREE.Mesh(primaryGeo, env.toon(C.cotton));
  primary.position.y = barY - 0.07;
  group.add(primary);
  const endTassel = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), env.toon(C.cotton));
  geos.push(endTassel.geometry);
  endTassel.position.set(barW / 2 + 0.16, barY - 0.18, 0);
  endTassel.rotation.z = 0.2;
  group.add(endTassel);

  const singleGeo = new THREE.SphereGeometry(0.05, 8, 6);
  singleGeo.scale(1, 0.8, 1);
  const turnGeo = new THREE.TorusGeometry(0.036, 0.017, 5, 10);
  turnGeo.rotateX(Math.PI / 2);
  const tipGeo = new THREE.ConeGeometry(0.04, 0.14, 5);
  geos.push(singleGeo, turnGeo, tipGeo);

  interface KnotView {
    meshes: THREE.Mesh[];
    base: THREE.Material;
    lit: THREE.Material;
    pulse: number;
  }
  const knots: KnotView[] = [];
  const pendants: Array<{ g: THREE.Group; ph: number; base: number }> = [];

  const makeCord = (spec: CordSpec, parent: THREE.Object3D, x: number, y: number, angle: number) => {
    const color = DYE[spec.stage.dye] ?? DYE.alpaca;
    const len = cordLength(spec.knots) * (spec.kind === "sub" ? 0.88 : 1);
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.rotation.z = angle;
    parent.add(pivot);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.015, -len * 0.5, 0.01),
      new THREE.Vector3(-0.01, -len, 0),
    ]);
    const tube = new THREE.TubeGeometry(curve, 10, 0.022, 5, false);
    geos.push(tube);
    pivot.add(new THREE.Mesh(tube, env.toon(color)));
    const tip = new THREE.Mesh(tipGeo, env.toon(color));
    tip.position.y = -len - 0.05;
    tip.rotation.x = Math.PI;
    pivot.add(tip);
    let yy = -0.2;
    for (const k of spec.knots) {
      const span = knotSpan(k.n);
      const meshes: THREE.Mesh[] = [];
      if (k.n > 1) {
        for (let i = 0; i < k.n; i++) {
          const m = new THREE.Mesh(turnGeo, env.toon(color));
          m.position.set(0, yy - 0.035 - i * TURN, 0);
          m.rotation.z = (i % 2 ? 1 : -1) * 0.22;
          pivot.add(m);
          meshes.push(m);
        }
      } else {
        const m = new THREE.Mesh(singleGeo, env.toon(color));
        m.position.set(0, yy - span / 2, 0);
        pivot.add(m);
        meshes.push(m);
      }
      knots.push({ meshes, base: env.toon(color), lit: litMat(color), pulse: 0 });
      yy -= span;
    }
    pendants.push({ g: pivot, ph: pendants.length * 1.7 + seed, base: angle });
    return { pivot, len };
  };

  const main = specs.find((s) => s.kind === "main");
  const mainX = subs ? -barW / 2 + 0.35 : 0;
  let mainPivot: THREE.Group | null = null;
  let mainLen = 1;
  if (main) {
    const r = makeCord(main, group, mainX, barY - 0.07, 0);
    mainPivot = r.pivot;
    mainLen = r.len;
  }
  // Subsidiaries: tied lower and lower along the main pendant, splaying to the right.
  let i = 0;
  for (const spec of specs.filter((s) => s.kind === "sub")) {
    const tieY = -0.12 - i * Math.min(0.16, (mainLen * 0.5) / Math.max(1, subs));
    const angle = 0.32 + i * 0.12;
    makeCord(spec, mainPivot ?? group, 0, tieY, angle);
    // A small wrap where the subsidiary is tied.
    const wrap = new THREE.Mesh(turnGeo, env.toon(C.cotton));
    wrap.position.set(0, tieY, 0);
    (mainPivot ?? group).add(wrap);
    i++;
  }

  let litCount = 0;
  let acc = 0;
  const rm = env.reducedMotion;
  return {
    group,
    knotCount: knots.length,
    update(dt, t, lit) {
      if (lit && rm && litCount < knots.length) {
        for (let k = litCount; k < knots.length; k++) for (const m of knots[k]!.meshes) m.material = knots[k]!.lit;
        litCount = knots.length;
      }
      acc += dt;
      const step = lit ? 0.16 : 0.05;
      while (acc >= step) {
        acc -= step;
        if (lit && litCount < knots.length) {
          const k = knots[litCount++]!;
          for (const m of k.meshes) m.material = k.lit;
          k.pulse = 1;
        } else if (!lit && litCount > 0) {
          const k = knots[--litCount]!;
          for (const m of k.meshes) m.material = k.base;
        } else break;
      }
      if (acc > step) acc = 0;
      for (const k of knots) {
        if (k.pulse <= 0) continue;
        k.pulse = Math.max(0, k.pulse - dt * 3);
        const s = 1 + k.pulse * 0.6;
        for (const m of k.meshes) m.scale.setScalar(s);
      }
      if (!rm) for (const p of pendants) p.g.rotation.z = p.base + Math.sin(t * 1.3 + p.ph) * 0.035;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of owned) m.dispose();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && o.name.startsWith("khipu-frame")) m.geometry.dispose();
      });
      group.removeFromParent();
    },
  };
}
