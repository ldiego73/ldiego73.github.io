import * as THREE from "three";
import type { Avatar, CreateAvatar, WorldEnv } from "./contract";
import { on } from "./events";
import { C, canvasTex, DYE, toonMapped } from "./props";

/**
 * Generic Andean traveler (not a real person): chullo with ear flaps and pompom, poncho with khipu dye
 * stripes, backpack with a laptop edge peeking out, boots. Chunky, Messenger-like proportions.
 * Origin at the feet, facing +Z (core sets group.rotation.y = yaw). About 1.6 units tall.
 * All motion is procedural: idle breathing + look-around, walk/run cycles, jump, landing squash, dust.
 * Riding (`world:mount`): legs straddle the saddle, hands on the reins, no walk cycle, a light bob with speed.
 */

const SKIN = "#b9764a";
const PANTS = "#2f3557";
const BOOT = "#4a2e1c";
const SWEATER = "#7a2f35";
const PACK = "#6b4a2b";

function ponchoTexture() {
  return canvasTex(256, 128, (ctx, w, h) => {
    ctx.fillStyle = "#e9dcc4";
    ctx.fillRect(0, 0, w, h);
    // Khipu dye bands, top (v=1) at the shoulders → bottom hem.
    const bands: Array<[number, string, number]> = [
      [0.12, DYE.red, 10],
      [0.24, DYE.ochre, 5],
      [0.55, DYE.indigo, 12],
      [0.7, DYE.turq, 5],
      [0.8, DYE.red, 7],
      [0.9, DYE.indigo, 12],
    ];
    for (const [y, c, th] of bands) {
      ctx.fillStyle = c;
      ctx.fillRect(0, y * h, w, th);
    }
    // Knot-like diamonds between the bands (pallay motif).
    ctx.fillStyle = "#2b2140";
    for (let x = 10; x < w; x += 21) {
      const y = 0.42 * h;
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 7);
      ctx.lineTo(x - 6, y);
      ctx.fill();
    }
    ctx.fillStyle = DYE.ochre;
    for (let x = 10; x < w; x += 21) ctx.fillRect(x - 2, 0.42 * h - 2, 4, 4);
  });
}

function chulloTexture() {
  return canvasTex(128, 64, (ctx, w, h) => {
    ctx.fillStyle = DYE.red;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = C.cotton;
    ctx.fillRect(0, h * 0.62, w, 6);
    ctx.fillRect(0, h * 0.3, w, 3);
    ctx.fillStyle = DYE.ochre;
    for (let x = 0; x < w; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, h * 0.62 + 12);
      ctx.lineTo(x + 6, h * 0.62 + 20);
      ctx.lineTo(x + 12, h * 0.62 + 12);
      ctx.fill();
    }
    ctx.fillStyle = DYE.indigo;
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
    ctx.fillStyle = DYE.turq;
    for (let x = 4; x < w; x += 16) ctx.fillRect(x, h * 0.4, 6, 6);
  });
}

/** Tiny critically-damped spring for secondary motion (tassels, pompom, poncho). */
class Spring {
  x = 0;
  v = 0;
  constructor(
    private k = 90,
    private d = 9,
  ) {}
  step(target: number, dt: number) {
    const a = -this.k * (this.x - target) - this.d * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export const createAvatar: CreateAvatar = (env: WorldEnv): Avatar => {
  const group = new THREE.Group();
  group.name = "traveler";
  const geos: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T) => {
    geos.push(x);
    return x;
  };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  };
  const toon = (c: string) => env.toon(c);

  // Rig: rig (bob/squash) → hips → legs; torso → arms, poncho, pack, head.
  const rig = new THREE.Group();
  group.add(rig);

