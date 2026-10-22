/**
 * Held and carried props for people (crowd members or single characters): tools, loads and crafts that follow
 * a bone. Rigid, so they are not part of the skinned archetypes: any person can pick one up, and an archetype
 * stays reusable. One InstancedMesh per prop kind in use (so a village of ploughs is one draw call), cel-shaded
 * and inked like everything else, paint blotches off. Colours are fixed per prop, except the parts marked
 * "tint", which take a per-instance colour (a q'ipi's lliclla, a basket's dye).
 *
 *   const props = new HeldProps();  scene.add(props.group);
 *   const h = props.attach(member, "chakitaqlla");   // member: a CrowdMember or anything with boneWorld()
 *   // every frame, after the person is posed and committed:
 *   props.update();
 *
 * Anchors are in the bone's own frame at bind pose (the bind pose is world aligned: +Y up, +Z forward), so a
 * staff held in a hanging hand is modelled upright, and turns with the hand as the arm moves.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { paintStrength } from "../style-gl";
import { gradientMap } from "../toon";

export type PropKind =
  | "chakitaqlla"
  | "staff"
  | "basket-hand"
  | "basket-back"
  | "qipi"
  | "pouch"
  | "panuelo"
  | "cup"
  | "ladle"
  | "stone"
  | "spool"
  | "pushka"
  | "knitting"
  | "paddle"
  | "pole"
  | "net"
  | "bananas"
  | "board"
  | "cooler"
  | "stick"
  | "pot"
  | "brush"
  | "ball"
  | "camera"
  | "phone"
  | "whip";

export interface PropHolder {
  /** World matrix of a bone of the person. */
  boneWorld(name: string, out: THREE.Matrix4): THREE.Matrix4;
  /** False while the person is not drawn (a crowd member's `shown`): their props hide too. */
  readonly shown?: boolean;
}

/**
 * A prop kind: the bone it follows, its offset there, and its geometry. Build the geometry with `PropKit`
 * (vertex colours plus "tint" parts); a plain geometry also works (drawn white, or in `color` when given).
 */
export interface PropDef {
  bone: string;
  /** Offset in the bone frame (body units) and rotation (Euler XYZ). */
  pos: [number, number, number];
  rot?: [number, number, number];
  build(): THREE.BufferGeometry;
  /** Colour of a geometry built without vertex colours. */
  color?: THREE.ColorRepresentation;
  /** Spin about a local axis (radians/s), e.g. a whip or a sling circling (calmed with reduced motion). */
  spin?: { axis: "x" | "y" | "z"; speed: number };
}

const WOOD = "#7a5233";
const WOOD_D = "#5e3b22";
const IRON = "#5d5a56";
const COTTON = "#efe6d6";
const CLAY = "#b5653b";
const STRAW = "#c99a55";
const TINT = "tint";

/** Builds a merged prop geometry from primitives with a colour (or "tint") each. Public for world props. */
export class PropKit {
  private list: THREE.BufferGeometry[] = [];
  add(
    g: THREE.BufferGeometry,
    color: string,
    p: [number, number, number] = [0, 0, 0],
    r: [number, number, number] = [0, 0, 0],
    s: [number, number, number] = [1, 1, 1],
  ) {
    const geo = g.index ? g.toNonIndexed() : g.clone();
    g.dispose();
    for (const k of Object.keys(geo.attributes)) if (k !== "position" && k !== "normal") geo.deleteAttribute(k);
    geo.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...p),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
        new THREE.Vector3(...s),
      ),
    );
    const n = geo.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    const tint = new Float32Array(n);
    const c = new THREE.Color(color === TINT ? "#ffffff" : color);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      tint[i] = color === TINT ? 1 : 0;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aTint", new THREE.BufferAttribute(tint, 1));
    this.list.push(geo);
    return this;
  }
  build() {
    const g = mergeGeometries(this.list, false);
    for (const x of this.list) x.dispose();
    g.computeBoundingSphere();
    return g;
  }
}

