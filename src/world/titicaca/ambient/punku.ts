/**
 * The Collasuyu's punku: an Inca stone gateway at the start of the shore road (t = 0), the way back to Qusqu.
 * Trapezoidal doorway of fitted ashlar blocks with a lintel, a carved board ("Qusqu") above, and in the opening a
 * painted glimpse of Haukaypata (the hub's plaza, its stone walls and the usnu). Within PREFETCH_R its page and
 * chunks are warmed once (../../travel.ts `prefetchWorld`); on its road side "E · Volver a Qusqu" travels there
 * (`travelTo`, so the hub starts the traveler at its Collasuyu gate with `?from=titicaca`).
 *
 * At night two braziers beside it burn (additive glow sprites, no outline; still with prefers-reduced-motion).
 * The jambs are colliders and the doorway is blocked (nothing lies beyond it on this side). Draw calls: stone 1,
 * glimpse 1, board 1, plus the night glows. Pure rules: ./punku/logic.ts.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { vertexToon } from "../../merge-colors";
import { canvasTex, FONT, glowSprite } from "../../props";
import type { SuyuEnv } from "../../suyu/contract";
import { inkMask } from "../../toon";
import { prefetchWorld, travelTo } from "../../travel";
import { Build, frameAt } from "./kit/build";
import { buildBoards, paperBoard } from "./kit/signs";
import { GATE, gateFrame, inPrompt, PREFETCH_R, PUNKU_COPY } from "./punku/logic";

const STONE = ["#a39a8a", "#b2a896", "#968d7e", "#8a8274"];

/** Haukaypata seen through the doorway: sky, the hills, the plaza's stone walls with trapezoid doors, the usnu. */
function paintGlimpse(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  sky.addColorStop(0, "#6aa2dc");
  sky.addColorStop(1, "#d6e6f3");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#7f9a5c";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.5);
  for (let x = 0; x <= w; x += 16) ctx.lineTo(x, h * (0.42 + 0.06 * Math.sin(x * 0.05) + 0.03 * Math.sin(x * 0.17)));
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
  // Stone walls of the plaza with trapezoid doorways.
  ctx.fillStyle = "#b9b1a3";
  ctx.fillRect(0, h * 0.56, w, h * 0.16);
  ctx.fillStyle = "#5d564c";
  for (let x = 14; x < w; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, h * 0.72);
    ctx.lineTo(x + 4, h * 0.6);
    ctx.lineTo(x + 18, h * 0.6);
    ctx.lineTo(x + 22, h * 0.72);
    ctx.fill();
  }
  // Thatched roofs.
  ctx.fillStyle = "#a8743f";
  ctx.fillRect(0, h * 0.53, w, h * 0.035);
  // The plaza and the usnu's tiers.
  ctx.fillStyle = "#c9b48a";
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  for (const [k, c] of [
    [0, "#9a917f"],
    [1, "#aaa18e"],
    [2, "#bab19e"],
  ] as const) {
    const tw = w * (0.5 - k * 0.12);
    ctx.fillStyle = c;
    ctx.fillRect((w - tw) / 2, h * (0.8 - k * 0.045), tw, h * 0.05);
  }
  ctx.fillStyle = "#e8b631";
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.66, 7, 0, Math.PI * 2);
  ctx.fill();
}

