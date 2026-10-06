import "./hud.css";
import "./npc.css";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { sfx } from "../audio";
import { t as tr, type UIKey } from "../i18n/ui";
import { CATALOG } from "../lib/passport";
import { makeChip, releaseChips, trailChips } from "./ambient/errand/chips";
import {
  ARRIVE_R,
  accept as acceptErrand,
  arrive as arriveErrand,
  type ErrandState,
  loadErrands,
  type Mission,
  missionById,
  offerable,
  saveErrands,
  targetT,
} from "./ambient/errand/state";
import type { Ambient, CreateAmbient, WorldEnv } from "./contract";
import { STATIONS } from "./contract";
import { type Body, creatures } from "./creatures";
import { emit } from "./events";
import { type Convo, DialogMachine, MISSION_DIALOGS, NPC_DIALOGS, type NpcDialog } from "./npc-dialogs";
import { DYE } from "./palette";

/**
 * Tech chasquis: 7 NPC messengers walking the Qhapaq Ñan up and down. Each wears an unku tunic with khipu-dye
 * bands, a llawt'u headband (most with the chasqui's white plume) and carries something: a khipu, a pututo conch,
 * a glowing tablet, a laptop satchel, a tiny server rack, or a llama. Bodies are procedural and cheap: every limb
 * is one merged, vertex-colored toon mesh (one shared material). Walk/run gaits, rests at tambos, stepping aside
 * for the traveler, turning to face them, and idle gestures while talking are all procedural.
 *
 * Dialog is a DOM paper-and-ink speech card anchored to the NPC's head (docked on narrow screens), with a typewriter
 * reveal, Space/E to advance, 1–3 or buttons for choices, Esc to close. "Talked to N chasquis" persists in
 * localStorage, with a toast at milestones.
 *
 * Errands (ambient/errand/state.ts): any chasqui offers the next of three khipu relays when its tambo is a good
 * walk uphill. Accepting ties a knotted khipu to the traveler's pack, shows an objective chip (top-left trail
 * chips) and emits `world:mission`; walking into the target plaza delivers it (thank-you card, `mission:N` stamp).
 * Every chasqui (and Sisa's llama) is a solid Body in `creatures`: they look ahead and change lane around other
 * bodies, and separation keeps them from overlapping.
 */

const C_INK = "#1f1a17";
const SANDAL = "#4a2e1c";
const TALK_R = 2.6;
const LEAVE_R = 5.2;
const STORE_KEY = "qn.npcs.talked";

type Carry = "staff" | "pututo" | "khipuHand" | "khipuHip" | "rack" | "satchel" | "tablet" | "tabletL" | "bundle";

interface Look {
  skin: string;
  hair: string;
  tunic: string;
  bands: [string, string];
  headband: string;
  plume: string | null;
  scale: number;
  girth: number;
  hunch: number;
  carry: Carry[];
  hat?: "montera";
  braids?: boolean;
  ponytail?: boolean;
  beard?: boolean;
  llama?: boolean;
}

interface Route {
  tMin: number;
  tMax: number;
  t0: number;
  dir: 1 | -1;
  /** Cruise speed (world units / s). */
  speed: number;
  /** Speeds over 2.6 read as a run. Some NPCs alternate walk and jog. */
  jog?: number;
  restChance: number;
}

interface Spec {
  id: string;
  dye: string;
  look: Look;
  route: Route;
}

export const NPC_SPECS: Spec[] = [
  {
    id: "amauta",
    dye: DYE.alpaca,
    look: {
      skin: "#9a6440",
      hair: "#d9d4cc",
      tunic: "#8a6a4a",
      bands: [DYE.ochre, DYE.red],
      headband: DYE.red,
      plume: "#e9e4da",
      scale: 0.95,
      girth: 1.08,
      hunch: 0.2,
      carry: ["staff", "khipuHip"],
      beard: true,
    },
    route: { tMin: 0.02, tMax: 0.3, t0: 0.05, dir: 1, speed: 0.95, restChance: 0.8 },
  },
  {
    id: "killa",
    dye: DYE.red,
    look: {
      skin: "#b9764a",
      hair: "#241914",
      tunic: DYE.cotton,
      bands: [DYE.red, DYE.indigo],
      headband: DYE.red,
      plume: "#ffffff",
      scale: 1,
      girth: 0.9,
      hunch: 0,
      carry: ["pututo", "khipuHand"],
      ponytail: true,
    },
    route: { tMin: 0.04, tMax: 0.62, t0: 0.4, dir: -1, speed: 4.2, restChance: 0.15 },
  },
  {
    id: "waman",
    dye: DYE.indigo,
    look: {
      skin: "#8e5a38",
      hair: "#221813",
      tunic: DYE.indigo,
      bands: [DYE.turq, DYE.ochre],
      headband: DYE.ochre,
      plume: "#ffffff",
      scale: 1.04,
      girth: 1.25,
      hunch: 0.12,
      carry: ["rack"],
    },
    route: { tMin: 0.12, tMax: 0.46, t0: 0.2, dir: 1, speed: 1.25, restChance: 0.5 },
  },
  {
    id: "sisa",
    dye: DYE.turq,
    look: {
      skin: "#a86a42",
      hair: "#1c1411",
      tunic: DYE.turq,
      bands: [DYE.red, DYE.cotton],
      headband: DYE.indigo,
      plume: null,
      scale: 0.92,
      girth: 1,
      hunch: 0,
      carry: ["bundle", "khipuHand"],
      braids: true,
      llama: true,
    },
    route: { tMin: 0.3, tMax: 0.6, t0: 0.5, dir: -1, speed: 1.15, restChance: 0.6 },
  },
  {
    id: "inti",
    dye: DYE.ochre,
    look: {
      skin: "#c08458",
      hair: "#2a1d17",
      tunic: DYE.ochre,
      bands: [DYE.indigo, DYE.red],
      headband: DYE.turq,
      plume: "#ffffff",
      scale: 1,
      girth: 1,
      hunch: 0.1,
      carry: ["tablet"],
    },
    route: { tMin: 0.44, tMax: 0.64, t0: 0.58, dir: 1, speed: 1.2, restChance: 0.4 },
  },
  {
    id: "yupanqui",
    dye: DYE.red,
    look: {
      skin: "#9b6239",
      hair: "#1f1612",
      tunic: DYE.red,
      bands: [DYE.cotton, DYE.ochre],
      headband: DYE.indigo,
      plume: "#ffffff",
      scale: 1.08,
      girth: 1,
      hunch: 0,
      carry: ["satchel", "khipuHip"],
    },
    route: { tMin: 0.72, tMax: 0.95, t0: 0.75, dir: 1, speed: 1.55, restChance: 0.5 },
  },
  {
    id: "chaska",
    dye: DYE.turq,
    look: {
      skin: "#b47a50",
      hair: "#1c1411",
      tunic: DYE.alpaca,
      bands: [DYE.turq, DYE.red],
      headband: DYE.red,
      plume: null,
      scale: 0.94,
      girth: 0.95,
      hunch: 0,
      carry: ["tabletL", "khipuHand"],
      hat: "montera",
      braids: true,
    },
    route: { tMin: 0.74, tMax: 0.97, t0: 0.9, dir: -1, speed: 1.4, jog: 3.2, restChance: 0.35 },
  },
];

// ------------------------------------------------------------------ geometry: one merged vertex-colored mesh per limb

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

class Part {
  private list: THREE.BufferGeometry[] = [];
  add(src: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    tmpQ.setFromEuler(tmpE.set(rx, ry, rz));
    g.applyMatrix4(tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)));
    const n = g.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    tmpC.set(color); // ColorManagement already converts sRGB hex to the linear working space
    for (let i = 0; i < n; i++) col.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.list.push(g);
    return this;
  }
  get empty() {
    return this.list.length === 0;
  }
  mesh(mat: THREE.Material, name: string) {
    const merged = mergeGeometries(this.list, false);
    for (const g of this.list) g.dispose();
    this.list = [];
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, mat);
    m.name = name;
    return m;
  }
}

/** Shared primitive prototypes (disposed after the build). */
function protos() {
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    sph: new THREE.SphereGeometry(1, 10, 8),
    lowSph: new THREE.IcosahedronGeometry(1, 0),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
    cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
    cone: new THREE.ConeGeometry(1, 1, 8),
    cap: new THREE.CapsuleGeometry(1, 1, 2, 8),
    torus: new THREE.TorusGeometry(1, 0.16, 5, 14),
    halfSph: new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
  };
}
type Protos = ReturnType<typeof protos>;

interface Rig {
  group: THREE.Group;
  rig: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  plume: THREE.Object3D | null;
  leds: THREE.Mesh | null;
  geos: THREE.BufferGeometry[];
}

