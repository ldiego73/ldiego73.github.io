/**
 * Readable landmarks of Haukaypata: a carved stele in front of the Qorikancha (left of its doorway) and a small
 * plaque on the wall beside the twelve-angled stone in the Antisuyu street. Near either, "E · Leer" opens a
 * short card with the same words as the text mode (../textmode.ts cuscoTextCopy: one source for both).
 *
 * One vertex-coloured mesh (the stele's stone) and one atlas mesh (both inscriptions).
 */
import * as THREE from "three";
import { createFieldPanel, el } from "../../ambient/fields/panel";
import type { Ambient, CreateAmbient, L } from "../../contract";
import { flattenToonGroup, vertexToon } from "../../merge-colors";
import { FONT, fitFont, Kit, offFontsReady, onFontsReady } from "../../props";
import { GATES, type Gate, HATUN_RUMIYOC, QORI_STELE, QORIKANCHA, stationSpot, WALL_OFF, wallPoint } from "../plan";
import { cuscoTextCopy } from "../textmode";
import "./khipu/khipu.css";

const S = {
  prompt: { es: "E · Leer", en: "E · Read" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
  qori: { es: "QORIKANCHA", en: "QORIKANCHA" },
  qoriSub: { es: "Templo del Sol · Inti", en: "Temple of the Sun · Inti" },
  hatun: { es: "HATUN RUMIYOC", en: "HATUN RUMIYOC" },
  hatunSub: { es: "La piedra de los doce ángulos", en: "The twelve-angled stone" },
} satisfies Record<string, L>;

const PROMPT_R = 2.6;

export const create: CreateAmbient = (env, hudRoot): Ambient => {
  const lang = env.lang;
  const T = (l: L) => l[lang];
  const copy = cuscoTextCopy(lang);
  const antisuyu = GATES.find((g) => g.id === "antisuyu") as Gate;
  const hatun = stationSpot("hatun-rumiyoc") ?? { x: 0, z: 0, yaw: 0 };
  // The plaque: on the wall face, just past the stone (toward the gate), at eye height.
  const plaqueAt = wallPoint(antisuyu, HATUN_RUMIYOC.s + 2.2, HATUN_RUMIYOC.side, WALL_OFF - 0.03);

  // ------------------------------------------------------------------ stele (stone)
  const group = new THREE.Group();
  group.name = "cusco-landmarks";
  const k = new Kit(env);
  k.box(0.9, 0.25, 0.6, QORI_STELE.x, 0, QORI_STELE.z, "#8c867b");
  k.box(0.7, 1.55, 0.36, QORI_STELE.x, 0.25, QORI_STELE.z, "#6f6c67", QORIKANCHA.yaw);
  const stone = k.build("cusco-stele");
  const mat = vertexToon();
  flattenToonGroup(stone, mat);
  group.add(stone);

  // ------------------------------------------------------------------ inscriptions (atlas: 2 rows)
  const W = 256;
  const H = 128;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H * 2;
  const draw = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rows: Array<[string, string, string]> = [
      [T(S.qori), T(S.qoriSub), "#e8b631"],
      [T(S.hatun), T(S.hatunSub), "#2a9d8f"],
    ];
    rows.forEach(([title, sub, dye], i) => {
      const y = i * H;
      ctx.fillStyle = "#5f5a52";
      ctx.fillRect(0, y, W, H);
      ctx.strokeStyle = dye;
      ctx.lineWidth = 6;
      ctx.strokeRect(9, y + 9, W - 18, H - 18);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f3ead8";
      fitFont(ctx, title, "800", FONT.display, 34, W - 40, "condensed ");
      ctx.fillText(title, W / 2, y + H * 0.4);
      ctx.fillStyle = "#e8d29a";
      fitFont(ctx, sub, "700", FONT.body, 17, W - 40);
      ctx.fillText(sub, W / 2, y + H * 0.68);
    });
  };
  draw();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const redraw = () => {
    draw();
    tex.needsUpdate = true;
  };
  onFontsReady(redraw);
  const quad = (row: number, w: number, x: number, y: number, z: number, yaw: number) => {
    const g = new THREE.PlaneGeometry(w, w / 2);
    const uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setY(i, (1 - row + uv.getY(i)) / 2);
    g.rotateY(yaw);
    g.translate(x, y, z);
    return g;
  };
  // Stele face toward the plaza (−x), the plaque's toward the street (the hatun spot's facing).
  const qx = QORI_STELE.x - 0.19;
  const parts = [
    quad(0, 0.62, qx, 1.25, QORI_STELE.z, QORIKANCHA.yaw),
    quad(1, 0.9, plaqueAt.x + Math.sin(hatun.yaw) * 0.08, 1.55, plaqueAt.z + Math.cos(hatun.yaw) * 0.08, hatun.yaw),
  ];
  const geo = new THREE.BufferGeometry();
  {
    const pos: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    for (const p of parts) {
      const base = pos.length / 3;
      const a = p.getAttribute("position");
      const u = p.getAttribute("uv");
      for (let i = 0; i < a.count; i++) {
        pos.push(a.getX(i), a.getY(i), a.getZ(i));
        uvs.push(u.getX(i), u.getY(i));
      }
      const index = p.getIndex();
      if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
      p.dispose();
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  const signMat = env.toon("#ffffff").clone();
  signMat.map = tex;
  const signs = new THREE.Mesh(geo, signMat);
  signs.name = "cusco-landmarks:signs";
  group.add(signs);
  env.scene.add(group);
  env.addCollider({ kind: "circle", x: QORI_STELE.x, z: QORI_STELE.z, r: 0.55 });

  // ------------------------------------------------------------------ card
  const panel = createFieldPanel(hudRoot, { name: "landmark", closeLabel: T(S.closeAria) });
  panel.layer.classList.add("qnc");
  const body = el("p", "qnf-lede");
  panel.body.append(body);
  const spots = [
    { x: QORI_STELE.x - 1.2, z: QORI_STELE.z, title: copy.qoriTitle, kicker: T(S.qoriSub), text: copy.qori },
    { x: hatun.x, z: hatun.z, title: copy.stoneTitle, kicker: T(S.hatunSub), text: copy.stone },
  ];
  let near: (typeof spots)[number] | null = null;

  return {
    update(_dt, avatar) {
      near = null;
      for (const s of spots) if (Math.hypot(avatar.x - s.x, avatar.z - s.z) < PROMPT_R) near = s;
      if (panel.isOpen() && !near) panel.close();
    },
    prompt() {
      if (panel.isOpen()) return near ? T(S.close) : null;
      return near ? T(S.prompt) : null;
    },
    interact() {
      if (panel.isOpen()) {
        panel.close();
        return true;
      }
      if (!near) return false;
      panel.kicker.textContent = near.kicker;
      panel.title.textContent = near.title;
      body.textContent = near.text;
      panel.open();
      return true;
    },
    escape() {
      if (!panel.isOpen()) return false;
      panel.close();
      return true;
    },
    dispose() {
      offFontsReady(redraw);
      panel.dispose();
      group.removeFromParent();
      stone.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      mat.dispose();
      geo.dispose();
      signMat.dispose();
      tex.dispose();
    },
  };
};
