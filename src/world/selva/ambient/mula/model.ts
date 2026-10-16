/**
 * Saddled mule for the jungle ride: a brown pack mule (long ears, short upright mane, tufted tail, pale muzzle)
 * with a striped saddle blanket, a leather saddle with pommel and stirrups, and canvas saddlebags (alforjas).
 * Faces +Z, origin at the feet. Pivots are exposed for the walk/trot, same shape as the mountain llama's.
 *
 * Draw calls: each rigid node (body, every leg, neck, head, tail) is flattened into one vertex-colored mesh on
 * one shared vertex-toon material (../../../merge-colors.ts); the eyes stay apart (no ink outline).
 */
import * as THREE from "three";
import type { WorldEnv } from "../../../contract";
import { flattenToonGroup, vertexToon } from "../../../merge-colors";
import { DYE } from "../../../props";

const COAT = "#6e4a33";
const COAT_DARK = "#3f2a1e";
const MUZZLE = "#c9b39a";
const HOOF = "#2a211b";
const EYE = "#1f1a17";
const LEATHER = "#5a3522";
const LEATHER_DARK = "#3b2418";
const CANVAS = "#a89a72";
const BRASS = "#c9a24a";

/** Hip height of the leg pivots and the back line (top of the barrel). */
const HIP = 0.8;
const BODY_Y = 1.0;
const BODY_R = 0.3;

/** Saddle seat above the feet: the rider's feet sit this high (avatar hip pivot 0.56 → hips on the seat). */
export const SEAT_HEIGHT = 0.88;

export interface MuleModel {
  group: THREE.Group;
  /** Bob/sway node (everything but the root). */
  body: THREE.Group;
  /** Front-left, front-right, back-left, back-right hip pivots. */
  legs: THREE.Group[];
  neck: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group;
  /** Hanging stirrups and saddlebags (swing with the gait). */
  danglers: THREE.Group[];
  dispose(): void;
}

