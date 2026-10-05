import * as THREE from "three";
import { ARTIFACTS, type Dye } from "../../data/career";
import { onThemeChange, readPalette, type SitePalette } from "../../games/core/palette";
import { artifactCords, buildCords, type CordSpec } from "./model";

export interface KhipuOptions {
  lang: "es" | "en";
  /** "hero" frames the whole khipu; "artifacts" leaves room above for top cords. */
  mode: "hero" | "artifacts";
  /** Called when the pointer hovers a cord (null when leaving). */
  onHover?: (cord: CordSpec | null, x: number, y: number) => void;
  /** Called when a cord is clicked or tapped. */
  onSelect?: (cord: CordSpec) => void;
}

export interface Khipu {
  setArtifact(id: string | null): void;
  /** Screen positions of every pendant's top, for HTML tags. */
  tags(): Array<{ cord: CordSpec; x: number; y: number }>;
  destroy(): void;
}

const SEG = 24;
const W = 14;
const TOP = 3.2;

interface Rope {
  spec: CordSpec;
  pts: THREE.Vector3[];
  old: THREE.Vector3[];
  segLen: number;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  knots: Array<{ t: number; beads: THREE.Mesh[] }>;
  anchorX: number;
  hi: number;
  dim: number;
}

const dyeColor = (p: SitePalette, d: Dye) => p[d];

