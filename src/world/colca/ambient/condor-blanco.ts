/**
 * Secret: the white condor of the Colca. Among the black condors riding the morning thermals at the Cruz del
 * Cóndor (./condores.ts), a rare leucistic one (pale cream all over, the white collar still there, a pinkish
 * bare head) flies only in the morning band (sky time 0.26–0.52, ./condor-blanco/logic.ts WINDOW): it circles
 * its own small thermal just out over the canyon in front of the lookout and, while the traveler is at the
 * Cruz, comes down every ~50 s for a low pass close past the platform (the first ~9 s after arriving), then
 * rejoins its circle where it would have been. With reduced motion it glides at half speed, wings still, and
 * never dives.
 *
 * A good look (within 30 u and on screen for 0.6 s, like the mountain's golden condor) stamps
 * `colca:egg:white-condor`, listed under the passport's "Secretos" for the Kuntisuyu.
 *
 * Rendering: the shared animals' condor (./condores/model.ts, a herd of one) in a leucistic palette: one
 * instanced draw (plus its ink and shadow), only while it flies. Registered in `creatures` (kind "condor", not
 * solid), parked far away while hidden.
 */
import * as THREE from "three";
import { bpal } from "../../characters/animals/species/birds";
import type { CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { emit } from "../../events";
import type { SuyuEnv } from "../../suyu/contract";
import type { ColcaLayout } from "../layout";
import { CANYON, rimZ } from "../plan";
import {
  type Anchor,
  type CPoint,
  circleFor,
  farthestPhase,
  inWindow,
  LOOK,
  lookStep,
  onCircle,
  passAt,
  passDuration,
  passOver,
  schedule,
} from "./condor-blanco/logic";
import { CondorFlock } from "./condores/model";

const STAMP = "colca:egg:white-condor";
const LABEL: L = { es: "Cóndor blanco", en: "White condor" };
/**
 * Leucistic: cream body and wings, the collar and wing band a step brighter so they still read, a pinkish bare
 * head; kept light so the bird does not sink into the canyon's dusty haze.
 */
const WHITE = bpal({
  back: "#f1eadc",
  head: "#e8aca2",
  bill: "#efe4cc",
  legs: "#c9c0b3",
  belly: "#f4eee2",
  coverts: "#eee6d6",
  flight: "#e6dece",
  tail: "#ebe3d3",
  face: "#dc958a",
  collar: "#fffdf6",
});

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SuyuEnv;
  const layout = env.suyu.layout as ColcaLayout;
  const rm = env.reducedMotion;
  const rimY = CANYON.rimY;
  const P = layout.cruz;
  const anchor: Anchor = { x: P.x, s: P.z - rimZ(P.x), y: P.y - rimY };
  const circle = circleFor(anchor, rm);
  const over = passOver(anchor);

  // ---------------------------------------------------------------- bird
  const bird = new CondorFlock("colca-white-condor", 1, rm, [WHITE]);
  env.scene.add(bird.group);

  const body0 = creatures.add("condor", 1.4, { solid: false, x: 1e5, z: 1e5 });

  // ---------------------------------------------------------------- flight state
  let clock = 0;
  let ph = 0;
  let active = false;
  let next: number | null = null;
  let pass: { start: number; dur: number; a: CPoint; b: CPoint } | null = null;
  let seen = 0;
  let stamped = false;
  const ndc = new THREE.Vector3();

  return {
    update(dtIn, avatar, t) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      const want = inWindow(env.sky.time());
      if (want && !active) {
        // Enter on the far side of the circle from the camera, so it glides in instead of popping up.
        const cam = env.camera.position;
        ph = farthestPhase(circle, cam.x, cam.z - rimZ(cam.x));
        pass = null;
        next = null;
        seen = 0;
      }
      active = want;
      if (!active) {
        body0.x = 1e5;
        body0.z = 1e5;
        bird.hide(0);
        bird.update(dt, t, env.camera);
        return;
      }

      // The circle keeps turning during a pass, so the bird rejoins it where it would have been.
      ph += circle.w * dt;
      const dPlat = Math.hypot(avatar.x - P.x, avatar.z - P.z);
      const sch = schedule(next, clock, dPlat, rm);
      next = sch.next;
      if (sch.start && !pass) {
        const p = onCircle(circle, ph, clock, rm);
        const a = { x: p.x, s: p.s, y: p.y };
        // Rejoin point: where the circle will be when the pass ends (estimated with a first duration).
        const at = (d: number) => {
          const e = onCircle(circle, ph + circle.w * d, clock + d, rm);
          return { x: e.x, s: e.s, y: e.y };
        };
        let dur = passDuration(a, over, a);
        dur = passDuration(a, over, at(dur));
        pass = { start: clock, dur, a, b: at(dur) };
      }
      if (pass && clock - pass.start >= pass.dur) pass = null;

      const f = pass ? passAt(pass.a, over, pass.b, (clock - pass.start) / pass.dur) : onCircle(circle, ph, clock, rm);
      const x = f.x;
      const z = rimZ(f.x) + f.s;
      // Never below the ground (the circle and the pass stay over the canyon; a guard all the same).
      const y = Math.max(rimY + f.y, env.heightAt(x, z) + 3);
      bird.begin(dt);
      // Its couple of lazy strokes (./condor-blanco/logic.ts onCircle: 1.8 s every 37 s, never in a pass).
      bird.set(0, { x, y, z, yaw: f.yaw, bank: f.bank, flap: !pass && !rm && clock % 37 < 1.8 });
      bird.update(dt, t, env.camera);
      body0.x = x;
      body0.z = z;

      if (!stamped) {
        const d = Math.hypot(x - avatar.x, y - avatar.y, z - avatar.z);
        ndc.set(x, y, z).project(env.camera);
        const onScreen = ndc.z < 1 && Math.abs(ndc.x) < 0.92 && Math.abs(ndc.y) < 0.92;
        seen = lookStep(seen, dt, d, onScreen);
        if (seen >= LOOK.hold) {
          stamped = true;
          emit("world:stamp", { id: STAMP, kind: "egg", label: LABEL });
        }
      }
    },
    dispose() {
      creatures.remove(body0);
      bird.dispose();
    },
  };
};
