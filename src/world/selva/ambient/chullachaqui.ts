/**
 * Easter egg of the Antisuyu road: the Chullachaqui, the Amazonian forest spirit with one foot unlike the
 * other (one human, one hoof) who takes familiar shapes and leads walkers astray. Here he is friendly.
 *
 * Between the palafitos and the floating arcade (road t ≈ 0.64–0.72, the forest side, away from the river),
 * a trail of mismatched prints (a bare foot, a cloven hoof, alternating; raised rims and dark pits, no ink)
 * crosses half the road, passes a freshly snapped branch on the verge and leaves into the trees along a
 * short walkable side path, ending in a small clearing. There, half hidden among arching roots in front of a
 * mossy log, the Chullachaqui stands with his back to the road, peeking over his shoulder now and then.
 * When the traveler comes near he turns and says a mischievous quip; "E · Hablar" gets a short folk line
 * (don't follow strangers' footprints in the forest), stamps `selva:egg:chullachaqui`, and he vanishes in a puff of
 * leaves (under prefers-reduced-motion: a plain fade). The prints fade after him. If the traveler walks far
 * away and comes back, he is there again with fresh prints (the stamp is only given once by the passport).
 *
 * Placement is chosen at runtime (./chullachaqui/logic.ts pickSite) against the trunk colliders the scenery
 * registered, because the seeded forest differs per quality tier. The side path and the clearing are added
 * with `env.addWalkable` (there is no removal API: they stay for the page's life, harmless open floor).
 * Undergrowth instances (shrubs, ferns, heliconias) standing on the path or in the clearing are hidden by
 * zero-scaling them in the scenery's instanced meshes (restored on dispose), so the prints stay readable.
 * Draws: prints (1), roots + log (1), branch (1), spirit (1; a transparent twin without ink for the vanish)
 * and the leaf puff (1 instanced, only while it plays).
 */
import "../../ambient/people/people.css";
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures, park } from "../../creatures";
import { emit } from "../../events";
import { vertexToon } from "../../merge-colors";
import { paintStrength } from "../../style-gl";
import type { SelvaEnv } from "../contract";
import { ride } from "../ride";
import { mudPatches } from "../scenery/ground";
import {
  CLEAR_R,
  canTalk,
  figureFade,
  newSpirit,
  PATH_HALF,
  pathPoints,
  pickSite,
  placePrints,
  type RoadFrame,
  talk,
  tick,
} from "./chullachaqui/logic";
import {
  branchGeometry,
  leafGeometry,
  printsGeometry,
  rootsGeometry,
  SPIRIT_TOP,
  spiritGeometry,
} from "./chullachaqui/model";

const STAMP = {
  id: "selva:egg:chullachaqui",
  kind: "egg" as const,
  label: { es: "Chullachaqui", en: "Chullachaqui" },
};
const T_TALK = { es: "E · Hablar", en: "E · Talk" } as const;
const QUIP = {
  es: "¡Jijiji! ¿Me venías siguiendo, caminante?",
  en: "Hee hee! Were you following me, walker?",
} as const;
const LINES = [
  {
    es: "Soy el Chullachaqui. Un consejo: nunca sigas huellas de desconocidos en el monte… y si un amigo te llama desde los árboles, mírale primero los pies.",
    en: "I'm the Chullachaqui. A word of advice: never follow a stranger's footprints in the forest… and if a friend calls you from the trees, look at their feet first.",
  },
  {
    es: "¿Otra vez tú? Cuida el monte y el monte te cuida. Y no le cuentes a nadie dónde vivo. ¡Jijiji!",
    en: "You again? Look after the forest and the forest looks after you. And don't tell anyone where I live. Hee hee!",
  },
] as const;

/** Beyond this distance from the clearing nothing runs (most of the road). */
const AWAKE_R = 60;
/** Undergrowth species cleared off the path and out of the clearing (the scenery's instanced mesh names). */
const UNDER = new Set(["selva-shrub", "selva-fern", "selva-heliconia"]);
/** Leaves in the vanishing puff and their flight time (s). */
const LEAVES = 26;
const PUFF_TIME = 1.6;
/** Lift above the ground for the print rims (the pits sit 0.008 higher): clear of the terrain triangles. */
const PRINT_LIFT = 0.035;
/** The road ribbon sits this far above the centerline height (scenery/ground.ts buildRoad). */
const ROAD_LIFT = 0.07;

