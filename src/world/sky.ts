/**
 * Sky + day/night: gradient dome (fades to the title "void"), toon sun and moon discs, stars,
 * the key light that follows the sun (or moon), hemisphere fill, fog, ink and cloud tint.
 * Time: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
 */
import * as THREE from "three";
import { loadPassport } from "../lib/passport";
import { createMilkyWay } from "./ambient/sky/milkyway";
import { arcDir, createMoonDisc, moonlight } from "./ambient/sky/moon";
import { festivalOf, type MoonInfo, moonOf, type SeasonInfo, seasonOf } from "./calendar";
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

/**
 * Weather hook on the contract `Sky` object (ambients only get `env.sky`): src/world/ambient/weather.ts
 * drives it; sky.ts blends it into fog, dome, key light, stars and the Milky Way so nothing fights over
 * `scene.fog`. Scaled out in the title void.
 */
export interface SkyWeather {
  /** fog: 0 clear … 1 thick valley fog (fog near/far shrink, color goes misty). cover: 0 clear … 1 overcast
   *  (dims stars, Milky Way, sun glow and key light). Both clamped to [0, 1]. */
  setWeather(fog: number, cover: number): void;
  /** Current weather inputs (read-only view). */
  weather(): { fog: number; cover: number };
}
export const hasWeather = (s: Sky): s is Sky & SkyWeather =>
  typeof (s as Partial<SkyWeather>).setWeather === "function";

/**
 * Calendar hook on env.sky (real date, `?date=` to test): tonight's moon, the season, and the hidden fox
 * Atoq in the Milky Way (sky-lore.ts reveals it; also on at load once the `egg:atoq` stamp exists).
 */