/** A hanging khipu: a cotton top cord with colored pendants and knots. */
function khipu(p: Part, P: Protos, x: number, y: number, z: number, colors: string[], s = 1) {
  p.add(P.cyl6, DYE.cotton, x, y, z, 0, 0, Math.PI / 2, 0.018 * s, 0.2 * s, 0.018 * s);
  colors.forEach((c, i) => {
    const cx = x - 0.08 * s + i * (0.16 / Math.max(1, colors.length - 1)) * s;
    const len = (0.16 + (i % 2) * 0.05) * s;
    p.add(P.cyl6, c, cx, y - len / 2, z, 0, 0, 0, 0.012 * s, len, 0.012 * s);
    p.add(P.lowSph, c, cx, y - len * 0.55, z, 0, 0, 0, 0.022 * s, 0.022 * s, 0.022 * s);
  });
}

function buildNpc(env: WorldEnv, spec: Spec, mat: THREE.Material, P: Protos): Rig {
  const L = spec.look;
  const g = L.girth;
  const group = new THREE.Group();
  group.name = `npc:${spec.id}`;
  const rig = new THREE.Group();
  rig.scale.setScalar(L.scale);
  group.add(rig);
  const geos: THREE.BufferGeometry[] = [];
  const done = (p: Part, name: string) => {
    const m = p.mesh(mat, name);
    geos.push(m.geometry);
    return m;
  };

  // Legs: bare calves (the unku is knee-length), ankle ties in dye, leather sandals.
  const makeLeg = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.1 * side * g, 0.55, 0);
    const p = new Part();
    p.add(P.cap, L.skin, 0, -0.24, 0, 0, 0, 0, 0.075, 0.28, 0.075);
    p.add(P.cyl, L.bands[0], 0, -0.43, 0, 0, 0, 0, 0.082, 0.04, 0.082);
    p.add(P.box, SANDAL, 0, -0.51, 0.035, 0, 0, 0, 0.14, 0.06, 0.24);
    pivot.add(done(p, `${spec.id}:leg`));
    rig.add(pivot);
    return pivot;
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  // Torso: unku tunic (slightly squared cone) with dye bands and a tocapu checker belt.
  const torso = new THREE.Group();
  torso.position.y = 0.55;
  rig.add(torso);
  const tp = new Part();
  tp.add(P.cyl, L.tunic, 0, 0.2, 0, 0, 0, 0, 0.21 * g, 0.66, 0.17 * g);
  tp.add(P.cyl, L.tunic, 0, -0.08, 0, 0, 0, 0, 0.255 * g, 0.12, 0.2 * g);
  tp.add(P.cyl, L.bands[0], 0, -0.13, 0, 0, 0, 0, 0.262 * g, 0.05, 0.205 * g);
  tp.add(P.cyl, L.bands[1], 0, 0.42, 0, 0, 0, 0, 0.205 * g, 0.045, 0.168 * g);
  for (let i = 0; i < 5; i++) {
    const a = -0.5 + i * 0.25;
    tp.add(
      P.box,
      i % 2 ? L.bands[0] : L.bands[1],
      Math.sin(a) * 0.205 * g,
      0.16,
      Math.cos(a) * 0.168 * g,
      0,
      a,
      0,
      0.07,
      0.07,
      0.02,
    );
  }
  tp.add(P.cyl, L.skin, 0, 0.56, 0, 0, 0, 0, 0.075, 0.1, 0.075);

  // Arms: bare, with dye wrist bands.
  const armGroups: THREE.Group[] = [];
  const armParts: Part[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.27 * side * g, 0.47, 0);
    torso.add(pivot);
    const ap = new Part();
    ap.add(P.cap, L.skin, 0, -0.17, 0, 0, 0, 0, 0.06, 0.24, 0.06);
    ap.add(P.cyl, L.bands[1], 0, -0.3, 0, 0, 0, 0, 0.066, 0.04, 0.066);
    ap.add(P.sph, L.skin, 0, -0.37, 0.01, 0, 0, 0, 0.068, 0.068, 0.068);
    armGroups.push(pivot);
    armParts.push(ap);
  }
  const [armL, armR] = armGroups as [THREE.Group, THREE.Group];
  const [apL, apR] = armParts as [Part, Part];

  // Head
  const head = new THREE.Group();
  head.position.y = 0.62;
  torso.add(head);
  const hp = new Part();
  hp.add(P.sph, L.skin, 0, 0.2, 0, 0, 0, 0, 0.22, 0.215, 0.205);
  hp.add(P.halfSph, L.hair, 0, 0.21, -0.012, -0.25, 0, 0, 0.232, 0.232, 0.225);
  for (const s of [-1, 1]) hp.add(P.sph, C_INK, 0.078 * s, 0.17, 0.2, 0, 0, 0, 0.024, 0.032, 0.012);
  hp.add(P.sph, "#8a4f30", 0, 0.12, 0.215, 0, 0, 0, 0.032, 0.032, 0.03);
  for (const s of [-1, 1]) hp.add(P.sph, "#c4565a", 0.13 * s, 0.1, 0.17, 0, 0, 0, 0.03, 0.018, 0.012);
  if (L.beard) {
    hp.add(P.box, L.hair, 0, 0.065, 0.19, 0, 0, 0, 0.16, 0.04, 0.05);
    hp.add(P.sph, L.hair, 0, 0.02, 0.17, 0, 0, 0, 0.09, 0.08, 0.06);
  }
  if (L.ponytail) hp.add(P.cap, L.hair, 0, 0.12, -0.24, 0.5, 0, 0, 0.05, 0.16, 0.05);
  if (L.braids)
    for (const s of [-1, 1]) {
      hp.add(P.cap, L.hair, 0.16 * s, -0.02, -0.1, 0.15, 0, 0.08 * s, 0.04, 0.22, 0.04);
      hp.add(P.sph, L.bands[0], 0.17 * s, -0.17, -0.12, 0, 0, 0, 0.035, 0.035, 0.035);
    }
  let plume: THREE.Object3D | null = null;
  if (L.hat === "montera") {
    // Andean montera: a wide flat round hat with a dyed fringe.
    hp.add(P.cyl, L.headband, 0, 0.36, 0, 0, 0, 0, 0.34, 0.05, 0.34);
    hp.add(P.cyl, L.headband, 0, 0.42, 0, 0, 0, 0, 0.19, 0.1, 0.19);
    hp.add(P.cyl, DYE.ochre, 0, 0.335, 0, 0, 0, 0, 0.345, 0.025, 0.345);
    hp.add(P.cyl, DYE.cotton, 0, 0.475, 0, 0, 0, 0, 0.12, 0.02, 0.12);
  } else {
    // Llawt'u headband in dye, with a knot at the back.
    hp.add(P.cyl, L.headband, 0, 0.27, 0, 0, 0, 0, 0.228, 0.06, 0.215);
    hp.add(P.cyl, L.bands[0], 0, 0.27, 0, 0, 0, 0, 0.232, 0.018, 0.219);
    hp.add(P.lowSph, L.headband, 0, 0.27, -0.22, 0, 0, 0, 0.05, 0.05, 0.04);
  }
  const headMesh = done(hp, `${spec.id}:head`);
  head.add(headMesh);
  if (L.plume) {
    // Chasqui plume: a small fan of white feathers on its own pivot (it sways with the gait).
    const pp = new Part();
    for (let i = -1; i <= 1; i++) pp.add(P.cone, L.plume, i * 0.05, 0.14, 0, 0, 0, i * 0.35, 0.045, 0.3, 0.04);
    pp.add(P.lowSph, L.bands[1], 0, 0.0, 0, 0, 0, 0, 0.04, 0.04, 0.04);
    const pm = done(pp, `${spec.id}:plume`);
    const piv = new THREE.Group();
    piv.position.set(0, 0.32, -0.04);
    piv.add(pm);
    head.add(piv);
    plume = piv;
  }

  // ---- Carried things
  let leds: THREE.Mesh | null = null;
  const owned = (m: THREE.Mesh) => {
    geos.push(m.geometry);
    return m;
  };
  for (const c of L.carry) {
    if (c === "staff") {
      apR.add(P.cyl6, "#6b4226", 0, -0.42, 0.06, 0, 0, 0, 0.025, 1.2, 0.025);
      apR.add(P.lowSph, DYE.ochre, 0, 0.2, 0.06, 0, 0, 0, 0.05, 0.05, 0.05);
      apR.add(P.cyl6, DYE.red, 0, 0.12, 0.06, 0, 0, 0, 0.032, 0.05, 0.032);
    } else if (c === "khipuHand") {
      khipu(c === "khipuHand" && L.carry.includes("tabletL") ? apR : apL, P, 0, -0.42, 0.04, [
        DYE.red,
        DYE.indigo,
        DYE.ochre,
        DYE.turq,
      ]);
    } else if (c === "khipuHip") {
      khipu(tp, P, 0.2 * g, -0.02, 0.1 * g, [DYE.ochre, DYE.red, DYE.indigo, DYE.turq, DYE.cotton], 0.9);
    } else if (c === "pututo") {
      // Pututo conch on a cord at the hip: spiral body + flared lip.
      tp.add(P.cyl6, "#6b4226", -0.12 * g, 0.2, 0.13 * g, 0, 0, -0.7, 0.012, 0.42, 0.012);
      tp.add(P.cone, "#f2d9c4", -0.25 * g, 0.0, 0.12 * g, 0, 0, Math.PI / 2 + 0.3, 0.075, 0.24, 0.075);
      tp.add(P.sph, "#e8b9a0", -0.13 * g, -0.03, 0.12 * g, 0, 0, 0, 0.07, 0.06, 0.06);
      tp.add(P.torus, "#d98f7a", -0.37 * g, 0.03, 0.12 * g, 0, Math.PI / 2, 0, 0.04, 0.04, 0.04);
    } else if (c === "rack") {
      // A tiny 4U rack on the back: frame, server faces, straps, and blinking LEDs (one emissive mesh).
      const z = -(0.17 * g + 0.12);
      tp.add(P.box, "#8a909b", 0, 0.28, z, 0, 0, 0, 0.4, 0.58, 0.26);
      for (let i = 0; i < 4; i++) tp.add(P.box, "#b7bcc4", 0, 0.08 + i * 0.13, z - 0.132, 0, 0, 0, 0.36, 0.1, 0.01);
      tp.add(P.box, DYE.ochre, 0, 0.61, z, 0, 0, 0, 0.44, 0.04, 0.32);
      for (const s of [-1, 1]) tp.add(P.box, "#4a2e1c", 0.13 * s, 0.3, 0.2 * g - 0.02, 0.05, 0, 0, 0.04, 0.5, 0.03);
      tp.add(P.box, DYE.cotton, 0.14, 0.04, z - 0.138, 0, 0, 0, 0.05, 0.06, 0.012);
      const lp = new Part();
      for (let i = 0; i < 4; i++)
        for (let k = 0; k < 3; k++)
          lp.add(P.box, "#ffffff", -0.13 + k * 0.05, 0.08 + i * 0.13, z - 0.14, 0, 0, 0, 0.025, 0.025, 0.01);
      const lm = lp.mesh(env.toon("#7af0c8", { emissive: "#3ce0a8", emissiveIntensity: 1.2 }), `${spec.id}:leds`);
      lm.geometry.deleteAttribute("color");
      owned(lm);
      env.noOutline(lm);
      torso.add(lm);
      leds = lm;
    } else if (c === "satchel") {
      // Laptop satchel on a cross-body strap; the lid peeks out.
      tp.add(P.box, "#6b4a2b", -0.27 * g, -0.02, 0.02, 0, 0, 0.05, 0.1, 0.28, 0.34);
      tp.add(P.box, DYE.ochre, -0.27 * g, 0.1, 0.02, 0, 0, 0.05, 0.11, 0.07, 0.35);
      tp.add(P.box, "#3d4046", -0.25 * g, 0.14, 0.02, 0, 0, 0.05, 0.03, 0.12, 0.28);
      tp.add(P.box, "#4a2e1c", 0, 0.2, 0.175 * g, 0, 0, 0.78, 0.045, 0.72, 0.02);
      tp.add(P.box, "#4a2e1c", 0, 0.2, -0.175 * g, 0, 0, -0.78, 0.045, 0.72, 0.02);
    } else if (c === "bundle") {
      // Q'ipi: a cloth bundle tied across the chest.
      tp.add(P.sph, DYE.red, 0, 0.3, -0.27 * g, 0, 0, 0, 0.24, 0.22, 0.15);
      tp.add(P.box, DYE.ochre, 0, 0.3, -0.27 * g, 0, 0, 0, 0.5, 0.05, 0.31);
      tp.add(P.box, DYE.indigo, 0, 0.35, 0.18 * g, 0, 0, 0, 0.24, 0.05, 0.03);
    }
  }
  const screens: THREE.Mesh[] = [];
  const screenMat = env.toon("#b8fff4", { emissive: "#58d8ca", emissiveIntensity: 1.1 });
  const addTablet = (parent: Part, holder: THREE.Group, x: number, y: number, z: number, rx: number) => {
    parent.add(P.box, "#2b2d33", x, y, z, rx, 0, 0, 0.3, 0.21, 0.022);
    const s = owned(new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.17), screenMat));
    s.position.set(x, y, z);
    s.rotation.x = rx;
    s.translateZ(0.013);
    s.rotateX(Math.PI); // the screen faces the holder (up/back toward the eyes)
    s.translateZ(0.027);
    env.noOutline(s);
    holder.add(s);
    screens.push(s);
  };
  if (L.carry.includes("tablet")) addTablet(tp, torso, 0, 0.36, 0.42, -0.9);
  if (L.carry.includes("tabletL")) addTablet(apL, armL, 0.0, -0.39, 0.06, -0.15);

  torso.add(done(tp, `${spec.id}:torso`));
  armL.add(done(apL, `${spec.id}:arm`));
  armR.add(done(apR, `${spec.id}:arm`));
  return { group, rig, torso, head, legL, legR, armL, armR, plume, leds, geos };
}