const cyl = (r0: number, r1: number, h: number, n = 8) => new THREE.CylinderGeometry(r0, r1, h, n);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const sph = (r: number, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const ico = (r: number) => new THREE.IcosahedronGeometry(r, 0);

/** Grip at the palm (the hand bone sits at the wrist). */
const GRIP: [number, number, number] = [0, -0.07, 0.02];
const at = (p: [number, number, number], d: [number, number, number]): [number, number, number] => [
  p[0] + d[0],
  p[1] + d[1],
  p[2] + d[2],
];

export const PROPS: Record<PropKind, PropDef> = {
  chakitaqlla: {
    // The Andean foot plough held in both hands, blade forward and down.
    bone: "handR",
    pos: at(GRIP, [0, 0, 0]),
    rot: [-1.15, 0, 0],
    build: () =>
      new PropKit()
        .add(cyl(0.028, 0.028, 1.4, 6), WOOD, [0, -0.25, 0])
        .add(cyl(0.026, 0.026, 0.25, 6), WOOD, [0, 0.5, -0.04], [-0.35, 0, 0])
        .add(box(0.16, 0.04, 0.05), WOOD_D, [0.07, -0.71, 0])
        .add(box(0.07, 0.18, 0.03), IRON, [0, -1.0, 0.01])
        .build(),
  },
  staff: {
    bone: "handR",
    pos: at(GRIP, [0, 0, 0]),
    build: () =>
      new PropKit()
        .add(cyl(0.022, 0.026, 1.55, 6), WOOD, [0, 0.12, 0])
        .add(ico(0.04), WOOD_D, [0, 0.9, 0])
        .build(),
  },
  "basket-hand": {
    bone: "handR",
    pos: at(GRIP, [0, -0.02, 0]),
    build: () =>
      new PropKit()
        .add(new THREE.TorusGeometry(0.13, 0.012, 4, 12, Math.PI), "#b8873f", [0, -0.02, 0], [0, Math.PI / 2, 0])
        .add(cyl(0.17, 0.13, 0.16, 10), STRAW, [0, -0.22, 0])
        .add(cyl(0.165, 0.165, 0.02, 10), TINT, [0, -0.15, 0])
        .add(ico(0.05), "#7a4f3a", [-0.05, -0.13, 0.02])
        .add(ico(0.045), "#a8705a", [0.05, -0.13, -0.02])
        .build(),
  },
  "basket-back": {
    // A carrying basket on the back, a tumpline strap over the forehead / shoulders (Amazon, coast).
    bone: "chest",
    pos: [0, -0.06, -0.24],
    rot: [0.12, 0, 0],
    build: () =>
      new PropKit()
        .add(cyl(0.19, 0.14, 0.42, 10), STRAW, [0, 0, 0])
        .add(cyl(0.195, 0.195, 0.03, 10), TINT, [0, 0.2, 0])
        .add(cyl(0.18, 0.18, 0.02, 10), "#8a6633", [0, -0.1, 0])
        .add(box(0.04, 0.3, 0.02), "#8a6633", [0.1, 0.12, 0.2], [0.4, 0, 0])
        .add(box(0.04, 0.3, 0.02), "#8a6633", [-0.1, 0.12, 0.2], [0.4, 0, 0])
        .build(),
  },
  qipi: {
    // A load wrapped in a lliclla, carried on the back, the ends knotted at the chest.
    bone: "chest",
    pos: [0, -0.07, -0.25],
    rot: [0.1, 0, 0],
    build: () =>
      new PropKit()
        .add(box(0.4, 0.32, 0.2), TINT, [0, 0, 0])
        .add(cyl(0.1, 0.1, 0.36, 8), TINT, [0, 0, 0], [0, 0, Math.PI / 2], [1, 1, 1.05])
        .add(box(0.41, 0.03, 0.205), COTTON, [0, -0.08, 0])
        .add(box(0.41, 0.03, 0.205), COTTON, [0, 0.08, 0])
        .add(box(0.05, 0.03, 0.42), TINT, [0.11, 0.17, 0.2], [0.35, 0, -0.5])
        .add(box(0.05, 0.03, 0.42), TINT, [-0.11, 0.17, 0.2], [0.35, 0, 0.5])
        .add(ico(0.055), TINT, [0, 0.1, 0.4])
        .build(),
  },
  pouch: {
    bone: "hips",
    pos: [0.08, 0.1, 0.16],
    build: () => new PropKit().add(sph(0.11, 8, 6), TINT, [0, 0, 0], [0, 0, 0], [1, 0.8, 0.6]).build(),
  },
  panuelo: {
    bone: "handR",
    pos: at(GRIP, [0, -0.02, 0.03]),
    build: () =>
      new PropKit()
        .add(box(0.2, 0.2, 0.012), COTTON, [0, -0.1, 0], [0, 0, 0.2])
        .add(box(0.2, 0.02, 0.013), TINT, [0.02, -0.2, 0], [0, 0, 0.2])
        .build(),
  },
  cup: {
    bone: "handR",
    pos: at(GRIP, [0, 0.0, 0.03]),
    build: () =>
      new PropKit()
        .add(cyl(0.05, 0.04, 0.11, 8), CLAY, [0, 0.03, 0])
        .add(cyl(0.052, 0.052, 0.015, 8), COTTON, [0, 0.07, 0])
        .add(cyl(0.044, 0.044, 0.01, 8), "#5b2a4e", [0, 0.08, 0])
        .build(),
  },
  ladle: {
    bone: "handR",
    pos: at(GRIP, [0, 0, 0.02]),
    rot: [0.3, 0, 0],
    build: () =>
      new PropKit()
        .add(cyl(0.016, 0.016, 0.5, 6), WOOD, [0, -0.2, 0])
        .add(sph(0.06, 8, 4), "#6a4329", [0, -0.47, 0], [Math.PI, 0, 0], [1, 0.7, 1])
        .build(),
  },
  stone: {
    bone: "handR",
    pos: at(GRIP, [0, -0.04, 0.03]),
    build: () => new PropKit().add(ico(0.08), "#9a9184", [0, 0, 0], [0.4, 0.7, 0], [1.1, 0.8, 0.95]).build(),
  },
  spool: {
    bone: "handR",
    pos: at(GRIP, [0, 0, 0.02]),
    rot: [0, 0, Math.PI / 2],
    build: () =>
      new PropKit()
        .add(cyl(0.012, 0.012, 0.22, 6), WOOD, [0, 0, 0])
        .add(cyl(0.035, 0.035, 0.1, 8), COTTON, [0, 0, 0])
        .build(),
  },
  pushka: {
    // Drop spindle: a shaft, a whorl, the ball of spun wool, held low by the twirling hand.
    bone: "handR",
    pos: at(GRIP, [0, -0.05, 0.03]),
    build: () =>
      new PropKit()
        .add(cyl(0.012, 0.012, 0.36, 6), WOOD, [0, -0.12, 0])
        .add(cyl(0.05, 0.05, 0.02, 8), WOOD, [0, -0.24, 0])
        .add(ico(0.06), TINT, [0, -0.08, 0], [0, 0, 0], [1, 1.3, 1])
        .add(cyl(0.004, 0.004, 0.3, 4), COTTON, [0, 0.12, 0])
        .build(),
  },
  knitting: {
    // Needles and a chullo being knitted, held before the chest.
    bone: "chest",
    pos: [0, -0.05, 0.24],
    rot: [-0.3, 0, 0],
    build: () =>
      new PropKit()
        .add(new THREE.ConeGeometry(0.09, 0.16, 8), TINT, [0, 0, 0])
        .add(cyl(0.092, 0.092, 0.025, 8), COTTON, [0, -0.07, 0])
        .add(cyl(0.006, 0.006, 0.26, 4), "#d9d3c4", [0.07, 0.04, 0.03], [0, 0, 0.5])
        .add(cyl(0.006, 0.006, 0.26, 4), "#d9d3c4", [-0.07, 0.04, 0.03], [0, 0, -0.5])
        .build(),
  },
  paddle: {
    bone: "handR",
    pos: at(GRIP, [0, 0, 0]),
    build: () =>
      new PropKit()
        .add(cyl(0.022, 0.022, 1.1, 6), WOOD, [0, -0.25, 0])
        .add(box(0.15, 0.36, 0.02), WOOD_D, [0, -0.95, 0])
        .add(box(0.08, 0.04, 0.04), WOOD_D, [0, 0.3, 0])
        .build(),
  },
  pole: {
    bone: "handR",
    pos: at(GRIP, [0, 0, 0]),
    build: () => new PropKit().add(cyl(0.025, 0.03, 3.2, 6), WOOD, [0, -0.6, 0]).build(),
  },
  net: {
    // A cast net gathered over the arm (a cone of mesh read as a soft bundle).
    bone: "handR",
    pos: at(GRIP, [0, -0.15, 0.05]),
    build: () =>
      new PropKit()
        .add(new THREE.ConeGeometry(0.22, 0.45, 10, 1, true), "#cfc6b0", [0, -0.12, 0])
        .add(new THREE.TorusGeometry(0.2, 0.015, 4, 12), "#8f877b", [0, -0.34, 0], [Math.PI / 2, 0, 0])
        .build(),
  },
  bananas: {
    // A bunch of green bananas on the shoulder, steadied by the raised hand.
    bone: "chest",
    pos: [-0.17, 0.2, -0.02],
    rot: [0, 0, -0.4],
    build: () => {
      const k = new PropKit().add(cyl(0.03, 0.03, 0.5, 6), "#6b5a3a", [0, 0, 0], [0, 0, Math.PI / 2]);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        k.add(
          cyl(0.025, 0.02, 0.18, 5),
          i % 3 ? "#7fa83a" : "#6d9a30",
          [-0.18 + i * 0.04, Math.cos(a) * 0.06, Math.sin(a) * 0.06],
          [a, 0, 0.6],
        );
      }
      return k.build();
    },
  },
  board: {
    bone: "handR",
    pos: at(GRIP, [0.04, 0.05, -0.05]),
    rot: [0, 0, 0],
    build: () =>
      new PropKit()
        .add(box(0.05, 1.7, 0.44), TINT, [0.04, 0.15, 0], [0, 0, 0], [1, 1, 1])
        .add(box(0.052, 1.6, 0.03), COTTON, [0.04, 0.15, 0])
        .build(),
  },
  cooler: {
    bone: "hips",
    pos: [0.24, 0.0, 0.0],
    build: () =>
      new PropKit()
        .add(box(0.16, 0.22, 0.3), TINT, [0, 0, 0])
        .add(box(0.17, 0.04, 0.31), COTTON, [0, 0.12, 0])
        .add(box(0.02, 0.5, 0.03), "#2a2420", [-0.09, 0.32, 0], [0, 0, 0.6])
        .build(),
  },
  stick: {
    bone: "handR",
    pos: at(GRIP, [0, 0, 0.02]),
    rot: [-1.1, 0, 0],
    build: () => new PropKit().add(cyl(0.014, 0.018, 0.7, 5), WOOD_D, [0, -0.25, 0]).build(),
  },
  pot: {
    bone: "handL",
    pos: at(GRIP, [0, 0.02, 0.06]),
    build: () =>
      new PropKit()
        .add(sph(0.12, 10, 8), CLAY, [0, 0, 0], [0, 0, 0], [1, 0.9, 1])
        .add(cyl(0.05, 0.06, 0.06, 8), CLAY, [0, 0.12, 0])
        .add(cyl(0.122, 0.122, 0.03, 10), COTTON, [0, 0.0, 0])
        .add(cyl(0.123, 0.123, 0.01, 10), "#2a1d17", [0, 0.0, 0])
        .build(),
  },
  brush: {
    bone: "handR",
    pos: at(GRIP, [0, 0, 0.03]),
    rot: [-0.9, 0, 0],
    build: () =>
      new PropKit()
        .add(cyl(0.007, 0.007, 0.18, 4), WOOD, [0, -0.06, 0])
        .add(cyl(0.012, 0.004, 0.04, 4), "#2a1d17", [0, -0.16, 0])
        .build(),
  },
  camera: {
    // A small camera held up in both hands before the face (the "photo" action).
    bone: "handR",
    pos: at(GRIP, [0.05, 0.04, 0.05]),
    build: () =>
      new PropKit()
        .add(box(0.13, 0.08, 0.06), "#24262c", [0, 0, 0])
        .add(cyl(0.025, 0.028, 0.04, 10), "#3a3d45", [0, 0, 0.045], [Math.PI / 2, 0, 0])
        .add(cyl(0.016, 0.016, 0.006, 10), "#7fb6d6", [0, 0, 0.066], [Math.PI / 2, 0, 0])
        .build(),
  },
  phone: {
    bone: "handR",
    pos: at(GRIP, [0.03, 0.03, 0.04]),
    build: () =>
      new PropKit()
        .add(box(0.07, 0.13, 0.012), "#1f2128", [0, 0, 0])
        .add(box(0.06, 0.115, 0.002), "#9fd7d0", [0, 0, -0.007])
        .build(),
  },
  whip: {
    // A braided whip (the ukuku's chicote, a herder's huaraca): a short handle and a thong that circles.
    bone: "handR",
    pos: at(GRIP, [0, 0, 0.02]),
    spin: { axis: "y", speed: 7 },
    build: () => {
      const k = new PropKit().add(cyl(0.018, 0.02, 0.22, 6), WOOD_D, [0, 0.06, 0]);
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        k.add(
          cyl(0.011 - t * 0.006, 0.011 - t * 0.006, 0.12, 5),
          i % 2 ? "#3b2a20" : TINT,
          [Math.sin(t * 1.4) * 0.35 * t + 0.04 * i, 0.17 + 0.02 * i - t * t * 0.3, 0],
          [0, 0, -1.2 + t * 0.6],
        );
      }
      return k.build();
    },
  },
  ball: {
    bone: "handR",
    pos: at(GRIP, [0, -0.06, 0.06]),
    build: () =>
      new PropKit()
        .add(sph(0.13, 10, 8), TINT)
        .add(cyl(0.131, 0.131, 0.05, 10), COTTON)
        .build(),
  },
};

