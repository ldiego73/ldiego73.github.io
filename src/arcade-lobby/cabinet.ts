import * as THREE from "three";
import { BLOCK } from "../games/core/neon";
import type { CabinetSkin } from "../games/core/store";
import { type AguayoTrim, buildAguayoTrim } from "./aguayo";

/** Boxy cabinet, 1.8 units tall, origin at floor center, facing +Z. */
export interface CabinetOptions {
  color: string;
  marquee: string;
  lang?: "es" | "en";
}

export interface Cabinet {
  group: THREE.Group;
  screen: THREE.Mesh;
  /** Caller retains ownership of supplied textures. Canvas/image textures should use sRGB. */
  setScreenTexture(tex: THREE.Texture): void;
  /** 0 = idle, 1 = focused: a small lift and brightness change. */
  setFocus(t: number): void;
  /** Reward skin (games/core/store activeSkin): "aguayo" adds the woven trim and khipu marquee. */
  setSkin(skin: CabinetSkin): void;
  dispose(): void;
}

export function arcadeFontFamily(): string {
  let family = "";
  try {
    const style = getComputedStyle(document.documentElement);
    family = style.getPropertyValue("--font-arcade").trim() || style.getPropertyValue("--font-pixel").trim();
  } catch {
    /* No DOM in tests. */
  }
  return `${family ? `${family}, ` : ""}"Silkscreen", ui-monospace, monospace`;
}

