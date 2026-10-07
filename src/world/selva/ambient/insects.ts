/**
 * Small life of the jungle road (no passport stamps):
 *  - Morphos (blue morpho butterflies): by day (≈ 8–16 h), a few flutter along the road a little ahead of the
 *    traveler in erratic loops at head height; each wingbeat flashes the electric-blue upper side and the
 *    brown, eye-spotted underside. They veer off from a traveler who walks into them.
 *  - Luciérnagas (fireflies): at night, greenish blinks drifting over the undergrowth on both sides of the
 *    road around the traveler, each on its own slow rhythm.
 *  - Ranas (poison dart frogs): tiny bright frogs (red, yellow, blue, lime) sitting on broad leaves at the
 *    road edge, throats pulsing; one hops off its leaf when the traveler brushes past.
 *  - Curuhuinsis (leafcutter ants): a few trails cross the road on quiet stretches; a column of ants carries
 *    green leaf bits across in one direction and comes back empty in the other, day and night.
 * Everything stays near the traveler (pools re-placed ahead while out of sight) and is only drawn near them.
 *
 * Rendering: morphos (bird rig), fireflies (additive dots), leaves, frogs, ants, leaf bits: one InstancedMesh
 * each → 6 draw calls at most; a pool with nothing to show sets its count to 0. Bodies: none (too small to
 * block anyone).
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { on } from "../../events";
import { GeoBuilder } from "../../flora/geom";
import { CANOPY_T, SELVA_STATIONS } from "../contract";
import { morphoModel, WingSet } from "./wild/birds";
import { col, devHook, egg, idle, ramp, rootMatrix, selvaOf, View } from "./wild/kit";
import { damp, morphoHours, nightAmount, quietT, rng, roadFrame, TAU } from "./wild/logic";

const STATION_T = SELVA_STATIONS.map((s) => s.t);

/** Broad heliconia-like leaf on a short stalk: blade centered at (0, 0.82, 0.22), tilted toward +Z. */
function leafGeometry() {
  const b = new GeoBuilder();
  const stem = new THREE.CylinderGeometry(0.012, 0.018, 0.8, 4, 1);
  stem.translate(0, 0.4, 0);
  b.add(stem, { color: "#4c7a2c" });
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.16, 0.2, 0, 0.55);
  shape.quadraticCurveTo(-0.16, 0.2, 0, 0);
  const blade = new THREE.ShapeGeometry(shape, 4);
  blade.rotateX(-Math.PI / 2 + 0.25);
  blade.translate(0, 0.8, 0);
  b.add(blade, { color: (p) => (Math.abs(p.x) < 0.012 ? col("#a7c96a") : col("#3f8a2e")) });
  return b.build();
}

/** Poison dart frog, ~0.12 u (stylized ×3): white body pattern areas take the instance tint; dark spots stay. */
function frogGeometry() {
  const b = new GeoBuilder();
  const spots = (p: THREE.Vector3) => {
    const h = Math.sin(p.x * 91 + p.z * 57) * Math.cos(p.z * 73 - p.y * 39);
    return h > 0.55 ? col("#141414") : col("#ffffff");
  };
  b.add(egg(0.045, 1, 0.7, 1.25, 0, 0.035, 0, -0.2, 8), { color: spots });
  b.add(egg(0.032, 1.05, 0.75, 1, 0, 0.05, 0.05, 0, 8), { color: "#ffffff" });
  for (const s of [-1, 1]) {
    b.add(egg(0.012, 1, 1, 1, s * 0.022, 0.07, 0.065, 0, 5), { color: "#101010" });
    b.add(egg(0.014, 1.6, 0.6, 1, s * 0.045, 0.015, 0.035, 0, 5), { color: "#202020" });
    b.add(egg(0.018, 1.8, 0.6, 1.4, s * 0.05, 0.015, -0.04, 0, 5), { color: "#202020" });
  }
  return b.build();
}

