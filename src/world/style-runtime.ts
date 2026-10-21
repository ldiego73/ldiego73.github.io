/**
 * Per-frame driver of the "cel pintado andino" style and the shared wind, used by all three runtimes
 * (mountain index.ts, selva/index.ts, suyu/index.ts) with one call each:
 *
 *   const style = createWorldStyle({ world, engine, sky, reducedMotion, focus: pos, noPaint: [avatar.group] });
 *   …every frame, after sky.update and the runtime's own fog tweaks:  style.update(dt, time);
 *
 * Each frame it packs the world's profile (./style.ts) with this frame's light, fog, night and title-void
 * amounts into the shared uniform array (./style-gl.ts `KW_U`), retunes the ink (colour day → night, brush
 * weights), derives the wind (./wind.ts) and publishes it to the GPU and to `liveWind`, fills the pushers
 * (the solid bodies of the creatures registry nearest the traveler bend the grass), steps the spring kicks
 * of the small trees brushed past, and drifts the sky's clouds along the wind.
 *
 * Nothing here allocates per frame. Reduced motion: the wind state drops gusts (gentle constant sway) and
 * the spring kicks are off; bodies still part the grass they stand in.
 */
import type * as THREE from "three";
import { creatures } from "./creatures";
import type { Engine } from "./engine";
import type { WorldId } from "./events";
import type { SkySystem } from "./sky";
import {
  inkColor,
  packStyle,
  profileColors,
  type RGB,
  SLOT,
  STYLES,
  type StyleFrame,
  type StyleProfile,
  WIND,
} from "./style";
import { KW_KICK, KW_PUSH, KW_U, noPaint } from "./style-gl";
import {
  liveWind,
  MAX_PUSHERS,
  type Mover,
  packWind,
  pickPushers,
  springs,
  type WindProfile,
  windAt,
  windState,
} from "./wind";

export interface WorldStyleOptions {
  world: WorldId;
  engine: Engine;
  sky: SkySystem;
  reducedMotion: boolean;
  /** The traveler's position, read every frame (pushers and kicks are picked around it). */
  focus: THREE.Vector3;
  /** Objects whose painted blotches are turned off (the avatar: blotches would slide over a moving body). */
  noPaint?: THREE.Object3D[];
  /** Profile overrides (tuning, dev); default `STYLES[world]` / `WIND[world]`. */
  style?: StyleProfile;
  wind?: WindProfile;
}

export interface WorldStyle {
  readonly profile: StyleProfile;
  readonly windProfile: WindProfile;
  update(dt: number, t: number): void;
  /** Swap profiles live (dev hook, tuning sessions). */
  set(style?: StyleProfile, wind?: WindProfile): void;
  dispose(): void;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function createWorldStyle(o: WorldStyleOptions): WorldStyle {
  let profile = o.style ?? STYLES[o.world];
  let windProfile = o.wind ?? WIND[o.world];
  let colors = profileColors(profile);
  const applySky = () => o.sky.setStyle({ ...profile.sky, clouds: profile.clouds, shadeTint: profile.shadowTint });
  applySky();
  for (const obj of o.noPaint ?? []) noPaint(obj);

  const frame: StyleFrame = { keyRef: 1, fog: [1, 1, 1], night: 0, void: 0 };
  const ink: RGB = [0, 0, 0];
  const idx = new Int32Array(MAX_PUSHERS);
  const movers: Mover[] = Array.from({ length: MAX_PUSHERS }, () => ({ x: 0, z: 0, vx: 0, vz: 0, r: 0 }));
  const last = new Map<number, { x: number; z: number }>();
  const seen = new Set<number>();
  const sample = { x: 0, y: 0, z: 0, gust: 0, speed: 0 };
  const u = o.engine.outline.uniforms;

  return {
    get profile() {
      return profile;
    },
    get windProfile() {
      return windProfile;
    },
    set(style, wind) {
      if (style) {
        profile = style;
        colors = profileColors(profile);
        applySky();
      }
      if (wind) windProfile = wind;
    },
    update(dt, t) {
      const sky = o.sky;
      // ----- light, fog, night → style uniforms
      const e = Math.sin((sky.sky.time() - 0.25) * Math.PI * 2);
      frame.night = smooth(0.02, 0.2, -e);
      const key = sky.light;
      frame.keyRef = key.intensity * Math.max(key.color.r, key.color.g, key.color.b);
      const fc = sky.fog.color;
      frame.fog[0] = fc.r;
      frame.fog[1] = fc.g;
      frame.fog[2] = fc.b;
      frame.void = sky.voidAmount();
      packStyle(profile, colors, frame, KW_U);

      // ----- ink: warm brush by day, the night ink after dusk; brush weights
      inkColor(colors, frame.night, ink);
      u.uInk.value.setRGB(ink[0], ink[1], ink[2]);
      u.uSil.value = profile.ink.silhouette;
      u.uCrease.value = profile.ink.crease;
      u.uCreaseK.value = profile.ink.creaseAlpha;

      // ----- wind
      const ws = windState(windProfile, t, o.reducedMotion, liveWind.state);
      packWind(ws, KW_U);
      const f = o.focus;
      windAt(ws, f.x, f.z, f.y, sample);
      liveWind.gust += (sample.gust - liveWind.gust) * Math.min(1, dt * 3);
      sky.setWind(ws.dirX, ws.dirZ, ws.strength * (1 + sample.gust * 0.5));

      // ----- pushers: the solid bodies nearest the traveler part the grass
      const bodies = creatures.all();
      const n = pickPushers(bodies, f.x, f.z, KW_PUSH, idx);
      // Bounds around every pusher, so far vegetation skips the loop in the vertex shader.
      let reach = 0;
      for (let k = 0; k < n; k++) {
        const o4 = k * 4;
        const d = Math.hypot((KW_PUSH[o4] as number) - f.x, (KW_PUSH[o4 + 1] as number) - f.z);
        reach = Math.max(reach, d + (KW_PUSH[o4 + 2] as number) + 0.5);
      }
      const near = SLOT.NEAR * 4;
      KW_U[near] = f.x;
      KW_U[near + 1] = f.z;
      KW_U[near + 2] = reach;
      seen.clear();
      for (let k = 0; k < n; k++) {
        const b = bodies[idx[k] as number];
        if (!b) continue;
        const m = movers[k] as Mover;
        const p = last.get(b.id);
        m.x = b.x;
        m.z = b.z;
        m.r = b.r;
        m.vx = p && dt > 0 ? (b.x - p.x) / dt : 0;
        m.vz = p && dt > 0 ? (b.z - p.z) / dt : 0;
        if (p) {
          p.x = b.x;
          p.z = b.z;
        } else last.set(b.id, { x: b.x, z: b.z });
        seen.add(b.id);
      }
      for (const id of last.keys()) if (!seen.has(id)) last.delete(id);

      // ----- spring kicks of the small trees brushed past (off under reduced motion)
      if (!o.reducedMotion) {
        springs.step(dt, movers, n);
        KW_U[SLOT.NEAR * 4 + 3] = springs.pack(KW_KICK, f.x, f.z);
      } else KW_U[SLOT.NEAR * 4 + 3] = 0;
    },
    dispose() {
      KW_U.fill(0);
      KW_PUSH.fill(0);
      KW_KICK.fill(0);
      springs.clear();
      liveWind.gust = 0;
    },
  };
}