interface LlamaRig {
  group: THREE.Group;
  body: THREE.Group;
  neck: THREE.Group;
  legs: THREE.Group[];
  geos: THREE.BufferGeometry[];
}

function buildLlama(mat: THREE.Material, P: Protos): LlamaRig {
  const group = new THREE.Group();
  group.name = "npc:llama";
  const body = new THREE.Group();
  group.add(body);
  const geos: THREE.BufferGeometry[] = [];
  const wool = "#efe6d6";
  const bp = new Part();
  bp.add(P.cap, wool, 0, 0.78, 0, Math.PI / 2, 0, 0, 0.22, 0.42, 0.22);
  bp.add(P.lowSph, wool, 0, 0.82, -0.42, 0, 0, 0, 0.12, 0.12, 0.12);
  // Panniers with "Helm charts" in dye cloth + a tasseled saddle blanket.
  bp.add(P.box, DYE.red, 0, 0.98, 0, 0, 0, 0, 0.5, 0.06, 0.4);
  for (const s of [-1, 1]) {
    bp.add(P.box, s > 0 ? DYE.indigo : DYE.ochre, 0.27 * s, 0.82, 0.02, 0, 0, 0, 0.12, 0.24, 0.3);
    bp.add(P.box, DYE.cotton, 0.335 * s, 0.84, 0.02, 0, 0, 0, 0.012, 0.06, 0.2);
    bp.add(P.lowSph, DYE.turq, 0.26 * s, 1.0, 0.2, 0, 0, 0, 0.04, 0.04, 0.04);
  }
  const bm = bp.mesh(mat, "llama:body");
  geos.push(bm.geometry);
  body.add(bm);
  const neck = new THREE.Group();
  neck.position.set(0, 0.9, 0.36);
  body.add(neck);
  const np = new Part();
  np.add(P.cap, wool, 0, 0.26, 0.02, 0.12, 0, 0, 0.09, 0.42, 0.09);
  np.add(P.cap, wool, 0, 0.56, 0.1, Math.PI / 2 - 0.2, 0, 0, 0.085, 0.14, 0.085);
  np.add(P.sph, "#d8cbb4", 0, 0.54, 0.24, 0, 0, 0, 0.06, 0.055, 0.05);
  for (const s of [-1, 1]) {
    np.add(P.cone, wool, 0.06 * s, 0.7, 0.04, -0.15, 0, 0.2 * s, 0.03, 0.16, 0.025);
    np.add(P.lowSph, DYE.red, 0.065 * s, 0.68, 0.06, 0, 0, 0, 0.032, 0.032, 0.032);
    np.add(P.sph, C_INK, 0.06 * s, 0.6, 0.16, 0, 0, 0, 0.018, 0.022, 0.012);
  }
  const nm = np.mesh(mat, "llama:neck");
  geos.push(nm.geometry);
  neck.add(nm);
  const legs: THREE.Group[] = [];
  for (const [x, z] of [
    [0.12, 0.3],
    [-0.12, 0.3],
    [0.12, -0.3],
    [-0.12, -0.3],
  ] as const) {
    const piv = new THREE.Group();
    piv.position.set(x, 0.62, z);
    const lp = new Part();
    lp.add(P.cap, wool, 0, -0.3, 0, 0, 0, 0, 0.05, 0.5, 0.05);
    lp.add(P.box, "#3d2c22", 0, -0.6, 0.02, 0, 0, 0, 0.07, 0.05, 0.1);
    const lm = lp.mesh(mat, "llama:leg");
    geos.push(lm.geometry);
    piv.add(lm);
    body.add(piv);
    legs.push(piv);
  }
  return { group, body, neck, legs, geos };
}

