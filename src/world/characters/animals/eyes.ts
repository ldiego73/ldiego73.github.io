/**
 * Painted animal eyes (canvas, no image files): one atlas of four square cells per eye style, laid on both
 * sides of the head by the mirrored face decal (../build.ts projectFace). In a cell, +x points toward the
 * muzzle (the decal's u), up is up.
 *
 *   cell 0  open        cell 1  closed (blink, sleep)
 *   cell 2  soft        (upper lid lowered: content, chewing, dozing)
 *   cell 3  half        (the in-between frame of a blink)
 *
 * Gentle on purpose: mammals get one big dark eye with a warm lower glow and two highlights (the llama's eye
 * made generic), birds and reptiles a coloured iris with a ROUND pupil and a highlight (no slit pupils, so the
 * jaguar, the puma and the caiman look calm), and optional patches that make a species read from afar: the
 * sloth's dark mask, the macaw's white face with feather lines, the toucan's blue ring, the condor's bare skin.
 */
import * as THREE from "three";
import type { EyeStyle } from "./spec";

export const EYE_CELL = 256;
export const EYE_CELLS = 4;

type Ctx = CanvasRenderingContext2D;

const atlases = new Map<string, THREE.CanvasTexture>();

/** The eye atlas of a style (cached by its content). */
export function eyeAtlas(style: EyeStyle): THREE.CanvasTexture {
  const key = JSON.stringify(style);
  let t = atlases.get(key);
  if (!t) {
    t = draw(style);
    atlases.set(key, t);
  }
  return t;
}

