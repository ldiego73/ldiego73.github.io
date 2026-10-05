import * as THREE from "three";

const RAMP = " .,:;-=+*cxoO#%@";
const NOISE = "#%@*+=-:;.,xoO0/\\|[]{}<>?!$&";

/** Seeded PRNG so the noise pattern is stable between renders. */
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Text at a denoising level s in [0, 1]: characters resolve in a fixed random order. */
export function denoiseText(message: string, s: number, seed = 7): string {
  const rnd = mulberry(seed);
  return [...message]
    .map((c) => {
      const r = rnd();
      if (r < s) return c;
      if (c === " " && r < s + 0.25) return " ";
      return NOISE[Math.floor(rnd() * NOISE.length)] ?? "#";
    })
    .join("");
}

/**
 * "Del ruido a la señal": a point cloud that collapses from noise into a torus knot,
 * rendered through a glyph ramp like a phosphor terminal. A slider drives both the
 * 3D scene and the paragraph.
 */
export function initSignal(root: HTMLElement): void {
  const out = root.querySelector<HTMLCanvasElement>("canvas.glyphs");
  const pre = root.querySelector<HTMLElement>("[data-noise]");
  const range = root.querySelector<HTMLInputElement>("[data-steps]");
  const outEl = root.querySelector<HTMLOutputElement>("[data-steps-out]");
  if (!out || !pre || !range) return;
  const message = pre.textContent ?? "";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let level = 1;
  const setText = () => {
    pre.textContent = denoiseText(message, level);
    if (outEl) outEl.textContent = `${range.value} / 50`;
  };

  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  } catch {
    out.hidden = true;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 5.2, 9.5);
  const camera = new THREE.PerspectiveCamera(38, 2, 0.1, 50);
  camera.position.set(0, 0, 7);
  const N = 1400;
  const knot = new THREE.TorusKnotGeometry(1.5, 0.42, 280, 6, 2, 3).getAttribute("position");
  const rnd = mulberry(42);
  const from = new Float32Array(N * 3);
  const to = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const k = Math.floor(rnd() * knot.count);
    to[i * 3] = knot.getX(k);
    to[i * 3 + 1] = knot.getY(k);
    to[i * 3 + 2] = knot.getZ(k);
    from[i * 3] = (rnd() - 0.5) * 9;
    from[i * 3 + 1] = (rnd() - 0.5) * 4.5;
    from[i * 3 + 2] = (rnd() - 0.5) * 4;
  }
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xb0b0b0, size: 0.13, sizeAttenuation: true }),
  );
  scene.add(points);

  const tmp = document.createElement("canvas");
  const tctx = tmp.getContext("2d", { willReadFrequently: true });
  const ctx = out.getContext("2d");
  let cols = 0;
  let rows = 0;
  let cw = 7;
  let ch = 12;
  let fontPx = 12;
  const resize = () => {
    const w = out.clientWidth;
    const h = out.clientHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    out.width = w * dpr;
    out.height = h * dpr;
    fontPx = w < 520 ? 9 : 12;
    cw = fontPx * 0.6;
    ch = fontPx * 1.08;
    cols = Math.max(10, Math.floor(w / cw));
    rows = Math.max(6, Math.floor(h / ch));
    renderer?.setSize(cols, rows, false);
    tmp.width = cols;
    tmp.height = rows;
    camera.aspect = (cols * cw) / (rows * ch);
    camera.updateProjectionMatrix();
  };

  let shown = level;
  const draw = (t: number) => {
    if (!renderer || !tctx || !ctx) return;
    shown += (level - shown) * (reduce ? 1 : 0.08);
    const e = shown * shown * (3 - 2 * shown);
    for (let i = 0; i < N * 3; i++) {
      const j = (from[i] ?? 0) + ((to[i] ?? 0) - (from[i] ?? 0)) * e;
      pos[i] = j + (reduce ? 0 : Math.sin(t * 1.3 + i) * 0.04 * (1 - e));
    }
    geo.attributes.position!.needsUpdate = true;
    points.rotation.y = reduce ? 0.6 : t * 0.25;
    points.rotation.x = 0.35;
    renderer.render(scene, camera);
    tctx.drawImage(renderer.domElement, 0, 0, cols, rows);
    const d = tctx.getImageData(0, 0, cols, rows).data;
    const dpr = out.width / Math.max(1, out.clientWidth);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, out.width, out.height);
    ctx.font = `${fontPx}px ${getComputedStyle(document.documentElement).getPropertyValue("--font-mono") || "monospace"}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffb547";
    for (let y = 0; y < rows; y++) {
      let line = "";
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const lum = ((d[i] ?? 0) * 0.3 + (d[i + 1] ?? 0) * 0.59 + (d[i + 2] ?? 0) * 0.11) / 255;
        line += RAMP[Math.min(RAMP.length - 1, Math.floor(lum * RAMP.length))];
      }
      ctx.fillText(line, 0, y * ch);
    }
  };

  let raf = 0;
  let visible = false;
  let start = 0;
  const loop = (now: number) => {
    if (!visible) return;
    raf = requestAnimationFrame(loop);
    draw((now - start) / 1000);
  };
  const io = new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    if (visible) {
      resize();
      start ||= performance.now();
      cancelAnimationFrame(raf);
      if (reduce) draw(0);
      else raf = requestAnimationFrame(loop);
    }
  });
  io.observe(root);
  new ResizeObserver(() => {
    resize();
    if (reduce) draw(0);
  }).observe(out);

  // Play the denoise once when first seen; the slider takes over after.
  let played = false;
  const autoplay = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting || played || reduce) return;
      played = true;
      autoplay.disconnect();
      let v = 0;
      range.value = "0";
      level = 0;
      setText();
      const timer = setInterval(() => {
        v += 1;
        range.value = String(v);
        level = v / 50;
        setText();
        if (v >= 50) clearInterval(timer);
      }, 70);
      range.addEventListener("pointerdown", () => clearInterval(timer), { once: true });
      range.addEventListener("keydown", () => clearInterval(timer), { once: true });
    },
    { threshold: 0.5 },
  );
  autoplay.observe(root);

  range.addEventListener("input", () => {
    level = Number(range.value) / 50;
    setText();
    if (reduce) draw(0);
  });
  setText();
}