export interface SkyCalendar {
  moon(): MoonInfo;
  season(): SeasonInfo;
  /** Moon direction in the sky (unit vector, no allocation) and its light 0..1 on the ground right now. */
  moonDir(out: THREE.Vector3): THREE.Vector3;
  moonlight(): number;
  revealAtoq(): void;
  atoqRevealed(): boolean;
  /** World direction of Atoq for the current sky rotation. */
  atoqDir(out: THREE.Vector3): THREE.Vector3;
}
export const hasCalendar = (s: Sky): s is Sky & SkyCalendar =>
  typeof (s as Partial<SkyCalendar>).revealAtoq === "function";

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
  // The moon shows its real phase (calendar.ts), lit from the sun's side.
  const moon = createMoonDisc(24);
  const moonDisc = moon.mesh;
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
  // Mayu (the Milky Way) with the Andean dark constellations.
  const milky = createMilkyWay();
  group.add(milky.object);
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

  // ---------------------------------------------------------------- calendar
  let moonInfo = moonOf();
  let season = seasonOf();
  let festival = festivalOf();
  let calAge = 0;
  let atoqOn = false;
  let atoqK = 0;
  try {
    atoqOn = !!loadPassport().stamps["egg:atoq"];
  } catch {
    /* storage blocked */
  }
  atoqK = atoqOn ? 1 : 0;
  milky.setAtoq(atoqK);
  const moonDir = new THREE.Vector3(0, -1, 0);
  let moonLight = 0;

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
  const wx = { fog: 0, cover: 0 };
  const clamp01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0);
  const sky: Sky & SkyWeather & SkyCalendar = {
    moon: () => moonInfo,
    season: () => season,
    moonDir: (out) => out.copy(moonDir),
    moonlight: () => moonLight,
    revealAtoq() {
      atoqOn = true;
      if (opts.reducedMotion) atoqK = 1;
    },
    atoqRevealed: () => atoqOn,
    atoqDir: (out) => milky.atoqDir(out),
    setWeather(f, c) {
      wx.fog = clamp01(f);
      wx.cover = clamp01(c);
    },
    weather: () => wx,
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
  const mistCol = new THREE.Color();
  const greyCol = new THREE.Color();
  const FROST = new THREE.Color("#b9d3ef");
  const FROST_GROUND = new THREE.Color("#9fb4d0");
  const FROST_KEY = new THREE.Color("#e2ecff");
  const GOLD_SKY = new THREE.Color("#ffc25a");
  const GOLD_KEY = new THREE.Color("#ffc46a");
  const MOON_DARK = new THREE.Color("#6a78c0");
  const MOON_FULL = new THREE.Color("#b4c2f4");
  const moonCol = new THREE.Color();
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
      // The date can change under a long session (or the dev hook): refresh the calendar now and then.
      calAge += dt;
      if (calAge > 20) {
        calAge = 0;
        moonInfo = moonOf();
        season = seasonOf();
        festival = festivalOf();
      }
      if (atoqOn && atoqK < 1) atoqK = Math.min(1, atoqK + dt / 4);
      milky.setAtoq(atoqK);

      // The sun arcs east → west, leaning north (southern-hemisphere Andes); the moon follows the same
      // arc, lagging by its phase (full moon opposite the sun, new moon beside it).
      arcDir(time, 0, sunDir);
      arcDir(time, moonInfo.phase, moonDir);
      const e = sunDir.y;
      lerpLook(e);
      const day = e > -0.04;
      const night = THREE.MathUtils.smoothstep(-e, 0.02, 0.2);
      moonLight = moonlight(moonInfo.illumination, moonDir.y);
      // Night key light: from the moon when it is up, otherwise from the anti-sun sky glow.
      const lightDir = day ? sunDir : tmp.copy(sunDir).negate();
      if (!day) {
        const up = THREE.MathUtils.smoothstep(moonDir.y, 0.0, 0.25);
        lightDir.lerp(moonDir, up).normalize();
      }
      // Keep the key light above the horizon so dawn/dusk still model the forms.
      if (lightDir.y < 0.18) lightDir.y = 0.18;
      lightDir.normalize();

      // Seasons: frost-blue dry-season mornings; a golden Inti Raymi sunrise.
      const dawn = Math.exp(-(((time - 0.265) / 0.05) ** 2));
      const gold = festival === "inti-raymi" ? Math.exp(-(((time - 0.27) / 0.05) ** 2)) * (1 - voidAmt) : 0;
      const frost = Math.min(1, dawn * season.snow * 1.05) * (1 - voidAmt) * (1 - gold);
      if (frost > 0.002) {
        cur.horizon.lerp(FROST, frost);
        cur.top.lerp(FROST, frost * 0.3);
        cur.fog.lerp(FROST, frost * 0.9);
        cur.hemiSky.lerp(FROST, frost * 0.6);
        cur.hemiGround.lerp(FROST_GROUND, frost * 0.5);
        cur.cloud.lerp(FROST, frost * 0.5);
        cur.key.lerp(FROST_KEY, frost * 0.6);
      }
      if (gold > 0.002) {
        cur.horizon.lerp(GOLD_SKY, gold * 0.75);
        cur.fog.lerp(GOLD_SKY, gold * 0.35);
        cur.key.lerp(GOLD_KEY, gold * 0.8);
        cur.keyI += gold * 0.6;
        cur.cloud.lerp(GOLD_SKY, gold * 0.5);
      }
      // Moonlight: a silver full-moon night vs. a very dark new-moon night.
      if (night > 0.001) {
        moonCol.copy(MOON_DARK).lerp(MOON_FULL, moonLight);
        cur.key.lerp(moonCol, night);
        cur.keyI *= 1 - night * (1 - (0.5 + 0.45 * moonLight));
        cur.hemi *= 1 - night * (1 - (0.86 + 0.14 * moonLight));
      }

      // Weather (none in the title void).
      const wf = wx.fog * (1 - voidAmt);
      const wc = wx.cover * (1 - voidAmt);
      mistCol.copy(cur.fog).lerp(cur.cloud, 0.35);
      const l = (mistCol.r + mistCol.g + mistCol.b) / 3;
      mistCol.lerp(greyCol.setRGB(l, l, l), 0.35 + 0.25 * wc);

      U.uTop.value.copy(cur.top).lerp(mistCol, wc * 0.45 + wf * 0.2);
      U.uHorizon.value.copy(cur.horizon).lerp(mistCol, wf * 0.85 + wc * 0.2);
      U.uVoidTop.value.copy(cur.voidTop);
      U.uVoidBottom.value.copy(cur.voidBottom);
      U.uVoid.value = voidAmt;
      U.uSun.value.copy(day ? sunDir : tmp.copy(sunDir).negate());
      U.uGlow.value.copy(cur.key).multiplyScalar((1 - voidAmt) * (1 - wc * 0.7) * (1 + gold * 1.4));
      dome.position.copy(camera.position);
      stars.position.copy(camera.position);
      const clearSky = 1 - Math.max(wc, wf) * 0.85;
      // More stars (and a brighter Mayu) on moonless nights; the full moon washes them out a little.
      const dark = 1 - moonLight;
      starMat.opacity = Math.min(1, night * (1 - voidAmt * 0.6) * clearSky * (0.7 + 0.45 * dark));
      starMat.size = 1.9 + 1.0 * dark;
      milky.update(camera.position, time, night * (1 - voidAmt) * clearSky * (0.5 + 0.55 * dark));

      // Discs sit on the dome and face the camera.
      sunDisc.position.copy(camera.position).addScaledVector(sunDir, 820);
      moonDisc.position.copy(camera.position).addScaledVector(moonDir, 820);
      sunDisc.lookAt(camera.position);
      moonDisc.lookAt(camera.position);
      sunDisc.scale.setScalar(1 + gold * 0.25);
      sunDisc.visible = sunDir.y > -0.12 && voidAmt < 0.95;
      moonDisc.visible = moonDir.y > -0.12 && voidAmt < 0.95 && moonInfo.illumination > 0.01;
      // By day the moon is a pale ghost; behind clouds it dims.
      moon.update(
        sunDir,
        moonInfo.phase,
        night,
        (0.35 + 0.65 * Math.max(night, 1 - THREE.MathUtils.smoothstep(e, -0.1, 0.25))) * (1 - wc * 0.75),
      );

      hemi.color.copy(cur.hemiSky);
      hemi.groundColor.copy(cur.hemiGround);
      hemi.intensity = cur.hemi;
      key.color.copy(cur.key);
      key.intensity = cur.keyI * (1 - wc * 0.35);
      key.position.copy(focus).addScaledVector(lightDir, 200);
      key.target.position.copy(focus);
      key.castShadow = shadows && opts.quality === "high";

      fog.color.copy(voidAmt > 0.5 ? cur.voidBottom : cur.fog);
      // Crisp dry-season air sees further; the rainy season is a little hazier.
      const air = 1 + 0.18 * season.snow - 0.1 * season.rain;
      fog.near = THREE.MathUtils.lerp(150 * air, 4000, voidAmt);
      fog.far = THREE.MathUtils.lerp(760 * air, 6000, voidAmt);
      if (wf > 0.001) {
        fog.color.lerp(mistCol, Math.min(1, wf * 1.4));
        fog.near = THREE.MathUtils.lerp(fog.near, 6, wf);
        fog.far = THREE.MathUtils.lerp(fog.far, 140, wf);
      }
    },
    dispose() {
      scene.remove(group, hemi, key, key.target);
      domeMat.dispose();
      dome.geometry.dispose();
      starGeo.dispose();
      starMat.dispose();
      milky.dispose();
      moon.dispose();
      for (const d of [sunDisc])
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
