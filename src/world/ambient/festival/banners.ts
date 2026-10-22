/**
 * Inti Raymi dress for the summit plaza: tall poles with waving rainbow banners (seven stripes, as flown in
 * Cusco for the festival) and red cloth banners with a golden Inti, plus flower petals strewn round the
 * ushnu (red and yellow, like the cantuta). Banners ride the world's shared wind as cloth (style-gl.ts
 * `clothFlex` + `windSway` "cloth": the gust fronts that cross the ichu shake them too, no CPU work, ink-aware so
 * they keep their outline); petals are one instanced mesh. Local frame = the summit group's (origin at the plaza
 * center, +Z toward the trail).
 */
import * as THREE from "three";
import type { WorldEnv } from "../../contract";
import { C } from "../../props";
import { clothFlex, paintStrength, windSway } from "../../style-gl";
import { gradientMap } from "../../toon";

export interface Banners {
  group: THREE.Group;
  update(dt: number): void;
  dispose(): void;
}

const RAINBOW = ["#d23a33", "#ec7a2c", "#f2c230", "#4f9a48", "#5fb3d9", "#2f4fa2", "#7a3f9a"];

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function rainbowTex() {
  return canvasTexture(128, 112, (g) => {
    RAINBOW.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(0, i * 16, 128, 16);
    });
    g.strokeStyle = C.ink;
    g.lineWidth = 4;
    g.strokeRect(2, 2, 124, 108);
  });
}

function sunTex() {
  return canvasTexture(96, 192, (g) => {
    g.fillStyle = "#b8282f";
    g.fillRect(0, 0, 96, 192);
    // Woven border bands.
    g.fillStyle = "#f2c230";
    g.fillRect(0, 10, 96, 6);
    g.fillRect(0, 176, 96, 6);
    g.fillStyle = "#1f1a17";
    for (let x = 4; x < 96; x += 12) {
      g.fillRect(x, 26, 6, 6);
      g.fillRect(x + 6, 160, 6, 6);
    }
    // Inti: a disc with rays.
    const cx = 48;
    const cy = 92;
    g.fillStyle = "#e8b631";
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r1 = i % 2 ? 30 : 36;
      g.beginPath();
      g.moveTo(cx + Math.cos(a - 0.12) * 18, cy + Math.sin(a - 0.12) * 18);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.lineTo(cx + Math.cos(a + 0.12) * 18, cy + Math.sin(a + 0.12) * 18);
      g.fill();
    }
    g.beginPath();
    g.arc(cx, cy, 20, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#7a4b12";
    g.lineWidth = 2.5;
    g.stroke();
    g.fillStyle = "#7a4b12";
    g.fillRect(cx - 9, cy - 5, 5, 3);
    g.fillRect(cx + 4, cy - 5, 5, 3);
    g.fillRect(cx - 6, cy + 7, 12, 3);
    g.strokeStyle = C.ink;
    g.lineWidth = 4;
    g.strokeRect(2, 2, 92, 188);
  });
}

/**
 * Cloth on the shared wind: the geometry's `flex` (clothFlex) is 0 at the pole or crossbar and 1 at the free
 * edge. Woven designs carry no painted blotches (they would slide as the cloth moves). A heavy hanging banner
 * moves less than a flag flying free (`amp`).
 */
function clothMaterial(map: THREE.Texture, amp: number) {
  const m = new THREE.MeshToonMaterial({ map, gradientMap: gradientMap(), side: THREE.DoubleSide });
  return paintStrength(windSway(m, { mode: "cloth", flex: true, amp }), 0);
}