function draw(s: EyeStyle) {
  const el = document.createElement("canvas");
  el.width = EYE_CELL * EYE_CELLS;
  el.height = EYE_CELL;
  const c = el.getContext("2d");
  if (!c) throw new Error("animals: no 2d context");
  const lids = [1, 0, 0.62, 0.42];
  for (let i = 0; i < EYE_CELLS; i++) {
    c.save();
    c.translate(i * EYE_CELL, 0);
    cell(c, s, lids[i] as number);
    c.restore();
  }
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function cell(c: Ctx, s: EyeStyle, lid: number) {
  const cx = EYE_CELL / 2;
  const cy = EYE_CELL / 2;
  const w = s.size * EYE_CELL;
  const h = w * (s.aspect ?? 1);
  patch(c, s, cx, cy, w, h);
  if (s.ring) {
    c.fillStyle = s.ring;
    c.beginPath();
    const rw = s.ringW ?? 16;
    c.ellipse(cx, cy, w / 2 + rw, h / 2 + rw, 0, 0, Math.PI * 2);
    c.fill();
  }
  const mammal = !s.pupil;
  if (lid > 0.05) {
    c.save();
    // Clip to the open part of the eye (the upper lid comes down).
    const top = cy - h / 2 + h * (1 - lid);
    c.beginPath();
    c.rect(cx - w, top, w * 2, h * 2);
    c.clip();
    if (s.sclera) {
      c.fillStyle = s.sclera;
      c.beginPath();
      c.ellipse(cx, cy, w / 2 + 6, h / 2 + 2, 0, 0, Math.PI * 2);
      c.fill();
    }
    // Iris (mammals: the whole eye dark, warm at the bottom).
    const g = c.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
    g.addColorStop(0, s.iris);
    g.addColorStop(mammal ? 0.5 : 0.35, s.iris);
    g.addColorStop(1, s.irisLow ?? s.iris);
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(cx, cy, w / 2, h / 2, mammal ? -0.12 : 0, 0, Math.PI * 2);
    c.fill();
    if (!mammal) {
      c.fillStyle = s.pupil as string;
      c.beginPath();
      const pr = (w / 2) * (s.pupilK ?? 0.5);
      c.ellipse(cx + w * 0.03, cy, pr, pr * (h / w), 0, 0, Math.PI * 2);
      c.fill();
      // A thin dark rim around the iris keeps a light iris readable.
      c.strokeStyle = "rgba(20,12,8,0.7)";
      c.lineWidth = 5;
      c.beginPath();
      c.ellipse(cx, cy, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2);
      c.stroke();
    }
    // Highlights: a big one up and back (toward the light), a small one low and forward.
    if (lid > 0.5) {
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.ellipse(cx - w * 0.16, cy - h * 0.2, w * 0.15, h * 0.11, 0.3, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 0.85;
      c.beginPath();
      c.arc(cx + w * 0.17, cy + h * 0.2, w * 0.055, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }
    c.restore();
  }
  lidLine(c, s, cx, cy, w, h, lid);
}

function lidLine(c: Ctx, s: EyeStyle, cx: number, cy: number, w: number, h: number, lid: number) {
  const col = s.lid ?? "#1a110d";
  const lw = s.lidW ?? (s.pupil ? 5 : 9);
  c.save();
  c.strokeStyle = col;
  c.lineCap = "round";
  c.lineWidth = lw;
  if (lid <= 0.05) {
    // Closed: a calm curve (‿), lashes pointing down and back.
    c.beginPath();
    c.moveTo(cx + w / 2, cy - 2);
    c.quadraticCurveTo(cx, cy + h * 0.16, cx - w / 2 - 4, cy - 4);
    c.stroke();
    for (let i = 0; i < (s.lashes ?? 0); i++) {
      const t = 0.25 + i * 0.18;
      const x = cx + w / 2 - t * (w + 4);
      const y = cy + Math.sin(t * Math.PI) * h * 0.14;
      c.lineWidth = lw * 0.55;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x - 6, y + 10, x - 16, y + 14);
      c.stroke();
    }
    c.restore();
    return;
  }
  if (!s.lid && s.pupil) {
    // Birds and reptiles: no lash line, only the lid's edge when it is lowered.
    if (lid < 0.9) {
      const top = cy - h / 2 + h * (1 - lid);
      c.lineWidth = lw;
      c.beginPath();
      c.moveTo(cx - w / 2, top + 2);
      c.quadraticCurveTo(cx, top - 4, cx + w / 2, top + 2);
      c.stroke();
    }
    c.restore();
    return;
  }
  const top = cy - h / 2 + h * (1 - lid);
  c.beginPath();
  c.moveTo(cx + w / 2 + 2, top + h * 0.22 * lid);
  c.quadraticCurveTo(cx, top - 6, cx - w / 2 - 4, top + h * 0.2 * lid);
  c.stroke();
  for (let i = 0; i < (s.lashes ?? 0); i++) {
    const t = 0.3 + i * 0.2;
    const x = cx + w / 2 - t * (w + 6);
    const y = top + Math.sin(t * Math.PI) * -6 + h * 0.04;
    c.lineWidth = lw * 0.6;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x - 8, y - 18, x - 20, y - 24);
    c.stroke();
  }
  c.restore();
}

function patch(c: Ctx, s: EyeStyle, cx: number, cy: number, w: number, h: number) {
  const p = s.patch;
  if (!p) return;
  c.save();
  c.fillStyle = p.color;
  c.beginPath();
  switch (p.kind) {
    case "mask":
      // A dark band from the eye back toward the ear (sloths, raccoon-like masks).
      c.ellipse(cx - w * 0.45, cy + h * 0.08, w * 1.05, h * 0.62, 0.12, 0, Math.PI * 2);
      break;
    case "face":
      // A large bare face patch (macaws): fills most of the cell around the eye.
      c.ellipse(cx + w * 0.25, cy + h * 0.12, w * 1.35, h * 1.1, 0, 0, Math.PI * 2);
      break;
    case "brow":
      c.ellipse(cx - w * 0.1, cy - h * 0.62, w * 0.75, h * 0.22, -0.1, 0, Math.PI * 2);
      break;
    case "tear":
      // A dark line down from the front corner (the puma's muzzle mark).
      c.moveTo(cx + w * 0.45, cy + h * 0.2);
      c.quadraticCurveTo(cx + w * 0.75, cy + h * 0.9, cx + w * 1.05, cy + h * 1.15);
      c.lineTo(cx + w * 0.85, cy + h * 1.2);
      c.quadraticCurveTo(cx + w * 0.55, cy + h * 0.85, cx + w * 0.3, cy + h * 0.3);
      break;
    case "stripe":
      c.rect(cx - w * 1.6, cy - h * 0.18, w * 3.2, h * 0.36);
      break;
  }
  c.fill();
  if (s.lines && p.kind === "face") {
    c.strokeStyle = s.lines;
    c.lineWidth = 3;
    c.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const y = cy + h * (0.55 + i * 0.16);
      c.beginPath();
      c.moveTo(cx - w * 0.2 + i * 6, y);
      c.quadraticCurveTo(cx + w * 0.4, y + 6, cx + w * 1.2 - i * 8, y - 4);
      c.stroke();
    }
  }
  c.restore();
}
