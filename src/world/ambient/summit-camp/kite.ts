/**
 * The children's kite (cometa): a diamond of dyed cloth on a cane cross with a tail of cotton bows, flown on
 * a long string from the holder's hand. It rides downwind of the summit, swaying with the wind
 * (plan.ts `kiteSway`; still with reduced motion). `lift` 0..1 reels it in (children going home).
 */
import * as THREE from "three";
import { DYE } from "../../palette";
import { Part, protos } from "../people/rig";
import { kiteSway } from "./plan";

const SEG = 18;

function tri(a: number[], b: number[], c: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  g.computeVertexNormals();
  return g;
}

function kiteGeometry() {
  const P = protos();
  const p = new Part();
  const top = [0, 0.62, 0];
  const bot = [0, -0.62, 0];
  const l = [-0.44, 0.16, 0];
  const r = [0.44, 0.16, 0];
  const c = [0, 0.16, 0];
  const quads: Array<[number[], number[], string]> = [
    [top, l, DYE.red],
    [r, top, DYE.ochre],
    [l, bot, DYE.indigo],
    [bot, r, DYE.turq],
  ];
  const tris: THREE.BufferGeometry[] = [];
  for (const [a, b, col] of quads) {
    const g = tri(c, a, b);
    tris.push(g);
    p.add(g, col);
  }
  // A woven diamond (tocapu) at the center and a cotton border.
  const d = tri([0, 0.36, 0.004], [-0.12, 0.16, 0.004], [0.12, 0.16, 0.004]);
  const d2 = tri([0, -0.04, 0.004], [0.12, 0.16, 0.004], [-0.12, 0.16, 0.004]);
  tris.push(d, d2);
  p.add(d, DYE.cotton).add(d2, DYE.cotton);
  // Cane cross.
  p.add(P.box, "#c9a46a", 0, 0, -0.02, 0, 0, 0, 0.025, 1.26, 0.02);
  p.add(P.box, "#c9a46a", 0, 0.16, -0.02, 0, 0, 0, 0.9, 0.022, 0.02);
  // Tail: a string of bows hanging below the bottom corner.
  for (let k = 0; k < 6; k++) {
    const y = -0.75 - k * 0.3;
    const x = Math.sin(k * 0.9) * 0.08;
    p.add(P.box, "#3a2a22", x, y + 0.13, 0, 0, 0, Math.sin(k * 0.9 + 0.5) * 0.25, 0.008, 0.3, 0.008);
    const col = k % 2 ? DYE.cotton : DYE.red;
    p.add(P.cone, col, x - 0.07, y, 0, 0, 0, Math.PI / 2, 0.05, 0.13, 0.015);
    p.add(P.cone, col, x + 0.07, y, 0, 0, 0, -Math.PI / 2, 0.05, 0.13, 0.015);
  }
  const g = p.build();
  g.deleteAttribute("aSlot");
  for (const t of tris) t.dispose();
  for (const v of Object.values(P)) v.dispose();
  return g;
}

export interface Kite {
  group: THREE.Group;
  /**
   * `hand`: the string's end (holder's right hand). (`ax`, `az`): holder position; `wx`, `wz`: world wind
   * direction; `groundY`: ground under the kite. `lift` 0..1: flying height (0 = reeled in, hidden).
   */
  update(
    hand: THREE.Vector3,
    ax: number,
    az: number,
    wx: number,
    wz: number,
    groundY: number,
    reach: number,
    height: number,
    lift: number,
    clock: number,
    rm: boolean,
  ): void;
  hide(): void;
  dispose(): void;
}

const sway = { side: 0, up: 0, roll: 0, pitch: 0 };
const kp = new THREE.Vector3();

export function createKite(noOutline: (o: THREE.Object3D) => void, gradientMap: THREE.Texture | null): Kite {
  const group = new THREE.Group();
  group.name = "summit-camp:kite";
  const geo = kiteGeometry();
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap, side: THREE.DoubleSide });
  const kite = new THREE.Mesh(geo, mat);
  kite.name = "summit-camp:kite-body";
  kite.castShadow = true;
  group.add(kite);

  const pos = new Float32Array((SEG + 1) * 3);
  const lineGeo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos, 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  lineGeo.setAttribute("position", attr);
  const lineMat = new THREE.LineBasicMaterial({ color: "#3a2a22", transparent: true, opacity: 0.85 });
  const line = new THREE.Line(lineGeo, lineMat);
  line.name = "summit-camp:kite-string";
  line.frustumCulled = false;
  noOutline(line);
  group.add(line);
  group.visible = false;

  return {
    group,
    update(hand, ax, az, wx, wz, groundY, reach, height, lift, clock, rm) {
      if (lift < 0.04) {
        group.visible = false;
        return;
      }
      group.visible = true;
      kiteSway(clock, rm, sway);
      const k = lift * lift * (3 - 2 * lift);
      // Downwind and up; the sway moves it across the wind.
      kp.set(
        ax + wx * reach * k - wz * sway.side * k,
        Math.max(groundY + 0.4, hand.y + (groundY - hand.y) * (1 - k) + (height + sway.up) * k),
        az + wz * reach * k + wx * sway.side * k,
      );
      kite.position.copy(kp);
      kite.lookAt(hand);
      kite.rotateX(-0.55 * k + sway.pitch);
      kite.rotateZ(sway.roll);
      // String from the hand to the kite's bridle, sagging a little.
      const dx = kp.x - hand.x;
      const dy = kp.y - 0.05 - hand.y;
      const dz = kp.z - hand.z;
      const sag = Math.hypot(dx, dy, dz) * 0.07;
      for (let i = 0; i <= SEG; i++) {
        const u = i / SEG;
        pos[i * 3] = hand.x + dx * u;
        pos[i * 3 + 1] = hand.y + dy * u - Math.sin(Math.PI * u) * sag;
        pos[i * 3 + 2] = hand.z + dz * u;
      }
      attr.needsUpdate = true;
    },
    hide() {
      group.visible = false;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      group.removeFromParent();
    },
  };
}