// ------------------------------------------------------------------ runtime state

type Mode = "walk" | "turn" | "rest" | "attend" | "talk";

interface Npc {
  spec: Spec;
  dialog: NpcDialog;
  rig: Rig;
  llama: LlamaRig | null;
  t: number;
  dir: 1 | -1;
  lane: number;
  laneTarget: number;
  speed: number;
  mode: Mode;
  timer: number;
  restCooldown: number;
  rest: { k: number; target: THREE.Vector3; base: THREE.Vector3; hold: number; out: boolean } | null;
  yaw: number;
  phase: number;
  walkW: number;
  runW: number;
  talkW: number;
  restW: number;
  headYaw: number;
  acc: number;
  frame: number;
  jogT: number;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  llamaPos: THREE.Vector3;
  llamaYaw: number;
  llamaPhase: number;
  llamaSpeed: number;
  convoIdx: number;
  ledT: number;
  seed: number;
  body: Body;
  llamaBody: Body | null;
  /** Separation offset from other bodies (decays back to the lane). */
  offX: number;
  offZ: number;
  /** 0..1 slow-down when the way ahead is blocked on both sides. */
  block: number;
}

const damp = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));
const angleDamp = (cur: number, target: number, rate: number, dt: number) => {
  let d = target - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + d * (1 - Math.exp(-rate * dt));
};
const smooth = (x: number) => x * x * (3 - 2 * x);

