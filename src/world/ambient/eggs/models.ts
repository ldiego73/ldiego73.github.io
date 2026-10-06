/**
 * Easter-egg models: the hidden vizcachas (fauna vizcacha parts, cream/grey coat, curled tail),
 * a few boulders to hide behind, the golden khipu and its stone niche, and the squeak bubble sprite.
 * Faces +Z, origin at the feet. Geometries are shared between instances; `dispose()` frees them.
 */
import * as THREE from "three";
import type { L, WorldEnv } from "../../contract";
import { merge, vizcachaParts } from "../../fauna-models";
import { DYE, WORLD } from "../../palette";
import { canvasTex, glowSprite } from "../../props";

const COAT = ["#cfc6b6", "#b9b1a3", "#c7bfb2", "#aca59a", "#d6cdbd"];
const TAIL = "#5f5a54";
const EYE = "#1f1a17";
export const GOLD = "#e8b93a";

export interface Vizcacha {
  group: THREE.Group;
  /** Sinks into the burrow when hiding. */
  body: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group;
}

export interface EggKit {
  vizcacha(i: number): Vizcacha;
  /** A loose cluster of boulders (hiding cover), in local space around the origin. */
  rocks(seed: number): THREE.Mesh;
  /** Stone niche with the golden khipu inside; `glow` and `sparkles` shimmer when awake. */
  khipu(lowQuality: boolean): {
    group: THREE.Group;
    glow: THREE.Sprite;
    sparkles: THREE.Points | null;
    sparkleBase: Float32Array | null;
  };
  /** Speech bubble sprite ("¡Fiii!") shown above a greeted vizcacha. */
  bubble(text: L, lang: "es" | "en"): THREE.Sprite;
  dispose(): void;
}

