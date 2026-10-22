/**
 * Saddled llama for the trailhead ride and the lake road: the shared animal "llama" (the approved one-surface
 * llama from ../../characters/animals/: woolly barrel and neck, banana ears with yarn t'ikas, big lashed eyes)
 * dressed with a woven Andean blanket (canvas-striped aguayo) with side drapes, a saddle pad with cinch, a
 * dyed collar and yarn tassels along the blanket hem. Faces +Z, origin at the feet.
 *
 * Its gait is the llama's own (lateral walk, then the pace), driven by the ground speed. Two ways to drive it:
 *  - `animate(frame)` (./llama.ts on the road mount, ./ride.ts): speed and head look given each frame;
 *  - the legacy pivots (`body`, `legs`, `neck`, `head`, `tail`, `tassels`) that ../llama-mount.ts poses:
 *    when nobody calls `animate`, the model reads its own ground speed from how far its group moved between
 *    renders and its head look from `neck.rotation.y`, and poses itself just before three updates the
 *    matrices (so the colour pass, the ink prepass and the shadows all see the same pose). The tassels are
 *    real (that module swings them in the wind); the other pivots are placeholders.
 */
import * as THREE from "three";
import type { WorldEnv } from "../../contract";
import { DYE } from "../../palette";
import { canvasTex, toonMapped } from "../../props";
import { mountAnimal } from "./animal";
import type { MountFrame } from "./gait";

/** Blanket top above the feet (the new llama's back, ../../characters/animals/species/camelids.ts). */
const BACK = 1.15;
/** Saddle top above the feet; the rider's feet sit this high (hip pivot 0.56 → hips on the pad). */
export const SEAT_HEIGHT = BACK + 0.09 - 0.56;

export interface LlamaModel {
  group: THREE.Group;
  /** Bob/sway node (placeholder: the gait moves the body). */
  body: THREE.Group;
  /** Front-left, front-right, back-left, back-right hip pivots (placeholders). */
  legs: THREE.Group[];
  neck: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group;
  /** Hanging tassels (swing with the trot). */
  tassels: THREE.Group[];
  /** Pose for this frame (the road mount); without it the model drives itself from its motion. */
  animate(f: MountFrame): void;
  dispose(): void;
}

function blanketTexture() {
  return canvasTex(256, 128, (ctx, w, h) => {
    // Warp-faced aguayo: broad dye bands with thin pallay rows of diamonds between them.
    const bands: Array<[string, number]> = [
      [DYE.red, 0.18],
      [DYE.ochre, 0.06],
      [DYE.indigo, 0.14],
      [DYE.cotton, 0.06],
      [DYE.turq, 0.12],
      [DYE.cotton, 0.06],
      [DYE.indigo, 0.14],
      [DYE.ochre, 0.06],
      [DYE.red, 0.18],
    ];
    let y = 0;
    for (const [c, f] of bands) {
      ctx.fillStyle = c;
      ctx.fillRect(0, y * h, w, f * h + 1);
      y += f;
    }
    ctx.fillStyle = "#2b2140";
    for (const row of [0.27, 0.73]) {
      for (let x = 8; x < w; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, row * h - 5);
        ctx.lineTo(x + 5, row * h);
        ctx.lineTo(x, row * h + 5);
        ctx.lineTo(x - 5, row * h);
        ctx.fill();
      }
    }
    ctx.fillStyle = DYE.ochre;
    for (let x = 0; x < w; x += 10) ctx.fillRect(x, 0.5 * h - 2, 5, 4);
  });
}