function readTalked(): string[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeTalked(ids: string[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable (private mode, blocked): the counter just lives for this visit */
  }
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export const createNpcs: CreateAmbient = (env, hudRoot) => {
  const lang = env.lang;
  const T = (k: UIKey, vars: Record<string, string | number> = {}) =>
    tr(lang, k).replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v] ?? ""));
  const rm = env.reducedMotion;
  const trail = env.trail;
  const hw = trail.halfWidth;
  const len = Math.max(1, trail.length);

  // One vertex-colored toon material for every NPC body (shares the core's 3-step ramp).
  const ramp = env.toon("#ffffff").gradientMap;
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
  const P = protos();

  const root = new THREE.Group();
  root.name = "npc-chasquis";
  env.scene.add(root);

  const tambos = STATIONS.filter((s) => s.kind === "company").map((s) => ({ id: s.id, t: s.t }));
  const restSpot = (id: string, t: number) => {
    const base = trail.pointAt(t);
    const pose = env.stationPose(id).position;
    const d = Math.hypot(pose.x - base.x, pose.z - base.z);
    const k = Math.min(1, (hw + 1.6) / Math.max(d, 0.001));
    return new THREE.Vector3(base.x + (pose.x - base.x) * k, 0, base.z + (pose.z - base.z) * k);
  };
  const restSpots = new Map<string, THREE.Vector3>();
  for (const tb of tambos) {
    try {
      restSpots.set(tb.id, restSpot(tb.id, tb.t));
    } catch {
      /* station pose unavailable: that tambo just has no rest spot */
    }
  }

  const npcs: Npc[] = [];
  NPC_SPECS.forEach((spec, i) => {
    const dialog = NPC_DIALOGS.find((d) => d.id === spec.id);
    if (!dialog) return;
    const rig = buildNpc(env, spec, mat, P);
    root.add(rig.group);
    let llama: LlamaRig | null = null;
    if (spec.look.llama) {
      llama = buildLlama(mat, P);
      root.add(llama.group);
    }
    const r = spec.route;
    const pos = trail.pointAt(r.t0);
    npcs.push({
      spec,
      dialog,
      rig,
      llama,
      t: r.t0,
      dir: r.dir,
      lane: r.dir * 0.4 * hw,
      laneTarget: r.dir * 0.4 * hw,
      speed: r.speed,
      mode: "walk",
      timer: 0,
      restCooldown: 3 + i * 2,
      rest: null,
      yaw: 0,
      phase: i * 1.7,
      walkW: 1,
      runW: r.speed > 2.6 ? 1 : 0,
      talkW: 0,
      restW: 0,
      headYaw: 0,
      acc: 0,
      frame: i,
      jogT: 6 + i,
      pos: pos.clone(),
      prev: pos.clone(),
      llamaPos: pos.clone(),
      llamaYaw: 0,
      llamaPhase: 0,
      llamaSpeed: 0,
      convoIdx: 0,
      ledT: 0,
      seed: i * 7.3 + 1,
      body: creatures.add("chasqui", 0.36 * spec.look.scale * Math.max(1, spec.look.girth), {
        give: 0.35,
        x: pos.x,
        z: pos.z,
      }),
      llamaBody: llama ? creatures.add("pack-llama", 0.5, { give: 0.3, x: pos.x, z: pos.z }) : null,
      offX: 0,
      offZ: 0,
      block: 0,
    });
  });
  for (const k of Object.values(P)) k.dispose();

  // ------------------------------------------------------------------ DOM: tag, dialog card, toast
  const layer = el("div", "qn-hud qn-npc-layer");
  layer.lang = lang;
  hudRoot.appendChild(layer);

  const tag = el("button", "qn-npc-tag");
  tag.type = "button";
  tag.hidden = true;
  layer.appendChild(tag);

  const card = el("section", "qn-npc-card");
  card.hidden = true;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "false");
  card.id = "qn-npc-card";
  const head = el("header", "qn-npc-head");
  const swatch = el("span", "qn-npc-swatch");
  swatch.setAttribute("aria-hidden", "true");
  const who = el("div", "qn-npc-who");
  const nameEl = el("h2", "qn-npc-name");
  nameEl.id = "qn-npc-name";
  const roleEl = el("p", "qn-npc-role");
  who.append(nameEl, roleEl);
  const closeBtn = el("button", "qn-btn qn-icon qn-npc-close");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", tr(lang, "qn.close"));
  closeBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  head.append(swatch, who, closeBtn);
  card.setAttribute("aria-labelledby", "qn-npc-name");
  const textEl = el("p", "qn-npc-text");
  textEl.setAttribute("aria-hidden", "true");
  const live = el("p", "sr-only qn-npc-live");
  live.setAttribute("aria-live", "polite");
  const choicesEl = el("div", "qn-npc-choices");
  choicesEl.setAttribute("role", "group");
  choicesEl.setAttribute("aria-label", tr(lang, "qn.npc.choices"));
  const foot = el("footer", "qn-npc-foot");
  const nextBtn = el("button", "qn-btn qn-npc-next");
  nextBtn.type = "button";
  foot.append(nextBtn);
  card.append(head, textEl, live, choicesEl, foot);
  layer.appendChild(card);

  const toast = el("div", "qn-npc-toast");
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  layer.appendChild(toast);
  let toastTimer = 0;
  const showToast = (text: string) => {
    toast.textContent = text;
    toast.classList.add("is-on");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-on"), 3200);
  };

  // ------------------------------------------------------------------ errands: state, khipu on the pack, chip, thanks
  let errands: ErrandState = loadErrands();
  /** After "not now", chasquis just chat for a while before offering again. */
  let offerCooldown = 0;
  let avatarT = 0;
  const avatarPos = new THREE.Vector3();
  const L = (x: { es: string; en: string }) => x[lang];
  const stampLabel = (id: string) => CATALOG.find((c) => c.id === id)?.label ?? { es: id, en: id };

  const chips = trailChips(hudRoot);
  const errandChip = makeChip("errand", 1);
  errandChip.label.textContent = lang === "es" ? "Encargo" : "Errand";
  chips.appendChild(errandChip.chip);
  let chipText = "";

  const thanks = el("div", "qn-npc-thanks");
  thanks.setAttribute("role", "status");
  thanks.setAttribute("aria-live", "polite");
  const thanksWho = el("strong", "qn-npc-thanks-who");
  const thanksText = el("p", "qn-npc-thanks-text");
  const thanksSeal = el("span", "qn-npc-thanks-seal");
  thanks.append(thanksSeal, thanksWho, thanksText);
  layer.appendChild(thanks);
  let thanksTimer = 0;
  const showThanks = (m: Mission) => {
    thanksSeal.textContent = L(stampLabel(m.id));
    thanksWho.textContent = L(m.thanks.who);
    thanksText.textContent = L(m.thanks.text);
    thanks.classList.remove("is-on");
    void thanks.offsetWidth;
    thanks.classList.add("is-on");
    window.clearTimeout(thanksTimer);
    thanksTimer = window.setTimeout(() => thanks.classList.remove("is-on"), 6500);
  };

  /** The knotted khipu tied under the traveler's pack while an errand is carried. */
  let carried: { mesh: THREE.Mesh; swing: number } | null = null;
  const findPack = (traveler: THREE.Object3D) => {
    let pack: THREE.Object3D | null = null;
    traveler.traverse((o) => {
      if (!pack && o.type === "Group" && Math.abs(o.position.z + 0.25) < 0.02 && Math.abs(o.position.y - 0.28) < 0.02)
        pack = o;
    });
    return pack as THREE.Object3D | null;
  };
  const attachKhipu = () => {
    if (carried) return true;
    const traveler = env.scene.getObjectByName("traveler");
    if (!traveler) return false;
    const pack = findPack(traveler);
    const P2 = protos();
    const p = new Part();
    const colors = [DYE.red, DYE.ochre, DYE.indigo, DYE.turq, DYE.red, DYE.cotton];
    // Top cord across the pack's bottom edge, with a loop at each end tied to the straps.
    p.add(P2.cyl6, DYE.cotton, 0, 0, 0, 0, 0, Math.PI / 2, 0.022, 0.34, 0.022);
    for (const sx of [-1, 1]) p.add(P2.torus, DYE.cotton, 0.17 * sx, 0.025, 0, 0, 0, 0, 0.04, 0.04, 0.04);
    colors.forEach((c, i) => {
      const x = -0.14 + i * 0.056;
      const len = 0.19 + ((i * 7) % 3) * 0.04;
      p.add(P2.cyl6, c, x, -len / 2, 0, 0, 0, 0, 0.014, len, 0.014);
      // Knots (two or three per cord: the count is the message) and a little tassel end.
      const knots = 2 + (i % 2);
      for (let k = 0; k < knots; k++) p.add(P2.lowSph, c, x, -0.06 - k * 0.055, 0, 0, 0, 0, 0.027, 0.027, 0.027);
      p.add(P2.cone, c, x, -len - 0.02, 0, Math.PI, 0, 0, 0.02, 0.05, 0.02);
    });
    for (const g of Object.values(P2)) g.dispose();
    const mesh = p.mesh(mat, "traveler:khipu");
    if (pack) {
      mesh.position.set(0, -0.2, -0.11);
      pack.add(mesh);
    } else {
      mesh.position.set(0, 0.62, -0.36);
      traveler.add(mesh);
    }
    carried = { mesh, swing: 0 };
    return true;
  };
  const detachKhipu = () => {
    if (!carried) return;
    carried.mesh.removeFromParent();
    carried.mesh.geometry.dispose();
    carried = null;
  };

  const missionDistance = (m: Mission) => {
    const pose = targetPose(m);
    const straight = Math.hypot(pose.x - avatarPos.x, pose.z - avatarPos.z);
    const along = Math.abs(targetT(m) - avatarT) * len;
    return Math.max(straight, along);
  };
  const targetPoses = new Map<string, THREE.Vector3>();
  const targetPose = (m: Mission) => {
    let p = targetPoses.get(m.to);
    if (!p) {
      p = env.stationPose(m.to).position.clone();
      targetPoses.set(m.to, p);
    }
    return p;
  };
  const renderChip = () => {
    const m = errands.active ? missionById(errands.active) : null;
    if (!m) {
      errandChip.chip.hidden = true;
      chipText = "";
      return;
    }
    const d = missionDistance(m);
    const meters = d >= 100 ? Math.round(d / 10) * 10 : Math.max(1, Math.round(d));
    const text =
      lang === "es" ? `lleva el khipu ${L(m.place)} · ${meters} m` : `take the khipu ${L(m.place)} · ${meters} m`;
    if (text !== chipText) {
      chipText = text;
      errandChip.value.textContent = text;
    }
    errandChip.chip.hidden = false;
  };

  const startErrand = (m: Mission) => {
    const next = acceptErrand(errands, m.id);
    if (next === errands) return;
    errands = next;
    saveErrands(errands);
    attachKhipu();
    renderChip();
    errandChip.chip.classList.remove("is-flash");
    void errandChip.chip.offsetWidth;
    errandChip.chip.classList.add("is-flash");
    sfx.play("open");
    emit("world:mission", { id: m.id, state: "accepted", to: m.to });
  };
  const completeErrand = (stationId: string) => {
    const r = arriveErrand(errands, stationId);
    if (!r.completed) return;
    errands = r.state;
    saveErrands(errands);
    detachKhipu();
    renderChip();
    showThanks(r.completed);
    emit("world:stamp", { id: r.completed.id, kind: "npc", label: stampLabel(r.completed.id) });
    emit("world:mission", { id: r.completed.id, state: "done", to: r.completed.to });
  };
  let errandClock = 0;
  const updateErrand = (dt: number, avatar: THREE.Vector3) => {
    offerCooldown = Math.max(0, offerCooldown - dt);
    if (carried) {
      // The khipu swings a little with the walk.
      const v = Math.min(1, avatar.distanceTo(avatarPos) / Math.max(dt, 1e-3) / 4);
      carried.swing += dt * (3 + v * 6);
      carried.mesh.rotation.x = rm ? 0.12 * v : 0.1 + Math.sin(carried.swing) * 0.12 * v + 0.12 * v;
    }
    avatarPos.copy(avatar);
    errandClock -= dt;
    if (errandClock > 0) return;
    errandClock = 0.25;
    avatarT = trail.nearestT(avatar.x, avatar.z);
    const m = errands.active ? missionById(errands.active) : null;
    if (!m) return;
    // The avatar may load after the NPCs (or come back from a reload mid-errand).
    if (!carried) attachKhipu();
    const p = targetPose(m);
    if ((p.x - avatar.x) ** 2 + (p.z - avatar.z) ** 2 < ARRIVE_R * ARRIVE_R) completeErrand(m.to);
    else renderChip();
  };

  let near: Npc | null = null;
  let active: { npc: Npc; m: DialogMachine; mission: Mission | null; fired: string | null } | null = null;
  let renderedNode: string | null = null;
  let renderedChoices = -1;
  let talked = new Set(readTalked());
  const total = npcs.length;

  const nextLabel = (end: boolean) => `<kbd>E</kbd> ${end ? tr(lang, "qn.npc.end") : tr(lang, "qn.npc.next")}`;

  const renderChoices = () => {
    if (!active) return;
    const ch = active.m.choices;
    if (ch.length === renderedChoices && renderedNode === active.m.nodeId) {
      choicesEl.querySelectorAll("button").forEach((b, i) => {
        b.classList.toggle("is-sel", i === active?.m.sel);
      });
      return;
    }
    renderedChoices = ch.length;
    choicesEl.replaceChildren();
    ch.forEach((c, i) => {
      const b = el("button", "qn-npc-choice");
      b.type = "button";
      b.innerHTML = `<kbd>${i + 1}</kbd><span></span>`;
      (b.lastElementChild as HTMLElement).textContent = c.label[lang];
      b.classList.toggle("is-sel", i === active?.m.sel);
      b.addEventListener("click", () => step(() => active?.m.choose(i)));
      choicesEl.appendChild(b);
    });
    choicesEl.hidden = ch.length === 0;
    const n = active.m.node;
    const isEnd = !n?.choices?.length && !n?.next;
    nextBtn.hidden = ch.length > 0;
    foot.hidden = ch.length > 0;
    nextBtn.innerHTML = nextLabel(isEnd);
  };

  const renderNode = () => {
    if (!active) return;
    const { m } = active;
    if (renderedNode !== m.nodeId) {
      renderedNode = m.nodeId;
      renderedChoices = -1;
      live.textContent = `${active.npc.dialog.name}: ${m.text}`;
      card.classList.remove("is-pop");
      void card.offsetWidth;
      card.classList.add("is-pop");
    }
    textEl.textContent = m.visibleText();
    textEl.classList.toggle("is-typing", m.typing);
    renderChoices();
  };

  const open = (npc: Npc) => {
    // The next errand, when its tambo is a good walk uphill from here; otherwise the chasqui's own talk.
    const mission = offerCooldown > 0 ? null : offerable(errands, avatarT);
    let convo: Convo;
    if (mission) {
      convo = MISSION_DIALOGS[mission.id];
      emit("world:mission", { id: mission.id, state: "offered", to: mission.to });
    } else {
      const convos = npc.dialog.convos;
      convo = convos[npc.convoIdx % convos.length] as Convo;
      npc.convoIdx++;
    }
    const m = new DialogMachine(convo, lang);
    if (rm) m.revealAll();
    active = { npc, m, mission, fired: null };
    renderedNode = null;
    npc.mode = "talk";
    nameEl.textContent = npc.dialog.name;
    roleEl.textContent = npc.dialog.role[lang];
    swatch.style.background = npc.spec.dye;
    card.hidden = false;
    tag.hidden = true;
    renderNode();
    if (!talked.has(npc.spec.id)) {
      talked.add(npc.spec.id);
      writeTalked([...talked]);
      const n = talked.size;
      if (n >= total) showToast(T("qn.npc.all"));
      else if (n === 1 || n === 3 || n === 5) showToast(T("qn.npc.count", { n, total }));
    }
  };

  const close = () => {
    if (!active) return;
    // Walking away from an offer (or "not now") rests the offers for a while.
    if (active.mission && errands.active !== active.mission.id) offerCooldown = 45;
    active.npc.mode = "attend";
    active.npc.timer = 1.2;
    active = null;
    renderedNode = null;
    card.hidden = true;
    card.classList.remove("is-pop");
  };

  /** Run a dialog action and re-render; closes the card when the machine ends. */
  const step = (fn: () => unknown) => {
    if (!active) return;
    fn();
    // A node with an action fires it once when it's shown (errand accepted on the "yes" line).
    const a = active;
    if (a.m.node?.action === "accept" && a.fired !== a.m.nodeId && a.mission) {
      a.fired = a.m.nodeId;
      startErrand(a.mission);
    }
    if (!active.m.open) close();
    else {
      if (rm) active.m.revealAll();
      renderNode();
    }
  };

  closeBtn.addEventListener("click", close);
  nextBtn.addEventListener("click", () => step(() => active?.m.advance()));
  tag.addEventListener("click", () => {
    if (near && !active) open(near);
  });

  // Dialog keys (capture phase so Space advances instead of jumping; digits pick choices).
  const onKey = (e: KeyboardEvent) => {
    if (!active || e.metaKey || e.ctrlKey || e.altKey) return;
    const ch = active.m.choices;
    const focusedMine = e.target instanceof HTMLElement && layer.contains(e.target) && e.target.tagName === "BUTTON";
    if (e.code === "Space") {
      // Always keep Space from reaching the core (no jump mid-conversation).
      e.stopPropagation();
      // A focused dialog button activates natively on keyup; don't double it.
      if (focusedMine) return;
      e.preventDefault();
      if (!e.repeat) step(() => active?.m.advance());
    } else if (ch.length && /^Digit[1-3]$/.test(e.code)) {
      const i = Number(e.code.slice(5)) - 1;
      if (i < ch.length) {
        e.preventDefault();
        e.stopPropagation();
        step(() => active?.m.choose(i));
      }
    } else if (ch.length && (e.code === "ArrowUp" || e.code === "ArrowDown")) {
      e.preventDefault();
      e.stopPropagation();
      active.m.moveSel(e.code === "ArrowUp" ? -1 : 1);
      renderChoices();
    }
  };
  window.addEventListener("keydown", onKey, true);

  // ------------------------------------------------------------------ simulation
  const base = new THREE.Vector3();
  const tg = new THREE.Vector3();
  const proj = new THREE.Vector3();
  const push = { x: 0, z: 0 };
  const nearBuf: Body[] = [];
  let clock = 0;

  const surfaceY = (x: number, z: number) => env.heightAt(x, z) + 0.06;

  const simulate = (n: Npc, dt: number, avatar: THREE.Vector3, distA: number) => {
    const r = n.spec.route;
    n.restCooldown -= dt;
    n.timer -= dt;
    const engaged = n === near || active?.npc === n;

    // Mode transitions driven by the traveler.
    if (active?.npc === n) n.mode = "talk";
    else if (engaged) {
      n.mode = "attend";
      n.timer = Math.max(n.timer, 0.8);
    } else if (n.mode === "talk") n.mode = "attend";
    else if (n.mode === "attend" && n.timer <= 0) n.mode = n.rest ? "rest" : "walk";

    // Cruise speed (some alternate walk and jog), slowed near the traveler.
    if (r.jog) {
      n.jogT -= dt;
      if (n.jogT <= 0) n.jogT = 7 + ((n.seed * 13.1 + clock) % 6);
    }
    const jogging = r.jog !== undefined && n.jogT < 3;
    let want = jogging ? (r.jog ?? r.speed) : r.speed;
    if (distA < 4.5) want *= THREE.MathUtils.clamp((distA - 1.2) / 3.3, 0.2, 1);
    // Something blocks the whole path ahead (a bear lying across it, a herd): slow down and wait.
    want *= 1 - 0.85 * n.block;

    if (n.mode === "talk" || n.mode === "attend" || n.mode === "turn") want = 0;
    if (n.mode === "rest") want = n.rest?.out && n.rest.k >= 1 ? 0 : Math.min(r.speed, 1.3);
    n.speed = damp(n.speed, want, n.mode === "walk" ? 3 : 6, dt);

    if (n.mode === "turn" && n.timer <= 0) {
      n.dir = n.dir === 1 ? -1 : 1;
      n.mode = "walk";
    }

    // Advance along the spline / in and out of a tambo rest spot.
    const prevT = n.t;
    if (n.mode === "rest" && n.rest) {
      const rs = n.rest;
      const d = Math.max(0.5, rs.base.distanceTo(rs.target));
      if (rs.out) {
        rs.k = Math.min(1, rs.k + (n.speed * dt) / d);
        if (rs.k >= 1) {
          rs.hold -= dt;
          if (rs.hold <= 0) rs.out = false;
        }
      } else {
        rs.k = Math.max(0, rs.k - (Math.max(0.6, n.speed) * dt) / d);
        if (rs.k <= 0) {
          n.rest = null;
          n.mode = "walk";
          n.restCooldown = 10 + (n.seed % 5);
        }
      }
    } else if (n.mode === "walk") {
      n.t += (n.dir * n.speed * dt) / len;
      if (n.t >= r.tMax || n.t <= r.tMin) {
        n.t = THREE.MathUtils.clamp(n.t, r.tMin, r.tMax);
        n.mode = "turn";
        n.timer = r.speed > 2.6 ? 2.6 : 1 + (n.seed % 1.2);
      }
      // Passing a tambo: maybe step aside into its plaza and rest a while.
      if (n.restCooldown <= 0) {
        for (const tb of tambos) {
          const crossed = (prevT - tb.t) * (n.t - tb.t) <= 0 && prevT !== n.t;
          const spot = restSpots.get(tb.id);
          if (!crossed || !spot) continue;
          if (Math.sin(n.seed * 91.7 + clock * 3.1) * 0.5 + 0.5 < r.restChance) {
            n.mode = "rest";
            n.rest = { k: 0, target: spot.clone(), base: trail.pointAt(tb.t), hold: 4 + (n.seed % 4), out: true };
            n.t = tb.t;
          } else n.restCooldown = 6;
          break;
        }
      }
    }

    // Lane: keep right of the direction of travel; sidestep around the traveler when they're ahead.
    tg.copy(trail.tangentAt(n.t)).setY(0).normalize();
    base.copy(trail.pointAt(n.t));
    const rx = -tg.z;
    const rz = tg.x;
    let laneT = n.dir * 0.42 * hw;
    const ax = avatar.x - base.x;
    const az = avatar.z - base.z;
    const along = (ax * tg.x + az * tg.z) * n.dir;
    const la = ax * rx + az * rz;
    if (along > -1 && along < 4.5 && Math.abs(la - laneT) < 1.1) {
      // Pass on whichever side has more room.
      laneT = la > 0 ? la - 1.3 : la + 1.3;
      if (Math.abs(laneT) > hw * 0.9) laneT = la > 0 ? Math.min(hw * 0.9, la + 1.3) : Math.max(-hw * 0.9, la - 1.3);
      laneT = THREE.MathUtils.clamp(laneT, -hw * 0.9, hw * 0.9);
    }
    // Same-direction overtakes: a faster NPC swings to the outside.
    for (const o of npcs) {
      if (o === n || o.dir !== n.dir) continue;
      const dt2 = (o.t - n.t) * len * n.dir;
      if (dt2 > 0 && dt2 < 2.2 && n.speed > o.speed + 0.2) laneT = -n.dir * 0.42 * hw;
    }
    // Look ahead for other bodies (animals, people, other chasquis) and change lane early to pass them.
    n.block = 0;
    if (n.mode === "walk" && !n.rest) {
      const me = n.body.r;
      for (const b of creatures.near(base.x, base.z, 4.5, nearBuf, n.body)) {
        if (b === n.llamaBody || b.kind === "traveler" || !b.solid) continue;
        const bx = b.x - base.x;
        const bz = b.z - base.z;
        const ahead = (bx * tg.x + bz * tg.z) * n.dir;
        if (ahead < -0.4 || ahead > 4) continue;
        const lb = bx * rx + bz * rz;
        const clear = b.r + me + 0.35;
        if (Math.abs(lb - laneT) >= clear) continue;
        // Pass on the side with more room; if neither side fits inside the path, wait behind it.
        const left = lb - clear;
        const right = lb + clear;
        const lim = hw * 0.92;
        const canL = left >= -lim;
        const canR = right <= lim;
        if (canL && (!canR || Math.abs(left - laneT) <= Math.abs(right - laneT))) laneT = left;
        else if (canR) laneT = right;
        else n.block = Math.max(n.block, THREE.MathUtils.clamp(1 - (ahead - 1.2) / 2.5, 0, 1));
      }
    }
    n.laneTarget = laneT;
    n.lane = damp(n.lane, n.laneTarget, 2.5, dt);

    n.prev.copy(n.pos);
    const lx = base.x + rx * n.lane;
    const lz = base.z + rz * n.lane;
    if (n.rest) {
      const k = smooth(n.rest.k);
      n.pos.x = THREE.MathUtils.lerp(lx, n.rest.target.x, k);
      n.pos.z = THREE.MathUtils.lerp(lz, n.rest.target.z, k);
    } else {
      n.pos.x = lx;
      n.pos.z = lz;
    }
    // Separation from other solid bodies: an offset that eases back to the lane once the way is clear.
    const body = n.body;
    body.x = n.pos.x + n.offX;
    body.z = n.pos.z + n.offZ;
    creatures.separate(body, push);
    const k = body.give;
    n.offX = damp(n.offX + push.x * k, 0, 1.5, dt);
    n.offZ = damp(n.offZ + push.z * k, 0, 1.5, dt);
    n.pos.x += n.offX;
    n.pos.z += n.offZ;
    body.x = n.pos.x;
    body.z = n.pos.z;
    n.pos.y = surfaceY(n.pos.x, n.pos.z);

    // Facing: movement direction, or the traveler when engaged, or the trail when idle at a rest spot.
    const mvx = n.pos.x - n.prev.x;
    const mvz = n.pos.z - n.prev.z;
    let face = n.yaw;
    if (n.mode === "talk" || n.mode === "attend") face = Math.atan2(avatar.x - n.pos.x, avatar.z - n.pos.z);
    else if (mvx * mvx + mvz * mvz > 1e-6) face = Math.atan2(mvx, mvz);
    else if (n.rest && n.rest.k >= 1) face = Math.atan2(base.x - n.pos.x, base.z - n.pos.z);
    n.yaw = angleDamp(n.yaw, face, n.mode === "talk" || n.mode === "attend" ? 6 : 8, dt);

    if (n.llama) followLlama(n, dt);
  };

  const followLlama = (n: Npc, dt: number) => {
    // Seek a point behind and to the side of Sisa; trot to catch up.
    const back = 1.5;
    const fx = Math.sin(n.yaw);
    const fz = Math.cos(n.yaw);
    const gx = n.pos.x - fx * back + fz * 0.55;
    const gz = n.pos.z - fz * back - fx * 0.55;
    const dx = gx - n.llamaPos.x;
    const dz = gz - n.llamaPos.z;
    const d = Math.hypot(dx, dz);
    const want = d > 0.25 ? Math.min(3, d * 1.6) : 0;
    n.llamaSpeed = damp(n.llamaSpeed, want, 5, dt);
    if (d > 0.001) {
      const s = Math.min(d, n.llamaSpeed * dt);
      n.llamaPos.x += (dx / d) * s;
      n.llamaPos.z += (dz / d) * s;
      if (n.llamaSpeed > 0.15) n.llamaYaw = angleDamp(n.llamaYaw, Math.atan2(dx, dz), 5, dt);
    }
    if (d > 8) n.llamaPos.set(gx, 0, gz);
    const lb = n.llamaBody;
    if (lb) {
      lb.x = n.llamaPos.x;
      lb.z = n.llamaPos.z;
      creatures.separate(lb, push);
      n.llamaPos.x += push.x * lb.give;
      n.llamaPos.z += push.z * lb.give;
      lb.x = n.llamaPos.x;
      lb.z = n.llamaPos.z;
    }
    n.llamaPos.y = surfaceY(n.llamaPos.x, n.llamaPos.z);
  };

  const animate = (n: Npc, dt: number, avatar: THREE.Vector3) => {
    const R = n.rig;
    const L = n.spec.look;
    const sp = n.speed;
    const amp = rm ? 0.45 : 1;
    n.walkW = damp(n.walkW, Math.min(1, sp / 1.1), 8, dt);
    n.runW = damp(n.runW, sp > 2.6 ? 1 : 0, 5, dt);
    n.talkW = damp(n.talkW, n.mode === "talk" ? 1 : 0, 5, dt);
    const resting = n.mode === "rest" && !!n.rest && n.rest.k >= 1 && n.rest.hold > 0;
    const winded = n.mode === "turn" && n.spec.route.speed > 2.6;
    n.restW = damp(n.restW, resting || winded ? 1 : 0, 4, dt);

    const stride = 0.62 + n.runW * 0.5;
    n.phase += (dt * sp * Math.PI) / stride;
    const sw = Math.sin(n.phase);
    const legAmp = (0.5 * n.walkW + 0.42 * n.runW) * amp;
    const armAmp = (0.38 * n.walkW + 0.5 * n.runW) * amp;
    const tAll = clock + n.seed;

    R.legL.rotation.x = sw * legAmp;
    R.legR.rotation.x = -sw * legAmp;

    // Arms: swing, or hold (tablet / staff), plus talk gestures and rest poses.
    const holdsFront = L.carry.includes("tablet");
    const holdsLeft = L.carry.includes("tabletL");
    const staff = L.carry.includes("staff");
    let aL = -sw * armAmp;
    let aR = sw * armAmp;
    let zL = 0.1 + n.runW * 0.2;
    let zR = -0.1 - n.runW * 0.2;
    if (holdsFront) {
      aL = aR = -1.05 + sw * 0.05 * n.walkW;
      zL = -0.28;
      zR = 0.28;
    }
    if (holdsLeft) aL = -0.95 + sw * 0.06 * n.walkW;
    if (staff) aR = -0.35 + sw * 0.18 * n.walkW;
    if (n.runW > 0.5) {
      aL -= 0.35 * n.runW;
      aR -= 0.35 * n.runW;
    }
    // Idle gestures while talking: the free hand explains, the head nods along with the typewriter.
    const typing = active?.npc === n && active.m.typing;
    const gest = n.talkW * amp;
    if (!holdsFront) {
      if (!staff) {
        aR = THREE.MathUtils.lerp(aR, -1.1 - Math.sin(tAll * 3.1) * 0.35 * (rm ? 0 : 1), gest);
        zR = THREE.MathUtils.lerp(zR, -0.35 - Math.sin(tAll * 2.3) * 0.15 * (rm ? 0 : 1), gest);
      } else if (staff) {
        // The guide taps the staff while he talks.
        aR = THREE.MathUtils.lerp(aR, -0.45 + Math.abs(Math.sin(tAll * 2.2)) * 0.12 * (rm ? 0 : 1), gest);
        aL = THREE.MathUtils.lerp(aL, -0.6 - Math.sin(tAll * 1.7) * 0.25 * (rm ? 0 : 1), gest);
      }
    }
    // Rest: the runner leans on her knees; the others stretch now and then.
    if (n.restW > 0.01) {
      if (n.spec.route.speed > 2.6) {
        aL = THREE.MathUtils.lerp(aL, -0.75, n.restW);
        aR = THREE.MathUtils.lerp(aR, -0.75, n.restW);
      } else if (!holdsFront && !staff) {
        const s = rm ? 0 : Math.max(0, Math.sin(tAll * 0.9)) ** 3;
        aR = THREE.MathUtils.lerp(aR, -2.7 * s, n.restW);
        if (!holdsLeft) aL = THREE.MathUtils.lerp(aL, -2.7 * s, n.restW);
      }
    }
    R.armL.rotation.x = aL;
    R.armR.rotation.x = aR;
    R.armL.rotation.z = zL;
    R.armR.rotation.z = zR;

    // Body: bob, lean (run lean, elder hunch, runner hands-on-knees), breathing, talk bounce.
    const bob = Math.abs(Math.cos(n.phase)) * (0.035 * n.walkW + 0.07 * n.runW) * amp;
    const breathe = rm ? 0 : Math.sin(tAll * 2) * 0.012 * (1 - n.walkW);
    const bounce = !rm && n.spec.route.speed > 2.6 ? Math.abs(Math.sin(tAll * 7)) * 0.025 * n.talkW : 0;
    R.rig.position.y = bob + bounce;
    R.rig.scale.y = L.scale * (1 + breathe);
    const lean = L.hunch + 0.05 * n.walkW + 0.2 * n.runW + (n.spec.route.speed > 2.6 ? 0.5 : 0.05) * n.restW;
    R.torso.rotation.x = lean;
    R.torso.rotation.y = sw * 0.06 * n.walkW * amp;
    R.torso.rotation.z = Math.cos(n.phase) * 0.03 * n.walkW * amp;

    // Head: look at the traveler (within limits) when engaged, nod while the line types.
    let look = 0;
    if (n.mode === "talk" || n.mode === "attend") {
      const want = Math.atan2(avatar.x - n.pos.x, avatar.z - n.pos.z) - n.yaw;
      look = THREE.MathUtils.clamp(Math.atan2(Math.sin(want), Math.cos(want)), -0.7, 0.7);
    }
    n.headYaw = damp(n.headYaw, look, 6, dt);
    R.head.rotation.y = n.headYaw;
    R.head.rotation.x = -lean * 0.7 + (typing && !rm ? Math.sin(tAll * 13) * 0.05 : 0) - n.talkW * 0.06;
    if (R.plume) R.plume.rotation.x = -(0.15 * n.walkW + 0.35 * n.runW) * amp + Math.sin(n.phase * 2) * 0.08 * amp;

    if (R.leds && !rm) {
      n.ledT -= dt;
      if (n.ledT <= 0) {
        R.leds.visible = !R.leds.visible || Math.sin(tAll * 17) > -0.2;
        n.ledT = 0.15 + Math.abs(Math.sin(tAll * 5.3)) * 0.5;
      }
    }

    R.group.position.copy(n.pos);
    R.group.rotation.y = n.yaw;

    const lm = n.llama;
    if (lm) {
      lm.group.position.copy(n.llamaPos);
      lm.group.rotation.y = n.llamaYaw;
      const ls = n.llamaSpeed;
      n.llamaPhase += dt * ls * 4.2;
      const a = Math.sin(n.llamaPhase) * Math.min(1, ls / 1.2) * 0.45 * amp;
      // Diagonal pairs move together (a llama's pace is close to it; diagonal reads better at this scale).
      lm.legs[0]!.rotation.x = a;
      lm.legs[3]!.rotation.x = a;
      lm.legs[1]!.rotation.x = -a;
      lm.legs[2]!.rotation.x = -a;
      lm.body.position.y = Math.abs(Math.cos(n.llamaPhase)) * 0.03 * Math.min(1, ls) * amp;
      lm.neck.rotation.x = rm ? 0 : Math.sin(tAll * 0.7) * 0.08 - Math.min(1, ls) * 0.1;
      lm.neck.rotation.y = rm ? 0 : Math.sin(tAll * 0.4) * 0.25 * (1 - Math.min(1, ls));
    }
  };

  // ------------------------------------------------------------------ anchoring the DOM to the NPC
  const anchor = (n: Npc) => {
    proj.set(n.pos.x, n.pos.y + 2.15 * n.spec.look.scale, n.pos.z).project(env.camera);
    const w = hudRoot.clientWidth || innerWidth;
    const h = hudRoot.clientHeight || innerHeight;
    const onScreen = proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1;
    return { x: ((proj.x + 1) / 2) * w, y: ((1 - proj.y) / 2) * h, w, h, onScreen };
  };

  const placeCard = (n: Npc) => {
    const a = anchor(n);
    const narrow = a.w < 640;
    const docked = narrow || !a.onScreen;
    card.classList.toggle("is-docked", docked);
    if (docked) {
      card.style.left = "";
      card.style.top = "";
      return;
    }
    const cw = card.offsetWidth || 360;
    const ch = card.offsetHeight || 160;
    const left = THREE.MathUtils.clamp(a.x - 48, 12, a.w - cw - 12);
    const top = THREE.MathUtils.clamp(a.y - ch - 18, 70, a.h - ch - 90);
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
    card.style.setProperty("--tail-x", `${Math.round(THREE.MathUtils.clamp(a.x - left, 22, cw - 22))}px`);
    card.classList.toggle("tail-off", top + ch + 6 < a.y - 40 || top + ch > a.y + 8);
  };

  const placeTag = (n: Npc) => {
    const a = anchor(n);
    if (!a.onScreen) {
      tag.hidden = true;
      return;
    }
    tag.hidden = false;
    tag.style.left = `${Math.round(THREE.MathUtils.clamp(a.x, 72, a.w - 72))}px`;
    tag.style.top = `${Math.round(a.y)}px`;
  };

  let tagFor: Npc | null = null;
  let night: boolean | null = null;
  let bodyClock = 0;

  const ambient: Ambient = {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      clock += dt;
      updateErrand(dt, avatar);
      bodyClock -= dt;
      if (bodyClock <= 0) {
        // The registry is reset by core on (re)mount: make sure our bodies are still in it.
        bodyClock = 1;
        const all = creatures.all();
        for (const n of npcs) {
          if (!all.includes(n.body))
            n.body = creatures.add("chasqui", n.body.r, { give: 0.35, x: n.pos.x, z: n.pos.z });
          if (n.llamaBody && !all.includes(n.llamaBody))
            n.llamaBody = creatures.add("pack-llama", 0.5, { give: 0.3, x: n.llamaPos.x, z: n.llamaPos.z });
        }
      }

      // Who is close enough to talk?
      let best: Npc | null = null;
      let bestD = TALK_R;
      for (const n of npcs) {
        const d = Math.hypot(n.pos.x - avatar.x, n.pos.z - avatar.z);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      near = active ? active.npc : best;
      if (active) {
        const d = Math.hypot(active.npc.pos.x - avatar.x, active.npc.pos.z - avatar.z);
        if (d > LEAVE_R) close();
      }

      for (const n of npcs) {
        const d = Math.hypot(n.pos.x - avatar.x, n.pos.z - avatar.z);
        // Distance-based update rate: full rate nearby, every 3rd frame mid-range, every 8th far away.
        const every = d < 40 ? 1 : d < 90 ? 3 : 8;
        n.acc += dt;
        n.frame++;
        if (n.frame % every !== 0 && n !== near) continue;
        const sdt = Math.min(n.acc, 0.25);
        n.acc = 0;
        simulate(n, sdt, avatar, d);
        const vis = d < 150;
        n.rig.group.visible = vis;
        if (n.llama) n.llama.group.visible = vis;
        if (vis) animate(n, sdt, avatar);
      }

      // Typewriter + card placement.
      if (active) {
        if (active.m.tick(dt, rm ? 1e6 : 52)) renderNode();
        placeCard(active.npc);
      }

      // Floating "talk" tag over the nearest NPC (also a tap target on touch screens).
      if (near && !active) {
        if (tagFor !== near) {
          tagFor = near;
          tag.innerHTML = `<kbd>E</kbd><span></span>`;
          (tag.lastElementChild as HTMLElement).textContent = near.dialog.name;
          tag.setAttribute("aria-label", T("qn.npc.talkTo", { name: near.dialog.name }));
          tag.style.setProperty("--npc-dye", near.spec.dye);
        }
        placeTag(near);
      } else if (!tag.hidden || tagFor) {
        tag.hidden = true;
        tagFor = null;
      }

      const isNight = env.sky.isNight();
      if (isNight !== night) {
        night = isNight;
        layer.classList.toggle("is-night", isNight);
      }
    },

    interact() {
      if (active) {
        step(() => active?.m.advance());
        return true;
      }
      if (near) {
        open(near);
        return true;
      }
      return false;
    },

    escape() {
      if (!active) return false;
      close();
      return true;
    },

    prompt() {
      if (active || !near) return null;
      return `E · ${T("qn.npc.talkTo", { name: near.dialog.name })}`;
    },

    dispose() {
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(toastTimer);
      window.clearTimeout(thanksTimer);
      detachKhipu();
      errandChip.chip.remove();
      releaseChips(chips);
      for (const n of npcs) {
        creatures.remove(n.body);
        if (n.llamaBody) creatures.remove(n.llamaBody);
        for (const g of n.rig.geos) g.dispose();
        if (n.llama) for (const g of n.llama.geos) g.dispose();
      }
      mat.dispose();
      root.removeFromParent();
      layer.remove();
      talked = new Set();
    },
  };

  // Dev hooks for the harness / screenshots.
  if (import.meta.env?.DEV) {
    const debug = {
      npcs: () => npcs.map((n) => ({ id: n.spec.id, t: n.t, mode: n.mode, x: n.pos.x, z: n.pos.z, yaw: n.yaw })),
      place(id: string, t: number, dir: 1 | -1 = 1) {
        const n = npcs.find((x) => x.spec.id === id);
        if (!n) return;
        n.t = t;
        n.dir = dir;
        n.rest = null;
        n.mode = "walk";
        const p = trail.pointAt(t);
        n.pos.copy(p);
        n.llamaPos.copy(p);
      },
      open(id: string) {
        const n = npcs.find((x) => x.spec.id === id);
        if (n) open(n);
      },
      errands: () => ({ ...errands, carrying: !!carried, chip: chipText }),
      /** Accept the next errand directly (screenshots). */
      acceptNext() {
        const m = offerable(errands, 0);
        if (m) startErrand(m);
      },
      reset() {
        errands = { done: 0, active: null };
        saveErrands(errands);
        detachKhipu();
        offerCooldown = 0;
        renderChip();
      },
    };
    (window as unknown as { __npcs?: typeof debug }).__npcs = debug;
  }
  return ambient;
};