export function createBanners(
  env: WorldEnv,
  toWorld: (lx: number, lz: number, out: THREE.Vector3) => THREE.Vector3,
  yaw: number,
  petalCount: number,
): Banners {
  const group = new THREE.Group();
  group.name = "inti-raymi-banners";
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const v = new THREE.Vector3();

  // ---- poles: two tall ones for the rainbow flags at the plaza's outer corners, two by its entrance.
  // (Behind the ushnu the summit already drops away, so nothing stands there.)
  const poles: Array<{ lx: number; lz: number; h: number; kind: "flag" | "hang" }> = [
    { lx: -5.6, lz: 3.2, h: 4.4, kind: "flag" },
    { lx: 5.6, lz: 3.2, h: 4.4, kind: "flag" },
    { lx: -3.7, lz: 5.4, h: 3.2, kind: "hang" },
    { lx: 3.7, lz: 5.4, h: 3.2, kind: "hang" },
  ];
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.075, 1, 6);
  poleGeo.translate(0, 0.5, 0);
  const capGeo = new THREE.SphereGeometry(0.11, 8, 6);
  geos.push(poleGeo, capGeo);
  const poleMesh = new THREE.InstancedMesh(poleGeo, env.toon(C.woodDark), poles.length);
  const capMesh = new THREE.InstancedMesh(capGeo, env.toon("#e8b631"), poles.length);
  poleMesh.name = "festival-poles";
  capMesh.name = "festival-pole-caps";
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const one = new THREE.Vector3(1, 1, 1);
  const flagTex = rainbowTex();
  const sunT = sunTex();
  texs.push(flagTex, sunT);
  const flagMat = clothMaterial(flagTex, 1.3);
  const hangMat = clothMaterial(sunT, 0.75);
  mats.push(flagMat, hangMat);
  // Flag flying from the pole at x = 0 (enough segments for the wave to read as cloth).
  const flagGeo = new THREE.PlaneGeometry(1.6, 1.05, 12, 4);
  flagGeo.translate(0.8, -0.52, 0);
  clothFlex(flagGeo, "x", 0, 1.6);
  // Hanging banner from a crossbar: top edge at y = 0, the hem swings.
  const hangGeo = new THREE.PlaneGeometry(0.8, 1.6, 3, 10);
  hangGeo.translate(0, -0.8, 0);
  clothFlex(hangGeo, "y", 0, -1.6);
  const barGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.0, 5);
  barGeo.rotateZ(Math.PI / 2);
  geos.push(flagGeo, hangGeo, barGeo);
  poles.forEach((p, i) => {
    toWorld(p.lx, p.lz, v);
    const g = env.heightAt(v.x, v.z);
    m4.compose(v.setY(g - 0.1), q, new THREE.Vector3(1, p.h + 0.1, 1));
    poleMesh.setMatrixAt(i, m4);
    m4.compose(v.clone().setY(g + p.h + 0.05), q, one);
    capMesh.setMatrixAt(i, m4);
    if (p.kind === "flag") {
      const f = new THREE.Mesh(flagGeo, flagMat);
      f.position.set(v.x, g + p.h - 0.05, v.z);
      // Fly outward, away from the plaza (left pole flies left).
      f.rotation.y = yaw + (p.lx < 0 ? Math.PI : 0);
      f.name = "festival-flag";
      group.add(f);
    } else {
      // Crossbar on the pole, cloth hanging from it, facing the trail (+Z local).
      const bar = new THREE.Mesh(barGeo, env.toon(C.woodDark));
      bar.position.set(v.x, g + p.h - 0.25, v.z);
      bar.rotation.y = yaw;
      const cloth = new THREE.Mesh(hangGeo, hangMat);
      cloth.position.set(v.x, g + p.h - 0.28, v.z);
      cloth.rotation.y = yaw;
      // Nudge the cloth a little in front of the pole.
      cloth.translateZ(0.09);
      cloth.name = "festival-banner";
      group.add(bar, cloth);
    }
  });
  poleMesh.instanceMatrix.needsUpdate = true;
  capMesh.instanceMatrix.needsUpdate = true;
  poleMesh.computeBoundingSphere();
  capMesh.computeBoundingSphere();
  group.add(poleMesh, capMesh);
  for (const p of poles) {
    toWorld(p.lx, p.lz, v);
    env.addCollider({ kind: "circle", x: v.x, z: v.z, r: 0.25 });
  }

  // ---- petals strewn round the ushnu.
  let petals: THREE.InstancedMesh | null = null;
  if (petalCount > 0) {
    const pg = new THREE.CircleGeometry(0.07, 5);
    pg.scale(1, 0.62, 1);
    pg.rotateX(-Math.PI / 2);
    geos.push(pg);
    const pm = new THREE.MeshToonMaterial({
      gradientMap: gradientMap(),
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -6,
    });
    mats.push(pm);
    petals = new THREE.InstancedMesh(pg, pm, petalCount);
    petals.name = "festival-petals";
    const cols = ["#c8243a", "#e23d4f", "#f2c230", "#f5d65a", "#d9468f", "#ef8a2e"].map((c) => new THREE.Color(c));
    let r = 9;
    const R = () => {
      r = (r * 16807) % 2147483647;
      return r / 2147483647;
    };
    const e = new THREE.Euler();
    const qq = new THREE.Quaternion();
    let n = 0;
    for (let tries = 0; n < petalCount && tries < petalCount * 6; tries++) {
      // Denser near the ushnu steps and along the approach from the trail.
      const lane = R() < 0.35;
      const lx = lane ? (R() - 0.5) * 2.4 : (R() - 0.5) * 11;
      const lz = lane ? 1.9 + R() * 4.5 : (R() - 0.5) * 10;
      if (Math.abs(lx) < 1.85 && Math.abs(lz) < 1.85) continue;
      if (lx * lx + lz * lz > 30) continue;
      toWorld(lx, lz, v);
      v.y = env.heightAt(v.x, v.z) + 0.07;
      e.set((R() - 0.5) * 0.3, R() * Math.PI * 2, (R() - 0.5) * 0.3);
      m4.compose(v, qq.setFromEuler(e), one);
      petals.setMatrixAt(n, m4);
      petals.setColorAt(n, cols[Math.floor(R() * cols.length)]!);
      n++;
    }
    petals.count = n;
    petals.instanceMatrix.needsUpdate = true;
    if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
    petals.computeBoundingSphere();
    env.noOutline(petals);
    group.add(petals);
  }

  return {
    group,
    update() {
      // The cloth moves with the shared wind (style-runtime.ts); reduced motion is the wind state's business.
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const x of texs) x.dispose();
      poleMesh.dispose();
      capMesh.dispose();
      petals?.dispose();
    },
  };
}
