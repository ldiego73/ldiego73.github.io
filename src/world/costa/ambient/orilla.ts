/**
 * Life on the rocks and the sand: South American sea lions hauled out on the rocks at the foot of the headland
 * (some lying, some with heads raised) and a few swimming round them, riding the swell; Humboldt penguins on the
 * rocky point off the Paracas station, shifting about; ghost crabs by their burrows near the waterline of the
 * beaches, scuttling sideways into the sea and vanishing into the sand when the traveler comes close, and
 * coming back out once they have gone (./fauna/logic.ts).
 *
 * Passport (bonus): `costa:fauna:lobo-marino` within LION_R of a sea lion, `costa:fauna:pinguino` within
 * PENGUIN_R of a penguin, `costa:fauna:cangrejo` within CRAB_R of a crab (you have to get close). Field guide:
 * ../wildlife.ts. Reduced motion: no breathing, swimming circles or waddling (crabs still hide, without
 * running). Draw calls: lying and raised sea lions, swimmers, penguins, crabs (one instanced mesh each).
 */
import * as THREE from "three";
import { CATALOG } from "../../../lib/passport";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { emit } from "../../events";
import { vertexToon } from "../../merge-colors";
import { paintStrength } from "../../style-gl";
import type { SuyuEnv } from "../../suyu/contract";
import type { CostaLayout } from "../layout";
import { BEACHES, COMPANY_STOPS, MARKET } from "../plan";
import { seaHeight } from "../scenery/waves";
import { type Crab, prng, seen, stepCrab } from "./fauna/logic";
import { crab, penguin, seaLionLying, seaLionSwim, seaLionUp } from "./fauna/models";

