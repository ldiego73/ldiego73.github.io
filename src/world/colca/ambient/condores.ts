/**
 * Andean condors riding the thermals up from the Colca canyon: big, slow circles over the canyon near the
 * rim, drifting through the air from well below the rim to above it (./condores/logic.ts). In the early
 * morning two of them come to the thermal right in front of the Cruz del Cóndor and pass close by the
 * viewpoint, as they do there. They go down to roost at dusk and are not out at night.
 *
 * Passport: a good look (a condor within 45 u of the traveler, by day) stamps `colca:fauna:condor`.
 * Rendering: ./condores/model.ts, three instanced draw calls. Bodies are registered in creatures (never solid).
 */

import { CATALOG } from "../../../lib/passport";
import type { CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { emit } from "../../events";
import type { SuyuEnv } from "../../suyu/contract";
import type { ColcaLayout } from "../layout";
import { CANYON, rimZ } from "../plan";
import { flying, onThermal, type Thermal, thermalFor } from "./condores/logic";
import { CondorFlock } from "./condores/model";

const STAMP = "colca:fauna:condor";

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SuyuEnv;
  const layout = env.suyu.layout as ColcaLayout;
  const n = env.quality === "high" ? 6 : 4;
  const flock = new CondorFlock("colca-condors", n, 0.95);
  env.scene.add(flock.group);
  const bodies = Array.from({ length: n }, () => creatures.add("condor", 1.2, { solid: false, x: 1e5, z: 1e5 }));
  // Each bird blends toward its current thermal (smoothly, when the morning moves two of them).
  const cur: Thermal[] = Array.from({ length: n }, (_, i) => ({ ...thermalFor(i, 0.4, layout.cruz.x) }));
  const rimY = CANYON.rimY;
  let clock = Math.random() * 500;
  let stamped = false;
  return {
    update(dt, avatar) {
      clock += env.reducedMotion ? dt * 0.5 : dt;
      const time = env.sky.time();
      const out = !flying(time);
      for (let i = 0; i < n; i++) {
        const body = bodies[i];
        if (out) {
          flock.hide(i);
          if (body) {
            body.x = 1e5;
            body.z = 1e5;
          }
          continue;
        }
        const want = thermalFor(i, time, layout.cruz.x);
        const c = cur[i] as Thermal;
        const k = Math.min(1, dt * 0.08);
        c.x += (want.x - c.x) * k;
        c.s += (want.s - c.s) * k;
        c.r += (want.r - c.r) * k;
        c.y0 += (want.y0 - c.y0) * k;
        c.y1 += (want.y1 - c.y1) * k;
        c.w = want.w;
        const p = onThermal(c, clock, i);
        const z = rimZ(p.x) + p.s;
        const y = rimY + p.y;
        flock.set(i, { x: p.x, y, z, yaw: p.yaw, bank: p.bank, pitch: 0, wing: p.wing });
        if (body) {
          body.x = p.x;
          body.z = z;
        }
        if (!stamped && Math.hypot(p.x - avatar.x, y - avatar.y, z - avatar.z) < 45) {
          stamped = true;
          const entry = CATALOG.find((s) => s.id === STAMP);
          if (entry) emit("world:stamp", { id: STAMP, kind: "fauna", label: entry.label });
        }
      }
      flock.commit();
    },
    dispose() {
      for (const b of bodies) creatures.remove(b);
      flock.dispose();
    },
  };
};