export const create: CreateAmbient = (baseEnv, hudRoot): Ambient => {
  const env = baseEnv as SuyuEnv;
  const lang = env.lang;
  const f = gateFrame(env.suyu.layout);
  const group = new THREE.Group();
  group.name = "titicaca-punku";

  // ------------------------------------------------------------------ stone
  const b = new Build();
  b.frame = frameAt(f.x, f.y, f.z, f.yaw);
  let seed = 3;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // Jambs: courses of fitted blocks, leaning inward (the Inca trapezoid), a plinth below the ground.
  for (const side of [-1, 1]) {
    let y = -0.4;
    let k = 0;
    while (y < GATE.height) {
      const h = 0.42 + r() * 0.22;
      const u = (y + h / 2) / GATE.height;
      const half = GATE.bottom / 2 + (GATE.top / 2 - GATE.bottom / 2) * u;
      const wdt = 1.25 - u * 0.25;
      b.box(
        wdt + r() * 0.1,
        h - 0.03,
        GATE.depth,
        side * (half + wdt / 2),
        y,
        (r() - 0.5) * 0.06,
        STONE[k % 4] as string,
      );
      y += h;
      k++;
    }
  }
  // Lintel and a second course over it.
  b.box(GATE.top + 2.6, 0.62, GATE.depth + 0.1, 0, GATE.height, 0, "#9d9483");
  b.box(GATE.top + 1.6, 0.44, GATE.depth - 0.1, 0, GATE.height + 0.62, 0, "#b2a896");
  // A low wall running off each side, so the gateway reads as a pass and not a lone frame.
  for (const side of [-1, 1])
    for (let i = 0; i < 4; i++)
      b.box(
        1.3,
        1.0 - i * 0.18,
        0.9,
        side * (GATE.bottom / 2 + 1.9 + i * 1.3),
        -0.3,
        0.1,
        STONE[(i + 2) % 4] as string,
      );
  // Braziers on stone stands.
  for (const side of [-1, 1]) {
    b.cyl(0.32, 0.38, 0.9, side * (GATE.bottom / 2 + 1.5), 0, 1.6, "#8a8274", 7);
    b.cyl(0.42, 0.26, 0.25, side * (GATE.bottom / 2 + 1.5), 0.9, 1.6, "#5d564c", 8);
  }
  b.frame = null;
  const geo = b.build();
  const mat = vertexToon();
  if (geo) {
    const stone = new THREE.Mesh(geo, mat);
    stone.name = "titicaca-punku:stone";
    stone.castShadow = true;
    stone.receiveShadow = true;
    group.add(stone);
  }

  // ------------------------------------------------------------------ glimpse (the doorway's opening)
  const tex = canvasTex(256, 320, (ctx, w, h) => paintGlimpse(ctx, w, h));
  const gShape = new THREE.Shape([
    new THREE.Vector2(-GATE.bottom / 2, 0),
    new THREE.Vector2(GATE.bottom / 2, 0),
    new THREE.Vector2(GATE.top / 2, GATE.height),
    new THREE.Vector2(-GATE.top / 2, GATE.height),
  ]);
  const gGeo = new THREE.ShapeGeometry(gShape);
  const uv = gGeo.getAttribute("uv") as THREE.BufferAttribute;
  const pos = gGeo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, (pos.getX(i) + GATE.bottom / 2) / GATE.bottom, pos.getY(i) / GATE.height);
  const gMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
  const glimpse = new THREE.Mesh(gGeo, gMat);
  glimpse.name = "titicaca-punku:glimpse";
  glimpse.position.set(f.x, f.y, f.z);
  glimpse.rotation.y = f.yaw;
  env.noOutline(glimpse);
  // Lines of the hillside behind the doorway must not cross the painting.
  inkMask(glimpse);
  group.add(glimpse);

  // ------------------------------------------------------------------ board over the lintel
  const fc = Math.cos(f.yaw);
  const fs = Math.sin(f.yaw);
  const board = buildBoards(
    env,
    "titicaca-punku:board",
    1,
    512,
    150,
    (ctx, _i, cw, ch) => {
      paperBoard(ctx, cw, ch, "#dda63c");
      ctx.fillStyle = "#1f1a17";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 54px ${FONT.display}`;
      ctx.fillText("QUSQU", cw / 2, ch * 0.42);
      ctx.font = `600 22px ${FONT.body}`;
      ctx.fillText(PUNKU_COPY.sub[lang], cw / 2, ch * 0.74);
    },
    [
      {
        i: 0,
        w: 2.6,
        h: 0.76,
        x: f.x + fs * (GATE.depth / 2 + 0.03),
        y: f.y + GATE.height + 1.4,
        z: f.z + fc * (GATE.depth / 2 + 0.03),
        yaw: f.yaw,
      },
    ],
  );
  group.add(board.mesh);

  const glows = [-1, 1].map((side) => {
    const s = glowSprite(env, "#ffb35c", 2.2);
    const lx = side * (GATE.bottom / 2 + 1.5);
    s.position.set(f.x + lx * fc + 1.6 * fs, f.y + 1.45, f.z - lx * fs + 1.6 * fc);
    s.visible = false;
    group.add(s);
    return s;
  });
  env.scene.add(group);

  // ------------------------------------------------------------------ world registration
  const at = (lx: number, lz: number) => ({ x: f.x + lx * fc + lz * fs, z: f.z - lx * fs + lz * fc });
  for (const side of [-1, 1]) {
    for (const lx of [GATE.bottom / 2 + 0.6, GATE.bottom / 2 + 2.4, GATE.bottom / 2 + 4.6]) {
      const p = at(side * lx, 0);
      env.addCollider({ kind: "circle", ...p, r: 0.8 });
    }
    const p = at(side * (GATE.bottom / 2 + 1.5), 1.6);
    env.addCollider({ kind: "circle", ...p, r: 0.45 });
  }
  env.addCollider({ kind: "circle", ...at(0, -0.4), r: 1.5 });
  const keep = creatures.keepOut(f.x, f.z, 5);

  void hudRoot;
  let near = false;
  let busy = false;
  let warmed = false;
  let lastNight: boolean | null = null;
  return {
    update(_dt, avatar, t) {
      const d = Math.hypot(avatar.x - f.x, avatar.z - f.z);
      if (!warmed && d < PREFETCH_R) {
        warmed = true;
        prefetchWorld(lang, "cusco");
      }
      near = !busy && inPrompt(f, avatar.x, avatar.z);
      const night = env.sky.isNight();
      if (night !== lastNight) {
        lastNight = night;
        for (const s of glows) s.visible = night;
      }
      if (night && !env.reducedMotion)
        glows.forEach((s, i) => {
          s.scale.setScalar(2.1 + Math.sin(t * 7.3 + i * 1.7) * 0.18 + Math.sin(t * 13 + i) * 0.08);
        });
    },
    prompt: () => (near ? PUNKU_COPY.prompt[lang] : null),
    interact() {
      if (!near) return false;
      busy = true;
      travelTo(lang, "titicaca", "cusco");
      return true;
    },
    dispose() {
      creatures.removeKeepOut(keep);
      board.dispose();
      geo?.dispose();
      mat.dispose();
      gGeo.dispose();
      gMat.dispose();
      tex.dispose();
      for (const s of glows) (s.material as THREE.SpriteMaterial).dispose();
      group.removeFromParent();
    },
  };
};
