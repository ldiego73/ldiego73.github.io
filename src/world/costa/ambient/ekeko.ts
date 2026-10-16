/**
 * Easter egg of the coast: the hidden Ekeko. A small statuette of the Andean god of abundance (./ekeko/model.ts)
 * stands on a fruit crate tucked against the outer side of the last stall of the Huanchaco market, half under
 * its reed roof (placement in ./ekeko/logic.ts, on the same station frame and STALLS table as ./huacas.ts and
 * ./gente.ts). It is small enough to walk past; every few seconds a glint flashes on the banknotes in his hand
 * (with reduced motion: a steady faint glint instead), which is what a careful eye catches.
 *
 * Within a step of the crate, "E · Mirar" / "E · Look": he gives a little double hop, his miniatures jingle (a
 * short Web Audio tinkle on the shared sfx bus, silent until audio is live), a bilingual caption about the
 * Ekeko and the Alasitas fair shows above the prompt, and the first look stamps `egg:ekeko` (kind "egg"). E
 * again or Esc closes the caption; it also closes on its own or when the traveler walks away.
 *
 * Draw calls: the crate and the statuette (one vertex-toon mesh each, inked like every prop) and one additive
 * sprite, shown only while the camera is near. Collider: the crate.
 */
import "./ekeko/ekeko.css";
import * as THREE from "three";
import type { AudioOutput } from "../../../audio/contract";
import { getMusic } from "../../../audio/player";
import type { Ambient, CreateAmbient } from "../../contract";
import { emit } from "../../events";
import { vertexToon } from "../../merge-colors";
import { glowSprite } from "../../props";
import type { SuyuEnv } from "../../suyu/contract";
import { STATION } from "../plan";
import {
  BOUNCE_S,
  bounce,
  COPY,
  CRATE_H,
  CRATE_R,
  createLook,
  ekekoSpot,
  inRange,
  SPARKLE_NEAR,
  STAMP,
  sparkle,
} from "./ekeko/logic";
import { buildCrate, buildEkeko } from "./ekeko/model";

/** Height of the aguayo cloth on the crate lid (the statuette's feet). */
const CLOTH = 0.02;
/** Sparkle sprite size at full flash (world units; the statuette is ≈ 0.47 tall). */
const GLINT_SIZE = 0.42;

