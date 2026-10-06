import * as THREE from "three";
import type { CordSpec } from "./artifacts";
import type { WorldEnv } from "./contract";
import { cullDistance, deviceCullFactor } from "./detail-cull";
import { type ColoredPart, flattenToonGroup, mergeColored, vertexToon } from "./merge-colors";
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

/** Knot instances of one geometry (single knots or long-knot turns), split into a base and a lit mesh. */
interface KnotSet {
  base: THREE.InstancedMesh;
  lit: THREE.InstancedMesh;
  /** Per instance (knot order): pendant index, local T·R matrix in its pendant, knot index. */
  pend: number[];
  local: THREE.Matrix4[];
  knot: number[];
}

const _s = new THREE.Matrix4();
const _m = new THREE.Matrix4();

export function buildKhipu(env: WorldEnv, specs: CordSpec[], seed = 1): KhipuModel {
  const group = new THREE.Group();
  group.name = "khipu";
  const geos: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];
  // Draw-call diet: the frame (+ primary cord and tassel) is one vertex-colored mesh, each pendant (cord,
  // tip, tie wraps) another, and the knots are instanced per shape in a base and a lit mesh (instance
  // colors = dye). Sway and the light-up pulse move the knot instances from update(), so the toon shading,
  // the ink prepass and picking (any child of the tagged group) see exactly what the per-knot meshes did.
  const vMat = vertexToon();
  const knotMat = env.toon("#ffffff");
  const litMat = knotMat.clone();
  litMat.emissive = new THREE.Color(C.torch);
  litMat.emissiveIntensity = 0.75;
  owned.push(vMat, litMat);

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
  const frame = kit.build("khipu-frame");
  group.add(frame);

  // Primary cord along the bar (cotton), with wraps.
  const primaryGeo = new THREE.CylinderGeometry(0.035, 0.035, barW + 0.2, 6);
  primaryGeo.rotateZ(Math.PI / 2);
  const primary = new THREE.Mesh(primaryGeo, env.toon(C.cotton));
  primary.position.y = barY - 0.07;
  frame.add(primary);
  const endTassel = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), env.toon(C.cotton));
  endTassel.position.set(barW / 2 + 0.16, barY - 0.18, 0);
  endTassel.rotation.z = 0.2;
  frame.add(endTassel);
  flattenToonGroup(frame, vMat);

  const singleGeo = new THREE.SphereGeometry(0.05, 8, 6);
  singleGeo.scale(1, 0.8, 1);
  const turnGeo = new THREE.TorusGeometry(0.036, 0.017, 5, 10);
  turnGeo.rotateX(Math.PI / 2);
  const tipGeo = new THREE.ConeGeometry(0.04, 0.14, 5);
  geos.push(singleGeo, turnGeo, tipGeo);

  const cotton = new THREE.Color(C.cotton);
  const pendants: Array<{ g: THREE.Group; ph: number; base: number; parent: number; parts: ColoredPart[] }> = [];
  /** Knot instances per shape, in knot order (lighting goes knot by knot). */
  const singles: Array<{ pend: number; local: THREE.Matrix4; knot: number; color: THREE.Color }> = [];
  const turns: typeof singles = [];
  let knotCount = 0;

  const makeCord = (spec: CordSpec, parent: number, x: number, y: number, angle: number) => {
    const color = new THREE.Color(DYE[spec.stage.dye] ?? DYE.alpaca);
    const len = cordLength(spec.knots) * (spec.kind === "sub" ? 0.88 : 1);
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.rotation.z = angle;
    (parent < 0 ? group : pendants[parent]!.g).add(pivot);
    const pi = pendants.length;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.015, -len * 0.5, 0.01),
      new THREE.Vector3(-0.01, -len, 0),
    ]);
    const tube = new THREE.TubeGeometry(curve, 10, 0.022, 5, false);
    geos.push(tube);
    const tip = new THREE.Matrix4().compose(
      new THREE.Vector3(0, -len - 0.05, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    const parts: ColoredPart[] = [
      { geometry: tube, color },
      { geometry: tipGeo, color, matrix: tip },
    ];
    pendants.push({ g: pivot, ph: pendants.length * 1.7 + seed, base: angle, parent, parts });
    let yy = -0.2;
    for (const k of spec.knots) {
      const span = knotSpan(k.n);
      if (k.n > 1) {
        for (let i = 0; i < k.n; i++) {
          const local = new THREE.Matrix4().compose(
            new THREE.Vector3(0, yy - 0.035 - i * TURN, 0),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, (i % 2 ? 1 : -1) * 0.22)),
            new THREE.Vector3(1, 1, 1),
          );
          turns.push({ pend: pi, local, knot: knotCount, color });
        }
      } else {
        singles.push({
          pend: pi,
          local: new THREE.Matrix4().makeTranslation(0, yy - span / 2, 0),
          knot: knotCount,
          color,
        });
      }
      knotCount++;
      yy -= span;
    }
    return { pi, len };
  };

  const main = specs.find((s) => s.kind === "main");
  const mainX = subs ? -barW / 2 + 0.35 : 0;
  let mainPi = -1;
  let mainLen = 1;
  if (main) {
    const r = makeCord(main, -1, mainX, barY - 0.07, 0);
    mainPi = r.pi;
    mainLen = r.len;
  }
  // Subsidiaries: tied lower and lower along the main pendant, splaying to the right.
  const loose: ColoredPart[] = [];
  let i = 0;
  for (const spec of specs.filter((s) => s.kind === "sub")) {
    const tieY = -0.12 - i * Math.min(0.16, (mainLen * 0.5) / Math.max(1, subs));
    const angle = 0.32 + i * 0.12;
    makeCord(spec, mainPi, 0, tieY, angle);
    // A small wrap where the subsidiary is tied.
    const wrap = { geometry: turnGeo, color: cotton, matrix: new THREE.Matrix4().makeTranslation(0, tieY, 0) };
    (mainPi >= 0 ? pendants[mainPi]!.parts : loose).push(wrap);
    i++;
  }
  for (const p of pendants) {
    const geo = mergeColored(p.parts);
    if (!geo) continue;
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, vMat);
    mesh.name = "khipu-cord";
    p.g.add(mesh);
  }
  if (loose.length) {
    const geo = mergeColored(loose);
    if (geo) {
      geos.push(geo);
      group.add(new THREE.Mesh(geo, vMat));
    }
  }

  // Knot sets: lit instances are knots [0, litCount) in order; base instances are the rest, stored in
  // reverse so both meshes only change their draw count.
  const knotCull = cullDistance(0.35, deviceCullFactor()) - 1.2;
  const makeSet = (geo: THREE.BufferGeometry, list: typeof singles, name: string): KnotSet | null => {
    const n = list.length;
    if (!n) return null;
    const mk = (mat: THREE.Material, suffix: string) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.name = `${name}-${suffix}`;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Knots are tiny: drop them where the old per-knot meshes were dropped (detail-cull.ts).
      im.userData.cullDistance = knotCull;
      group.add(im);
      return im;
    };
    const set: KnotSet = {
      base: mk(knotMat, "base"),
      lit: mk(litMat, "lit"),
      pend: list.map((k) => k.pend),
      local: list.map((k) => k.local),
      knot: list.map((k) => k.knot),
    };
    list.forEach((k, j) => {
      set.lit.setColorAt(j, k.color);
      set.base.setColorAt(n - 1 - j, k.color);
    });
    return set;
  };
  const sets = [makeSet(singleGeo, singles, "khipu-knot"), makeSet(turnGeo, turns, "khipu-turn")].filter(
    (s): s is KnotSet => !!s,
  );

  const pulses = new Float32Array(knotCount);
  const rel = pendants.map(() => new THREE.Matrix4());
  let litCount = 0;
  let acc = 0;
  let first = true;
  const rm = env.reducedMotion;

  /** Pendant pivots relative to the khipu group, then every knot instance (with its pulse). */
  const place = () => {
    for (let k = 0; k < pendants.length; k++) {
      const p = pendants[k]!;
      p.g.updateMatrix();
      if (p.parent < 0) rel[k]!.copy(p.g.matrix);
      else rel[k]!.multiplyMatrices(rel[p.parent]!, p.g.matrix);
    }
    for (const s of sets) {
      const n = s.knot.length;
      let lit = 0;
      for (let j = 0; j < n; j++) {
        const kn = s.knot[j]!;
        if (kn < litCount) lit++;
        _m.multiplyMatrices(rel[s.pend[j]!]!, s.local[j]!);
        const p = pulses[kn]!;
        if (p > 0) _m.multiply(_s.makeScale(1 + p * 0.6, 1 + p * 0.6, 1 + p * 0.6));
        s.lit.setMatrixAt(j, _m);
        s.base.setMatrixAt(n - 1 - j, _m);
      }
      s.lit.count = lit;
      s.base.count = n - lit;
      s.lit.visible = lit > 0;
      s.base.visible = lit < n;
      s.lit.instanceMatrix.needsUpdate = true;
      s.base.instanceMatrix.needsUpdate = true;
    }
    if (first) {
      first = false;
      // Culling/picking spheres from the rest pose (all instances), padded for sway and the pulse.
      for (const s of sets)
        for (const im of [s.lit, s.base]) {
          const c = im.count;
          im.count = s.knot.length;
          im.computeBoundingSphere();
          if (im.boundingSphere) im.boundingSphere.radius += 0.12;
          im.count = c;
          // Keep this sphere: a later recompute (detail-cull's scan) would see only the drawn instances,
          // or none for an unlit khipu's lit mesh, and cull the knots that light up afterwards.
          im.computeBoundingSphere = () => {};
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
        }
    }
  };
  place();

  return {
    group,
    knotCount,
    update(dt, t, lit) {
      let dirty = false;
      if (lit && rm && litCount < knotCount) {
        litCount = knotCount;
        dirty = true;
      }
      acc += dt;
      const step = lit ? 0.16 : 0.05;
      while (acc >= step) {
        acc -= step;
        if (lit && litCount < knotCount) {
          pulses[litCount++] = 1;
          dirty = true;
        } else if (!lit && litCount > 0) {
          litCount--;
          dirty = true;
        } else break;
      }
      if (acc > step) acc = 0;
      for (let k = 0; k < knotCount; k++) {
        if (pulses[k]! <= 0) continue;
        pulses[k] = Math.max(0, pulses[k]! - dt * 3);
        dirty = true;
      }
      if (!rm) {
        for (const p of pendants) p.g.rotation.z = p.base + Math.sin(t * 1.3 + p.ph) * 0.035;
        dirty = true;
      }
      if (dirty) place();
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of owned) m.dispose();
      for (const s of sets) {
        s.base.dispose();
        s.lit.dispose();
      }
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && o.name.startsWith("khipu-frame")) m.geometry.dispose();
      });
      group.removeFromParent();
    },
  };
}