export function createEggKit(env: WorldEnv): EggKit {
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const own = <T extends THREE.BufferGeometry>(g: T) => {
    geos.push(g);
    return g;
  };
  const Z = vizcachaParts();
  geos.push(Z.body, Z.head, Z.eyes, Z.tail);
  // Head and tail are modelled in their pivot's space (headPivot / tailPivot).
  // A cream belly patch so they read "cream/grey" from the path.
  const bellyGeo = own(new THREE.SphereGeometry(0.13, 8, 6));
  bellyGeo.scale(0.9, 1.2, 0.6);

  const kit: EggKit = {
    vizcacha(i) {
      const coat = COAT[i % COAT.length] as string;
      const group = new THREE.Group();
      group.name = `egg-vizcacha-${i + 1}`;
      const body = new THREE.Group();
      group.add(body);
      body.add(new THREE.Mesh(Z.body, env.toon(coat)));
      const belly = new THREE.Mesh(bellyGeo, env.toon("#efe6d6"));
      belly.position.set(0, 0.27, 0.15);
      belly.rotation.x = -0.5;
      body.add(belly);
      const head = new THREE.Group();
      head.position.copy(Z.headPivot);
      head.add(new THREE.Mesh(Z.head, env.toon(coat)));
      const eyes = new THREE.Mesh(Z.eyes, env.toon(EYE));
      env.noOutline(eyes);
      head.add(eyes);
      body.add(head);
      const tail = new THREE.Group();
      tail.position.copy(Z.tailPivot);
      tail.add(new THREE.Mesh(Z.tail, env.toon(TAIL)));
      body.add(tail);
      return { group, body, head, tail };
    },
    rocks(seed) {
      const parts: THREE.BufferGeometry[] = [];
      let a = seed;
      const r = () => {
        a = (a * 16807) % 2147483647;
        return a / 2147483647;
      };
      for (let k = 0; k < 3; k++) {
        const g = new THREE.DodecahedronGeometry(0.25 + r() * 0.2, 0);
        g.scale(1.2, 0.75 + r() * 0.3, 1);
        g.rotateY(r() * 3);
        g.translate((k - 1) * 0.45 + (r() - 0.5) * 0.2, 0.12, 0.5 + r() * 0.15);
        parts.push(g);
      }
      const m = new THREE.Mesh(own(merge(parts)), env.toon(WORLD.stoneDark));
      m.name = "egg-rocks";
      return m;
    },
    khipu(low) {
      const group = new THREE.Group();
      group.name = "egg-golden-khipu";
      // Niche: back wall, two jambs, lintel and a sill (a little Inca trapezoidal alcove).
      const stone: THREE.BufferGeometry[] = [];
      const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
        const g = new THREE.BoxGeometry(w, h, d);
        g.translate(x, y, z);
        stone.push(g);
      };
      box(1.5, 1.5, 0.35, 0, 0.75, -0.45);
      box(0.4, 1.3, 0.75, -0.6, 0.65, -0.1);
      box(0.4, 1.3, 0.75, 0.6, 0.65, -0.1);
      box(1.45, 0.3, 0.8, 0, 1.4, -0.12);
      box(1.1, 0.22, 0.7, 0, 0.11, -0.12);
      group.add(new THREE.Mesh(own(merge(stone)), env.toon(WORLD.stone)));

      // The khipu: a primary cord with knotted pendant cords hanging inside the niche.
      const cords: THREE.BufferGeometry[] = [];
      const top = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6);
      top.rotateZ(Math.PI / 2);
      top.translate(0, 1.12, -0.15);
      cords.push(top);
      for (let k = 0; k < 9; k++) {
        const x = -0.31 + k * 0.078;
        const len = 0.38 + ((k * 37) % 5) * 0.06;
        const c = new THREE.CylinderGeometry(0.011, 0.011, len, 4);
        c.translate(x, 1.12 - len / 2, -0.15);
        cords.push(c);
        const knots = 1 + ((k * 7) % 3);
        for (let n = 0; n < knots; n++) {
          const kn = new THREE.SphereGeometry(0.026, 6, 4);
          kn.translate(x, 1.03 - n * 0.09 - (k % 2) * 0.05, -0.15);
          cords.push(kn);
        }
      }
      const gold = env.toon(GOLD, { emissive: "#a8741a", emissiveIntensity: 0.35 });
      group.add(new THREE.Mesh(own(merge(cords)), gold));
      // Dye accent: a red tassel at the end of the primary cord.
      const tas = new THREE.Mesh(own(new THREE.IcosahedronGeometry(0.05, 0)), env.toon(DYE.red));
      tas.position.set(0.38, 1.1, -0.15);
      group.add(tas);

      const glow = glowSprite(env, "#ffd36b", 1.7);
      mats.push(glow.material);
      glow.position.set(0, 0.95, -0.05);
      glow.material.opacity = 0;
      group.add(glow);

      let sparkles: THREE.Points | null = null;
      let sparkleBase: Float32Array | null = null;
      if (!low) {
        const n = 14;
        sparkleBase = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) {
          sparkleBase[k * 3] = Math.sin(k * 2.4) * 0.45;
          sparkleBase[k * 3 + 1] = 0.75 + ((k * 0.37) % 0.6);
          sparkleBase[k * 3 + 2] = -0.05 + Math.cos(k * 1.7) * 0.15;
        }
        const geo = own(new THREE.BufferGeometry());
        geo.setAttribute("position", new THREE.BufferAttribute(sparkleBase.slice(), 3));
        const pm = new THREE.PointsMaterial({
          color: "#fff1b8",
          size: 0.07,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        mats.push(pm);
        sparkles = new THREE.Points(geo, pm);
        env.noOutline(sparkles);
        group.add(sparkles);
      }
      return { group, glow, sparkles, sparkleBase };
    },
    bubble(text, lang) {
      const tex = canvasTex(256, 112, (ctx, w, h) => {
        ctx.fillStyle = "#f3ead8";
        ctx.strokeStyle = "#1f1a17";
        ctx.lineWidth = 6;
        const r = 26;
        ctx.beginPath();
        ctx.moveTo(r + 4, 4);
        ctx.arcTo(w - 4, 4, w - 4, h - 26, r);
        ctx.arcTo(w - 4, h - 26, 4, h - 26, r);
        ctx.lineTo(w / 2 + 14, h - 26);
        ctx.lineTo(w / 2 - 4, h - 4);
        ctx.lineTo(w / 2 - 10, h - 26);
        ctx.arcTo(4, h - 26, 4, 4, r);
        ctx.arcTo(4, 4, w - 4, 4, r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1f1a17";
        ctx.font = '800 38px "Archivo", "Arial Narrow", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text[lang], w / 2, (h - 26) / 2 + 3, w - 30);
      });
      texs.push(tex);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
      mats.push(mat);
      const s = new THREE.Sprite(mat);
      s.scale.set(1.1, 0.48, 1);
      s.renderOrder = 10;
      s.visible = false;
      env.noOutline(s);
      return s;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
  return kit;
}
