/**
 * Peruvian Paso horse (caballo de paso) for the coast ride: the shared animal "horse" (one continuous skinned
 * body from ../../characters/animals/: a bay with black points, a star on the forehead, the arched neck and
 * near-vertical face of the breed, the long mane falling to one side and the long low tail) moving in the
 * breed's own gait, the paso llano (a lateral four-beat at running speed with the "término", the front legs
 * swinging out in an arc, and a still back). Dressed in a chalán's tack: a Peruvian saddle (high pommel and
 * cantle, leather skirts) under a sheepskin pellón with woven, fringed edges, carved wooden box stirrups
 * (estribos de cajón) with brass trim, a studded breast collar and crupper, and a bridle with a dyed browband
 * and wool tassels (borlas). Faces +Z, origin at the feet. Ridden on the Chinchaysuyu coast road
 * (../../costa/ambient/caballo.ts via ./ride.ts).
 *
 * Draw calls: the body, one merged mesh for the saddle and one for the bridle, one per stirrup.
 */
import * as THREE from "three";
import type { WorldEnv } from "../../contract";
import { DYE } from "../../props";
import { mountAnimal } from "./animal";
import type { MountModel } from "./ride";

const LEATHER = "#6a3b20";
const LEATHER_DARK = "#3f2414";
const WOOD = "#5b3a22";
const WOOD_LIGHT = "#7a5232";
const FLEECE = "#e9dfc9";
const SILVER = "#d8d4c8";
const BRASS = "#c9a24a";

/** Barrel centre and radius of the "horse" species (../../characters/animals/species/mammals.ts HORSE_SHAPE). */
const BODY_Y = 1.12;
const BODY_R = 0.32;
/** Top of the barrel (the saddle sits on it) and of the pellón (the rider sits on it). */
const TOP = BODY_Y + BODY_R;
const PELLON_TOP = TOP + 0.13;
/** The rider's feet sit this high: the avatar's hip pivot (0.56 above its feet) lands a hair above the pellón. */
const SEAT_HEIGHT = PELLON_TOP + 0.05 - 0.56;

