/**
 * Sky + day/night: gradient dome (fades to the title "void"), toon sun and moon discs, stars,
 * the key light that follows the sun (or moon), hemisphere fill, fog, ink and cloud tint.
 * Time: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
 */
import * as THREE from "three";
import type { Sky } from "./contract";
import { WORLD } from "./palette";
import { rng } from "./tex";
import { noOutline } from "./toon";

const DAY_SECONDS = 360;

interface Look {
  top: THREE.Color;
  horizon: THREE.Color;
  voidTop: THREE.Color;
  voidBottom: THREE.Color;
  fog: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemi: number;
  key: THREE.Color;
  keyI: number;
  ink: THREE.Color;
  cloud: THREE.Color;
}
const look = (o: Record<string, string | number>): Look => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === "string" ? new THREE.Color(v) : v;
  return out as unknown as Look;
};
const DAY = look({
  top: "#8fcfc7",
  horizon: "#e9f2e6",
  voidTop: "#bfe6df",
  voidBottom: "#8fcfc6",
  fog: "#d8ece4",
  hemiSky: "#eef6ea",
  hemiGround: "#9a8a68",
  hemi: 1.25,
  key: "#fff3dc",
  keyI: 2.1,
  ink: WORLD.inkDay,
  cloud: "#ffffff",
});
const TWILIGHT = look({
  top: "#5f78b0",
  horizon: "#f3b48c",
  voidTop: "#e9c2b0",
  voidBottom: "#8a87b8",
  fog: "#e0b49a",
  hemiSky: "#f1c6a6",
  hemiGround: "#5b4a52",
  hemi: 1.05,
  key: "#ffb27c",
  keyI: 1.7,
  ink: "#2a1b24",
  cloud: "#ffd6c2",
});
const NIGHT = look({
  top: "#141b36",
  horizon: "#2c3a6a",
  voidTop: "#26315e",
  voidBottom: "#141a33",
  fog: "#222c55",
  hemiSky: "#6f80c8",
  hemiGround: "#2a3150",
  hemi: 1.55,
  key: WORLD.moon,
  keyI: 1.9,
  ink: WORLD.inkNight,
  cloud: "#8b95c6",
});