  // ---- Legs (pivot at hip)
  const legGeo = g(new THREE.CapsuleGeometry(0.085, 0.3, 3, 8));
  const bootGeo = g(new THREE.BoxGeometry(0.15, 0.11, 0.24));
  const makeLeg = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.105 * side, 0.56, 0);
    pivot.add(mesh(legGeo, toon(PANTS), 0, -0.24, 0));
    const boot = mesh(bootGeo, toon(BOOT), 0, -0.5, 0.035);
    pivot.add(boot);
    // Sandal strap/sock cuff in cotton.
    pivot.add(mesh(g(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8)), toon(C.cotton), 0, -0.42, 0));
    rig.add(pivot);
    return pivot;
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  // ---- Torso
  const torso = new THREE.Group();
  torso.position.y = 0.56;
  rig.add(torso);
  const chest = mesh(g(new THREE.CylinderGeometry(0.19, 0.17, 0.48, 10)), toon(SWEATER), 0, 0.24, 0);
  torso.add(chest);

  // Poncho: pivot at the shoulders, hangs over the chest; striped cloth.
  const ponchoTex = ponchoTexture();
  ponchoTex.wrapS = THREE.RepeatWrapping;
  ponchoTex.repeat.set(2, 1);
  const ponchoMat = toonMapped(env, ponchoTex);
  owned.push(ponchoMat);
  const ponchoGeo = g(new THREE.CylinderGeometry(0.17, 0.4, 0.46, 12, 1));
  ponchoGeo.translate(0, -0.23, 0);
  // Slightly square the poncho (a cloth rectangle draped over the shoulders).
  {
    const p = ponchoGeo.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setXYZ(i, x * 1.08, p.getY(i), z * 0.86);
    }
    ponchoGeo.computeVertexNormals();
  }
  const poncho = mesh(ponchoGeo, ponchoMat, 0, 0.5, 0);
  torso.add(poncho);
  // Neck opening collar.
  torso.add(mesh(g(new THREE.TorusGeometry(0.11, 0.035, 5, 10)), toon(DYE.indigo), 0, 0.5, 0).rotateX(Math.PI / 2));

  // Arms (pivot at shoulder), sleeves + hands.
  const armGeo = g(new THREE.CapsuleGeometry(0.065, 0.26, 3, 8));
  const handGeo = g(new THREE.SphereGeometry(0.07, 8, 6));
  const makeArm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.25 * side, 0.43, 0);
    pivot.add(mesh(armGeo, toon(SWEATER), 0, -0.17, 0));
    pivot.add(mesh(handGeo, toon(SKIN), 0, -0.36, 0.01));
    torso.add(pivot);
    return pivot;
  };
  const armL = makeArm(1);
  const armR = makeArm(-1);

  // Backpack with a laptop edge peeking out the top.
  const pack = new THREE.Group();
  pack.position.set(0, 0.28, -0.25);
  pack.add(mesh(g(new THREE.BoxGeometry(0.36, 0.38, 0.18)), toon(PACK), 0, 0, 0));
  pack.add(mesh(g(new THREE.BoxGeometry(0.37, 0.12, 0.2)), toon(DYE.ochre), 0, 0.15, 0.005)); // flap
  pack.add(mesh(g(new THREE.BoxGeometry(0.22, 0.12, 0.05)), toon(PACK), 0, -0.07, -0.1)); // pocket
  const laptop = mesh(g(new THREE.BoxGeometry(0.3, 0.22, 0.025)), toon("#3d4046"), 0.01, 0.16, 0.05);
  laptop.rotation.z = -0.06;
  pack.add(laptop);
  const lid = mesh(g(new THREE.BoxGeometry(0.26, 0.015, 0.012)), toon("#9fd7d0"), 0.01, 0.27, 0.064);
  lid.rotation.z = -0.06;
  pack.add(lid);
  // Straps
  for (const s of [-1, 1]) pack.add(mesh(g(new THREE.BoxGeometry(0.045, 0.42, 0.03)), toon(PACK), 0.11 * s, 0.02, 0.1));
  // Bedroll in cotton.
  const roll = mesh(g(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8)), toon(DYE.turq), 0, -0.22, 0.02);
  roll.rotation.z = Math.PI / 2;
  pack.add(roll);
  torso.add(pack);

  // ---- Head
  const head = new THREE.Group();
  head.position.y = 0.6;
  torso.add(head);
  const skull = mesh(g(new THREE.SphereGeometry(0.235, 14, 10)), toon(SKIN), 0, 0.2, 0);
  skull.scale.set(1, 0.98, 0.94);
  head.add(skull);
  const eyeGeo = g(new THREE.SphereGeometry(0.028, 6, 5));
  const eyeL = mesh(eyeGeo, toon(C.ink), 0.085, 0.13, 0.215);
  const eyeR = mesh(eyeGeo, toon(C.ink), -0.085, 0.13, 0.215);
  env.noOutline(eyeL);
  env.noOutline(eyeR);
  eyeL.scale.set(1, 1.3, 0.5);
  eyeR.scale.set(1, 1.3, 0.5);
  head.add(eyeL, eyeR);
  const cheekGeo = g(new THREE.SphereGeometry(0.035, 6, 5));
  for (const s of [-1, 1]) {
    const ck = mesh(cheekGeo, toon("#c4565a"), 0.135 * s, 0.07, 0.19);
    ck.scale.set(1, 0.6, 0.4);
    env.noOutline(ck);
    head.add(ck);
  }
  const nose = mesh(g(new THREE.SphereGeometry(0.035, 6, 5)), toon("#a8653d"), 0, 0.08, 0.235);
  env.noOutline(nose);
  head.add(nose);

  // Chullo: knitted cap + cuff band + ear flaps with tassels + pompom.
  const chulloTex = chulloTexture();
  chulloTex.wrapS = THREE.RepeatWrapping;
  chulloTex.repeat.set(3, 1);
  const chulloMat = toonMapped(env, chulloTex);
  owned.push(chulloMat);
  const capGeo = g(new THREE.SphereGeometry(0.255, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55));
  const cap = mesh(capGeo, chulloMat, 0, 0.25, -0.01);
  cap.scale.set(1.02, 1.12, 1.02);
  head.add(cap);
  // Pointed crown (chullos are a bit conical).
  head.add(mesh(g(new THREE.ConeGeometry(0.13, 0.16, 10)), chulloMat, 0, 0.5, -0.03));
  const pompomPivot = new THREE.Group();
  pompomPivot.position.set(0, 0.56, -0.03);
  pompomPivot.add(mesh(g(new THREE.IcosahedronGeometry(0.07, 0)), toon(DYE.ochre), 0, 0.06, 0));
  head.add(pompomPivot);
  const flapGeo = g(new THREE.BoxGeometry(0.06, 0.18, 0.14));
  const tasselGeo = g(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4));
  const tasselEndGeo = g(new THREE.IcosahedronGeometry(0.035, 0));
  const tassels: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const flap = mesh(flapGeo, chulloMat, 0.235 * s, 0.13, -0.01);
    flap.rotation.z = 0.12 * s;
    head.add(flap);
    const tp = new THREE.Group();
    tp.position.set(0.25 * s, 0.03, -0.01);
    tp.add(mesh(tasselGeo, toon(DYE.indigo), 0, -0.08, 0));
    tp.add(mesh(tasselEndGeo, toon(DYE.red), 0, -0.17, 0));
    head.add(tp);
    tassels.push(tp);
  }

  // ---- Dust puffs (world space, pooled)
  const dustGeo = g(new THREE.IcosahedronGeometry(0.12, 0));
  const dustMat = new THREE.MeshBasicMaterial({ color: "#e9dcc4", transparent: true, opacity: 0.8, depthWrite: false });
  owned.push(dustMat);
  const dust: Array<{ m: THREE.Mesh; life: number; v: THREE.Vector3 }> = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(dustGeo, dustMat);
    m.visible = false;
    env.noOutline(m);
    env.scene.add(m);
    dust.push({ m, life: 0, v: new THREE.Vector3() });
  }
  let dustIdx = 0;
  const wp = new THREE.Vector3();
  const puff = (n: number, spread: number) => {
    if (env.reducedMotion) return;
    group.getWorldPosition(wp);
    for (let i = 0; i < n; i++) {
      const p = dust[dustIdx++ % dust.length]!;
      const a = Math.random() * Math.PI * 2;
      p.m.position.set(wp.x + Math.cos(a) * 0.15, wp.y + 0.05, wp.z + Math.sin(a) * 0.15);
      p.v.set(Math.cos(a) * spread, 0.5 + Math.random() * 0.4, Math.sin(a) * spread);
      p.life = 1;
      p.m.visible = true;
      p.m.scale.setScalar(0.5);
    }
  };

  // ---- Animation state
  let phase = 0;
  let walkW = 0;
  let runW = 0;
  let airW = 0;
  let squash = 0;
  let wasGrounded = true;
  let lastSin = 0;
  let headYaw = 0;
  let headTarget = 0;
  let lookTimer = 2;
  let prevSpeed = 0;
  const ponchoSpring = new Spring(60, 8);
  const tasselSpring = new Spring(50, 5);
  const pompomSpring = new Spring(80, 6);
  const rm = env.reducedMotion;
  const damp = (cur: number, target: number, rate: number, dt: number) =>
    cur + (target - cur) * (1 - Math.exp(-rate * dt));
  // Riding pose (llama mount): blended in with rideW so mounting never snaps.
  let riding = false;
  let rideW = 0;
  let ridePhase = 0;
  const offMount = on("world:mount", (d) => {
    riding = !!d?.riding;
  });

  const avatar: Avatar = {
    group,
    update(dt, s) {
      dt = Math.min(dt, 0.05);
      const sp = Math.max(0, s.speed);
      rideW = damp(rideW, riding ? 1 : 0, 9, dt);
      const onFoot = rideW < 0.5;
      walkW = damp(walkW, onFoot ? Math.min(1, sp / 2.2) : 0, 10, dt);
      runW = damp(runW, onFoot && s.running && sp > 1 ? Math.min(1, (sp - 2.5) / 2.5 + 0.4) : 0, 8, dt);
      airW = damp(airW, s.grounded ? 0 : 1, 14, dt);
      const accel = (sp - prevSpeed) / Math.max(dt, 1e-3);
      prevSpeed = sp;

      if (s.grounded && onFoot) phase += dt * (sp / (1.25 + runW * 0.55)) * Math.PI;
      const sw = Math.sin(phase);
      const legAmp = (0.6 * walkW + 0.35 * runW) * (1 - airW);
      const armAmp = (0.45 * walkW + 0.55 * runW) * (1 - airW);

      legL.rotation.x = sw * legAmp + airW * -0.65;
      legR.rotation.x = -sw * legAmp + airW * 0.35;
      armL.rotation.x = -sw * armAmp + airW * -0.3;
      armR.rotation.x = sw * armAmp + airW * -0.3;
      armL.rotation.z = 0.12 + runW * 0.25 + airW * 0.9;
      armR.rotation.z = -0.12 - runW * 0.25 - airW * 0.9;

      // Bob, lean, breathing, landing squash.
      const bob = Math.abs(Math.cos(phase)) * (0.045 * walkW + 0.05 * runW) * (1 - airW);
      const idle = 1 - walkW;
      const breathe = rm ? 0 : Math.sin(s.t * 2.1) * 0.018 * idle;
      squash = damp(squash, 0, 9, dt);
      rig.position.y = bob - squash * 0.08;
      rig.scale.set(1 + squash * 0.12, 1 - squash * 0.14 + breathe * 0.5, 1 + squash * 0.12);
      chest.scale.set(1 + breathe, 1 + breathe, 1 + breathe);
      torso.rotation.x = 0.07 * walkW + 0.16 * runW - airW * 0.08;
      torso.rotation.y = sw * 0.07 * walkW;
      torso.rotation.z = Math.cos(phase) * 0.025 * walkW;

      // Idle look-around: head glances to random targets.
      if (!rm) {
        lookTimer -= dt;
        if (lookTimer <= 0) {
          headTarget = idle > 0.7 ? (Math.random() - 0.5) * 1.1 : 0;
          lookTimer = 1.8 + Math.random() * 3;
        }
      }
      headYaw = damp(headYaw, walkW > 0.4 ? 0 : headTarget, 4, dt);
      head.rotation.y = headYaw;
      head.rotation.x = -torso.rotation.x * 0.6 + Math.sin(s.t * 2.1) * 0.02 * idle;

      // Secondary motion: poncho trails behind, tassels swing, pompom wobbles.
      const amp = rm ? 0.4 : 1;
      const pTarget = -(0.12 * walkW + 0.22 * runW) - THREE.MathUtils.clamp(accel * 0.02, -0.15, 0.15) + airW * 0.25;
      poncho.rotation.x = ponchoSpring.step(pTarget * amp, dt);
      poncho.rotation.z = Math.cos(phase) * 0.05 * walkW * amp;
      const tTarget = -(0.3 * walkW + 0.5 * runW) + airW * 0.6 + Math.sin(phase * 2) * 0.12 * walkW;
      const tx = tasselSpring.step(tTarget * amp, dt);
      for (const tp of tassels) {
        tp.rotation.x = tx;
        tp.rotation.z = Math.sin(phase + tp.position.x) * 0.15 * walkW * amp;
      }
      pompomPivot.rotation.x = pompomSpring.step((-0.3 * walkW - 0.5 * runW + airW * 0.5 - bob * 4) * amp, dt);

      // Seated on the llama: legs straddle the saddle, hands hold the reins, bob with the trot.
      if (rideW > 0.001) {
        const k = rideW;
        const mix = (a: number, b: number) => a + (b - a) * k;
        ridePhase += dt * (2.4 + sp * 1.1) * Math.PI;
        const rb = rm ? 0 : Math.abs(Math.sin(ridePhase)) * Math.min(1, sp / 4) * 0.045;
        legL.rotation.x = mix(legL.rotation.x, -0.55);
        legR.rotation.x = mix(legR.rotation.x, -0.55);
        legL.rotation.z = 0.62 * k;
        legR.rotation.z = -0.62 * k;
        armL.rotation.x = mix(armL.rotation.x, -0.75);
        armR.rotation.x = mix(armR.rotation.x, -0.75);
        armL.rotation.z = mix(armL.rotation.z, -0.18);
        armR.rotation.z = mix(armR.rotation.z, 0.18);
        rig.position.y = mix(rig.position.y, rb);
        torso.rotation.x = mix(torso.rotation.x, 0.06 + Math.min(1, sp / 6) * 0.1);
        torso.rotation.y *= 1 - k;
        torso.rotation.z = mix(torso.rotation.z, rm ? 0 : Math.sin(ridePhase * 0.5) * 0.03 * Math.min(1, sp / 4));
      } else {
        legL.rotation.z = 0;
        legR.rotation.z = 0;
      }

      // Dust: footfalls while running, and a puff on landing.
      if (s.grounded && onFoot && runW > 0.3 && Math.sign(sw) !== Math.sign(lastSin)) puff(2, 0.6);
      if (s.grounded && !wasGrounded && onFoot) {
        squash = rm ? 0 : 1;
        puff(6, 1.2);
      }
      if (!s.grounded && wasGrounded) squash = -0.4;
      lastSin = sw;
      wasGrounded = s.grounded;

      for (const p of dust) {
        if (p.life <= 0) continue;
        p.life -= dt * 1.6;
        p.m.position.addScaledVector(p.v, dt);
        p.v.multiplyScalar(1 - dt * 2.5);
        p.m.scale.setScalar(0.5 + (1 - p.life) * 1.1);
        dustMat.opacity = 0.75;
        if (p.life <= 0) p.m.visible = false;
      }
    },
    dispose() {
      offMount();
      for (const p of dust) p.m.removeFromParent();
      for (const x of geos) x.dispose();
      ponchoTex.dispose();
      chulloTex.dispose();
      for (const m of owned) m.dispose();
      group.removeFromParent();
    },
  };
  return avatar;
};