/** Leafcutter ant (stylized ×2): head, thorax, gaster in dark red-brown. */
function antGeometry() {
  const b = new GeoBuilder();
  b.add(egg(0.014, 1, 0.9, 1, 0, 0.018, 0.028, 0, 5), { color: "#5a2618" });
  b.add(egg(0.01, 1, 0.9, 1.4, 0, 0.018, 0.005, 0, 5), { color: "#6b2d1b" });
  b.add(egg(0.016, 1, 0.9, 1.3, 0, 0.02, -0.025, 0, 5), { color: "#4a2014" });
  return b.build();
}

/** A leaf bit held up over the ant like a sail. */
function bitGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.02, 0.035, 0.07, -0.01, -0.03, 0.09, 0.01], 3));
  g.computeVertexNormals();
  return g;
}

const FROG_TINTS = ["#e8322a", "#ffd21f", "#2a7fff", "#7ee03a", "#ff7a1a"];

export const create: CreateAmbient = (env0): Ambient => {
  const env = selvaOf(env0);
  if (!env) return idle();
  const L = env.selva.layout;
  const high = env.quality === "high";
  const rm = env.reducedMotion;
  const R = rng(2741);
  const gm = ramp(env);
  const view = new View(env.camera);
  const root = new THREE.Group();
  root.name = "selva-fauna-insects";
  env.scene.add(root);
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, name: string) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    m.name = name;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.visible = false;
    root.add(m);
    return m;
  };
  const vtoon = () => new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap: gm });

  // ---------------------------------------------------------------- morphos
  const nM = high ? 6 : 3;
  const morphoSet = new WingSet(env, "selva-fauna-morpho", morphoModel(), nM);
  root.add(morphoSet.mesh);
  const morphos = Array.from({ length: nM }, () => ({
    x: 0,
    y: 0,
    z: 0,
    yaw: R() * TAU,
    ax: 0,
    az: 0,
    ay: 1.5,
    turn: 0,
    flap: R() * TAU,
    live: false,
  }));

  // ---------------------------------------------------------------- fireflies
  const nF = high ? 90 : 45;
  const ffMat = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ffMesh = mk(new THREE.SphereGeometry(0.07, 6, 4), ffMat, nF, "selva-fauna-firefly");
  env.noOutline(ffMesh);
  const ff = Array.from({ length: nF }, () => ({
    x: 0,
    y: 0,
    z: 0,
    ph: R() * 10,
    per: 2 + R() * 3.5,
    live: false,
    s: R(),
  }));
  const ffColor = new THREE.Color("#c8ff5a");

  // ---------------------------------------------------------------- frogs on leaves
  const nL = high ? 8 : 4;
  const leafMesh = mk(
    leafGeometry(),
    (() => {
      const m = vtoon();
      m.side = THREE.DoubleSide;
      return m;
    })(),
    nL,
    "selva-fauna-frog-leaves",
  );
  const frogMesh = mk(frogGeometry(), vtoon(), nL, "selva-fauna-frogs");
  const leaves = Array.from({ length: nL }, (_, i) => ({
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    s: 1,
    live: false,
    frog: true,
    hop: 0,
    tint: new THREE.Color(FROG_TINTS[i % FROG_TINTS.length]),
    ph: R() * TAU,
  }));
  for (let i = 0; i < nL; i++) frogMesh.setColorAt(i, leaves[i]!.tint);

  // ---------------------------------------------------------------- leafcutter ant trails
  const trailT = [0.205, 0.468, 0.705, 0.93].filter((t) => quietT(t, STATION_T, CANOPY_T, 0.04));
  const trails = trailT.slice(0, high ? 3 : 2).map((t, i) => {
    const f = roadFrame(L, t);
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 16; k++) {
      const lat = -7 + (14 * k) / 16;
      const wig = Math.sin(k * 0.9 + i) * 0.5;
      const x = f.x + f.rx * lat + f.tx * wig;
      const z = f.z + f.rz * lat + f.tz * wig;
      pts.push(new THREE.Vector3(x, L.heightAt(x, z) + 0.035, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return { x: f.x, z: f.z, curve, len: curve.getLength() };
  });
  const perTrail = high ? 90 : 45;
  const ants = trails.flatMap((_, ti) =>
    Array.from({ length: perTrail }, (_, k) => ({
      trail: ti,
      s: R(),
      out: k % 2 === 0,
      bit: k % 2 === 0 && R() < 0.85,
      sp: 0.2 + R() * 0.08,
      tint: k % 5,
    })),
  );
  const antMesh = mk(antGeometry(), vtoon(), Math.max(1, ants.length), "selva-fauna-ants");
  const bitMat = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: gm, side: THREE.DoubleSide });
  const bitMesh = mk(bitGeometry(), bitMat, Math.max(1, ants.length), "selva-fauna-ant-leaves");
  const bitTints = ["#5fae3a", "#7fc24a", "#4a9a32", "#c9d24a", "#e07aa0"].map((c) => new THREE.Color(c));
  for (let i = 0; i < ants.length; i++) bitMesh.setColorAt(i, bitTints[0]!);

  let inside = false;
  const offInterior = on("world:interior", (d) => {
    inside = !!d?.inside;
  });
  const offDev = devHook("insects", () => ({
    morphos: morphos.filter((b) => b.live).map((b) => [+b.x.toFixed(1), +b.y.toFixed(1), +b.z.toFixed(1)]),
    frogs: leaves.filter((l) => l.live).map((l) => [+l.x.toFixed(1), +l.y.toFixed(1), +l.z.toFixed(1), l.frog]),
    trails: trails.map((t) => [+t.x.toFixed(1), +t.z.toFixed(1)]),
  }));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  let trackT = 0;
  let trackLast = -1;
  let trackDir = 1;
  let trackClock = 1;
  let clock = 0;

  /** A road frame some way ahead of the traveler (along their direction of travel). */
  const ahead = (min: number, max: number) => {
    const t = Math.max(0.01, Math.min(0.99, trackT + (trackDir * (min + R() * (max - min))) / L.trail.length));
    return roadFrame(L, t);
  };

  return {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      clock += dt;
      view.update();
      trackClock += dt;
      if (trackClock > 0.4) {
        const t = L.trail.nearestT(avatar.x, avatar.z);
        if (trackLast >= 0 && Math.abs(t - trackLast) > 0.0004) trackDir = t > trackLast ? 1 : -1;
        trackLast = t;
        trackT = t;
        trackClock = 0;
      }
      const time = env.sky.time();
      const night = nightAmount(time);
      const mot = rm ? 0.5 : 1;
      if (inside) {
        for (const m of [morphoSet.mesh, ffMesh, leafMesh, frogMesh, antMesh, bitMesh]) m.count = 0;
        return;
      }

      // ---- morphos
      const mk = morphoHours(time) > 0.5;
      let nm = 0;
      for (const b of morphos) {
        const far = Math.hypot(b.x - avatar.x, b.z - avatar.z);
        if (!mk) {
          b.live = false;
          continue;
        }
        if (!b.live || (far > 30 && !view.sees(b.x, b.y, b.z, 0.5))) {
          // A new one ahead along the road, out of the camera's view, wandering over the road edge.
          const f = ahead(8, 26);
          const lat = (R() < 0.5 ? -1 : 1) * (1 + R() * 3);
          b.ax = f.x + f.rx * lat;
          b.az = f.z + f.rz * lat;
          b.ay = f.y + 1.2 + R() * 1.2;
          b.x = b.ax;
          b.z = b.az;
          b.y = b.ay;
          b.live = true;
        }
        // Erratic flight: a wandering heading pulled back toward the anchor, a bobbing climb per beat.
        b.turn = damp(b.turn, (R() - 0.5) * 6, 3, dt);
        b.yaw += b.turn * dt;
        const toA = Math.atan2(b.ax - b.x, b.az - b.z);
        const da = Math.hypot(b.ax - b.x, b.az - b.z);
        if (da > 3) b.yaw += Math.sin(toA - b.yaw) * Math.min(1, (da - 3) / 4) * 3 * dt;
        const dAv = Math.hypot(avatar.x - b.x, avatar.z - b.z);
        if (dAv < 1.6) b.yaw += Math.sin(Math.atan2(b.x - avatar.x, b.z - avatar.z) - b.yaw) * 4 * dt;
        const sp = 1.6 * mot;
        b.x += Math.sin(b.yaw) * sp * dt;
        b.z += Math.cos(b.yaw) * sp * dt;
        b.flap += dt * (rm ? 14 : 24);
        const beat = Math.sin(b.flap);
        const ground = L.heightAt(b.x, b.z);
        b.y =
          damp(b.y, Math.max(ground + 0.6, b.ay + Math.sin(clock * 0.7 + b.flap * 0.05) * 0.5), 2, dt) - beat * 0.02;
        // Drawn ×3 (≈ 0.45 u span) so the blue flash reads from the follow camera.
        morphoSet.set(nm++, b.x, b.y, b.z, b.yaw, 0.15, 0, 3, 0.45 + beat * 0.85, 0, 0, 0);
      }
      morphoSet.commit(nm);

      // ---- fireflies
      let nf = 0;
      if (night > 0.3) {
        for (let i = 0; i < nF; i++) {
          const f = ff[i]!;
          if (!f.live || Math.hypot(f.x - avatar.x, f.z - avatar.z) > 30) {
            // Over the undergrowth on both road edges, ahead and behind (where the camera looks).
            const fr = roadFrame(L, Math.max(0.01, Math.min(0.99, trackT + ((R() - 0.4) * 50) / L.trail.length)));
            const lat = (R() < 0.5 ? -1 : 1) * (1.5 + R() * 12);
            f.x = fr.x + fr.rx * lat;
            f.z = fr.z + fr.rz * lat;
            if (L.isWater(f.x, f.z)) f.y = L.river.level + 0.5 + R() * 1.5;
            else f.y = L.heightAt(f.x, f.z) + 0.4 + R() * 2.4;
            f.live = true;
          }
          f.x += Math.sin(clock * 0.3 + f.ph) * 0.15 * dt * mot;
          f.z += Math.cos(clock * 0.27 + f.ph * 1.3) * 0.15 * dt * mot;
          f.y += Math.sin(clock * 0.5 + f.ph * 2) * 0.08 * dt * mot;
          // Blink: a short soft flash once per period.
          const u = ((clock + f.ph) % f.per) / f.per;
          const k = rm ? 0.5 + 0.3 * Math.sin(clock * 0.8 + f.ph) : Math.max(0, 1 - Math.abs(u - 0.15) / 0.13);
          const glow = k * night;
          if (glow < 0.02) continue;
          m4.makeScale(0.6 + glow * 0.6, 0.6 + glow * 0.6, 0.6 + glow * 0.6).setPosition(f.x, f.y, f.z);
          ffMesh.setMatrixAt(nf, m4);
          ffMesh.setColorAt(nf, c.copy(ffColor).multiplyScalar(glow));
          nf++;
        }
      }
      ffMesh.count = nf;
      ffMesh.visible = nf > 0;
      if (nf) {
        ffMesh.instanceMatrix.needsUpdate = true;
        if (ffMesh.instanceColor) ffMesh.instanceColor.needsUpdate = true;
      }

      // ---- frogs on leaves (road edge, ahead of the traveler)
      let nl = 0;
      for (let i = 0; i < nL; i++) {
        const l = leaves[i]!;
        const dAv = Math.hypot(l.x - avatar.x, l.z - avatar.z);
        if (!l.live || (dAv > 40 && !view.sees(l.x, l.y + 0.8, l.z, 0.6))) {
          const f = ahead(10, 40);
          const side = R() < 0.5 ? -1 : 1;
          // Just off the road band (half width 2.6), inside the low clear strip the scenery keeps open.
          const lat = side * (3.05 + R() * 0.4);
          l.x = f.x + f.rx * lat;
          l.z = f.z + f.rz * lat;
          if (L.isWater(l.x, l.z) || L.walkable(l.x, l.z) || creatures.inKeepOut(l.x, l.z, 0.5)) continue;
          l.y = L.heightAt(l.x, l.z);
          // The blade leans over the road edge.
          l.yaw = Math.atan2(-f.rx * side, -f.rz * side) + (R() - 0.5) * 0.8;
          l.s = 0.85 + R() * 0.4;
          l.live = true;
          l.frog = true;
          l.hop = 0;
        }
        rootMatrix(m4, l.x, l.y, l.z, l.yaw, 0, 0, l.s);
        leafMesh.setMatrixAt(nl, m4);
        // Frog: on the blade; throat pulse; a hop off the leaf when brushed.
        if (l.frog && dAv < 1.5) l.hop = 0.0001;
        if (l.hop > 0) {
          l.hop += dt / 0.5;
          if (l.hop >= 1) {
            l.frog = false;
            l.hop = 0;
          }
        }
        const fx = l.x + Math.sin(l.yaw) * 0.24 * l.s;
        const fz = l.z + Math.cos(l.yaw) * 0.24 * l.s;
        const fy = l.y + 0.86 * l.s;
        if (l.frog) {
          const h = l.hop;
          const jump = h > 0 ? Math.sin(Math.PI * h) * 0.45 : 0;
          const away = h * 1.4;
          const pulse = 1 + Math.max(0, Math.sin(clock * 5 + l.ph)) * 0.06 * mot;
          e.set(h > 0 ? -0.5 : -0.12, l.yaw + Math.PI, 0, "YXZ");
          q.setFromEuler(e);
          v.set(fx - Math.sin(l.yaw) * away, fy + jump, fz - Math.cos(l.yaw) * away);
          m4.compose(v, q, sc.set(1, pulse, 1));
        } else m4.makeScale(0, 0, 0);
        frogMesh.setMatrixAt(nl, m4);
        frogMesh.setColorAt(nl, l.tint);
        nl++;
      }
      for (const m of [leafMesh, frogMesh]) {
        m.count = nl;
        m.visible = nl > 0;
        m.instanceMatrix.needsUpdate = true;
      }
      if (frogMesh.instanceColor) frogMesh.instanceColor.needsUpdate = true;

      // ---- leafcutter ants (only trails near the traveler)
      let na = 0;
      for (const a of ants) {
        const tr = trails[a.trail]!;
        if (Math.hypot(tr.x - avatar.x, tr.z - avatar.z) > 40) continue;
        a.s = (a.s + ((a.out ? 1 : -1) * a.sp * mot * dt) / tr.len + 1) % 1;
        tr.curve.getPointAt(a.s, v);
        tr.curve.getTangentAt(a.s, tan);
        const yaw = Math.atan2(tan.x, tan.z) + (a.out ? 0 : Math.PI);
        rootMatrix(m4, v.x, v.y, v.z, yaw, 0, 0, 1);
        antMesh.setMatrixAt(na, m4);
        if (a.bit) {
          // The leaf bit rides above the head, swaying a little.
          rootMatrix(m4, v.x, v.y + 0.02, v.z, yaw + Math.sin(clock * 3 + a.s * 40) * 0.2, 0, 0, 1);
        } else m4.makeScale(0, 0, 0);
        bitMesh.setMatrixAt(na, m4);
        bitMesh.setColorAt(na, bitTints[a.tint]!);
        na++;
      }
      for (const m of [antMesh, bitMesh]) {
        m.count = na;
        m.visible = na > 0;
        if (na) m.instanceMatrix.needsUpdate = true;
      }
      if (na && bitMesh.instanceColor) bitMesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      offInterior();
      offDev();
      morphoSet.dispose();
      for (const m of [ffMesh, leafMesh, frogMesh, antMesh, bitMesh]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        m.dispose();
      }
      root.removeFromParent();
    },
  };
};