const DomeShader = {
  uniforms: {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uVoidTop: { value: new THREE.Color() },
    uVoidBottom: { value: new THREE.Color() },
    uVoid: { value: 0 },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uGlow: { value: new THREE.Color() },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_Position = p.xyww;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uTop, uHorizon, uVoidTop, uVoidBottom, uGlow, uSun;
    uniform float uVoid;
    varying vec3 vDir;
    void main() {
      float y = vDir.y;
      // Banded gradient (three soft steps) keeps the sky painterly rather than photographic.
      float k = smoothstep(-0.05, 0.55, y);
      k = floor(k * 6.0 + 0.5) / 6.0 * 0.35 + k * 0.65;
      vec3 sky = mix(uHorizon, uTop, k);
      float g = max(dot(normalize(vDir), normalize(uSun)), 0.0);
      sky += uGlow * pow(g, 12.0) * 0.35;
      vec3 voidc = mix(uVoidBottom, uVoidTop, smoothstep(-0.8, 0.8, y));
      gl_FragColor = vec4(mix(sky, voidc, uVoid), 1.0);
      #include <colorspace_fragment>
    }`,
};

export interface SkySystem {
  sky: Sky;
  /** Smoothly jump between day and night (instant with reduced motion). */
  toggle(): void;
  /** 0 = sky, 1 = floating-island void (title view). */
  setVoid(v: number): void;
  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3, shadows: boolean): void;
  ink: THREE.Color;
  cloudTint: THREE.Color;
  fog: THREE.Fog;
  dispose(): void;
}

export function createSky(scene: THREE.Scene, opts: { reducedMotion: boolean; quality: "low" | "high" }): SkySystem {
  const group = new THREE.Group();
  group.name = "sky";
  scene.add(group);

  const domeMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(DomeShader.uniforms),
    vertexShader: DomeShader.vertexShader,
    fragmentShader: DomeShader.fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), domeMat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);
  const U = domeMat.uniforms as typeof DomeShader.uniforms;

  // Sun and moon: flat discs with an ink rim, always facing the camera.
  const disc = (color: string, r: number, rim: string) => {
    const g = new THREE.Group();
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(r, 40),
      new THREE.MeshBasicMaterial({ color, fog: false, toneMapped: false }),
    );
    const ring = new THREE.Mesh(
      new THREE.CircleGeometry(r * 1.12, 40),
      new THREE.MeshBasicMaterial({ color: rim, fog: false }),
    );
    ring.position.z = -0.5;
    g.add(ring, face);
    return g;
  };
  const sunDisc = disc("#fff1c9", 34, "#f2a94e");
  const moonDisc = disc("#e9ecff", 24, "#5c66a8");
  {
    const crater = new THREE.MeshBasicMaterial({ color: "#c5cbef", fog: false });
    for (const [x, y, r] of [
      [-7, 6, 5],
      [8, -4, 4],
      [2, 10, 2.5],
    ] as const) {
      const c = new THREE.Mesh(new THREE.CircleGeometry(r, 18), crater);
      c.position.set(x, y, 0.3);
      moonDisc.add(c);
    }
  }
  group.add(sunDisc, moonDisc);

  // Stars on the upper hemisphere.
  const starGeo = new THREE.BufferGeometry();
  {
    const R = rng(3);
    const pts: number[] = [];
    for (let i = 0; i < 700; i++) {
      const u = R() * Math.PI * 2;
      const v = Math.acos(1 - R() * 0.95);
      pts.push(Math.sin(v) * Math.cos(u) * 900, Math.cos(v) * 900, Math.sin(v) * Math.sin(u) * 900);
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  }
  const starMat = new THREE.PointsMaterial({
    color: "#fff6dc",
    size: 2.2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  group.add(stars);
  for (const o of [dome, sunDisc, moonDisc, stars]) noOutline(o);

  const hemi = new THREE.HemisphereLight("#ffffff", "#888888", 1);
  const key = new THREE.DirectionalLight("#ffffff", 2);
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -48;
  sc.right = 48;
  sc.top = 48;
  sc.bottom = -48;
  sc.near = 1;
  sc.far = 400;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.06;
  scene.add(hemi, key, key.target);

  const fog = new THREE.Fog("#ffffff", 150, 760);
  scene.fog = fog;

  // ---------------------------------------------------------------- time
  const now = new Date();
  let time = (now.getHours() + now.getMinutes() / 60) / 24;
  let tween: { from: number; to: number; k: number } | null = null;
  const subs = new Set<(t: number) => void>();
  let lastEmit = -1;
  let lastNight: boolean | null = null;
  const isNight = () => {
    const e = Math.sin((time - 0.25) * Math.PI * 2);
    return e < -0.04;
  };
  const emit = (force = false) => {
    const n = isNight();
    const dt = Math.abs(time - lastEmit);
    if (force || n !== lastNight || Math.min(dt, 1 - dt) > 1 / 240) {
      lastEmit = time;
      lastNight = n;
      for (const cb of subs) cb(time);
    }
  };
  const sky: Sky = {
    time: () => time,
    setTime(t) {
      time = ((t % 1) + 1) % 1;
      tween = null;
      emit(true);
    },
    isNight,
    onChange(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };

  const cur = {} as Look;
  const lerpLook = (e: number) => {
    const wd = THREE.MathUtils.smoothstep(e, 0.0, 0.32);
    const wn = THREE.MathUtils.smoothstep(-e, 0.04, 0.24);
    const wt = Math.max(0, 1 - wd - wn);
    for (const k of Object.keys(DAY) as Array<keyof Look>) {
      const d = DAY[k];
      if (d instanceof THREE.Color) {
        const c = cur[k] as THREE.Color;
        c.r = d.r * wd + (TWILIGHT[k] as THREE.Color).r * wt + (NIGHT[k] as THREE.Color).r * wn;
        c.g = d.g * wd + (TWILIGHT[k] as THREE.Color).g * wt + (NIGHT[k] as THREE.Color).g * wn;
        c.b = d.b * wd + (TWILIGHT[k] as THREE.Color).b * wt + (NIGHT[k] as THREE.Color).b * wn;
      } else {
        (cur as unknown as Record<string, number>)[k] =
          (d as number) * wd + (TWILIGHT[k] as number) * wt + (NIGHT[k] as number) * wn;
      }
    }
  };
  for (const k of Object.keys(DAY) as Array<keyof Look>) {
    const v = DAY[k];
    (cur as unknown as Record<string, unknown>)[k] = v instanceof THREE.Color ? v.clone() : v;
  }

  const sunDir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let voidAmt = 0;

  return {
    sky,
    ink: cur.ink,
    cloudTint: cur.cloud,
    fog,
    toggle() {
      const target = isNight() ? 0.4 : 0.93;
      if (opts.reducedMotion) {
        sky.setTime(target);
        return;
      }
      tween = { from: time, to: target > time ? target : target + 1, k: 0 };
    },
    setVoid(v) {
      voidAmt = v;
    },
    update(dt, camera, focus, shadows) {
      if (tween) {
        tween.k = Math.min(1, tween.k + dt / 2.6);
        const e = tween.k < 0.5 ? 2 * tween.k * tween.k : 1 - (-2 * tween.k + 2) ** 2 / 2;
        time = (tween.from + (tween.to - tween.from) * e) % 1;
        if (tween.k >= 1) tween = null;
      } else if (!opts.reducedMotion) {
        time = (time + dt / DAY_SECONDS) % 1;
      }
      emit();

      const a = (time - 0.25) * Math.PI * 2;
      // The sun arcs east → west, leaning north (southern-hemisphere Andes).
      sunDir.set(Math.cos(a), Math.sin(a), -0.42).normalize();
      const e = sunDir.y;
      lerpLook(e);
      const day = e > -0.04;
      const lightDir = day ? sunDir : tmp.copy(sunDir).negate();
      // Keep the key light above the horizon so dawn/dusk still model the forms.
      if (lightDir.y < 0.18) lightDir.y = 0.18;
      lightDir.normalize();

      U.uTop.value.copy(cur.top);
      U.uHorizon.value.copy(cur.horizon);
      U.uVoidTop.value.copy(cur.voidTop);
      U.uVoidBottom.value.copy(cur.voidBottom);
      U.uVoid.value = voidAmt;
      U.uSun.value.copy(day ? sunDir : tmp.copy(sunDir).negate());
      U.uGlow.value.copy(cur.key).multiplyScalar(1 - voidAmt);
      dome.position.copy(camera.position);
      stars.position.copy(camera.position);
      starMat.opacity = THREE.MathUtils.smoothstep(-e, 0.02, 0.2) * (1 - voidAmt * 0.6);

      // Discs sit on the dome and face the camera.
      sunDisc.position.copy(camera.position).addScaledVector(sunDir, 820);
      moonDisc.position.copy(camera.position).addScaledVector(sunDir, -820);
      sunDisc.lookAt(camera.position);
      moonDisc.lookAt(camera.position);
      sunDisc.visible = sunDir.y > -0.12 && voidAmt < 0.95;
      moonDisc.visible = sunDir.y < 0.12 && voidAmt < 0.95;

      hemi.color.copy(cur.hemiSky);
      hemi.groundColor.copy(cur.hemiGround);
      hemi.intensity = cur.hemi;
      key.color.copy(cur.key);
      key.intensity = cur.keyI;
      key.position.copy(focus).addScaledVector(lightDir, 200);
      key.target.position.copy(focus);
      key.castShadow = shadows && opts.quality === "high";

      fog.color.copy(voidAmt > 0.5 ? cur.voidBottom : cur.fog);
      fog.near = THREE.MathUtils.lerp(150, 4000, voidAmt);
      fog.far = THREE.MathUtils.lerp(760, 6000, voidAmt);
    },
    dispose() {
      scene.remove(group, hemi, key, key.target);
      domeMat.dispose();
      dome.geometry.dispose();
      starGeo.dispose();
      starMat.dispose();
      for (const d of [sunDisc, moonDisc])
        d.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
          (m.material as THREE.Material | undefined)?.dispose();
        });
      key.dispose();
      hemi.dispose();
      subs.clear();
    },
  };
}