export function buildPasoHorse(env: WorldEnv): MountModel {
  const m = mountAnimal("horse", { variant: "bay", seed: 11 });
  const group = m.group;
  group.name = "ride-horse";
  const toon = (c: string) => env.toon(c);
  const sph = m.own(new THREE.SphereGeometry(1, 12, 9));
  const box = m.own(new THREE.BoxGeometry(1, 1, 1));
  const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, c: string, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, toon(c));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const blob = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    part(p, sph, c, x, y, z).scale.set(sx, sy, sz);
  const slab = (
    p: THREE.Object3D,
    c: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => {
    const mesh = part(p, box, c, x, y, z);
    mesh.scale.set(w, h, d);
    mesh.rotation.set(rx, ry, rz);
    return mesh;
  };

  // ---- Saddle, on the back (the body bone): cloth, skirts, seat, pommel and cantle, the pellón.
  const body = m.tack("body");
  slab(body, "#2f3557", 0, TOP - 0.01, 0.02, 0.62, 0.03, 0.72);
  for (const s of [-1, 1]) {
    slab(body, LEATHER, s * 0.3, TOP - 0.14, 0.0, 0.03, 0.3, 0.58, 0, 0, s * 0.22);
    slab(body, LEATHER_DARK, s * 0.335, TOP - 0.28, 0.0, 0.032, 0.035, 0.6, 0, 0, s * 0.22);
  }
  slab(body, LEATHER, 0, TOP + 0.04, 0, 0.42, 0.07, 0.52);
  slab(body, LEATHER_DARK, 0, TOP + 0.12, 0.25, 0.26, 0.17, 0.07, -0.25);
  slab(body, LEATHER_DARK, 0, TOP + 0.13, -0.26, 0.38, 0.16, 0.07, 0.3);
  part(body, m.own(new THREE.CylinderGeometry(0.035, 0.045, 0.1, 8)), LEATHER_DARK, 0, TOP + 0.24, 0.27);
  blob(body, FLEECE, 0, PELLON_TOP - 0.04, -0.01, 0.25, 0.05, 0.23);
  slab(body, FLEECE, 0, PELLON_TOP - 0.05, -0.01, 0.42, 0.06, 0.4);
  for (const s of [-1, 1]) {
    slab(body, DYE.red, s * 0.24, PELLON_TOP - 0.13, -0.01, 0.03, 0.15, 0.42, 0, 0, s * 0.35);
    slab(body, DYE.ochre, s * 0.265, PELLON_TOP - 0.18, -0.01, 0.032, 0.03, 0.43, 0, 0, s * 0.35);
    slab(body, DYE.indigo, s * 0.25, PELLON_TOP - 0.09, -0.01, 0.032, 0.025, 0.43, 0, 0, s * 0.35);
    for (let k = 0; k < 9; k++)
      slab(body, k % 2 ? DYE.ochre : DYE.red, s * 0.29, PELLON_TOP - 0.24, -0.19 + k * 0.045, 0.012, 0.07, 0.016);
  }
  // Girth round the barrel; the studded breast collar across the chest with a tassel each side.
  const girth = part(
    body,
    m.own(new THREE.TorusGeometry(BODY_R * 0.98, 0.022, 4, 18, Math.PI)),
    LEATHER_DARK,
    0,
    BODY_Y,
    0.16,
  );
  girth.rotation.set(0, Math.PI / 2, Math.PI);
  girth.scale.set(1, 1, 0.92);
  const collar = part(
    body,
    m.own(new THREE.TorusGeometry(0.27, 0.026, 4, 14, Math.PI)),
    LEATHER,
    0,
    BODY_Y + 0.02,
    0.66,
  );
  collar.rotation.set(0.25, 0, Math.PI);
  collar.scale.set(1, 0.75, 1);
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI + (k / 6) * Math.PI;
    blob(body, SILVER, Math.cos(a) * 0.27, BODY_Y + 0.02 + Math.sin(a) * 0.2, 0.69, 0.022, 0.022, 0.012);
  }
  const tasselGeo = m.own(new THREE.ConeGeometry(0.035, 0.12, 6));
  for (const s of [-1, 1]) part(body, tasselGeo, DYE.red, s * 0.2, BODY_Y - 0.17, 0.72).rotation.x = Math.PI;
  // Crupper (baticola) from the cantle along the croup, silver studs on it.
  slab(body, LEATHER, 0, TOP + 0.0, -0.6, 0.05, 0.025, 0.42, 0.12);
  for (let k = 0; k < 4; k++) blob(body, SILVER, 0, TOP + 0.015 - k * 0.018, -0.47 - k * 0.1, 0.018, 0.018, 0.018);

  // ---- Box stirrups (estribos de cajón) on straps from the saddle: they swing with the gait.
  const danglers: THREE.Group[] = [];
  const strapGeo = m.own(new THREE.BoxGeometry(0.022, 0.26, 0.045));
  strapGeo.translate(0, -0.13, 0);
  for (const s of [-1, 1]) {
    const st = new THREE.Group();
    st.name = "stirrup";
    st.position.set(s * 0.32, TOP + 0.02, 0.06);
    part(st, strapGeo, LEATHER_DARK);
    slab(st, WOOD, 0, -0.33, 0.02, 0.12, 0.13, 0.2);
    slab(st, WOOD_LIGHT, 0, -0.33, 0.125, 0.105, 0.1, 0.012);
    slab(st, BRASS, 0, -0.275, 0.02, 0.124, 0.018, 0.204);
    slab(st, WOOD_LIGHT, s * 0.0605, -0.35, 0.02, 0.006, 0.05, 0.12);
    body.add(st);
    danglers.push(st);
  }

  // ---- Bridle along the face: crown strap, dyed browband with brass studs, cheek straps, noseband, borlas.
  // Face frame: origin at the muzzle base, +Z down the face, +Y toward the forehead.
  const face = m.face();
  slab(face, LEATHER_DARK, 0, 0.1, -0.12, 0.2, 0.025, 0.03);
  slab(face, DYE.red, 0, 0.1, -0.05, 0.19, 0.03, 0.03, 0.2);
  for (const x of [-0.055, 0, 0.055]) blob(face, BRASS, x, 0.118, -0.05, 0.012, 0.012, 0.01);
  for (const s of [-1, 1]) slab(face, LEATHER_DARK, s * 0.088, 0.02, 0.06, 0.015, 0.025, 0.3, 0, s * 0.04);
  const nose = part(face, m.own(new THREE.TorusGeometry(0.085, 0.016, 4, 14)), LEATHER_DARK, 0, 0, 0.24);
  nose.scale.set(1, 0.95, 1);
  const borla = m.own(new THREE.ConeGeometry(0.03, 0.11, 6));
  for (const s of [-1, 1]) {
    part(face, borla, DYE.ochre, s * 0.11, 0.05, -0.06).rotation.set(Math.PI - 0.4, 0, 0);
    part(face, borla, DYE.red, s * 0.1, -0.03, 0.22).rotation.set(Math.PI - 0.6, 0, 0);
  }
  part(face, borla, DYE.indigo, 0, -0.1, -0.02).rotation.set(Math.PI - 0.6, 0, 0);

  m.flatten();
  m.merge(face);
  for (const d of danglers) m.merge(d);

  let swing = 0;
  return {
    group,
    seatHeight: SEAT_HEIGHT,
    bodyR: 0.7,
    animate({ speed, look, t, dt, rm }) {
      m.update(dt, t, { speed, look, rm });
      // The stirrups swing a little with the gait (the paso keeps them almost still).
      swing += dt * (2 + speed * 1.6);
      const k = Math.min(1, speed / 2) * (rm ? 0.4 : 1);
      danglers.forEach((d, i) => {
        d.rotation.x = Math.sin(swing + i) * 0.06 * k;
        d.rotation.z = Math.cos(swing * 0.5 + i) * 0.04 * k;
      });
    },
    dispose: m.dispose,
  };
}