export function createKhipu(container: HTMLElement, opts: KhipuOptions): Khipu {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.createElement("canvas");
  canvas.className = "khipu-canvas";
  container.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  let palette = readPalette();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3d48, 1.7);
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-5, 8, 9);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(6, 2, -6);
  scene.add(hemi, key, rim);

  // Primary cord: a gentle sag across the top.
  const primMat = new THREE.MeshStandardMaterial({ roughness: 0.92 });
  const primCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-W / 2 - 1, TOP + 0.12, 0),
    new THREE.Vector3(0, TOP - 0.14, 0),
    new THREE.Vector3(W / 2 + 1, TOP + 0.12, 0),
  ]);
  const prim = new THREE.Mesh(new THREE.TubeGeometry(primCurve, 64, 0.11, 10), primMat);
  scene.add(prim);
  const primY = (x: number) => TOP - 0.14 + 0.26 * (x / (W / 2 + 1)) ** 2;

  const specs = buildCords();
  const pendantIdx = specs.map((s, i) => (s.parent === -1 ? i : -1)).filter((i) => i >= 0);
  const xOf = new Map<number, number>();
  pendantIdx.forEach((ci, k) => {
    xOf.set(ci, -W / 2 + 0.9 + (k * (W - 1.8)) / (pendantIdx.length - 1));
  });

  const beadGeo = new THREE.SphereGeometry(1, 14, 10);
  const ropes: Rope[] = specs.map((spec, i) => {
    const anchorX = spec.parent === -1 ? (xOf.get(i) ?? 0) : (xOf.get(spec.parent) ?? 0) + spec.fan;
    const segLen = spec.length / SEG;
    const startY = spec.parent === -1 ? primY(anchorX) : TOP - specs[spec.parent]!.length * spec.tie;
    const pts = Array.from({ length: SEG + 1 }, (_, k) => new THREE.Vector3(anchorX, startY - k * segLen, 0));
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    scene.add(mesh);
    const knots = spec.knots.map((k) => {
      const beads = Array.from({ length: k.n }, () => {
        const b = new THREE.Mesh(beadGeo, mat);
        b.scale.setScalar(k.n > 1 ? spec.radius * 1.55 : spec.radius * 2.2);
        scene.add(b);
        return b;
      });
      return { t: k.t, beads };
    });
    return { spec, pts, old: pts.map((p) => p.clone()), segLen, mesh, mat, knots, anchorX, hi: 0, dim: 0 };
  });

  // Top cord (artifact) objects.
  const topMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const topMesh = new THREE.Mesh(new THREE.BufferGeometry(), topMat);
  scene.add(topMesh);
  let topGrow = 0;
  let topTarget = 0;
  let activeCords = new Set<number>();
  let topIndexCount = 0;

  const paint = () => {
    palette = readPalette();
    primMat.color.set(palette.cotton);
    const bgCol = new THREE.Color(palette.bg);
    for (const r of ropes) {
      const c = new THREE.Color(dyeColor(palette, r.spec.dye));
      r.mat.color.copy(c.lerp(bgCol, r.dim * (palette.dark ? 0.72 : 0.5)));
    }
    hemi.groundColor.set(palette.dark ? 0x3a3d48 : 0xb7bcc6);
    hemi.intensity = palette.dark ? 1.7 : 2.2;
  };

  const anchorOf = (r: Rope): THREE.Vector3 => {
    if (r.spec.parent === -1) return new THREE.Vector3(r.anchorX, primY(r.anchorX), 0);
    const parent = ropes[r.spec.parent]!;
    return at(parent, r.spec.tie);
  };

  function at(r: Rope, t: number): THREE.Vector3 {
    const f = Math.max(0, Math.min(0.9999, t)) * SEG;
    const i = Math.floor(f);
    return r.pts[i]!.clone().lerp(r.pts[i + 1]!, f - i);
  }

  const pointer = { x: 99, y: 99, vx: 0, active: false };

  const simulate = (dt: number) => {
    const g = -9.8 * dt * dt;
    for (const r of ropes) {
      const a = anchorOf(r);
      const restX = r.anchorX;
      for (let i = 1; i < r.pts.length; i++) {
        const p = r.pts[i]!;
        const o = r.old[i]!;
        let vx = (p.x - o.x) * 0.982;
        const vy = (p.y - o.y) * 0.982;
        let vz = (p.z - o.z) * 0.97;
        o.copy(p);
        if (pointer.active) {
          const d = Math.hypot(p.x - pointer.x, p.y - pointer.y);
          if (d < 1.4) {
            const f = (1 - d / 1.4) * 0.0016 * Math.max(-30, Math.min(30, pointer.vx));
            vx += f;
            vz += f * 0.5;
          }
        }
        // Keep subsidiaries fanned beside their pendant, like a real khipu.
        vx += (restX - p.x) * (r.spec.parent === -1 ? 0.0009 : 0.004);
        p.x += vx;
        p.y += vy + g;
        p.z += vz - p.z * 0.003;
      }
      for (let it = 0; it < 10; it++) {
        r.pts[0]!.copy(a);
        for (let i = 0; i < SEG; i++) {
          const p = r.pts[i]!;
          const q = r.pts[i + 1]!;
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const dz = q.z - p.z;
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          const k = ((d - r.segLen) / d) * (i === 0 ? 1 : 0.5);
          if (i > 0) {
            p.x += dx * k;
            p.y += dy * k;
            p.z += dz * k;
          }
          q.x -= dx * k;
          q.y -= dy * k;
          q.z -= dz * k;
        }
      }
    }
  };

  const rebuild = () => {
    for (const r of ropes) {
      r.mesh.geometry.dispose();
      const rad = r.spec.radius * (1 + r.hi * 0.4 + (activeCords.has(ropes.indexOf(r)) ? 0.35 : 0));
      r.mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(r.pts), SEG * 2, rad, 7);
      for (const k of r.knots) {
        const n = k.beads.length;
        k.beads.forEach((b, j) => {
          const tt = k.t + (j - (n - 1) / 2) * (0.11 / r.spec.length);
          b.position.copy(at(r, tt));
        });
      }
    }
  };

  const buildTopCord = (idx: number[]) => {
    topMesh.geometry.dispose();
    if (!idx.length) {
      topMesh.geometry = new THREE.BufferGeometry();
      topIndexCount = 0;
      return;
    }
    const xs = idx.map((i) =>
      ropes[i]!.spec.parent === -1 ? ropes[i]!.anchorX : (xOf.get(ropes[i]!.spec.parent) ?? 0),
    );
    const pts: THREE.Vector3[] = [];
    const sorted = [...new Set(xs)].sort((a, b) => a - b);
    const y = TOP + 1.05;
    pts.push(new THREE.Vector3(sorted[0]! - 0.5, y + 0.45, 0));
    for (const x of sorted) {
      pts.push(new THREE.Vector3(x - 0.18, y, 0.05));
      pts.push(new THREE.Vector3(x, primY(x) + 0.16, 0.1));
      pts.push(new THREE.Vector3(x + 0.18, y, 0.05));
    }
    pts.push(new THREE.Vector3(sorted[sorted.length - 1]! + 0.5, y + 0.45, 0));
    const geo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.3),
      pts.length * 12,
      0.07,
      8,
    );
    topMesh.geometry = geo;
    topIndexCount = geo.index?.count ?? 0;
    geo.setDrawRange(0, 0);
  };

  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const top = opts.mode === "artifacts" ? TOP + 2.9 : TOP + 0.9;
    const bottom = TOP - 8.6;
    const height = top - bottom;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distH = height / 2 / tan;
    const distW = (W + 1.2) / 2 / tan / camera.aspect;
    const dist = Math.max(distH, distW);
    const cy = (top + bottom) / 2;
    camera.position.set(0, cy, dist);
    camera.lookAt(0, cy, 0);
    camera.updateProjectionMatrix();
  };

  const toScreen = (v: THREE.Vector3) => {
    const p = v.clone().project(camera);
    return { x: ((p.x + 1) / 2) * container.clientWidth, y: ((1 - p.y) / 2) * container.clientHeight };
  };
  const toWorld = (sx: number, sy: number) => {
    const v = new THREE.Vector3((sx / container.clientWidth) * 2 - 1, -(sy / container.clientHeight) * 2 + 1, 0.5);
    v.unproject(camera);
    const dir = v.sub(camera.position).normalize();
    const s = -camera.position.z / dir.z;
    return camera.position.clone().add(dir.multiplyScalar(s));
  };
  const pick = (sx: number, sy: number) => {
    let best = -1;
    let bd = 22;
    ropes.forEach((r, i) => {
      if (!r.spec.stage) return;
      for (let k = 2; k < r.pts.length; k += 2) {
        const s = toScreen(r.pts[k]!);
        const d = Math.hypot(s.x - sx, s.y - sy);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    });
    return best;
  };

  let hover = -1;
  let lastWX = 0;
  const local = (e: PointerEvent) => {
    const b = canvas.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  const onMove = (e: PointerEvent) => {
    const { x, y } = local(e);
    const w = toWorld(x, y);
    pointer.vx = (w.x - lastWX) * 60;
    lastWX = w.x;
    pointer.x = w.x;
    pointer.y = w.y;
    pointer.active = !reduce;
    const h = pick(x, y);
    if (h !== hover) {
      hover = h;
      canvas.style.cursor = h >= 0 ? "pointer" : "default";
    }
    opts.onHover?.(h >= 0 ? ropes[h]!.spec : null, x, y);
  };
  const onLeave = () => {
    pointer.active = false;
    hover = -1;
    opts.onHover?.(null, 0, 0);
  };
  const onDown = (e: PointerEvent) => {
    const { x, y } = local(e);
    const h = pick(x, y);
    if (h < 0) return;
    hover = h;
    const r = ropes[h]!;
    // Tug: pull the free end toward the viewer and up, physics brings it back.
    if (!reduce) {
      const tip = r.pts[SEG]!;
      tip.z += 1.1;
      tip.y += 0.5;
    }
    opts.onHover?.(r.spec, x, y);
    opts.onSelect?.(r.spec);
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointerdown", onDown);

  paint();
  for (let i = 0; i < 260; i++) simulate(1 / 60);
  ropes.forEach((r, i) => {
    const tip = r.pts[SEG]!;
    tip.x += Math.sin(i * 1.9) * 0.18;
    r.old[SEG]!.x = tip.x;
  });
  rebuild();
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  const offTheme = onThemeChange(paint);

  let visible = true;
  const io = new IntersectionObserver(([e]) => {
    visible = !!e?.isIntersecting;
    if (visible) start();
  });
  io.observe(container);

  let raf = 0;
  let running = false;
  let last = performance.now();
  const frame = (now: number) => {
    if (!visible || document.hidden) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    if (!reduce) {
      ropes.forEach((r, i) => {
        r.pts[SEG]!.x += Math.sin(t * 0.6 + i) * 0.00008;
        r.pts[SEG]!.z += Math.cos(t * 0.45 + i * 1.3) * 0.00008;
      });
      simulate(dt);
    }
    let needPaint = false;
    ropes.forEach((r, i) => {
      const target = i === hover ? 1 : 0;
      r.hi += (target - r.hi) * 0.15;
      const dimT = activeCords.size && !activeCords.has(i) && r.spec.stage ? 1 : 0;
      if (Math.abs(dimT - r.dim) > 0.01) {
        r.dim += (dimT - r.dim) * 0.12;
        needPaint = true;
      }
    });
    if (needPaint) paint();
    topGrow += (topTarget - topGrow) * (reduce ? 1 : 0.06);
    topMesh.geometry.setDrawRange(0, Math.floor((topIndexCount * topGrow) / 3) * 3);
    rebuild();
    renderer.render(scene, camera);
    pointer.vx *= 0.85;
  };
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  const onVis = () => {
    if (!document.hidden) start();
  };
  document.addEventListener("visibilitychange", onVis);
  start();

  return {
    setArtifact(id) {
      const art = ARTIFACTS.find((a) => a.id === id);
      activeCords = new Set(id ? artifactCords(specs, id) : []);
      if (art) topMat.color.set(dyeColor(palette, art.dye));
      buildTopCord([...activeCords]);
      topGrow = 0;
      topTarget = art ? 1 : 0;
      start();
    },
    tags() {
      return pendantIdx.map((i) => {
        const r = ropes[i]!;
        const s = toScreen(
          new THREE.Vector3(r.anchorX, opts.mode === "artifacts" ? TOP + 2.25 : primY(r.anchorX) + 0.2, 0),
        );
        return { cord: r.spec, ...s };
      });
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      offTheme();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
      });
      beadGeo.dispose();
      primMat.dispose();
      topMat.dispose();
      for (const r of ropes) r.mat.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
