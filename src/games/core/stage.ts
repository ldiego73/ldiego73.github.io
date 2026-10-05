import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BLOOM, NEON } from "./neon";

export interface StageOptions {
  /** "ortho" keeps world units = cells for grid games; "persp" for 3/4 scenes. */
  camera?: "ortho" | "persp";
  /** Visible world height for ortho cameras (world units). */
  viewHeight?: number;
  fov?: number;
  antialias?: boolean;
  /** Fixed aspect ratio for the canvas box (width / height). Omit to fill the element. */
  aspect?: number;
  /**
   * Bloom post-processing (UnrealBloomPass at half resolution). Off by default in the block style;
   * pass an object to opt in for a subtle accent.
   */
  bloom?: false | Partial<{ strength: number; radius: number; threshold: number }>;
}

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  /** Bloom pass when enabled, to tweak strength at runtime (e.g. flash on hit). */
  bloomPass: UnrealBloomPass | null;
  /** Current CSS pixel size of the canvas. */
  size: { w: number; h: number };
  onResize(cb: (w: number, h: number) => void): void;
  /** Starts the frame loop. cb receives delta seconds (clamped to 1/20) and elapsed seconds. */
  loop(cb: (dt: number, t: number) => void): void;
  pause(): void;
  resume(): void;
  render(): void;
  dispose(): void;
}

/**
 * Shared Three.js stage: renderer, camera, resize, DPR cap, rAF loop with pause,
 * and full disposal. Games add meshes to stage.scene.
 */
export function createStage(el: HTMLElement, opts: StageOptions = {}): Stage {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  el.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: opts.antialias ?? true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(NEON.void, 1);

  const scene = new THREE.Scene();
  const viewHeight = opts.viewHeight ?? 20;
  const camera =
    opts.camera === "persp"
      ? new THREE.PerspectiveCamera(opts.fov ?? 40, 1, 0.1, 500)
      : new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 500);

  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  if (opts.bloom !== undefined && opts.bloom !== false) {
    const b = { ...BLOOM, ...(opts.bloom ?? {}) };
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), b.strength, b.radius, b.threshold);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }
  const draw = () => (composer ? composer.render() : renderer.render(scene, camera));

  const size = { w: 1, h: 1 };
  const resizeCbs: Array<(w: number, h: number) => void> = [];

  const resize = () => {
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, opts.aspect ? w / opts.aspect : el.clientHeight);
    size.w = w;
    size.h = h;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    bloomPass?.resolution.set(w / 2, h / 2);
    canvas.style.height = `${h}px`;
    const a = w / h;
    if (camera instanceof THREE.OrthographicCamera) {
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.left = (-viewHeight * a) / 2;
      camera.right = (viewHeight * a) / 2;
    } else {
      camera.aspect = a;
    }
    camera.updateProjectionMatrix();
    for (const cb of resizeCbs) cb(w, h);
    if (!running) draw();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  let frameCb: ((dt: number, t: number) => void) | null = null;
  let raf = 0;
  let running = false;
  let last = 0;
  let elapsed = 0;

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0));
    last = now;
    elapsed += dt;
    frameCb?.(dt, elapsed);
    draw();
  };

  const stage: Stage = {
    renderer,
    scene,
    camera,
    canvas,
    bloomPass,
    size,
    onResize(cb) {
      resizeCbs.push(cb);
      cb(size.w, size.h);
    },
    loop(cb) {
      frameCb = cb;
      stage.resume();
    },
    pause() {
      running = false;
      cancelAnimationFrame(raf);
    },
    resume() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    },
    render() {
      draw();
    },
    dispose() {
      stage.pause();
      ro.disconnect();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) for (const x of m) x.dispose();
        else m?.dispose();
      });
      composer?.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
  resize();
  return stage;
}

/** Block light rig (r186 physical intensities): warm sun key + soft sky fill, flat-shaded friendly. */
export function addLights(scene: THREE.Scene): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.HemisphereLight(0xfff4e0, 0x3a3c48, 2.3));
  const key = new THREE.DirectionalLight(0xfff1d6, 2.9);
  key.position.set(-6, 12, 8);
  g.add(key);
  scene.add(g);
  return g;
}