function propMaterial(): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap() });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aTint;").replace(
      "#include <color_vertex>",
      // Only the tinted parts take the instance colour (three would tint everything).
      "#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\n  vColor.rgb = mix( color.rgb, instanceColor.rgb, aTint );\n#endif",
    );
  };
  m.customProgramCacheKey = () => "ch-props";
  return paintStrength(m, 0);
}

/** Every prop kind, built in and world-defined (`HeldProps.define`). */
const REGISTRY = new Map<string, PropDef>();
const defOf = (kind: string): PropDef => {
  const d = REGISTRY.get(kind) ?? (PROPS as Record<string, PropDef>)[kind];
  if (!d) throw new Error(`characters: no prop kind "${kind}" (HeldProps.define it first)`);
  return d;
};

/** A geometry ready for the prop material: vertex colours and the tint mask (defaults when missing). */
function ready(g: THREE.BufferGeometry, color?: THREE.ColorRepresentation): THREE.BufferGeometry {
  const n = g.getAttribute("position").count;
  if (!g.getAttribute("color")) {
    const c = new THREE.Color(color ?? "#ffffff");
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  }
  if (!g.getAttribute("aTint")) g.setAttribute("aTint", new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}

interface Slot {
  holder: PropHolder;
  kind: string;
  index: number;
  visible: boolean;
}

const tmp = new THREE.Matrix4();
const off = new THREE.Matrix4();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const spinM = new THREE.Matrix4();
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);

