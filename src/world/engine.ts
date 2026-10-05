import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { InkOutlinePass } from "./outline";
import { NO_OUTLINE_LAYER } from "./toon";

export type Quality = "low" | "high";

export interface Engine {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  outline: InkOutlinePass;
  setQuality(q: Quality): void;
  quality(): Quality;
  onFrame(fn: (dt: number, t: number) => void): () => void;
  /**
   * Resolves with a 2D copy of the next rendered frame. The copy is made in the same tick right after
   * the composer renders, so preserveDrawingBuffer isn't needed.
   */
  capture(): Promise<HTMLCanvasElement>;
  /** Stop rendering (e.g. while an arcade game is open). */
  hold(on: boolean): void;
  size(): { w: number; h: number };
  dispose(): void;
}

/** One renderer, one scene: color → ink outline → FXAA (high) → tone map + sRGB. */
export function createEngine(host: HTMLElement, opts: { quality: Quality }): Engine {
  const canvas = document.createElement("canvas");
  canvas.className = "kw-canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  // Neutral keeps the flat toon hues close to the palette (ACES shifts greens and teals).
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 1600);
  camera.layers.enable(NO_OUTLINE_LAYER);
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const outline = new InkOutlinePass(scene, camera);
  const fxaa = new ShaderPass(FXAAShader);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(outline);
  composer.addPass(fxaa);
  composer.addPass(output);

  let q: Quality = opts.quality;
  let w = 1;
  let h = 1;
  const applySize = () => {
    w = Math.max(1, host.clientWidth);
    h = Math.max(1, host.clientHeight);
    const dpr = q === "high" ? Math.min(window.devicePixelRatio || 1, 1.5) : Math.min(window.devicePixelRatio || 1, 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    (fxaa.material.uniforms.resolution!.value as THREE.Vector2).set(1 / (w * dpr), 1 / (h * dpr));
    // Line weight scales with density so the ink reads the same on retina and 1x.
    outline.uniforms.uThick.value = dpr > 1.2 ? 1.5 : 1;
  };
  const setQuality = (next: Quality) => {
    q = next;
    fxaa.enabled = q === "high";
    renderer.shadowMap.enabled = q === "high";
    applySize();
  };
  setQuality(q);
  const ro = new ResizeObserver(applySize);
  ro.observe(host);

  const listeners = new Set<(dt: number, t: number) => void>();
  let lastT = performance.now();
  let raf = 0;
  let held = false;
  let elapsed = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min((now - lastT) / 1000, 1 / 20);
    lastT = now;
    elapsed += dt;
    for (const fn of listeners) fn(dt, elapsed);
    composer.render(dt);
    if (captures.length) flushCaptures();
  };
  const captures: Array<(c: HTMLCanvasElement) => void> = [];
  const flushCaptures = () => {
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    out.getContext("2d")?.drawImage(canvas, 0, 0);
    for (const r of captures.splice(0)) r(out);
  };
  const start = () => {
    if (raf || held || document.hidden) return;
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVis);
  start();

  return {
    renderer,
    canvas,
    scene,
    camera,
    outline,
    setQuality,
    quality: () => q,
    onFrame(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    capture() {
      return new Promise((resolve) => {
        captures.push(resolve);
        // Not rendering (held/hidden)? Render one frame now so the copy has content.
        if (!raf) {
          composer.render(0);
          flushCaptures();
        }
      });
    },
    hold(on) {
      held = on;
      if (on) stop();
      else start();
    },
    size: () => ({ w, h }),
    dispose() {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
      listeners.clear();
      outline.dispose();
      fxaa.dispose();
      output.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

/** Frees every geometry, material and texture under an object. */
export function disposeTree(root: THREE.Object3D) {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !seen.has(m.geometry)) {
      seen.add(m.geometry);
      m.geometry.dispose();
    }
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}
