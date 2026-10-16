/**
 * The punku at the south end of the coast road: an Inca doorway of fitted stone across the road (trapezoidal
 * opening, a lintel, short wing walls), with a glimpse of Qusqu's plaza painted in the doorway and a carved sign.
 * It is how the traveler came from the Qusqu hub and how they go back: on its road side, "E · Volver a Qusqu"
 * travels there (../../travel.ts `travelTo(lang, "costa", "cusco")`, which fades out and opens the hub with
 * `?from=costa`, so the hub starts at its Chinchaysuyu gate). Within PREFETCH_R the hub's page and chunks are
 * warmed once. Colliders: the jambs and wing walls; the doorway itself stays open (the road ends in it).
 * Draw calls: stone 1, glimpse 1, sign 1, two braziers' glows at night.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { vertexToon } from "../../merge-colors";
import { canvasTex, FONT, glowSprite, offFontsReady, onFontsReady, redraw } from "../../props";
import type { SuyuEnv } from "../../suyu/contract";
import { inkMask } from "../../toon";
import { prefetchWorld, travelTo } from "../../travel";
import { Geo, rng } from "../kit";
import { PUNKU_T } from "../plan";
import { type Frame, toLocal, toWorld } from "./huacas/logic";

const COPY = {
  back: { es: "E · Volver a Qusqu", en: "E · Back to Qusqu" },
  sign: { es: "QUSQU", en: "QUSQU" },
  sub: { es: "Haukaypata · el centro del Tawantinsuyu", en: "Haukaypata · the centre of the Tawantinsuyu" },
} satisfies Record<string, L>;

const PROMPT_R = 3.6;
const PREFETCH_R = 40;
/** Doorway: bottom width, top width, height, wall depth. */
const DOOR = { bottom: 3.2, top: 2.4, height: 4.1, depth: 1.8 } as const;