export const create: CreateAmbient = (baseEnv, hudRoot): Ambient => {
  const env = baseEnv as SelvaEnv;
  const S = env.selva;
  const L = S.layout;
  const hw = env.trail.halfWidth;

  // ------------------------------------------------------------ site
  const frameAt = (t: number): RoadFrame => {
    const p = env.trail.pointAt(t);
    const tg = env.trail.tangentAt(t).setY(0).normalize();
    return { px: p.x, pz: p.z, tx: tg.x, tz: tg.z };
  };
  const trunks = L.colliders.filter((c) => c.kind === "circle") as Array<{ x: number; z: number; r: number }>;
  // Same muddy stretches as the scenery's road (same layout + quality → same plank sections), with a margin.
  const pad = 6 / env.trail.length;
  const mud = mudPatches(L, env.quality);
  const site = pickSite(frameAt, trunks, S.isGround, (t) => mud.some(([a, b]) => t > a - pad && t < b + pad));
  const [cx, cz] = site.b;
  const [sx, sz] = site.spirit;
  const path = pathPoints(site, 24);

  // Walkable: a chain of overlapping discs along the path (the road part is walkable already) + the clearing.
  for (const [x, z] of path) env.addWalkable({ kind: "circle", x, z, r: PATH_HALF + 0.3 });
  env.addWalkable({ kind: "circle", x: cx, z: cz, r: CLEAR_R });
  // The log behind the spirit is solid where it crosses the clearing (roots local z −1.1 = 1.1 u beyond him, away from the road; the roots turn by yaw + π).
  const back = { x: Math.sin(site.yaw), z: Math.cos(site.yaw) };
  const across = { x: back.z, z: -back.x };
  for (const k of [-1.2, 0, 1.2])
    env.addCollider({
      kind: "circle",
      x: sx + back.x * 1.1 + across.x * k,
      z: sz + back.z * 1.1 + across.z * k,
      r: 0.38,
    });

  // Surface height under a print: the road ribbon on the road, the terrain off it.
  const surface = (x: number, z: number) => {
    const q = L.trailQuery(x, z);
    const h = L.heightAt(x, z);
    return (q.d <= hw + 0.05 ? Math.max(h, q.y + ROAD_LIFT) : h) + PRINT_LIFT;
  };

  // ------------------------------------------------------------ meshes
  const group = new THREE.Group();
  group.name = "chullachaqui";
  // The chosen site and path, for dev shots and debugging (read-only).
  group.userData.site = site;
  group.userData.path = path;
  env.scene.add(group);
  const solidMat = vertexToon();
  const printMat = vertexToon();
  printMat.transparent = true;
  printMat.depthWrite = false;
  printMat.polygonOffset = true;
  printMat.polygonOffsetFactor = -2;
  printMat.polygonOffsetUnits = -2;

  const prints = new THREE.Mesh(printsGeometry(placePrints(site), surface), printMat);
  prints.name = "chullachaqui:prints";
  prints.renderOrder = 1;
  prints.receiveShadow = true;
  env.noOutline(prints);
  group.add(prints);

  const roots = new THREE.Mesh(rootsGeometry(), solidMat);
  roots.name = "chullachaqui:roots";
  roots.position.set(sx, L.heightAt(sx, sz) - 0.04, sz);
  roots.rotation.y = site.yaw + Math.PI;
  roots.castShadow = true;
  roots.receiveShadow = true;
  group.add(roots);

  // The snapped branch: on the verge just off the road, beside the prints (the walk's left).
  const vergeU = 0.28;
  const [bx, bz] = path[Math.round(vergeU * (path.length - 1))] as [number, number];
  const [nx, nz] = path[Math.round(vergeU * (path.length - 1)) + 1] as [number, number];
  const head = Math.atan2(nx - bx, nz - bz);
  const branch = new THREE.Mesh(branchGeometry(), solidMat);
  branch.name = "chullachaqui:branch";
  const brx = bx + Math.cos(head) * 0.9;
  const brz = bz - Math.sin(head) * 0.9;
  branch.position.set(brx, L.heightAt(brx, brz), brz);
  branch.rotation.y = head + 0.5;
  branch.castShadow = true;
  group.add(branch);

  const spiritGeo = spiritGeometry();
  const figure = new THREE.Group();
  figure.name = "chullachaqui:figure";
  // The spirit, its vanishing twin and the leaf puff move: no world-space painted blotches on them.
  const bodyMat = paintStrength(vertexToon(), 0);
  const body = new THREE.Mesh(spiritGeo, bodyMat);
  body.castShadow = true;
  // Twin used only for the vanish: same shape, transparent, without ink (the screen-space ink can't fade).
  const ghostMat = paintStrength(vertexToon(), 0);
  ghostMat.transparent = true;
  const ghost = new THREE.Mesh(spiritGeo, ghostMat);
  ghost.visible = false;
  env.noOutline(ghost);
  figure.add(body, ghost);
  const groundY = L.heightAt(sx, sz);
  figure.position.set(sx, groundY, sz);
  group.add(figure);

  // Leaf puff (motion only).
  const leafGeo = leafGeometry();
  const leafMat = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: env.toon("#ffffff").gradientMap });
  leafMat.side = THREE.DoubleSide;
  paintStrength(leafMat, 0);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, LEAVES);
  leaves.name = "chullachaqui:puff";
  leaves.visible = false;
  leaves.frustumCulled = false;
  env.noOutline(leaves);
  const leafTints = ["#9ccc4a", "#e0b23a", "#7cb342", "#d9772e", "#c6e07a"];
  const tmpC = new THREE.Color();
  for (let i = 0; i < LEAVES; i++) leaves.setColorAt(i, tmpC.set(leafTints[i % leafTints.length] as string));
  group.add(leaves);
  const leafV = Array.from({ length: LEAVES }, () => new THREE.Vector3());
  const leafP = Array.from({ length: LEAVES }, () => new THREE.Vector3());
  const leafSpin = new Float32Array(LEAVES);
  let puffT = -1;
  const startPuff = () => {
    puffT = 0;
    leaves.visible = true;
    for (let i = 0; i < LEAVES; i++) {
      const a = (i / LEAVES) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 1.2 + Math.random() * 1.6;
      leafV[i]?.set(Math.cos(a) * sp, 2 + Math.random() * 2, Math.sin(a) * sp);
      leafP[i]?.set(sx, groundY + 0.3 + Math.random() * 0.8, sz);
      leafSpin[i] = (Math.random() - 0.5) * 14;
    }
  };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const updatePuff = (dt: number) => {
    if (puffT < 0) return;
    puffT += dt;
    if (puffT > PUFF_TIME) {
      puffT = -1;
      leaves.visible = false;
      return;
    }
    const k = 1 - Math.max(0, (puffT - PUFF_TIME * 0.6) / (PUFF_TIME * 0.4));
    for (let i = 0; i < LEAVES; i++) {
      const v = leafV[i] as THREE.Vector3;
      const p = leafP[i] as THREE.Vector3;
      // Leaves flutter: strong drag, slow fall.
      v.multiplyScalar(Math.exp(-2.4 * dt));
      v.y -= 2.2 * dt;
      p.addScaledVector(v, dt);
      const spin = (leafSpin[i] as number) * puffT;
      q.setFromEuler(e.set(spin, spin * 0.7 + i, Math.sin(puffT * 6 + i) * 0.8));
      leaves.setMatrixAt(i, m.compose(p, q, sc.setScalar(2.4 * k)));
    }
    leaves.instanceMatrix.needsUpdate = true;
  };

  // ------------------------------------------------------------ undergrowth off the path
  const hidden: Array<{ mesh: THREE.InstancedMesh; i: number; m: THREE.Matrix4 }> = [];
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const minX = Math.min(...path.map((p) => p[0]), sx) - 4;
  const maxX = Math.max(...path.map((p) => p[0]), sx) + 4;
  const blocks = (x: number, z: number) => {
    if (Math.hypot(x - cx, z - cz) < CLEAR_R + 1) return true;
    if (Math.hypot(x - sx, z - sz) < 1.6) return true;
    for (const [px, pz] of path) if (Math.hypot(x - px, z - pz) < PATH_HALF + 0.8) return true;
    return false;
  };
  env.scene.traverse((o) => {
    const mesh = o as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh || !UNDER.has(mesh.name)) return;
    const mm = new THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, mm);
      const x = mm.elements[12] as number;
      const z = mm.elements[14] as number;
      if (x < minX || x > maxX || !blocks(x, z)) continue;
      hidden.push({ mesh, i, m: mm.clone() });
      mesh.setMatrixAt(i, zero);
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  // ------------------------------------------------------------ body + keep-out for the fauna
  const bodyC = creatures.add("chullachaqui", 0.35, { solid: true, give: 0, x: sx, z: sz });
  const keep = creatures.keepOut(cx, cz, CLEAR_R + 0.6);

  // ------------------------------------------------------------ speech bubble
  const layer = document.createElement("div");
  layer.className = "qn-hud qn-people-layer";
  layer.lang = env.lang;
  hudRoot.appendChild(layer);
  const bubble = document.createElement("p");
  bubble.className = "qn-people-bubble";
  bubble.setAttribute("role", "status");
  bubble.setAttribute("aria-live", "polite");
  layer.appendChild(bubble);
  let bubbleT = 0;
  const bubbleAt = new THREE.Vector3(sx, groundY + SPIRIT_TOP + 0.35, sz);
  const proj = new THREE.Vector3();
  const say = (text: string, secs: number) => {
    bubble.textContent = text;
    bubbleT = secs;
    bubble.classList.add("is-on");
  };
  const placeBubble = () => {
    proj.copy(bubbleAt).project(env.camera);
    const w = hudRoot.clientWidth || innerWidth;
    const h = hudRoot.clientHeight || innerHeight;
    const vis = proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05;
    bubble.style.visibility = vis ? "" : "hidden";
    const half = Math.min(160, w / 2 - 12);
    bubble.style.left = `${Math.round(THREE.MathUtils.clamp(((proj.x + 1) / 2) * w, half, w - half))}px`;
    bubble.style.top = `${Math.round(THREE.MathUtils.clamp(((1 - proj.y) / 2) * h, 120, h - 40))}px`;
  };

  // ------------------------------------------------------------ encounter
  const spirit = newSpirit();
  let dist = Infinity;
  /** Current facing (radians); he looks away from the road while lurking. */
  let yaw = site.yaw;
  let clock = 0;
  const showFigure = (on: boolean) => {
    figure.visible = on;
    if (on) {
      body.visible = true;
      ghost.visible = false;
      figure.scale.setScalar(1);
      if (bodyC.x !== sx || bodyC.z !== sz) {
        bodyC.x = sx;
        bodyC.z = sz;
      }
    } else park(bodyC);
  };
  const turnToward = (target: number, rate: number, dt: number) => {
    const d = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
    yaw += d * Math.min(1, rate * dt);
  };

  return {
    update(dt, avatar) {
      dist = Math.hypot(avatar.x - sx, avatar.z - sz);
      if (dist > AWAKE_R && spirit.phase === "lurk" && spirit.prints >= 1 && bubbleT <= 0 && puffT < 0) return;
      clock += dt;
      const out = tick(spirit, dt, dist);
      if (out.quip) say(QUIP[env.lang], 3.6);
      if (out.vanish) {
        // Swap to the ink-free twin for the fade; with motion he also spins and shrinks into the leaf puff.
        body.visible = false;
        ghost.visible = true;
        if (!env.reducedMotion) startPuff();
      }
      if (out.back) showFigure(true);
      printMat.opacity = spirit.prints;
      prints.visible = spirit.prints > 0.01;

      const phase = spirit.phase;
      if (phase === "lurk") {
        // Back to the road; every ~6 s a sly look over the shoulder toward the road.
        const peek = !env.reducedMotion && clock % 6 > 4.6 ? 0.9 * Math.sin((((clock % 6) - 4.6) * Math.PI) / 1.4) : 0;
        turnToward(site.yaw + peek, 4, dt);
      } else if (phase === "watch" || phase === "talk") {
        turnToward(Math.atan2(avatar.x - sx, avatar.z - sz), 5, dt);
      } else if (phase === "vanish") {
        const k = figureFade(spirit);
        ghostMat.opacity = k;
        if (!env.reducedMotion) {
          yaw += dt * 14 * (1 - k + 0.2);
          figure.scale.setScalar(0.2 + 0.8 * k);
        }
      } else if (phase === "gone" && figure.visible) showFigure(false);
      figure.rotation.y = yaw;
      // Breathing bob; a giggle hop while talking (none under reduced motion).
      let bob = 0;
      if (!env.reducedMotion) {
        bob = Math.sin(clock * 2.1) * 0.015;
        if (phase === "talk") bob += Math.abs(Math.sin(clock * 9)) * 0.04 * Math.max(0, 1 - spirit.time / 2);
      }
      figure.position.y = groundY + bob;

      updatePuff(dt);
      if (bubbleT > 0) {
        bubbleT -= dt;
        placeBubble();
        if (bubbleT <= 0) bubble.classList.remove("is-on");
      }
    },
    prompt() {
      if (ride.active || !canTalk(spirit, dist)) return null;
      return T_TALK[env.lang];
    },
    interact() {
      if (ride.active) return false;
      const line = talk(spirit, dist);
      if (line < 0) return false;
      say((LINES[line] ?? LINES[0])[env.lang], 8);
      emit("world:stamp", STAMP);
      return true;
    },
    dispose() {
      for (const h of hidden) {
        h.mesh.setMatrixAt(h.i, h.m);
        h.mesh.instanceMatrix.needsUpdate = true;
      }
      creatures.remove(bodyC);
      creatures.removeKeepOut(keep);
      group.removeFromParent();
      for (const o of [prints, roots, branch]) o.geometry.dispose();
      spiritGeo.dispose();
      leafGeo.dispose();
      leaves.dispose();
      for (const mt of [solidMat, bodyMat, printMat, ghostMat, leafMat]) mt.dispose();
      layer.remove();
    },
  };
};
