/**
 * Secret: the sunken city. Aymara and Quechua stories tell of a city or temple swallowed by Lake Titicaca. Here,
 * only at night, a golden glow breathes in the open water off the Taquile pier (./sumergida/logic.ts `SPOT`),
 * seen from the shore road as a light in the lake. Coming closer (the pier's tip, or over it on the balsa), the
 * outlines of a stepped temple, its walls and the golden disc of Inti show through the water. A good look within
 * `LOOK_R` for `LOOK_HOLD` seconds stamps `titicaca:egg:sunken-city` and shows a short caption telling the legend
 * (as a legend). The first time the ruins show, a faint golden chime plays on the shared sfx bus (with sound on).
 *
 * Nothing by day (the group is hidden). With prefers-reduced-motion the glow is still and the water's wobble
 * stops. Draw calls: two while visible (./sumergida/models.ts). Pure rules: ./sumergida/logic.ts.
 */
import "./sumergida/sumergida.css";
import * as THREE from "three";
import { sfx } from "../../../audio/sfx";
import type { Ambient, CreateAmbient } from "../../contract";
import { emit, on } from "../../events";
import { LEVEL } from "../plan";
import {
  CAPTION,
  holdLook,
  isGoodLook,
  LABEL,
  nightAmount,
  pulse,
  reveal,
  SIZE,
  SPOT,
  STAMP_ID,
  smoothstep,
} from "./sumergida/logic";
import { buildSunkenCity } from "./sumergida/models";

/** A hair above the water (y = LEVEL), the polygon offset does the rest. */
const LIFT = 0.03;
/** Seconds the caption stays up. */
const CAPTION_S = 9;

export const create: CreateAmbient = (env, hudRoot): Ambient => {
  const lang = env.lang;
  const rm = env.reducedMotion;
  const city = buildSunkenCity(SPOT.x, LEVEL + LIFT, SPOT.z, SIZE);
  env.noOutline(city.ruins);
  env.noOutline(city.halo);
  city.group.visible = false;
  env.scene.add(city.group);

  // ---------------------------------------------------------------- caption (aria-live), HUD look
  const layer = document.createElement("div");
  layer.className = "qn-hud kx-sumergida-layer";
  const caption = document.createElement("p");
  caption.className = "kx-sumergida-caption";
  caption.setAttribute("role", "status");
  caption.setAttribute("aria-live", "polite");
  layer.append(caption);
  hudRoot.append(layer);
  let captionT = 0;
  let otherModal = false;
  const offModal = on("world:modal", (d) => {
    otherModal = !!d?.open;
    if (otherModal) caption.classList.remove("is-on");
  });

  let seen = 0;
  let stamped = false;
  let chimed = false;
  const center = new THREE.Vector3(SPOT.x, LEVEL, SPOT.z);
  const ndc = new THREE.Vector3();

  return {
    update(dt, avatar, t) {
      dt = Math.min(dt, 0.05);
      if (captionT > 0) {
        captionT -= dt;
        if (captionT <= 0) caption.classList.remove("is-on");
      }
      const night = nightAmount(env.sky.time());
      const dist = Math.hypot(avatar.x - SPOT.x, avatar.z - SPOT.z);
      const r = reveal(dist, night);
      const visible = r.glow > 0.002;
      city.group.visible = visible;
      if (!visible) {
        seen = 0;
        return;
      }
      const k = pulse(t, rm);
      city.uniforms.uTime.value = rm ? 0 : t;
      city.uniforms.uGlow.value = r.glow * k;
      // The walls breathe with the glow, a little less (they are "lit" by it).
      city.uniforms.uRuins.value = r.ruins * (0.75 + 0.25 * k);
      // The halo carries the light to the road, where the decal is seen edge-on; close by the decal does the work
      // and the halo fades out (from a high camera its foot would show where the water clips it).
      city.haloMat.opacity = r.glow * k * 0.8 * smoothstep(24, 56, dist);

      if (!chimed && r.ruins > 0.5) {
        chimed = true;
        sfx.play("sparkle", { gain: 0.45 });
      }
      if (stamped) return;
      ndc.copy(center).project(env.camera);
      const good = isGoodLook({ dist, night: env.sky.isNight(), ndc }) && r.ruins > 0.3;
      const h = holdLook(seen, good, dt);
      seen = h.seen;
      if (h.done) {
        stamped = true;
        emit("world:stamp", { id: STAMP_ID, kind: "egg", label: LABEL });
        if (!otherModal) {
          caption.textContent = CAPTION[lang];
          caption.classList.remove("is-on");
          void caption.offsetWidth;
          caption.classList.add("is-on");
          captionT = CAPTION_S;
        }
      }
    },
    dispose() {
      offModal();
      layer.remove();
      city.group.removeFromParent();
      city.dispose();
    },
  };
};