export function buildSaddledMule(env: WorldEnv): MuleModel {
  const geos: THREE.BufferGeometry[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T) => {
    geos.push(x);
    return x;
  };
  const mat = vertexToon();
  const toon = (c: string) => env.toon(c);
  const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, c: string, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, toon(c));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  const group = new THREE.Group();
  group.name = "ride-mule";
  const body = new THREE.Group();
  group.add(body);

  // ---- Barrel: a capsule along Z, a paler belly, a darker dorsal stripe (mules often show one).
  const barrel = part(body, g(new THREE.CapsuleGeometry(BODY_R, 0.62, 4, 12)), COAT, 0, BODY_Y, 0);
  barrel.rotation.x = Math.PI / 2;
  barrel.scale.set(1, 1, 0.95);
  const belly = part(body, g(new THREE.SphereGeometry(0.27, 10, 6)), "#7d5a41", 0, BODY_Y - 0.1, 0);
  belly.scale.set(0.95, 0.75, 1.9);
  const rump = part(body, g(new THREE.SphereGeometry(0.29, 10, 8)), COAT, 0, BODY_Y + 0.03, -0.42);
  rump.scale.set(1.05, 1, 1);

  // ---- Saddle blanket (stripes as thin boxes), saddle, pommel, cantle, girth, saddlebags.
  const top = BODY_Y + BODY_R;
  const blanket = part(body, g(new THREE.BoxGeometry(0.7, 0.04, 0.62)), DYE.red, 0, top - 0.01, 0.02);
  blanket.rotation.x = 0.02;
  for (const [dz, c] of [
    [-0.24, DYE.ochre],
    [0.28, DYE.ochre],
    [-0.18, DYE.indigo],
    [0.22, DYE.indigo],
  ] as Array<[number, string]>)
    part(body, g(new THREE.BoxGeometry(0.71, 0.045, 0.035)), c, 0, top - 0.01, dz);
  for (const s of [-1, 1]) {
    const drape = part(body, g(new THREE.BoxGeometry(0.035, 0.26, 0.62)), DYE.red, s * 0.335, top - 0.13, 0.02);
    drape.rotation.z = s * 0.2;
  }
  part(body, g(new THREE.BoxGeometry(0.42, 0.07, 0.44)), LEATHER, 0, top + 0.045, 0);
  part(body, g(new THREE.CylinderGeometry(0.035, 0.05, 0.12, 6)), LEATHER_DARK, 0, top + 0.12, 0.2);
  const cantle = part(body, g(new THREE.BoxGeometry(0.36, 0.1, 0.06)), LEATHER_DARK, 0, top + 0.1, -0.21);
  cantle.rotation.x = -0.35;
  const girth = part(
    body,
    g(new THREE.TorusGeometry(BODY_R * 1.03, 0.025, 4, 16, Math.PI)),
    LEATHER_DARK,
    0,
    BODY_Y,
    0.05,
  );
  girth.rotation.set(0, Math.PI / 2, Math.PI);
  // Breast collar across the chest.
  const collar = part(
    body,
    g(new THREE.TorusGeometry(0.27, 0.022, 4, 12, Math.PI)),
    LEATHER_DARK,
    0,
    BODY_Y + 0.02,
    0.47,
  );
  collar.rotation.z = Math.PI;
  collar.scale.set(1, 0.7, 1);

  // Swinging bits: a stirrup on each side under the saddle, a canvas saddlebag on each flank behind it.
  const danglers: THREE.Group[] = [];
  const strapGeo = g(new THREE.BoxGeometry(0.02, 0.36, 0.04));
  strapGeo.translate(0, -0.18, 0);
  const stirrupGeo = g(new THREE.TorusGeometry(0.05, 0.012, 4, 10));
  const bagGeo = g(new THREE.BoxGeometry(0.1, 0.24, 0.24));
  const flapGeo = g(new THREE.BoxGeometry(0.11, 0.08, 0.25));
  const buckleGeo = g(new THREE.BoxGeometry(0.02, 0.04, 0.04));
  for (const s of [-1, 1]) {
    const st = new THREE.Group();
    st.position.set(s * 0.25, top + 0.03, 0.02);
    part(st, strapGeo, LEATHER_DARK);
    const ring = part(st, stirrupGeo, BRASS, 0, -0.39, 0);
    ring.rotation.y = Math.PI / 2;
    body.add(st);
    danglers.push(st);
    const bag = new THREE.Group();
    bag.position.set(s * 0.33, top - 0.02, -0.38);
    part(bag, bagGeo, CANVAS, 0, -0.14, 0);
    part(bag, flapGeo, LEATHER, 0, -0.04, 0);
    part(bag, buckleGeo, BRASS, s * 0.055, -0.1, 0);
    body.add(bag);
    danglers.push(bag);
  }

  // ---- Legs: upper capsule + slimmer cannon + hoof; front pair under the chest, hind pair under the rump.
  const upperGeo = g(new THREE.CapsuleGeometry(0.075, 0.28, 3, 8));
  const cannonGeo = g(new THREE.CapsuleGeometry(0.05, 0.3, 3, 8));
  const hoofGeo = g(new THREE.CylinderGeometry(0.06, 0.07, 0.07, 8));
  const legs: THREE.Group[] = [];
  for (const [x, z] of [
    [0.16, 0.4],
    [-0.16, 0.4],
    [0.16, -0.42],
    [-0.16, -0.42],
  ] as Array<[number, number]>) {
    const p = new THREE.Group();
    p.position.set(x, HIP, z);
    part(p, upperGeo, COAT, 0, -0.18, 0);
    part(p, cannonGeo, COAT_DARK, 0, -0.52, 0);
    part(p, hoofGeo, HOOF, 0, -HIP + 0.035, 0.01);
    body.add(p);
    legs.push(p);
  }

  // ---- Neck (pivot at the withers, leaning forward) → head (long, nose down) with long ears.
  const neck = new THREE.Group();
  neck.position.set(0, BODY_Y + 0.08, 0.46);
  neck.rotation.x = 0.6;
  part(neck, g(new THREE.CapsuleGeometry(0.13, 0.32, 4, 10)), COAT, 0, 0.2, 0);
  // Short upright mane along the crest, dark.
  part(neck, g(new THREE.BoxGeometry(0.05, 0.42, 0.08)), COAT_DARK, 0, 0.24, -0.11);
  body.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 0.44, 0.02);
  head.rotation.x = -0.6 + 0.55;
  const skull = part(head, g(new THREE.CapsuleGeometry(0.115, 0.26, 4, 10)), COAT, 0, 0, 0.14);
  skull.rotation.x = Math.PI / 2;
  const muzzle = part(head, g(new THREE.SphereGeometry(0.1, 10, 8)), MUZZLE, 0, -0.02, 0.33);
  muzzle.scale.set(1, 0.9, 1.1);
  part(head, g(new THREE.SphereGeometry(0.06, 8, 6)), MUZZLE, 0.075, 0.03, 0.09).scale.set(0.6, 1, 1);
  part(head, g(new THREE.SphereGeometry(0.06, 8, 6)), MUZZLE, -0.075, 0.03, 0.09).scale.set(0.6, 1, 1);
  const earGeo = g(new THREE.ConeGeometry(0.045, 0.3, 6));
  earGeo.translate(0, 0.15, 0);
  for (const s of [-1, 1]) {
    const ear = part(head, earGeo, COAT, s * 0.07, 0.08, -0.02);
    ear.rotation.set(-0.45, 0, -s * 0.2);
    ear.scale.set(1, 1, 0.6);
  }
  // Halter: noseband + cheek strap in leather, a red tassel on the browband.
  const nose = part(head, g(new THREE.TorusGeometry(0.105, 0.016, 4, 12)), LEATHER_DARK, 0, -0.01, 0.25);
  nose.scale.set(1, 0.95, 1);
  part(head, g(new THREE.IcosahedronGeometry(0.035, 0)), DYE.red, 0, 0.1, 0.06);
  neck.add(head);
  const tail = new THREE.Group();
  tail.position.set(0, BODY_Y + 0.12, -0.66);
  const dock = part(tail, g(new THREE.CylinderGeometry(0.035, 0.025, 0.36, 5)), COAT_DARK, 0, -0.18, 0);
  dock.rotation.x = 0;
  part(tail, g(new THREE.ConeGeometry(0.07, 0.24, 6)), COAT_DARK, 0, -0.42, 0).rotation.x = Math.PI;
  tail.rotation.x = 0.25;
  body.add(tail);

  // One vertex-colored mesh per rigid node (bob and swing pivots keep their own transforms).
  for (const node of [body, neck, head, tail, ...legs, ...danglers]) flattenToonGroup(node, mat);

  // Eyes last (unmerged, no ink outline).
  const eyeGeo = g(new THREE.SphereGeometry(0.025, 6, 5));
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, toon(EYE));
    eye.position.set(s * 0.1, 0.05, 0.13);
    eye.scale.set(0.5, 1.2, 1);
    env.noOutline(eye);
    head.add(eye);
  }

  return {
    group,
    body,
    legs,
    neck,
    head,
    tail,
    danglers,
    dispose() {
      group.removeFromParent();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.name.endsWith(":vc")) m.geometry.dispose();
      });
      for (const x of geos) x.dispose();
      mat.dispose();
    },
  };
}
