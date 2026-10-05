import * as THREE from "three";
import type { Collider, WorldEnv } from "./contract";
import type { Place, PlaceCtx } from "./landmarks";
import { C, canvasTex, circleAt, circlesAlong, DYE, glowSprite, hashStr, Kit, rng } from "./props";

/**
 * Summit finale past the chasqui post: a stepped ushnu (ceremonial stone platform) crowned by a
 * golden Inti sun disk, pennant poles in khipu dyes with bunting between them, and a one-time
 * confetti burst of small dyed cubes the first time the traveler arrives.
 * Local frame: origin at the plaza center, +Z toward where the trail arrives.
 */
export interface SummitPlace extends Place {
  celebrate(): void;
}

const GOLD = "#e8b631";
const DYES = [DYE.red, DYE.ochre, DYE.indigo, DYE.turq, DYE.alpaca, "#7fae6a"];

function wiphalaTexture() {
  return canvasTex(140, 140, (ctx, w, h) => {
    const n = 7;
    const s = w / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = [DYE.red, DYE.ochre, "#efe6d6", DYE.turq, "#7fae6a", DYE.indigo, DYE.alpaca][
          (x - y + n * 2) % n
        ]!;
        ctx.fillRect(x * s, y * s, s + 1, s + 1);
      }
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    void h;
  });
}

