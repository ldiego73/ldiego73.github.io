import * as THREE from "three";
import type { Artifact } from "../data/career";
import { artifactsOnBridge } from "./artifacts";
import type { Collider, Station, WorldEnv } from "./contract";
import { C, canvasTex, DYE, Kit, rng, toonMapped } from "./props";

/**
 * Q'eswachaka rope bridge across the gorge the core cuts at the bridge station: woven ichu ropes
 * (two handrails, two floor ropes, hangers), a plank deck that sways a little, stone abutments.
 * Each ARTIFACT is a dyed cord tied to the railing, hanging over the gorge; walking past it opens its panel.
 * Built in world space from the trail spline.
 */
export interface ArtifactSpot {
  artifact: Artifact;
  position: THREE.Vector3;
  r: number;
}

export interface Bridge {
  group: THREE.Group;
  spots: ArtifactSpot[];
  walkables: Collider[];
  colliders: Collider[];
  /** Middle of the deck (tour stop) and the start of the deck. */
  center: THREE.Vector3;
  start: THREE.Vector3;
  /** Deck height under (x, z) if it lies on the deck, else null. */
  deckHeightAt(x: number, z: number): number | null;
  update(dt: number, t: number, active: string | null): void;
  hits: THREE.Object3D[];
  dispose(): void;
}