export function createCabinet(opts: CabinetOptions): Cabinet {
  const group = new THREE.Group();
  group.name = `cabinet:${opts.marquee}`;
  // Lift the model locally so callers can position the cabinet in any scene.
  const model = new THREE.Group();
  group.add(model);
  const owned: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  const own = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  let disposed = false;
  const texture = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
    const tex = own(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    return tex;
  };
  const stone = texture(16, 16, (ctx) => {
    ctx.fillStyle = BLOCK.floor;
    ctx.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y += 4) {
      ctx.fillStyle = BLOCK.void;
      ctx.fillRect(0, y, 16, 1);
      ctx.fillRect(y % 8 ? 4 : 11, y, 1, 4);
      ctx.fillStyle = BLOCK.grid;
      ctx.fillRect((y * 3) % 12, y + 1, 4, 1);
    }
  });
  const matte = (color: string, map?: THREE.Texture) =>
    own(
      new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true, ...(map ? { map } : {}) }),
    );
  const bodyMat = matte(BLOCK.ink, stone);
  const edgeMat = matte(BLOCK.void);
  const trimMat = matte(opts.color);
  const neutralMat = matte(BLOCK.ink);
  const cube = own(new THREE.BoxGeometry(1, 1, 1));
  const block = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(cube, material);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  };
  block(0.8, 0.12, 0.72, 0, 0.06, 0, edgeMat);
  block(0.72, 0.76, 0.64, 0, 0.5, -0.02, bodyMat);
  block(0.72, 0.58, 0.5, 0, 1.23, -0.09, bodyMat);
  block(0.8, 0.28, 0.72, 0, 1.66, 0, edgeMat);
  for (const x of [-0.37, 0.37]) {
    block(0.06, 1.4, 0.06, x, 0.82, 0.29, trimMat);
    block(0.06, 0.28, 0.72, x, 1.66, 0, trimMat);
  }
  block(0.68, 0.06, 0.06, 0, 0.16, 0.32, trimMat);
  block(0.8, 0.1, 0.82, 0, 0.94, 0.06, edgeMat);
  block(0.72, 0.04, 0.74, 0, 1.01, 0.06, trimMat);
  block(0.64, 0.48, 0.06, 0, 1.27, 0.19, edgeMat);

  const drawLabel = (ctx: CanvasRenderingContext2D, w: number, h: number, sign: boolean) => {
    ctx.fillStyle = sign ? opts.color : BLOCK.void;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = sign ? BLOCK.void : BLOCK.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = sign ? 22 : 16;
    const text = opts.marquee.toUpperCase();
    do {
      ctx.font = `700 ${size--}px ${arcadeFontFamily()}`;
    } while (ctx.measureText(text).width > w - 16 && size > 8);
    ctx.fillText(text, w / 2, sign ? h / 2 : h * 0.42);
    if (!sign) {
      ctx.font = `700 10px ${arcadeFontFamily()}`;
      ctx.fillStyle = opts.color;
      ctx.fillText(opts.lang === "en" ? "PRESS START" : "PULSA START", w / 2, h * 0.72);
    }
  };
  const idleTex = texture(128, 96, (ctx) => drawLabel(ctx, 128, 96, false));
  const screenMat = own(new THREE.MeshBasicMaterial({ map: idleTex, toneMapped: false }));
  const screen = new THREE.Mesh(own(new THREE.PlaneGeometry(0.56, 0.42)), screenMat);
  screen.position.set(0, 1.27, 0.225);
  screen.name = "screen";
  model.add(screen);
  const marqueeTex = texture(256, 64, (ctx) => drawLabel(ctx, 256, 64, true));
  const marqueeMat = own(new THREE.MeshBasicMaterial({ map: marqueeTex, toneMapped: false }));
  block(0.68, 0.2, 0.02, 0, 1.66, 0.367, marqueeMat);

  // Joystick and buttons are stacked, square blocks.
  block(0.1, 0.02, 0.1, -0.18, 1.04, 0.18, edgeMat);
  block(0.03, 0.08, 0.03, -0.18, 1.09, 0.18, neutralMat);
  block(0.08, 0.06, 0.08, -0.18, 1.16, 0.18, trimMat);
  for (const x of [0.02, 0.12, 0.22]) {
    block(0.08, 0.02, 0.08, x, 1.04, 0.2, edgeMat);
    block(0.06, 0.03, 0.06, x, 1.065, 0.2, x === 0.12 ? neutralMat : trimMat);
  }
  block(0.26, 0.32, 0.04, 0, 0.46, 0.32, edgeMat);
  block(0.14, 0.03, 0.01, 0, 0.55, 0.345, trimMat);
  block(0.03, 0.08, 0.01, 0, 0.44, 0.345, neutralMat);

  try {
    void document.fonts
      .load(`700 22px ${arcadeFontFamily()}`)
      .then(() => {
        if (disposed) return;
        drawLabel(marqueeTex.image.getContext("2d")!, 256, 64, true);
        drawLabel(idleTex.image.getContext("2d")!, 128, 96, false);
        marqueeTex.needsUpdate = idleTex.needsUpdate = true;
      })
      .catch(() => {});
  } catch {
    /* FontFaceSet unavailable. */
  }

  const baseTrim = trimMat.color.clone();
  let aguayo: AguayoTrim | null = null;
  let focusNow = 0;
  const cabinet: Cabinet = {
    group,
    screen,
    setScreenTexture(tex) {
      screenMat.map = tex;
      screenMat.needsUpdate = true;
    },
    setFocus(t) {
      const focus = THREE.MathUtils.clamp(t, 0, 1);
      model.position.y = focus * 0.06;
      screenMat.color.setScalar(0.86 + focus * 0.14);
      marqueeMat.color.setScalar(0.92 + focus * 0.08);
      trimMat.color.copy(baseTrim).multiplyScalar(0.9 + focus * 0.1);
      focusNow = focus;
      aguayo?.setFocus(focus);
    },
    setSkin(skin) {
      if (disposed) return;
      if (skin === "aguayo" && !aguayo) {
        aguayo = buildAguayoTrim();
        model.add(aguayo.group);
        cabinet.setFocus(focusNow);
      }
      if (aguayo) aguayo.group.visible = skin === "aguayo";
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      aguayo?.dispose();
      aguayo = null;
      for (const resource of owned) resource.dispose();
      owned.length = 0;
    },
  };
  cabinet.setFocus(0);
  return cabinet;
}