export const create: CreateAmbient = (baseEnv): Ambient => {
  const env = baseEnv as SuyuEnv;
  const lang = env.lang;
  const L = env.suyu.layout;
  const p = L.trail.pointAt(PUNKU_T);
  const tg = L.trail.tangentAt(PUNKU_T);
  // Local +Z points north along the road (the side the traveler stands on).
  const f: Frame = { x: p.x, z: p.z, y: p.y, yaw: Math.atan2(tg.x, tg.z) };
  const group = new THREE.Group();
  group.name = "costa-punku";
  group.position.set(f.x, f.y, f.z);
  group.rotation.y = f.yaw;

  // ------------------------------------------------------------------ stone
  const g = new Geo();
  const R = rng(0xb0c0);
  const stone = ["#a49c8f", "#968e81", "#b0a898", "#8c8478"];
  const pick = () => stone[Math.floor(R() * stone.length)] as string;
  const h = DOOR.height;
  // Jambs: courses of fitted ashlars leaning in (the trapezoid), each a little irregular.
  const courses = 7;
  for (const side of [-1, 1]) {
    for (let c = 0; c < courses; c++) {
      const y0 = (c / courses) * h;
      const k = c / courses;
      const inner = (DOOR.bottom / 2) * (1 - k) + (DOOR.top / 2) * k;
      const w = 1.5 - k * 0.15;
      const hh = h / courses;
      g.box(w, hh * 0.96, DOOR.depth, side * (inner + w / 2), y0, 0, pick(), 0, 0, side * 0.02);
    }
    // Wing walls.
    for (let c = 0; c < 4; c++) {
      const y0 = c * 0.85;
      g.box(4.2 - c * 0.3, 0.82, DOOR.depth * 0.8, side * (DOOR.bottom / 2 + 1.5 + 2.1), y0, 0, pick());
    }
  }
  // Base below grade and the lintel.
  g.box(DOOR.bottom + 13, 1.2, DOOR.depth + 0.4, 0, -1.15, 0, "#8c8478");
  g.box(DOOR.top + 3.6, 0.9, DOOR.depth + 0.1, 0, h, 0, "#9c9487");
  g.box(DOOR.top + 4, 0.25, DOOR.depth + 0.3, 0, h + 0.9, 0, "#8c8478");
  // Braziers on both sides of the road side.
  const fires: Array<[number, number, number]> = [];
  for (const side of [-1, 1]) {
    const x = side * (DOOR.bottom / 2 + 2.3);
    g.cyl(0.22, 0.28, 0.9, x, 0, 1.6, "#8f7a64", 7);
    g.cyl(0.42, 0.26, 0.32, x, 0.9, 1.6, "#8f4a2e", 8);
    fires.push([x, 1.45, 1.6]);
  }
  // Sign posts.
  for (const dx of [-1.3, 1.3]) g.cyl(0.08, 0.1, 2.3, 4.6 + dx, -0.2, 2.6, "#5a3b24", 6);
  const stoneGeo = g.build();
  const stoneMat = vertexToon();
  const stoneMesh = new THREE.Mesh(stoneGeo, stoneMat);
  stoneMesh.name = "costa-punku:stone";
  stoneMesh.castShadow = true;
  stoneMesh.receiveShadow = true;
  group.add(stoneMesh);

  // ------------------------------------------------------------------ glimpse of Qusqu in the doorway
  const glimpseTex = canvasTex(128, 192, (ctx, w, hh) => {
    const sky = ctx.createLinearGradient(0, 0, 0, hh * 0.55);
    sky.addColorStop(0, "#cfe1ee");
    sky.addColorStop(1, "#eef2ea");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, hh);
    // Green hills of the Huatanay, a stone wall, the usnu, the plaza flags.
    ctx.fillStyle = "#8fae7a";
    ctx.beginPath();
    ctx.moveTo(0, hh * 0.5);
    ctx.quadraticCurveTo(w * 0.3, hh * 0.36, w * 0.6, hh * 0.48);
    ctx.quadraticCurveTo(w * 0.85, hh * 0.4, w, hh * 0.46);
    ctx.lineTo(w, hh);
    ctx.lineTo(0, hh);
    ctx.fill();
    ctx.fillStyle = "#a49c8f";
    ctx.fillRect(0, hh * 0.58, w, hh * 0.1);
    ctx.fillStyle = "#cdbfa5";
    ctx.fillRect(0, hh * 0.68, w, hh * 0.32);
    ctx.fillStyle = "#b9ad96";
    ctx.fillRect(w * 0.3, hh * 0.6, w * 0.4, hh * 0.08);
    ctx.fillRect(w * 0.38, hh * 0.54, w * 0.24, hh * 0.06);
    ctx.fillStyle = "#e8b631";
    ctx.beginPath();
    ctx.arc(w * 0.5, hh * 0.24, w * 0.09, 0, Math.PI * 2);
    ctx.fill();
  });
  const glimpseGeo = new THREE.BufferGeometry();
  {
    const z = -0.3;
    const b = DOOR.bottom / 2;
    const t = DOOR.top / 2;
    // Trapezoid facing +Z (the road side), uv from the canvas.
    const P = [-b, 0, z, b, 0, z, t, h, z, -b, 0, z, t, h, z, -t, h, z];
    const U = [0, 0, 1, 0, 0.5 + t / (2 * b), 1, 0, 0, 0.5 + t / (2 * b), 1, 0.5 - t / (2 * b), 1];
    glimpseGeo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    glimpseGeo.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  }
  const glimpseMat = new THREE.MeshBasicMaterial({ map: glimpseTex, toneMapped: false, side: THREE.DoubleSide });
  const glimpse = new THREE.Mesh(glimpseGeo, glimpseMat);
  glimpse.name = "costa-punku:glimpse";
  env.noOutline(glimpse);
  group.add(glimpse);

  // ------------------------------------------------------------------ sign
  const drawSign = (ctx: CanvasRenderingContext2D, w: number, hh: number) => {
    ctx.fillStyle = "#7a5233";
    ctx.fillRect(0, 0, w, hh);
    ctx.fillStyle = "#8a6040";
    for (let k = 0; k < hh; k += 9) ctx.fillRect(0, k, w, 3);
    ctx.strokeStyle = "#2a1b12";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, hh - 6);
    ctx.fillStyle = "#c4383f";
    ctx.fillRect(12, 12, 20, hh - 24);
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fbecd0";
    ctx.font = `800 52px ${FONT.display}`;
    ctx.fillText(`← ${COPY.sign[lang]}`, 48, hh * 0.38);
    ctx.fillStyle = "#e9c98f";
    let px = 24;
    ctx.font = `600 ${px}px ${FONT.body}`;
    while (ctx.measureText(COPY.sub[lang]).width > w - 70 && px > 14) {
      px -= 1;
      ctx.font = `600 ${px}px ${FONT.body}`;
    }
    ctx.fillText(COPY.sub[lang], 48, hh * 0.76);
  };
  const signTex = canvasTex(512, 160, drawSign);
  const redrawSign = () => redraw(signTex, drawSign);
  onFontsReady(redrawSign);
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, color: "#ece4d6" });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.94), signMat);
  sign.name = "costa-punku:sign";
  sign.position.set(4.6, 1.55, 2.64);
  group.add(sign);
  inkMask(sign);

  const glows = fires.map(([x, y, z]) => {
    const s = glowSprite(env, "#ffb35c", 2.2);
    s.position.set(x, y, z);
    s.visible = false;
    group.add(s);
    return s;
  });
  env.scene.add(group);

  // ------------------------------------------------------------------ colliders
  for (const side of [-1, 1]) {
    for (const lz of [-0.5, 0.5]) {
      const w = toWorld(f, side * (DOOR.bottom / 2 + 0.75), lz);
      env.addCollider({ kind: "circle", x: w.x, z: w.z, r: 0.75 });
    }
    for (let k = 0; k < 4; k++) {
      const w = toWorld(f, side * (DOOR.bottom / 2 + 1.7 + k * 1.1), 0);
      env.addCollider({ kind: "circle", x: w.x, z: w.z, r: 0.75 });
    }
    const b = toWorld(f, side * (DOOR.bottom / 2 + 2.3), 1.6);
    env.addCollider({ kind: "circle", x: b.x, z: b.z, r: 0.45 });
  }
  // The road ends in the doorway: block it just behind the stones.
  {
    const w = toWorld(f, 0, -1.6);
    env.addCollider({ kind: "circle", x: w.x, z: w.z, r: 1.7 });
  }
  const keep = creatures.keepOut(f.x, f.z, 5);

  let near = false;
  let busy = false;
  let warmed = false;
  let night: boolean | null = null;
  return {
    update(_dt, avatar, t) {
      const l = toLocal(f, avatar.x, avatar.z);
      near = !busy && Math.hypot(l.x, l.z) < PROMPT_R && l.z > -0.6;
      if (!warmed && Math.hypot(avatar.x - f.x, avatar.z - f.z) < PREFETCH_R) {
        warmed = true;
        prefetchWorld(lang, "cusco");
      }
      const n = env.sky.isNight();
      if (n !== night) {
        night = n;
        for (const s of glows) s.visible = n;
      }
      if (night && !env.reducedMotion)
        for (const [i, s] of glows.entries()) s.scale.setScalar(2.1 + Math.sin(t * 8 + i * 2) * 0.15);
    },
    prompt: () => (near ? COPY.back[lang] : null),
    interact() {
      if (!near) return false;
      busy = true;
      travelTo(lang, "costa", "cusco");
      return true;
    },
    dispose() {
      offFontsReady(redrawSign);
      creatures.removeKeepOut(keep);
      group.removeFromParent();
      stoneGeo.dispose();
      stoneMat.dispose();
      glimpseGeo.dispose();
      glimpseMat.dispose();
      glimpseTex.dispose();
      sign.geometry.dispose();
      signMat.dispose();
      signTex.dispose();
      for (const s of glows) (s.material as THREE.SpriteMaterial).dispose();
    },
  };
};
