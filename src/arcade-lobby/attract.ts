import * as THREE from "three";
import { NEON } from "../games/core/neon";
import { arcadeFontFamily } from "./cabinet";

/**
 * Attract-mode screens: one small CanvasTexture per cabinet with the game title
 * and a cheap animated pattern hinting at the game. Redrawn at ~15 fps by the lobby.
 */
export interface Attract {
  texture: THREE.CanvasTexture;
  draw(t: number): void;
  dispose(): void;
}

const W = 192;
const H = 144;
type Ctx = CanvasRenderingContext2D;
type Pattern = (x: Ctx, t: number, c: string) => void;

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const tri = (v: number) => 1 - Math.abs((v % 2) - 1); // 0..1..0 triangle wave
const MONO = '"JetBrains Mono", ui-monospace, monospace';

const snake: Pattern = (x, t, c) => {
  const cell = 12;
  const pos = (s: number) => {
    const k = Math.floor(s * 8);
    const loop = ((k % 56) + 56) % 56;
    // Rectangle-ish lap around the board.
    const p =
      loop < 12
        ? [2 + loop, 4]
        : loop < 20
          ? [14, 4 + (loop - 12)]
          : loop < 32
            ? [14 - (loop - 20), 12]
            : loop < 40
              ? [2, 12 - (loop - 32)]
              : [2 + (loop - 40) / 2, 4];
    return p.map((v) => Math.floor(v)) as [number, number];
  };
  for (let i = 0; i < 9; i++) {
    const [cx, cy] = pos(t - i * 0.125);
    x.fillStyle = i === 0 ? NEON.ink : c;

    x.fillRect(cx * cell - 6, cy * cell - 12, cell - 2, cell - 2);
  }
  x.globalAlpha = 1;
  x.fillStyle = NEON.ink;
  if (Math.floor(t * 3) % 2) x.fillRect(9 * cell - 6, 8 * cell - 12, cell - 2, cell - 2);
};

const pac: Pattern = (x, t, c) => {
  const y = 82;
  const px = ((t * 50) % 240) - 24;
  x.fillStyle = NEON.ink;
  for (let d = 12; d < W; d += 16) if (d > px + 6) x.fillRect(d - 2, y - 2, 4, 4);
  x.fillStyle = c;
  x.fillRect(px - 10, y - 10, 20, 20);
  x.fillStyle = NEON.void;
  if (Math.floor(t * 4) % 2) x.fillRect(px + 2, y - 2, 8, 4);
  const gx = px - 44;
  x.fillStyle = NEON.ink;
  x.fillRect(gx - 8, y - 8, 16, 16);
  x.fillRect(gx - 10, y + 8, 6, 4);
  x.fillRect(gx + 4, y + 8, 6, 4);
  x.fillStyle = NEON.void;
  x.fillRect(gx - 4, y - 4, 4, 4);
  x.fillRect(gx + 4, y - 4, 4, 4);
};

const monolith: Pattern = (x, t, c) => {
  const gone = Math.floor(t * 1.5) % 24;
  for (let r = 0; r < 4; r++)
    for (let k = 0; k < 8; k++) {
      const i = r * 8 + k;
      if (hash(i) * 24 < gone) continue;
      x.fillStyle = r === 0 ? NEON.grid : c;

      x.fillRect(10 + k * 22, 30 + r * 10, 20, 8);
    }
  x.globalAlpha = 1;
  const bx = 14 + tri(t * 0.55) * 164;
  const by = 74 + tri(t * 0.9) * 46;
  x.fillStyle = NEON.ink;
  x.fillRect(bx - 3, by - 3, 6, 6);
  x.fillStyle = c;
  x.fillRect(Math.min(W - 40, Math.max(4, bx - 18)), 128, 36, 4);
};

const sweeper: Pattern = (x, t, c) => {
  const phase = (t * 0.35) % 1;
  for (let r = 0; r < 6; r++)
    for (let k = 0; k < 10; k++) {
      const i = r * 10 + k;
      const h = hash(i);
      const px = 8 + k * 18;
      const py = 30 + r * 17;
      if (h < phase) {
        x.fillStyle = NEON.floor;
        x.fillRect(px, py, 16, 15);
        const n = Math.floor(hash(i + 99) * 4);
        if (n) {
          x.fillStyle = c;
          x.font = `700 11px ${MONO}`;
          x.fillText(String(n), px + 8, py + 8);
        }
      } else {
        x.fillStyle = NEON.grid;
        x.fillRect(px, py, 16, 15);
        if (hash(i + 7) > 0.9) {
          x.fillStyle = NEON.ink;
          x.fillRect(px + 6, py + 3, 4, 9);
        }
      }
    }
};

const invaders: Pattern = (x, t, c) => {
  const ox = Math.sin(t * 1.2) * 18;
  const oy = (t * 3) % 16;
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 6; k++) {
      const px = 30 + k * 24 + ox;
      const py = 30 + r * 16 + oy;
      x.fillStyle = r === 0 ? NEON.grid : c;
      x.fillRect(px, py, 14, 6);
      x.fillRect(px + (Math.floor(t * 4) % 2 ? 0 : 10), py + 6, 4, 4);
      x.fillStyle = NEON.void;
      x.fillRect(px + 3, py + 2, 2, 2);
      x.fillRect(px + 9, py + 2, 2, 2);
    }
  const sx = W / 2 + Math.sin(t * 0.8) * 60;
  x.fillStyle = c;
  x.fillRect(sx - 10, 126, 20, 6);
  x.fillRect(sx - 2, 120, 4, 6);
  const shot = (t * 2) % 1;
  x.fillStyle = NEON.ink;
  x.fillRect(sx - 1, 118 - shot * 80, 2, 8);
};