export interface PropHandle {
  /** Show or hide this prop (e.g. the plough over the shoulder only while walking to the terrace). */
  show(on: boolean): void;
  /** Per-instance colour of the tinted parts. */
  tint(color: THREE.ColorRepresentation): void;
  detach(): void;
}

/** Instanced held props (one InstancedMesh per kind in use). */
export class HeldProps {
  readonly group = new THREE.Group();
  private meshes = new Map<string, { mesh: THREE.InstancedMesh; used: number; offset: THREE.Matrix4; def: PropDef }>();
  /** Reduced motion: spinning props turn slowly. */
  rm = false;

  /**
   * Register a prop kind for every HeldProps on the page (a world's khipu, conch, satchel…). Re-defining a
   * kind only affects the HeldProps that have not drawn it yet.
   */
  static define(kind: string, def: PropDef) {
    REGISTRY.set(kind, def);
  }

  /** True when the kind is built in or defined. */
  static has(kind: string): boolean {
    return REGISTRY.has(kind) || kind in PROPS;
  }
  private slots: Slot[] = [];
  private mat = propMaterial();

  constructor(private capacity = 32) {
    this.group.name = "characters:props";
  }

  attach(holder: PropHolder, kind: PropKind | (string & {}), tint?: THREE.ColorRepresentation): PropHandle {
    let m = this.meshes.get(kind);
    if (!m) {
      const def = defOf(kind);
      const mesh = new THREE.InstancedMesh(ready(def.build(), def.color), this.mat, this.capacity);
      mesh.name = `characters:prop:${kind}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      for (let i = 0; i < this.capacity; i++) mesh.setMatrixAt(i, ZERO);
      const offset = new THREE.Matrix4().compose(
        new THREE.Vector3(...def.pos),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(def.rot ?? [0, 0, 0]))),
        new THREE.Vector3(1, 1, 1),
      );
      m = { mesh, used: 0, offset, def };
      this.meshes.set(kind, m);
      this.group.add(mesh);
    }
    if (m.used >= this.capacity) throw new Error(`characters: too many ${kind} props`);
    const slot: Slot = { holder, kind, index: m.used++, visible: true };
    m.mesh.count = m.used;
    this.slots.push(slot);
    const mm = m;
    const handle: PropHandle = {
      show: (on) => {
        slot.visible = on;
      },
      tint: (c) => {
        mm.mesh.setColorAt(slot.index, new THREE.Color(c));
        if (mm.mesh.instanceColor) mm.mesh.instanceColor.needsUpdate = true;
      },
      detach: () => {
        slot.visible = false;
        mm.mesh.setMatrixAt(slot.index, ZERO);
        mm.mesh.instanceMatrix.needsUpdate = true;
        this.slots = this.slots.filter((s) => s !== slot);
      },
    };
    handle.tint(tint ?? "#c4383f");
    return handle;
  }

  /** Follow the bones (call after the people are posed). `t` (seconds) drives spinning props. */
  update(t = performance.now() / 1000) {
    for (const s of this.slots) {
      const m = this.meshes.get(s.kind);
      if (!m) continue;
      if (!s.visible || s.holder.shown === false) m.mesh.setMatrixAt(s.index, ZERO);
      else {
        const def = m.def;
        s.holder.boneWorld(def.bone, tmp);
        off.multiplyMatrices(tmp, m.offset);
        if (def.spin) {
          const a = t * def.spin.speed * (this.rm ? 0.25 : 1) + s.index;
          spinM.makeRotationAxis(def.spin.axis === "x" ? AX : def.spin.axis === "y" ? AY : AZ, a);
          off.multiply(spinM);
        }
        m.mesh.setMatrixAt(s.index, off);
      }
    }
    for (const m of this.meshes.values()) m.mesh.instanceMatrix.needsUpdate = true;
  }

  drawCalls() {
    let n = 0;
    for (const m of this.meshes.values()) if (this.slots.some((s) => s.kind && s.visible)) n += m.used ? 1 : 0;
    return n;
  }

  dispose() {
    for (const m of this.meshes.values()) {
      m.mesh.geometry.dispose();
      m.mesh.dispose();
    }
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