export function buildSaddledLlama(env: WorldEnv): LlamaModel {
  const m = mountAnimal("llama", { variant: "white", seed: 3, features: { tika: true, pack: false } });
  const group = m.group;
  group.name = "ride-llama";
  const toon = (c: string) => env.toon(c);
  const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const r = m.rest;
  const bz = r.body?.z ?? -0.04;

  // ---- Blanket over the back with side drapes (textured: kept apart from the merged tack), pad and cinch.
  const body = m.tack("body");
  const tex = blanketTexture();
  const cloth = toonMapped(env, tex);
  const bw = 0.56;
  const bl = 0.56;
  const blanketGroup = new THREE.Group();
  body.add(blanketGroup);
  part(blanketGroup, m.own(new THREE.BoxGeometry(bw, 0.045, bl)), cloth, 0, BACK, bz);
  const drapeH = 0.3;
  const drapeGeo = m.own(new THREE.BoxGeometry(0.04, drapeH, bl));
  for (const s of [-1, 1]) {
    const d = part(blanketGroup, drapeGeo, cloth, s * (bw / 2 - 0.01), BACK - drapeH / 2 + 0.02, bz);
    d.rotation.z = s * 0.16;
  }
  part(body, m.own(new THREE.BoxGeometry(bw * 0.62, 0.07, bl * 0.5)), toon("#6b3a2a"), 0, BACK + 0.055, bz - 0.02);
  part(body, m.own(new THREE.CylinderGeometry(0.03, 0.04, 0.1, 6)), toon("#4a2e1c"), 0, BACK + 0.12, bz + bl * 0.2);
  const cinch = part(
    body,
    m.own(new THREE.TorusGeometry(0.29, 0.025, 4, 16, Math.PI)),
    toon(DYE.indigo),
    0,
    (r.body?.y ?? 0.85) + 0.02,
    bz + 0.08,
  );
  cinch.rotation.set(0, Math.PI / 2, Math.PI);
  cinch.scale.set(1, 1.02, 0.95);

  // ---- Collar with a dyed band at the neck base.
  const neck0 = m.tack("neck0");
  const n0 = r.neck0 ?? new THREE.Vector3(0, 0.97, 0.37);
  const collar = part(
    neck0,
    m.own(new THREE.TorusGeometry(0.15, 0.03, 5, 12)),
    toon(DYE.red),
    n0.x,
    n0.y + 0.04,
    n0.z + 0.03,
  );
  collar.rotation.x = Math.PI / 2 - 0.5;

  // ---- Tassels along both drape hems (cord + yarn ball), alternating dyes.
  const tCord = m.own(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 4));
  tCord.translate(0, -0.05, 0);
  const tBall = m.own(new THREE.IcosahedronGeometry(0.03, 0));
  tBall.translate(0, -0.11, 0);
  const dyes = [DYE.red, DYE.ochre, DYE.turq, DYE.indigo];
  const tassels: THREE.Group[] = [];
  let k = 0;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const tg = new THREE.Group();
      const z = bz - bl / 2 + 0.04 + (i / 4) * (bl - 0.08);
      tg.position.set(s * (bw / 2 + 0.035), BACK - drapeH + 0.03, z);
      part(tg, tCord, toon(DYE.cotton));
      part(tg, tBall, toon(dyes[k++ % dyes.length] as string));
      body.add(tg);
      tassels.push(tg);
    }
  }
  m.flatten();
  for (const t of tassels) m.merge(t);

  // ---- Legacy pivots (../llama-mount.ts writes them; see the header).
  const proxy = () => {
    const p = new THREE.Group();
    group.add(p);
    return p;
  };
  const pBody = proxy();
  const legs = [proxy(), proxy(), proxy(), proxy()];
  const neck = proxy();
  const head = proxy();
  const tail = proxy();

  // Self-driven mode: pose from the group's own motion just before three updates the matrices.
  let driven = false;
  let lastT = -1;
  const lastPos = new THREE.Vector3();
  const pos = new THREE.Vector3();
  let clock = 0;
  const update = group.updateMatrixWorld.bind(group);
  group.updateMatrixWorld = (force?: boolean) => {
    if (!driven) {
      const now = performance.now() / 1000;
      const dt = lastT < 0 ? 0 : Math.min(0.1, now - lastT);
      if (dt > 0.001 || lastT < 0) {
        pos.copy(group.position);
        const sp = dt > 0 ? Math.hypot(pos.x - lastPos.x, pos.z - lastPos.z) / dt : 0;
        lastPos.copy(pos);
        lastT = now;
        clock += dt;
        m.update(dt, clock, { speed: sp > 30 ? 0 : sp, look: neck.rotation.y / 0.6, rm: env.reducedMotion });
      }
    }
    update(force);
  };

  return {
    group,
    body: pBody,
    legs,
    neck,
    head,
    tail,
    tassels,
    animate(f) {
      driven = true;
      m.update(f.dt, f.t, { speed: f.speed, look: f.look, rm: f.rm });
    },
    dispose() {
      m.dispose();
      tex.dispose();
      cloth.dispose();
    },
  };
}
