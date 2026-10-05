/**
 * Dev-only mock of the CORE's WorldEnv so content can be built and screenshotted in isolation.
 * Not shipped. Approximates: a terraced mountain, a winding trail with a gorge at the bridge,
 * toon materials (3-step), a cheap inverted-hull ink outline, day/night.
 */
import * as THREE from "three";
import { type Collider, type Lang, type Sky, STATIONS, type Trail, type WorldEnv } from "../contract";

const BRIDGE_T = STATIONS.find((s) => s.id === "bridge")!.t;

export function createMockEnv(lang: Lang, renderer: THREE.WebGLRenderer, footprint: Record<string, number>) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);

  // ---------- trail spline (spiral from the valley to the summit)
  const ctrl: THREE.Vector3[] = [];
  const turns = 1.35;
  for (let i = 0; i <= 28; i++) {
    const u = i / 28;
    const a = u * turns * Math.PI * 2 + 0.4;
    const r = 62 - u * 56 + Math.sin(u * 19) * 2.5;
    ctrl.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  const curve = new THREE.CatmullRomCurve3(ctrl);
  const length = curve.getLength();
  const samples = Array.from({ length: 801 }, (_, i) => curve.getPointAt(i / 800));

  const raw = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    const base = 30 * Math.max(0, 1 - r / 78) ** 1.25;
    return base + Math.sin(x * 0.11) * 0.8 + Math.cos(z * 0.09) * 0.8;
  };
  // Gorge across the trail at the bridge.
  const bp = curve.getPointAt(BRIDGE_T);
  const bt = curve.getTangentAt(BRIDGE_T).setY(0).normalize();
  const gorge = (x: number, z: number) => {
    const dx = x - bp.x;
    const dz = z - bp.z;
    const along = dx * bt.x + dz * bt.z; // along the trail
    const across = Math.abs(-dx * bt.z + dz * bt.x);
    if (across > 30) return 0;
    const w = 4.5;
    const k = Math.max(0, 1 - Math.abs(along) / w);
    return 9 * Math.min(1, k * 1.8) * (1 - across / 30);
  };
  // Flattened plazas at stations.
  const flats: Array<{ x: number; z: number; r: number; h: number }> = [];
  const heightAt = (x: number, z: number) => {
    let h = raw(x, z) - gorge(x, z);
    for (const f of flats) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r + 3) {
        const k = THREE.MathUtils.smoothstep(d, f.r + 3, f.r);
        h = THREE.MathUtils.lerp(h, f.h, k);
      }
    }
    return h;
  };

  const nearestT = (x: number, z: number) => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i]!;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return bi / (samples.length - 1);
  };
  const trail: Trail = {
    length,
    halfWidth: 1.4,
    pointAt(t) {
      const p = curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1));
      p.y = heightAt(p.x, p.z);
      return p;
    },
    tangentAt: (t) => curve.getTangentAt(THREE.MathUtils.clamp(t, 0, 1)),
    nearestT,
  };

  const poseRaw = (id: string) => {
    const st = STATIONS.find((s) => s.id === id)!;
    const p = curve.getPointAt(st.t);
    const tg = curve.getTangentAt(st.t);
    const n = new THREE.Vector3(-tg.z, 0, tg.x).normalize().multiplyScalar(st.side * st.offset);
    return { p: p.add(n), st };
  };
  for (const st of STATIONS) {
    if (st.kind === "bridge") continue;
    const { p } = poseRaw(st.id);
    flats.push({ x: p.x, z: p.z, r: footprint[st.id] ?? 5, h: raw(p.x, p.z) - gorge(p.x, p.z) });
  }

  const walkAreas: Collider[] = [];
  const colliders: Collider[] = [];
  const inside = (c: Collider, x: number, z: number, pad = 0) =>
    c.kind === "circle"
      ? Math.hypot(x - c.x, z - c.z) < c.r + pad
      : x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad;

  // ---------- toon materials
  const grad = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;
  const cache = new Map<string, THREE.MeshToonMaterial>();
  const noOut = new WeakSet<THREE.Object3D>();

  // ---------- sky
  let time = 0.45;
  const subs = new Set<(t: number) => void>();
  const sky: Sky = {
    time: () => time,
    setTime(t) {
      time = ((t % 1) + 1) % 1;
      applySky();
      for (const s of subs) s(time);
    },
    isNight: () => time < 0.24 || time > 0.77,
    onChange(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };

  const env: WorldEnv = {
    lang,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    quality: "high",
    scene,
    camera,
    heightAt,
    trail,
    stationPose(id) {
      const { p, st } = poseRaw(id);
      const tp = curve.getPointAt(st.t);
      p.y = heightAt(p.x, p.z);
      return { position: p, yaw: Math.atan2(tp.x - p.x, tp.z - p.z) };
    },
    walkable(x, z) {
      if (colliders.some((c) => inside(c, x, z, 0.3))) return false;
      const t = nearestT(x, z);
      const p = curve.getPointAt(t);
      if (Math.hypot(p.x - x, p.z - z) < trail.halfWidth + 0.4) return true;
      return walkAreas.some((c) => inside(c, x, z));
    },
    addWalkable: (a) => walkAreas.push(a),
    addCollider: (c) => colliders.push(c),
    sky,
    toon(color, opts) {
      const key = `${new THREE.Color(color).getHexString()}|${opts?.emissive ?? ""}|${opts?.emissiveIntensity ?? ""}`;
      let m = cache.get(key);
      if (!m) {
        m = new THREE.MeshToonMaterial({ color, gradientMap: grad });
        if (opts?.emissive) {
          m.emissive = new THREE.Color(opts.emissive);
          m.emissiveIntensity = opts.emissiveIntensity ?? 1;
        }
        cache.set(key, m);
      }
      return m;
    },
    noOutline(obj) {
      noOut.add(obj);
    },
  };

  // ---------- lights
  const hemi = new THREE.HemisphereLight("#e9f2e6", "#7a6a55", 1.1);
  const sun = new THREE.DirectionalLight("#fff3dc", 2.2);
  scene.add(hemi, sun, sun.target);
  const ambient = new THREE.AmbientLight("#ffffff", 0.35);
  scene.add(ambient);
  const outlineMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color("#1f1a17") }, uW: { value: 0.03 } },
    vertexShader: `uniform float uW; void main(){ vec3 p = position + normal * uW; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
    fragmentShader: `uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor,1.0); }`,
    side: THREE.BackSide,
  });
  function applySky() {
    const night = sky.isNight();
    const a = (time - 0.25) * Math.PI * 2;
    sun.position.set(Math.cos(a) * 60, Math.max(8, Math.sin(a) * 80), 30);
    if (night) {
      scene.background = new THREE.Color("#1b2340");
      scene.fog = new THREE.Fog("#1b2340", 60, 170);
      sun.color.set("#a9b8ff");
      sun.intensity = 0.7;
      hemi.intensity = 0.45;
      hemi.color.set("#6c78b8");
      ambient.intensity = 0.15;
      outlineMat.uniforms.uColor.value.set("#10142a");
    } else {
      scene.background = new THREE.Color("#9fd7d0");
      scene.fog = new THREE.Fog("#cfe7df", 70, 190);
      sun.color.set("#fff3dc");
      sun.intensity = 2.2;
      hemi.intensity = 1.1;
      hemi.color.set("#e9f2e6");
      ambient.intensity = 0.35;
      outlineMat.uniforms.uColor.value.set("#1f1a17");
    }
  }
  applySky();

  // ---------- terrain + trail ribbon + river
  const size = 170;
  const tg = new THREE.PlaneGeometry(size, size, 170, 170);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color("#7fae6a");
  const cGrass2 = new THREE.Color("#5f8f55");
  const cRock = new THREE.Color("#8f877b");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const terr = Math.floor(h / 2.2) % 2 === 0;
    const c = gorge(x, z) > 1 ? cRock : terr ? cGrass : cGrass2;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  tg.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad }));
  scene.add(terrain);
  noOut.add(terrain);
  const ribbon: number[] = [];
  const ribIdx: number[] = [];
  for (let i = 0; i <= 600; i++) {
    const t = i / 600;
    const p = curve.getPointAt(t);
    const tn = curve.getTangentAt(t);
    const n = new THREE.Vector3(-tn.z, 0, tn.x).normalize().multiplyScalar(trail.halfWidth);
    for (const s of [-1, 1]) {
      const x = p.x + n.x * s;
      const z = p.z + n.z * s;
      ribbon.push(x, heightAt(x, z) + 0.06, z);
    }
    if (i < 600) ribIdx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute("position", new THREE.Float32BufferAttribute(ribbon, 3));
  rg.setIndex(ribIdx);
  rg.computeVertexNormals();
  const rib = new THREE.Mesh(
    rg,
    new THREE.MeshToonMaterial({
      color: "#c9bfae",
      gradientMap: grad,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  scene.add(rib);
  noOut.add(rib);
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 60),
    new THREE.MeshToonMaterial({ color: "#5fb8c2", gradientMap: grad }),
  );
  river.rotation.x = -Math.PI / 2;
  river.rotation.z = Math.atan2(bt.x, bt.z) + Math.PI / 2;
  river.position.set(bp.x, heightAt(bp.x, bp.z) + 0.6, bp.z);
  scene.add(river);
  noOut.add(river);

  /** Adds inverted-hull outlines to every mesh not opted out (call after content is built). */
  function outlineAll(root: THREE.Object3D) {
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.isOutline) return;
      let p: THREE.Object3D | null = m;
      while (p) {
        if (noOut.has(p)) return;
        p = p.parent;
      }
      const mat = m.material as THREE.Material;
      if ((mat as THREE.MeshBasicMaterial).isMeshBasicMaterial && !(mat as THREE.MeshBasicMaterial).map) return;
      meshes.push(m);
    });
    for (const m of meshes) {
      const o = new THREE.Mesh(m.geometry, outlineMat);
      o.userData.isOutline = true;
      o.raycast = () => {};
      m.add(o);
    }
  }

  return { env, renderer, outlineAll, colliders, walkAreas };
}