const LION_R = 45;
const PENGUIN_R = 40;
const CRAB_R = 7;

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const L = env.suyu.layout as CostaLayout;
  const rm = env.reducedMotion;
  const R = prng(0x0411a);
  // Animals: no world-space paint sliding over moving bodies.
  const mat = paintStrength(vertexToon(), 0);
  const root = new THREE.Group();
  root.name = "costa-orilla";
  env.scene.add(root);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const dummy = new THREE.Object3D();

  /** Points on an islet's top (above `minY`), seeded. */
  const onRock = (id: string, n: number, minY: number) => {
    const it = L.islets.find((i) => i.id === id);
    const out: Array<{ x: number; y: number; z: number; yaw: number }> = [];
    if (!it) return out;
    for (let k = 0; k < n * 40 && out.length < n; k++) {
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * it.r * 0.8;
      const x = it.x + Math.cos(a) * r;
      const z = it.z + Math.sin(a) * r;
      const y = L.heightAt(x, z);
      if (y < minY) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 1.4)) continue;
      out.push({ x, y, z, yaw: R() * Math.PI * 2 });
    }
    return out;
  };
  const inst = (geo: THREE.BufferGeometry, n: number, name: string) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    m.name = name;
    m.count = n;
    m.castShadow = true;
    m.frustumCulled = false;
    root.add(m);
    return m;
  };

  // ------------------------------------------------------------------ sea lions
  const lions = [...onRock("lobos-1", 8, 0.5), ...onRock("lobos-2", 5, 0.5)];
  const upIdx = new Set([1, 4, 9]);
  const lying = lions.filter((_, i) => !upIdx.has(i));
  const raised = lions.filter((_, i) => upIdx.has(i));
  const lyingGeo = seaLionLying();
  const upGeo = seaLionUp();
  const swimGeo = seaLionSwim();
  const lyingMesh = inst(lyingGeo, lying.length, "costa-orilla:lions");
  const upMesh = inst(upGeo, raised.length, "costa-orilla:lions-up");
  const place = (mesh: THREE.InstancedMesh, list: typeof lions) => {
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p.yaw);
      m4.compose(new THREE.Vector3(p.x, p.y - 0.05, p.z), q, one);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  place(lyingMesh, lying);
  place(upMesh, raised);
  // Bodies for the soundscape's barks (on their rocks: never in anyone's way).
  const lionBodies = lions.map((p) => creatures.add("lobo-marino", 0.6, { solid: false, x: p.x, z: p.z }));
  const rocks = L.islets.filter((i) => i.id.startsWith("lobos"));
  const swimmers = Array.from({ length: 3 }, (_, i) => {
    const it = rocks[i % Math.max(1, rocks.length)];
    return { cx: it?.x ?? 0, cz: it?.z ?? 0, r: (it?.r ?? 5) + 4 + i * 2, w: 0.12 + i * 0.03, ph: i * 2.1 };
  });
  const swimMesh = inst(swimGeo, swimmers.length, "costa-orilla:swimmers");

  // ------------------------------------------------------------------ penguins
  const pens = onRock("pinguinos", 14, 0.9);
  const penGeo = penguin();
  const penMesh = inst(penGeo, pens.length, "costa-orilla:penguins");

  // ------------------------------------------------------------------ ghost crabs on the beaches
  const beachAt = (t: number) => {
    const bp = L.beachPoint(t);
    const dsx = L.shoreX(bp.z + 2) - L.shoreX(bp.z - 2);
    const l = Math.hypot(4, dsx) || 1;
    return { x: bp.x, z: bp.z, nx: -4 / l, nz: dsx / l };
  };
  const paracas = COMPANY_STOPS.find((s) => s.culture === "paracas");
  const groups = [beachAt(BEACHES.south - 0.012), beachAt(BEACHES.north + 0.006), beachAt(MARKET.t + 0.02)];
  if (paracas) groups.push(beachAt(paracas.t - 0.012));
  let crabs: Crab[] = [];
  for (const g of groups)
    for (let k = 0; k < 6; k++) {
      const along = (R() - 0.5) * 16;
      const back = 2.5 + R() * 4;
      const hx = g.x - g.nx * back + -g.nz * along;
      const hz = g.z - g.nz * back + g.nx * along;
      crabs.push({
        hx,
        hz,
        wx: g.x + g.nx * 1.2 + -g.nz * along,
        wz: g.z + g.nz * 1.2 + g.nx * along,
        x: hx,
        z: hz,
        state: "idle",
        timer: 0,
      });
    }
  const crabGeo = crab();
  const crabMesh = inst(crabGeo, crabs.length, "costa-orilla:crabs");
  crabMesh.castShadow = false;

  // ------------------------------------------------------------------ stamps
  const stamp = (id: string) => {
    const e = CATALOG.find((c) => c.id === id);
    if (e) emit("world:stamp", { id: e.id, kind: e.kind, label: e.label });
  };
  const done = new Set<string>();
  let clock = 0;
  let check = 0;

  return {
    update(dtIn, avatar, t) {
      const dt = Math.min(dtIn, 0.05);
      clock += dt;
      const tt = rm ? 0 : t;
      // Sea lions breathe; raised heads sway.
      if (!rm) {
        const k = 1 + Math.sin(clock * 1.3) * 0.015;
        lying.forEach((p, i) => {
          q.setFromAxisAngle(up, p.yaw);
          m4.compose(dummy.position.set(p.x, p.y - 0.05, p.z), q, dummy.scale.set(1, k + (i % 3) * 0.004, 1));
          lyingMesh.setMatrixAt(i, m4);
        });
        lyingMesh.instanceMatrix.needsUpdate = true;
        raised.forEach((p, i) => {
          q.setFromAxisAngle(up, p.yaw + Math.sin(clock * 0.5 + i) * 0.35);
          m4.compose(dummy.position.set(p.x, p.y - 0.05, p.z), q, one);
          upMesh.setMatrixAt(i, m4);
        });
        upMesh.instanceMatrix.needsUpdate = true;
      }
      swimmers.forEach((s, i) => {
        const a = s.ph + tt * s.w;
        const x = s.cx + Math.cos(a) * s.r;
        const z = s.cz + Math.sin(a) * s.r;
        const y = seaHeight(x, z, L.shoreX(z) - x, tt);
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        swimMesh.setMatrixAt(i, dummy.matrix);
      });
      swimMesh.instanceMatrix.needsUpdate = true;
      // Penguins shift about.
      pens.forEach((p, i) => {
        const yaw = p.yaw + (rm ? 0 : Math.sin(clock * 0.6 + i * 1.3) * 0.5);
        const waddle = rm ? 0 : Math.sin(clock * 6 + i) * 0.06 * (i % 4 === 0 ? 1 : 0.2);
        dummy.position.set(p.x, p.y - 0.03, p.z);
        dummy.rotation.set(0, yaw, waddle);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        penMesh.setMatrixAt(i, dummy.matrix);
      });
      penMesh.instanceMatrix.needsUpdate = true;
      // Crabs.
      crabs = crabs.map((c) => {
        const n = stepCrab(c, avatar.x, avatar.z, dt);
        return rm && n.state === "run" ? { ...n, x: n.wx, z: n.wz, state: "hidden", timer: 7 } : n;
      });
      crabs.forEach((c, i) => {
        if (c.state === "hidden") {
          dummy.scale.setScalar(0);
        } else {
          dummy.scale.setScalar(1.3);
        }
        dummy.position.set(c.x, L.heightAt(c.x, c.z), c.z);
        // Ghost crabs run sideways: their body across the way they go.
        const dir = Math.atan2(c.wx - c.hx, c.wz - c.hz) + Math.PI / 2;
        dummy.rotation.set(0, dir, 0);
        dummy.updateMatrix();
        crabMesh.setMatrixAt(i, dummy.matrix);
      });
      crabMesh.instanceMatrix.needsUpdate = true;

      // Bonus stamps.
      check += dt;
      if (check > 0.3) {
        check = 0;
        if (!done.has("lobo") && seen(lions, avatar.x, avatar.z, LION_R)) {
          done.add("lobo");
          stamp("costa:fauna:lobo-marino");
        }
        if (!done.has("pinguino") && seen(pens, avatar.x, avatar.z, PENGUIN_R)) {
          done.add("pinguino");
          stamp("costa:fauna:pinguino");
        }
        if (
          !done.has("cangrejo") &&
          seen(
            crabs.filter((c) => c.state !== "hidden"),
            avatar.x,
            avatar.z,
            CRAB_R,
          )
        ) {
          done.add("cangrejo");
          stamp("costa:fauna:cangrejo");
        }
      }
    },
    dispose() {
      for (const b of lionBodies) creatures.remove(b);
      root.removeFromParent();
      for (const g of [lyingGeo, upGeo, swimGeo, penGeo, crabGeo]) g.dispose();
      mat.dispose();
    },
  };
};
