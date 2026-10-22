/**
 * Saddled mule for the jungle ride and the Colca canyon: the shared animal "mule" (one continuous skinned body
 * from ../../characters/animals/: brown, long ears, a short upright mane, a tufted tail, a pale muzzle) with
 * its own gait (walk, trot, canter by speed), dressed with a striped saddle blanket, a leather saddle with
 * pommel, cantle and stirrups, a breast collar, a halter with a red tassel, and canvas saddlebags (alforjas).
 * Faces +Z, origin at the feet. Ridden via ./ride.ts.
 *
 * Draw calls: the body, one merged mesh for the saddle, one for the halter, one per swinging stirrup or bag.
 */
import * as THREE from "three";
import type { WorldEnv } from "../../contract";
import { DYE } from "../../props";
import { mountAnimal } from "./animal";
import type { MountModel } from "./ride";

const LEATHER = "#5a3522";
const LEATHER_DARK = "#3b2418";
const CANVAS = "#a89a72";
const BRASS = "#c9a24a";

/** Barrel centre and radius of the "mule" species (../../characters/animals/species/mammals.ts MULE_SHAPE). */
const BODY_Y = 1.0;
const BODY_R = 0.3;

/** Saddle seat above the feet: the rider's feet sit this high (avatar hip pivot 0.56 → hips on the seat). */
const SEAT_HEIGHT = 0.88;

export function buildSaddledMule(env: WorldEnv): MountModel {
  const m = mountAnimal("mule", { variant: "brown", seed: 5 });
  const group = m.group;
  group.name = "ride-mule";
  const toon = (c: string) => env.toon(c);
  const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, c: string, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, toon(c));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  // ---- Saddle blanket (stripes), saddle, pommel, cantle, girth, breast collar: on the back.
  const body = m.tack("body");
  const top = BODY_Y + BODY_R;
  const blanket = part(body, m.own(new THREE.BoxGeometry(0.62, 0.04, 0.62)), DYE.red, 0, top - 0.005, 0.02);
  blanket.rotation.x = 0.02;
  for (const [dz, c] of [
    [-0.24, DYE.ochre],
    [0.28, DYE.ochre],
    [-0.18, DYE.indigo],
    [0.22, DYE.indigo],
  ] as Array<[number, string]>)
    part(body, m.own(new THREE.BoxGeometry(0.63, 0.045, 0.035)), c, 0, top - 0.005, dz);
  for (const s of [-1, 1]) {
    const drape = part(body, m.own(new THREE.BoxGeometry(0.035, 0.26, 0.62)), DYE.red, s * 0.3, top - 0.12, 0.02);
    drape.rotation.z = s * 0.28;
  }
  part(body, m.own(new THREE.BoxGeometry(0.4, 0.07, 0.44)), LEATHER, 0, top + 0.05, 0);
  part(body, m.own(new THREE.CylinderGeometry(0.035, 0.05, 0.12, 6)), LEATHER_DARK, 0, top + 0.12, 0.2);
  const cantle = part(body, m.own(new THREE.BoxGeometry(0.36, 0.1, 0.06)), LEATHER_DARK, 0, top + 0.1, -0.21);
  cantle.rotation.x = -0.35;
  const girth = part(
    body,
    m.own(new THREE.TorusGeometry(BODY_R * 0.97, 0.025, 4, 16, Math.PI)),
    LEATHER_DARK,
    0,
    BODY_Y,
    0.1,
  );
  girth.rotation.set(0, Math.PI / 2, Math.PI);
  girth.scale.set(1, 1, 0.92);
  const collar = part(
    body,
    m.own(new THREE.TorusGeometry(0.25, 0.022, 4, 12, Math.PI)),
    LEATHER_DARK,
    0,
    BODY_Y + 0.02,
    0.6,
  );
  collar.rotation.set(0.25, 0, Math.PI);
  collar.scale.set(1, 0.72, 1);

  // ---- Swinging bits: a stirrup each side under the saddle, a canvas saddlebag on each flank behind it.
  const danglers: THREE.Group[] = [];
  const strapGeo = m.own(new THREE.BoxGeometry(0.02, 0.36, 0.04));
  strapGeo.translate(0, -0.18, 0);
  const stirrupGeo = m.own(new THREE.TorusGeometry(0.05, 0.012, 4, 10));
  const bagGeo = m.own(new THREE.BoxGeometry(0.1, 0.24, 0.24));
  const flapGeo = m.own(new THREE.BoxGeometry(0.11, 0.08, 0.25));
  const buckleGeo = m.own(new THREE.BoxGeometry(0.02, 0.04, 0.04));
  for (const s of [-1, 1]) {
    const st = new THREE.Group();
    st.position.set(s * 0.25, top + 0.03, 0.02);
    part(st, strapGeo, LEATHER_DARK);
    part(st, stirrupGeo, BRASS, 0, -0.39, 0).rotation.y = Math.PI / 2;
    body.add(st);
    danglers.push(st);
    const bag = new THREE.Group();
    bag.position.set(s * 0.31, top - 0.04, -0.4);
    part(bag, bagGeo, CANVAS, 0, -0.14, 0);
    part(bag, flapGeo, LEATHER, 0, -0.04, 0);
    part(bag, buckleGeo, BRASS, s * 0.055, -0.1, 0);
    bag.rotation.z = s * 0.15;
    body.add(bag);
    danglers.push(bag);
  }

  // ---- Halter: noseband and cheek straps, a red tassel on the browband.
  const face = m.face();
  const nose = part(face, m.own(new THREE.TorusGeometry(0.1, 0.016, 4, 12)), LEATHER_DARK, 0, 0, 0.17);
  nose.scale.set(1, 0.95, 1);
  for (const s of [-1, 1]) {
    const strap = part(face, m.own(new THREE.BoxGeometry(0.015, 0.025, 0.28)), LEATHER_DARK, s * 0.095, 0.03, 0.04);
    strap.rotation.y = s * 0.05;
  }
  part(face, m.own(new THREE.BoxGeometry(0.2, 0.025, 0.03)), LEATHER_DARK, 0, 0.1, -0.1);
  part(face, m.own(new THREE.IcosahedronGeometry(0.035, 0)), DYE.red, 0, 0.13, -0.08);

  m.flatten();
  m.merge(face);
  for (const d of danglers) m.merge(d);

  let swing = 0;
  return {
    group,
    seatHeight: SEAT_HEIGHT,
    bodyR: 0.65,
    animate({ speed, look, t, dt, rm }) {
      m.update(dt, t, { speed, look, rm });
      swing += dt * (2 + speed * 2.2);
      const k = Math.min(1, speed / 1.5) * (rm ? 0.4 : 1);
      // Stirrups and bags swing with the gait; the bags hang a little out from the flanks (odd entries).
      danglers.forEach((d, i) => {
        d.rotation.x = Math.sin(swing + i) * 0.12 * k;
        d.rotation.z = (i % 2 ? Math.sign(d.position.x) * 0.15 : 0) + Math.cos(swing * 0.5 + i) * 0.06 * k;
      });
    },
    dispose: m.dispose,
  };
}