export function buildSummit(env: WorldEnv, ground: (x: number, z: number) => number): SummitPlace {
  const group = new THREE.Group();
  group.name = "summit";
  const rand = rng(hashStr("summit"));
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const texs: THREE.Texture[] = [];

  // ---------- ushnu: three stepped tiers of dressed andesite, seated on the dome
  const kit = new Kit(env);
  const tiers = [
    { s: 3.4, h: 0.45 },
    { s: 2.5, h: 0.42 },
    { s: 1.6, h: 0.4 },
  ];
  let y = 0;
  tiers.forEach((tier, i) => {
    const n = Math.max(2, Math.round(tier.s / 0.85));
    const bl = tier.s / n;
    for (let a = 0; a < n; a++)
      for (let b = 0; b < n; b++) {
        const x = -tier.s / 2 + bl * (a + 0.5);
        const z = -tier.s / 2 + bl * (b + 0.5);
        const color = (a + b + i) % 3 === 0 ? C.stoneDark : C.stone;
        if (i === 0) kit.seatBox(bl - 0.04, tier.h, bl - 0.04, x, y, z, color, ground, (rand() - 0.5) * 0.04);
        else kit.box(bl - 0.04, tier.h, bl - 0.04, x, y, z, color, (rand() - 0.5) * 0.04);
      }
    y += tier.h;
  });
  // Two front steps (the ushnu itself is not climbable; the steps are a ceremonial approach).
  kit.seatBox(1.1, 0.22, 0.42, 0, 0, tiers[0]!.s / 2 + 0.2, C.stone, ground);
  kit.box(1.0, 0.22, 0.36, 0, tiers[0]!.h, tiers[1]!.s / 2 + 0.17, C.stoneDark);
  // Pedestal for the sun.
  kit.box(0.5, 0.35, 0.5, 0, y, 0, C.stoneDark);
  kit.box(0.14, 0.5, 0.14, 0, y + 0.35, 0, GOLD);
  group.add(kit.build("ushnu"));
  const top = y + 0.85;

  // ---------- golden Inti (sun disk with rays), slowly turning
  const gold = env.toon(GOLD).clone();
  gold.emissive = new THREE.Color("#ffcf5a");
  gold.emissiveIntensity = 0.28;
  mats.push(gold);
  const sun = new THREE.Group();
  sun.position.set(0, top + 0.55, 0);
  const sk = new Kit(env);
  sk.add(new THREE.CylinderGeometry(0.5, 0.5, 0.09, 28), "#ffffff", 0, 0, 0, Math.PI / 2, 0, 0);
  sk.add(new THREE.TorusGeometry(0.36, 0.035, 6, 28), "#ffffff", 0, 0, 0.05);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const long = i % 2 === 0;
    sk.add(
      new THREE.ConeGeometry(0.07, long ? 0.34 : 0.22, 4),
      "#ffffff",
      Math.cos(a) * (long ? 0.66 : 0.6),
      Math.sin(a) * (long ? 0.66 : 0.6),
      0,
      0,
      0,
      a - Math.PI / 2,
    );
  }
  // A simple face: eyes and mouth, in relief.
  sk.box(0.1, 0.05, 0.05, -0.14, 0.08, 0.05, "#ffffff");
  sk.box(0.1, 0.05, 0.05, 0.14, 0.08, 0.05, "#ffffff");
  sk.box(0.22, 0.05, 0.05, 0, -0.16, 0.05, "#ffffff");
  const sunMesh = sk.build("inti");
  sunMesh.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.material = gold;
  });
  sun.add(sunMesh);
  const halo = glowSprite(env, "#ffd36b", 3.2);
  halo.position.z = -0.1;
  sun.add(halo);
  group.add(sun);

  // ---------- pennant poles around the plaza + bunting between them
  const poles: Array<{ x: number; z: number; h: number; color: string }> = [];
  const R = 3.5;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    if (Math.abs(Math.sin(a)) > 0.9 && Math.cos(a) > 0) continue;
    poles.push({
      x: Math.cos(a) * R,
      z: Math.sin(a) * R * 0.9 - 0.2,
      h: 3.0 + rand() * 0.6,
      color: DYES[i % DYES.length]!,
    });
  }
  const pk = new Kit(env);
  for (const p of poles) {
    const g0 = ground(p.x, p.z);
    pk.seatBox(0.36, 0.25, 0.36, p.x, g0, p.z, C.stoneDark, ground);
    pk.cyl(0.05, 0.06, p.h, p.x, g0 + 0.2, p.z, C.woodDark, 6);
    pk.cyl(0.08, 0.02, 0.14, p.x, g0 + 0.2 + p.h, p.z, GOLD, 6);
  }
  group.add(pk.build("summit-poles"));

  // Waving pennants: a tapered plane per pole, vertices displaced each frame.
  interface Flag {
    mesh: THREE.Mesh;
    base: Float32Array;
    ph: number;
  }
  const flags: Flag[] = [];
  const wiphala = wiphalaTexture();
  texs.push(wiphala);
  poles.forEach((p, i) => {
    const g = new THREE.PlaneGeometry(1.1, 0.62, 8, 2);
    g.translate(0.55, 0, 0);
    const pos = g.getAttribute("position");
    if (i !== 0) for (let v = 0; v < pos.count; v++) pos.setY(v, pos.getY(v) * (1 - pos.getX(v) / 1.25));
    geos.push(g);
    const m = env.toon(i === 0 ? "#ffffff" : p.color).clone();
    m.side = THREE.DoubleSide;
    if (i === 0) m.map = wiphala;
    mats.push(m);
    const mesh = new THREE.Mesh(g, m);
    const g0 = ground(p.x, p.z);
    mesh.position.set(p.x, g0 + 0.2 + p.h - 0.4, p.z);
    mesh.rotation.y = rand() * Math.PI * 2;
    group.add(mesh);
    flags.push({ mesh, base: Float32Array.from(pos.array as Float32Array), ph: i * 1.3 });
  });
  // Bunting: small triangles strung between consecutive poles.
  const bunting = new THREE.Group();
  const bk = new Kit(env);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.3, 0, 0.13, 0, 0, -0.13, 0, 0, 0, -0.3, 0], 3),
  );
  tri.computeVertexNormals();
  for (let i = 0; i < poles.length; i++) {
    const a = poles[i]!;
    const b = poles[(i + 1) % poles.length]!;
    if (Math.hypot(a.x - b.x, a.z - b.z) > 6) continue;
    const ya = ground(a.x, a.z) + 0.2 + a.h - 0.9;
    const yb = ground(b.x, b.z) + 0.2 + b.h - 0.9;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const u = k / 10;
      pts.push(
        new THREE.Vector3(
          a.x + (b.x - a.x) * u,
          ya + (yb - ya) * u - Math.sin(Math.PI * u) * 0.5,
          a.z + (b.z - a.z) * u,
        ),
      );
    }
    for (let k = 0; k < 10; k++) bk.stick(pts[k]!, pts[k + 1]!, 0.012, C.cotton, 4);
    for (let k = 1; k < 10; k++) {
      const p = pts[k]!;
      const ry = Math.atan2(-(b.z - a.z), b.x - a.x);
      bk.add(tri, DYES[(i + k) % DYES.length]!, p.x, p.y, p.z, 0, ry, 0);
    }
  }
  tri.dispose();
  bunting.add(bk.build("bunting"));
  bunting.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const c = (m.material as THREE.MeshToonMaterial).clone();
      c.side = THREE.DoubleSide;
      m.material = c;
      mats.push(c);
    }
  });
  group.add(bunting);

  // ---------- confetti: instanced dyed cubes with simple ballistic physics
  const N = 220;
  const cubeGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  geos.push(cubeGeo);
  const cubeMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  mats.push(cubeMat);
  const confetti = new THREE.InstancedMesh(cubeGeo, cubeMat, N);
  confetti.frustumCulled = false;
  confetti.visible = false;
  env.noOutline(confetti);
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) confetti.setColorAt(i, col.set(DYES[i % DYES.length]!));
  if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
  group.add(confetti);
  const P = new Float32Array(N * 3);
  const V = new Float32Array(N * 3);
  const S = new Float32Array(N * 3);
  let burst = -1;
  const dummy = new THREE.Object3D();

  return {
    group,
    extras: [],
    focus: new THREE.Vector3(0, 0, 3.0),
    front: new THREE.Vector3(0, 0, 3.4),
    radius: 4.2,
    torches: [],
    hits: [group],
    celebrate() {
      if (env.reducedMotion) return;
      burst = 0;
      confetti.visible = true;
      for (let i = 0; i < N; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * 3.2;
        P.set([Math.cos(a) * 0.3, top + 0.6, Math.sin(a) * 0.3], i * 3);
        V.set([Math.cos(a) * sp, 4.5 + Math.random() * 4, Math.sin(a) * sp], i * 3);
        S.set([Math.random() * 8, Math.random() * 8, Math.random() * 8], i * 3);
      }
    },
    colliders(): Collider[] {
      group.updateMatrixWorld(true);
      const h = tiers[0]!.s / 2;
      return [
        ...circlesAlong(group, -h, -h, h, -h, 0.45),
        ...circlesAlong(group, -h, -h, -h, h, 0.45),
        ...circlesAlong(group, h, -h, h, h, 0.45),
        ...circlesAlong(group, -h, h, h, h, 0.45),
        circleAt(group, 0, 0, 1.2),
        ...poles.map((p) => circleAt(group, p.x, p.z, 0.22)),
      ];
    },
    walkables: () => [circleAt(group, 0, 0, 6.2)],
    update(dt, t, dist, _ctx?: PlaceCtx) {
      if (dist > 45) return;
      if (!env.reducedMotion) {
        sun.rotation.y = Math.sin(t * 0.5) * 0.5;
        sun.position.y = top + 0.55 + Math.sin(t * 1.4) * 0.06;
        for (const f of flags) {
          const pos = f.mesh.geometry.getAttribute("position");
          for (let v = 0; v < pos.count; v++) {
            const x = f.base[v * 3]!;
            pos.setZ(v, Math.sin(t * 4 + f.ph - x * 3.2) * 0.12 * (x / 1.1));
          }
          pos.needsUpdate = true;
          f.mesh.geometry.computeVertexNormals();
        }
        bunting.rotation.y = Math.sin(t * 0.7) * 0.004;
      }
      if (burst >= 0) {
        burst += dt;
        for (let i = 0; i < N; i++) {
          const j = i * 3;
          V[j + 1] = V[j + 1]! - 9.8 * dt;
          V[j] = V[j]! * (1 - dt * 0.8);
          V[j + 2] = V[j + 2]! * (1 - dt * 0.8);
          P[j] = P[j]! + V[j]! * dt;
          P[j + 1] = Math.max(ground(P[j]!, P[j + 2]!) + 0.05, P[j + 1]! + V[j + 1]! * dt);
          P[j + 2] = P[j + 2]! + V[j + 2]! * dt;
          dummy.position.set(P[j]!, P[j + 1]!, P[j + 2]!);
          dummy.rotation.set(S[j]! * burst, S[j + 1]! * burst, S[j + 2]! * burst);
          dummy.scale.setScalar(Math.max(0, 1 - Math.max(0, burst - 3.5) / 1.5));
          dummy.updateMatrix();
          confetti.setMatrixAt(i, dummy.matrix);
        }
        confetti.instanceMatrix.needsUpdate = true;
        if (burst > 5) {
          burst = -1;
          confetti.visible = false;
        }
      }
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.name.includes(":")) m.geometry.dispose();
      });
      confetti.dispose();
      for (const g of geos) g.dispose();
      for (const t of texs) t.dispose();
      for (const m of mats) m.dispose();
      (halo.material as THREE.SpriteMaterial).dispose();
      group.removeFromParent();
    },
  };
}