const catchBug: Pattern = (x, t, c) => {
  const lanes = ["DEV", "QA", "STG", "PROD"];
  x.font = `700 9px ${MONO}`;
  lanes.forEach((l, i) => {
    const lx = 8 + i * 46;
    x.fillStyle = NEON.floor;
    x.fillRect(lx, 30, 42, 100);
    x.fillStyle = NEON.ink;
    x.fillText(l, lx + 21, 124);
  });
  for (let b = 0; b < 4; b++) {
    const p = (t * 0.25 + b * 0.27) % 1;
    const bx = 14 + p * 168;
    const by = 46 + hash(b) * 56;
    x.fillStyle = p > 0.75 ? NEON.ink : c;
    x.fillRect(bx - 6, by - 4, 12, 8);
    x.fillRect(bx - 8, by - 2, 16, 4);
  }
};

const incident: Pattern = (x, t, c) => {
  x.strokeStyle = NEON.grid;
  x.lineWidth = 1;
  for (let gy = 40; gy < 130; gy += 20) {
    x.beginPath();
    x.moveTo(8, gy);
    x.lineTo(W - 8, gy);
    x.stroke();
  }
  x.fillStyle = c;
  for (let i = 0; i <= 44; i++) {
    const step = i + Math.floor(t * 10);
    const spike = Math.max(0, 1 - Math.abs(((step % 40) - 30) / 3));
    const v = 110 - hash(step) * 12 - spike * 64;
    x.fillRect(8 + i * 4, Math.floor(v / 4) * 4, 4, 8);
  }
  if (Math.floor(t * 2.5) % 2) {
    x.fillStyle = NEON.ink;
    x.fillRect(W - 66, 30, 58, 16);
    x.fillStyle = NEON.ink;
    x.font = `700 10px ${MONO}`;
    x.fillText("SEV-1", W - 37, 38);
  }
};

const deploy: Pattern = (x, t, c) => {
  for (let n = 0; n < 3; n++) {
    x.strokeStyle = NEON.grid;
    x.lineWidth = 2;
    x.strokeRect(14 + n * 60, 108, 46, 24);
    const fill = Math.floor(hash(n + Math.floor(t / 2)) * 3) + 1;
    for (let k = 0; k < fill; k++) {
      x.fillStyle = NEON.grid;
      x.fillRect(18 + n * 60 + k * 14, 114, 11, 12);
    }
  }
  const p = (t * 0.6) % 1;
  const lane = Math.floor(t * 0.6) % 3;
  x.fillStyle = c;
  x.fillRect(28 + lane * 60, 30 + p * 72, 18, 14);
  x.fillStyle = NEON.ink;
  x.fillRect(32 + lane * 60, 34 + p * 72, 10, 2);
};

const keepAlive: Pattern = (x, t, c) => {
  x.fillStyle = c;
  for (let i = 0; i <= 44; i++) {
    const phase = (i * 0.1 + t) % 1.6;
    const beat = phase < 0.08 ? -24 : phase < 0.16 ? 24 : 0;
    x.fillRect(8 + i * 4, 72 + beat, 4, 4);
  }
  x.fillStyle = c;
  x.font = `700 15px ${MONO}`;
  x.fillText(`${(99.9 + tri(t * 0.2) * 0.09).toFixed(2)}%`, W / 2, 118);
};

const PATTERNS: Record<string, Pattern> = {
  snake,
  "pac-bug": pac,
  "monolith-breaker": monolith,
  "zero-day-sweeper": sweeper,
  "request-invaders": invaders,
  "catch-the-bug": catchBug,
  "incident-commander": incident,
  "deploy-hero": deploy,
  "keep-alive": keepAlive,
};

export function createAttract(slug: string, title: string, color: string): Attract {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  x.imageSmoothingEnabled = false;
  const pixels = document.createElement("canvas");
  pixels.width = W / 2;
  pixels.height = H / 2;
  const pixelCtx = pixels.getContext("2d")!;
  pixelCtx.imageSmoothingEnabled = false;
  const texture = new THREE.CanvasTexture(pixels);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  const pattern = PATTERNS[slug] ?? snake;
  const family = arcadeFontFamily();
  const seed = hash(slug.length * 13.7) * 10;

  return {
    texture,
    draw(time) {
      const t = Math.floor((time + seed) * 4) / 4;
      x.fillStyle = NEON.void;
      x.fillRect(0, 0, W, H);
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.save();
      pattern(x, t, color);
      x.restore();
      // Title band.
      x.fillStyle = NEON.void;
      x.fillRect(0, 0, W, 22);
      x.font = `800 13px ${family}`;
      x.fillStyle = NEON.ink;
      x.fillText(title.toUpperCase(), W / 2, 12, W - 12);
      // Downsample to a tiny framebuffer; nearest sampling keeps chunky pixels.
      pixelCtx.drawImage(c, 0, 0, W / 2, H / 2);
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
    },
  };
}