/** The miniatures' jingle: a few tiny bell tings (two inharmonic partials each), quick and bright. */
function jingle(seed: number) {
  let out: AudioOutput | null = null;
  try {
    out = getMusic().output?.() ?? null;
  } catch {
    return;
  }
  if (out?.ctx.state !== "running") return;
  const ctx = out.ctx;
  let s = seed | 0 || 1;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const t0 = ctx.currentTime + 0.01;
  const bus = ctx.createGain();
  bus.gain.value = 0.32;
  bus.connect(out.sfx);
  const n = 9;
  for (let i = 0; i < n; i++) {
    // Tings spread over ≈ 0.55 s, thinning out like small metal charms settling after the hop.
    const t = t0 + (i / n) ** 1.4 * 0.55 + rand() * 0.03;
    const f = 2300 + rand() * 2600;
    const lvl = 0.5 * (1 - (i / n) * 0.6);
    for (const [mul, amp] of [
      [1, 1],
      [2.76, 0.35],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * mul;
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(lvl * amp, t + 0.004);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(gn).connect(bus);
      o.start(t);
      o.stop(t + 0.25);
      o.onended = () => {
        gn.disconnect();
        // The last ting frees the bus too.
        if (i === n - 1 && mul === 1) bus.disconnect();
      };
    }
  }
}

export const create: CreateAmbient = (baseEnv, hudRoot) => {
  const env = baseEnv as SuyuEnv;
  const S = env.suyu;
  const lang = env.lang;
  const rm = env.reducedMotion;

  const pose = env.stationPose(STATION.market);
  const spot = ekekoSpot({ x: pose.position.x, z: pose.position.z, y: 0, yaw: pose.yaw });
  const y = S.groundAt(spot.x, spot.z);

  const root = new THREE.Group();
  root.name = "costa-ekeko";
  root.position.set(spot.x, y, spot.z);
  root.rotation.y = spot.yaw;
  env.scene.add(root);

  const mat = vertexToon();
  const crateGeo = buildCrate();
  const crate = new THREE.Mesh(crateGeo, mat);
  crate.name = "costa-ekeko-crate";
  root.add(crate);
  const built = buildEkeko();
  const figure = new THREE.Mesh(built.geo, mat);
  figure.name = "costa-ekeko";
  // Turned a touch more toward the plaza than the crate, as if greeting passers-by.
  figure.position.set(-0.06, CRATE_H + CLOTH, 0.02);
  figure.rotation.y = -0.25;
  root.add(figure);
  const glint = glowSprite(env, "#fff1b8", GLINT_SIZE);
  glint.position.set(built.glint.x, built.glint.y, built.glint.z);
  glint.visible = false;
  figure.add(glint);
  const glintMat = glint.material as THREE.SpriteMaterial;

  env.addCollider({ kind: "circle", x: spot.x, z: spot.z, r: CRATE_R });

  // Caption (its own hud layer, so it does not depend on any other ambient's hud).
  const layer = document.createElement("div");
  layer.className = "qn-hud ek-layer";
  const caption = document.createElement("div");
  caption.className = "ek-caption";
  caption.setAttribute("role", "status");
  caption.setAttribute("aria-live", "polite");
  caption.setAttribute("aria-hidden", "true");
  layer.appendChild(caption);
  hudRoot.appendChild(layer);
  const showCaption = (on: boolean) => {
    caption.classList.toggle("is-on", on);
    caption.setAttribute("aria-hidden", on ? "false" : "true");
    if (on) {
      caption.replaceChildren();
      const title = document.createElement("strong");
      title.textContent = COPY.title[lang];
      const body = document.createElement("p");
      body.textContent = COPY.body[lang];
      caption.append(title, body);
    }
  };

  const look = createLook();
  let near = false;
  let shown = false;
  let looks = 0;
  const camPos = new THREE.Vector3();

  const api: Ambient = {
    update(dt, avatar, t) {
      const d = Math.hypot(spot.x - avatar.x, spot.z - avatar.z);
      near = inRange(spot, avatar.x, avatar.z);
      look.tick(dt, d);
      if (look.open !== shown) {
        shown = look.open;
        showCaption(shown);
      }
      // Bounce (none with reduced motion: bounce() returns the rest pose).
      const b = bounce(look.since, rm);
      figure.position.y = CRATE_H + CLOTH + b.lift;
      figure.scale.set(1 / Math.sqrt(b.squash), b.squash, 1 / Math.sqrt(b.squash));
      figure.rotation.z = b.tilt;
      // Sparkle: only near the camera; brighter for a moment right after a look.
      camPos.copy(env.camera.position);
      const camD = Math.hypot(camPos.x - spot.x, camPos.z - spot.z);
      let k = camD < SPARKLE_NEAR ? sparkle(t, rm) : 0;
      if (!rm && look.since < BOUNCE_S) k = Math.max(k, 1 - look.since / BOUNCE_S);
      glint.visible = k > 0.01;
      if (glint.visible) {
        glintMat.opacity = 0.9 * k;
        glint.scale.setScalar(GLINT_SIZE * (rm ? 0.6 : 0.5 + 0.5 * k));
      }
    },
    prompt() {
      if (!near) return null;
      return look.open ? COPY.close[lang] : COPY.look[lang];
    },
    interact() {
      if (!near) return false;
      if (look.open) {
        look.close();
        return true;
      }
      const r = look.look();
      jingle(0x3e3e + looks++ * 977);
      if (r.stamp) emit("world:stamp", { id: STAMP.id, kind: STAMP.kind, label: STAMP.label });
      return true;
    },
    escape() {
      if (!look.open) return false;
      look.close();
      return true;
    },
    dispose() {
      layer.remove();
      crateGeo.dispose();
      built.geo.dispose();
      mat.dispose();
      glintMat.dispose();
      root.removeFromParent();
    },
  };
  return api;
};