function ropeTexture() {
  const tex = canvasTex(64, 32, (ctx, w, h) => {
    ctx.fillStyle = C.straw;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = C.strawDark;
    ctx.lineWidth = 5;
    for (let x = -h; x < w + h; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(90,60,25,0.5)";
    ctx.lineWidth = 1.5;
    for (let x = -h; x < w + h; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x + 4, 0);
      ctx.lineTo(x + 4 + h, h);
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Finds the rims of the gorge along the trail around t; falls back to a fixed span when there is no gorge. */
export function findSpan(
  env: WorldEnv,
  tc: number,
): { t0: number; t1: number; y0: number; y1: number; gorge: boolean } {
  const L = Math.max(1, env.trail.length);
  const g = (s: number) => {
    const p = env.trail.pointAt(THREE.MathUtils.clamp(tc + s / L, 0, 1));
    return env.heightAt(p.x, p.z);
  };
  const gc = g(0);
  const rim = (dir: number) => {
    for (let s = 0.5; s <= 22; s += 0.5) {
      if (g(dir * s) > gc + 1.5) {
        // Walk on while the ground keeps rising steeply; stop on the shoulder.
        let e = s;
        while (e < 26 && g(dir * (e + 0.5)) - g(dir * e) > 0.18) e += 0.5;
        return e + 0.6;
      }
    }
    return -1;
  };
  const a = rim(-1);
  const b = rim(1);
  if (a < 0 || b < 0) {
    const t0 = tc - 6 / L;
    const t1 = tc + 6 / L;
    return { t0, t1, y0: env.trail.pointAt(t0).y, y1: env.trail.pointAt(t1).y, gorge: false };
  }
  return { t0: tc - a / L, t1: tc + b / L, y0: g(-a), y1: g(b), gorge: true };
}

export function buildBridge(env: WorldEnv, station: Station): Bridge {
  const rand = rng(68);
  const span = findSpan(env, station.t);
  const N = 48;
  // As wide as reads right for a rope bridge but close to the trail band, so walkers land on the planks.
  const deckW = THREE.MathUtils.clamp(env.trail.halfWidth * 0.75, 1.3, 2.0);
  const sag = 0.18;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const p = env.trail.pointAt(THREE.MathUtils.lerp(span.t0, span.t1, u));
    p.y = THREE.MathUtils.lerp(span.y0, span.y1, u) + 0.06 - Math.sin(Math.PI * u) * sag;
    pts.push(p);
  }
  const deck = new THREE.CatmullRomCurve3(pts);
  const length = deck.getLength();
  const A = pts[0]!.clone();
  const B = pts[N]!.clone();

  // Pivot the whole bridge on the A→B axis for a gentle roll.
  const group = new THREE.Group();
  group.name = "bridge";
  group.position.copy(A);
  const inner = new THREE.Group();
  inner.position.copy(A).negate();
  group.add(inner);
  const axis = B.clone().sub(A).normalize();

  const up = new THREE.Vector3(0, 1, 0);
  const frame = (u: number) => {
    const p = deck.getPointAt(u);
    const tan = deck.getTangentAt(u).normalize();
    const across = new THREE.Vector3().crossVectors(up, tan).normalize();
    const nrm = new THREE.Vector3().crossVectors(tan, across).normalize();
    return { p, tan, across, nrm };
  };

  const band = env.trail.halfWidth + 0.4;
  const funnels = () => {
    const out: Array<[THREE.Vector3, THREE.Vector3]> = [];
    for (const [u, dir] of [
      [0, -1],
      [1, 1],
    ] as const) {
      const f = frame(u);
      for (const sd of [-1, 1]) {
        const a = f.p.clone().addScaledVector(f.across, sd * (deckW / 2 + 0.28));
        const b = f.p
          .clone()
          .addScaledVector(f.across, sd * band)
          .addScaledVector(f.tan, dir * Math.max(0.6, band - deckW / 2));
        out.push([a, b]);
      }
    }
    return out;
  };

  const kit = new Kit(env);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const m = new THREE.Matrix4();
  const place = (
    geo: THREE.BufferGeometry,
    color: string,
    u: number,
    w: number,
    h: number,
    d: number,
    off: THREE.Vector3,
    jitter = 0,
  ) => {
    const f = frame(u);
    m.makeBasis(f.across, f.nrm, f.tan);
    const s = new THREE.Matrix4().makeScale(w, h, d);
    const rot = new THREE.Matrix4().makeRotationY(jitter);
    const pos = f.p
      .clone()
      .addScaledVector(f.across, off.x)
      .addScaledVector(f.nrm, off.y)
      .addScaledVector(f.tan, off.z);
    const full = new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z).multiply(m).multiply(rot).multiply(s);
    const g = geo.clone().applyMatrix4(full);
    kit.add(g, color);
    g.dispose();
  };
  // Planks (deck), slightly irregular.
  const planks = Math.ceil(length / 0.27);
  for (let i = 0; i < planks; i++) {
    const u = (i + 0.5) / planks;
    place(
      box,
      rand() < 0.3 ? C.woodDark : C.wood,
      u,
      deckW * (0.92 + rand() * 0.1),
      0.06,
      0.22,
      new THREE.Vector3((rand() - 0.5) * 0.06, -0.03, 0),
      (rand() - 0.5) * 0.08,
    );
  }
  // Hangers between handrails and floor ropes.
  const hangers = Math.ceil(length / 0.55);
  for (let i = 1; i < hangers; i++) {
    const u = i / hangers;
    const f = frame(u);
    for (const sd of [-1, 1]) {
      const a = f.p.clone().addScaledVector(f.across, (sd * deckW) / 2);
      const b = a.clone().addScaledVector(f.nrm, 0.92 + Math.sin(Math.PI * u) * 0.05);
      kit.stick(a, b, 0.018, C.strawDark, 4);
    }
  }
  // Abutments: stacked stone at both rims with tie posts.
  for (const [u, dir] of [
    [0, -1],
    [1, 1],
  ] as const) {
    const f = frame(u);
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        place(
          box,
          k % 2 ? C.stoneDark : C.stone,
          u,
          0.55,
          0.32,
          0.5,
          new THREE.Vector3((sd * (deckW + 0.5)) / 2, -0.35 + k * 0.3, dir * (0.3 + rand() * 0.1)),
          (rand() - 0.5) * 0.2,
        );
      }
      place(box, C.stone, u, 0.22, 1.3, 0.22, new THREE.Vector3((sd * (deckW + 0.35)) / 2, 0.25, dir * 0.35));
    }
    // Stone landing slab
    place(box, C.stoneDark, u, deckW + 0.6, 0.5, 1.2, new THREE.Vector3(0, -0.28, dir * 0.6));
    void f;
  }
  // Low stone guide walls that funnel the wide trail onto the deck (matched by colliders below).
  for (const [a, b] of funnels()) {
    const n = Math.max(2, Math.ceil(a.distanceTo(b) / 0.5));
    for (let i = 0; i < n; i++) {
      const p = a.clone().lerp(b, (i + 0.5) / n);
      const ry = Math.atan2(b.x - a.x, b.z - a.z);
      kit.box(
        0.46,
        0.5 + rand() * 0.12,
        0.52,
        p.x,
        env.heightAt(p.x, p.z) - 0.15,
        p.z,
        rand() < 0.35 ? C.stoneDark : C.stone,
        ry + (rand() - 0.5) * 0.2,
      );
    }
  }
  inner.add(kit.build("bridge-deck"));
  box.dispose();

  // Woven ropes.
  const ropeTex = ropeTexture();
  ropeTex.repeat.set(Math.round(length * 3), 1);
  const ropeMat = toonMapped(env, ropeTex);
  const geos: THREE.BufferGeometry[] = [];
  const ropeAt = (dx: number, dy: number, extraSag: number) => {
    const rp: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const f = frame(u);
      rp.push(
        f.p
          .clone()
          .addScaledVector(f.across, dx)
          .addScaledVector(f.nrm, dy - Math.sin(Math.PI * u) * extraSag),
      );
    }
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rp), 64, dy > 0.5 ? 0.06 : 0.05, 6, false);
    geos.push(tg);
    inner.add(new THREE.Mesh(tg, ropeMat));
    return rp;
  };
  const rails = [ropeAt(-deckW / 2, 0.95, -0.05), ropeAt(deckW / 2, 0.95, -0.05)];
  ropeAt(-deckW / 2, 0.0, 0);
  ropeAt(deckW / 2, 0.0, 0);

  // Artifact cords tied to the railing, alternating sides, hanging over the gorge.
  const arts = artifactsOnBridge();
  const spots: ArtifactSpot[] = [];
  const cords: Array<{ g: THREE.Group; id: string; mats: THREE.MeshToonMaterial[]; glow: number; ph: number }> = [];
  const knotGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const tagGeo = new THREE.BoxGeometry(0.16, 0.1, 0.03);
  geos.push(knotGeo, tagGeo);
  const spacing = 1 / (arts.length + 1);
  arts.forEach((art, i) => {
    const u = spacing * (i + 1);
    const sd = i % 2 ? 1 : -1;
    const f = frame(u);
    const tie = f.p
      .clone()
      .addScaledVector(f.across, (sd * deckW) / 2 + sd * 0.04)
      .addScaledVector(f.nrm, 0.95);
    const color = DYE[art.dye];
    const mat = env.toon(color).clone();
    mat.emissive = new THREE.Color(C.torch);
    mat.emissiveIntensity = 0;
    const g = new THREE.Group();
    g.position.copy(tie);
    g.rotation.y = Math.atan2(f.across.x * sd, f.across.z * sd);
    const len = 1.55 + (i % 3) * 0.2;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -0.1, 0.12),
      new THREE.Vector3(0, -len * 0.55, 0.16),
      new THREE.Vector3(0, -len, 0.1),
    ]);
    const tg = new THREE.TubeGeometry(curve, 16, 0.035, 5, false);
    geos.push(tg);
    g.add(new THREE.Mesh(tg, mat));
    // Knots: one per use (where this artifact showed up along the climb).
    art.uses.forEach((_, k) => {
      const km = new THREE.Mesh(knotGeo, mat);
      const p = curve.getPointAt(0.3 + (k / Math.max(1, art.uses.length)) * 0.62);
      km.position.copy(p);
      km.scale.set(1, 0.8, 1);
      g.add(km);
    });
    // Tassel at the end + a cotton tag at the tie.
    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 6), mat);
    geos.push(tassel.geometry);
    tassel.position.set(0, -len - 0.1, 0.1);
    tassel.rotation.x = Math.PI;
    g.add(tassel);
    const tag = new THREE.Mesh(tagGeo, env.toon(C.cotton));
    tag.position.set(0, -0.06, 0.05);
    g.add(tag);
    inner.add(g);
    cords.push({ g, id: art.id, mats: [mat], glow: 0, ph: i * 1.3 });
    spots.push({ artifact: art, position: f.p.clone(), r: Math.min(1.5, (length * spacing) / 2) });
  });
  void rails;

  // Walkables (deck chain) and rim landings; colliders at the tie posts.
  const walkables: Collider[] = [];
  for (let s = 0; s <= length; s += 0.45) {
    const p = deck.getPointAt(Math.min(1, s / length));
    walkables.push({ kind: "circle", x: p.x, z: p.z, r: deckW / 2 + 0.05 });
  }
  const colliders: Collider[] = [];
  // Railings: a chain of circles outside each handrail keeps the traveler on the planks.
  for (let s = 0.3; s <= length - 0.3; s += 0.4) {
    const f = frame(s / length);
    for (const sd of [-1, 1]) {
      const p = f.p.clone().addScaledVector(f.across, sd * (deckW / 2 + 0.28));
      colliders.push({ kind: "circle", x: p.x, z: p.z, r: 0.26 });
    }
  }
  // Funnels at both ends, so a traveler on the wide trail slides onto the deck instead of past it.
  for (const [a, b] of funnels()) {
    const n = Math.max(2, Math.ceil(a.distanceTo(b) / 0.35));
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      colliders.push({ kind: "circle", x: p.x, z: p.z, r: 0.28 });
    }
  }

  const center = deck.getPointAt(0.5);
  const start = frame(0).p.clone().addScaledVector(frame(0).tan, -1.4);
  const rm = env.reducedMotion;
  const v = new THREE.Vector3();

  return {
    group,
    spots,
    walkables,
    colliders,
    center,
    start,
    hits: cords.map((c) => c.g),
    deckHeightAt(x, z) {
      const t = env.trail.nearestT(x, z);
      if (t < span.t0 || t > span.t1) return null;
      const u = (t - span.t0) / (span.t1 - span.t0);
      const p = deck.getPointAt(u);
      v.set(x - p.x, 0, z - p.z);
      if (v.length() > deckW / 2 + 0.6) return null;
      return p.y;
    },
    update(dt, t, active) {
      if (!rm) group.quaternion.setFromAxisAngle(axis, Math.sin(t * 0.9) * 0.012);
      for (const c of cords) {
        const target = c.id === active ? 1 : 0;
        c.glow += (target - c.glow) * Math.min(1, dt * 5);
        for (const mm of c.mats) mm.emissiveIntensity = c.glow * 0.7;
        if (!rm) c.g.rotation.z = Math.sin(t * 1.2 + c.ph) * 0.06;
      }
    },
    dispose() {
      inner.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.name.startsWith("bridge-deck")) mesh.geometry.dispose();
      });
      for (const g of geos) g.dispose();
      ropeTex.dispose();
      ropeMat.dispose();
      for (const c of cords) for (const mm of c.mats) mm.dispose();
      group.removeFromParent();
    },
  };
}
