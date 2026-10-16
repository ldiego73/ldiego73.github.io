/**
 * Quad bike (cuatrimoto) for the road mounts (./ride.ts): the sand-and-gravel ATV that tourists ride across
 * the Nazca pampa. A dark tube frame with a red plastic body (front nose with twin headlights, front and rear
 * fenders, a tank cowl), a black saddle, footboards, steel racks front and back with a cloth-wrapped bundle
 * (q'ipi) strapped on the rear one, handlebars with grips and mirrors, and four chunky knobbly wheels.
 * Faces +Z, origin at the ground under the seat (the rider's hips).
 *
 * Motion (`animate`, called by ./ride.ts every frame after it set the group's yaw):
 *  - the wheels spin by the distance travelled (speed · dt / radius) — the rims' spokes and the tread lugs
 *    make the spin readable;
 *  - the front wheels and the handlebars steer with the turn rate (yaw change per second), eased;
 *  - the body pitches with the ground under the axles (env.heightAt front and back, smoothed), so it never
 *    floats on the descent or the climb, and bobs a little on its suspension with speed;
 *  - with reduced motion the bob and the idle shake are off (the wheels still roll, as any vehicle does).
 *
 * Draw calls: each rigid node (body, handlebars, every wheel) is flattened into one vertex-colored mesh on one
 * shared vertex-toon material (../../merge-colors.ts): six in all.
 */
import * as THREE from "three";
import type { WorldEnv } from "../../contract";
import { flattenToonGroup, vertexToon } from "../../merge-colors";
import { DYE } from "../../props";
import { angleLerp } from "./logic";
import type { MountModel } from "./ride";

const PLASTIC = "#c4383f";
const PLASTIC_DARK = "#8f2530";
const FRAME = "#2b2a2c";
const STEEL = "#8d8f93";
const TYRE = "#262220";
const LUG = "#171412";
const RIM = "#c9c4ba";
const SEAT = "#1f1c1b";
const LAMP = "#fff1b8";
const CLOTH = DYE.red;

/** Wheel radius and half track / half wheelbase (a ~1.9 × 1.2 m machine next to a ~1.65 m traveler). */
const WHEEL_R = 0.3;
const TRACK = 0.52;
const AXLE_F = 0.64;
const AXLE_R = -0.6;
/** Saddle top above the ground; the rider's feet sit SEAT_TOP − 0.5 high (avatar hip pivot ≈ 0.56, as on the mule). */
const SEAT_TOP = 0.95;
const SEAT_HEIGHT = SEAT_TOP - 0.5;

export function buildQuad(env: WorldEnv): MountModel {
  const geos: THREE.BufferGeometry[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T) => {
    geos.push(x);
    return x;
  };
  const mat = vertexToon();
  const part = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    c: string,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => {
    const m = new THREE.Mesh(geo, env.toon(c));
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const box = g(new THREE.BoxGeometry(1, 1, 1));
  const cyl = g(new THREE.CylinderGeometry(1, 1, 1, 12));
  const B = (
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    c: string,
    x: number,
    y: number,
    z: number,
    rx = 0,
  ) => part(parent, box, c, x, y, z, rx).scale.set(w, h, d);
  /** A tube from a to b (racks, frame rails), radius r. */
  const tube = (parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, c: string) => {
    const m = part(parent, cyl, c);
    const d = b.clone().sub(a);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    m.scale.set(r, d.length(), r);
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  const group = new THREE.Group();
  group.name = "ride-quad";
  /** Pitch + suspension node: everything rides on it. */
  const body = new THREE.Group();
  body.name = "ride-quad:body";
  group.add(body);

  // ---- Frame and engine (dark), footboards.
  B(body, 0.34, 0.16, 1.32, FRAME, 0, 0.42, 0.02);
  B(body, 0.36, 0.3, 0.46, "#3a3735", 0, 0.5, -0.02);
  B(body, 0.12, 0.12, 0.3, STEEL, 0.2, 0.42, -0.2);
  for (const s of [-1, 1]) {
    B(body, 0.26, 0.04, 0.5, FRAME, s * 0.36, 0.36, 0.1);
    // Tread strips on the footboards.
    for (const dz of [-0.12, 0, 0.12]) B(body, 0.24, 0.015, 0.04, STEEL, s * 0.36, 0.385, 0.1 + dz);
  }
  // Swing arm / axles (dark tubes across under the fenders).
  tube(body, V(-TRACK, WHEEL_R, AXLE_R), V(TRACK, WHEEL_R, AXLE_R), 0.035, FRAME);
  tube(body, V(-TRACK + 0.1, WHEEL_R + 0.04, AXLE_F), V(TRACK - 0.1, WHEEL_R + 0.04, AXLE_F), 0.03, FRAME);

  // ---- Red bodywork: nose, front fenders, tank cowl, rear fenders and deck.
  B(body, 0.62, 0.2, 0.44, PLASTIC, 0, 0.7, 0.86, -0.25);
  B(body, 0.5, 0.08, 0.3, PLASTIC_DARK, 0, 0.62, 1.02, -0.55);
  for (const s of [-1, 1]) {
    // Front fender: a flat top over the wheel with a sloped front and rear lip.
    B(body, 0.34, 0.05, 0.5, PLASTIC, s * TRACK, 0.7, AXLE_F);
    B(body, 0.34, 0.05, 0.22, PLASTIC, s * TRACK, 0.64, AXLE_F + 0.32, 0.55);
    B(body, 0.34, 0.05, 0.2, PLASTIC, s * TRACK, 0.62, AXLE_F - 0.3, -0.7);
    // Rear fender: the same, longer, joined to the deck.
    B(body, 0.36, 0.05, 0.56, PLASTIC, s * TRACK, 0.72, AXLE_R);
    B(body, 0.36, 0.05, 0.2, PLASTIC, s * TRACK, 0.64, AXLE_R - 0.34, 0.7);
    B(body, 0.36, 0.05, 0.18, PLASTIC, s * TRACK, 0.64, AXLE_R + 0.32, -0.6);
    // Headlights in the nose.
    part(body, cyl, "#3a3735", s * 0.17, 0.74, 1.07, Math.PI / 2 - 0.25).scale.set(0.075, 0.04, 0.075);
    part(body, cyl, LAMP, s * 0.17, 0.745, 1.09, Math.PI / 2 - 0.25).scale.set(0.06, 0.02, 0.06);
    // Rear tail light.
    B(body, 0.08, 0.05, 0.03, "#e0402f", s * 0.24, 0.72, AXLE_R - 0.5);
  }
  B(body, 0.84, 0.06, 0.6, PLASTIC, 0, 0.74, AXLE_R + 0.02);
  // Tank cowl in front of the seat (the rider's knees grip it).
  B(body, 0.36, 0.22, 0.38, PLASTIC, 0, 0.84, 0.34, 0.12);
  B(body, 0.22, 0.04, 0.2, PLASTIC_DARK, 0, 0.96, 0.36, 0.12);
  // Saddle: a long padded seat with a darker seam.
  B(body, 0.34, 0.12, 0.68, SEAT, 0, SEAT_TOP - 0.06, -0.14);
  B(body, 0.345, 0.02, 0.69, "#35302d", 0, SEAT_TOP - 0.1, -0.14);

  // ---- Racks (steel tubes) and the bundle on the rear one.
  const rack = (zc: number, y: number, w: number, d: number) => {
    for (const s of [-1, 1]) tube(body, V(s * w, y, zc - d), V(s * w, y, zc + d), 0.018, STEEL);
    for (const k of [-1, 0, 1]) tube(body, V(-w, y, zc + k * d), V(w, y, zc + k * d), 0.016, STEEL);
  };
  rack(0.86, 0.84, 0.32, 0.16);
  rack(AXLE_R - 0.05, 0.8, 0.36, 0.22);
  // Q'ipi: a cloth-wrapped bundle lying across the rear rack, with woven stripes and a strap.
  part(body, cyl, CLOTH, 0, 0.93, AXLE_R - 0.08, 0, 0, Math.PI / 2).scale.set(0.15, 0.62, 0.15);
  for (const [dx, c] of [
    [-0.18, DYE.ochre],
    [0, DYE.indigo],
    [0.18, DYE.ochre],
  ] as Array<[number, string]>)
    part(body, cyl, c, dx, 0.93, AXLE_R - 0.08, 0, 0, Math.PI / 2).scale.set(0.155, 0.04, 0.155);
  B(body, 0.03, 0.04, 0.34, "#3b2418", 0.24, 1.07, AXLE_R - 0.08);
  B(body, 0.03, 0.04, 0.34, "#3b2418", -0.24, 1.07, AXLE_R - 0.08);

  // ---- Handlebars (steer with the front wheels): stem, bar, grips, levers, mirrors.
  const bars = new THREE.Group();
  bars.name = "ride-quad:bars";
  bars.position.set(0, 0.96, 0.48);
  bars.rotation.x = -0.25;
  body.add(bars);
  tube(bars, V(0, -0.1, 0), V(0, 0.17, -0.02), 0.03, FRAME);
  tube(bars, V(-0.36, 0.2, -0.06), V(0.36, 0.2, -0.06), 0.02, STEEL);
  for (const s of [-1, 1]) {
    tube(bars, V(s * 0.3, 0.2, -0.06), V(s * 0.42, 0.2, -0.06), 0.03, "#141212");
    B(bars, 0.12, 0.015, 0.03, STEEL, s * 0.28, 0.21, -0.02);
    tube(bars, V(s * 0.24, 0.2, -0.06), V(s * 0.27, 0.36, -0.03), 0.01, STEEL);
    part(bars, cyl, "#141212", s * 0.27, 0.37, -0.03, Math.PI / 2).scale.set(0.045, 0.02, 0.035);
  }
  B(bars, 0.16, 0.08, 0.04, "#141212", 0, 0.22, 0.0);

  // ---- Wheels: a fat tyre with tread lugs, a pale rim with five spokes and a hub. Axis along X.
  const wheelParts = (w: THREE.Object3D, s: number) => {
    part(w, cyl, TYRE, 0, 0, 0, 0, 0, Math.PI / 2).scale.set(WHEEL_R, 0.22, WHEEL_R);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const lug = part(w, box, LUG, 0, Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R, a);
      lug.scale.set(0.24, 0.04, 0.07);
    }
    part(w, cyl, RIM, s * 0.075, 0, 0, 0, 0, Math.PI / 2).scale.set(0.17, 0.08, 0.17);
    part(w, cyl, "#6f6a62", s * 0.12, 0, 0, 0, 0, Math.PI / 2).scale.set(0.06, 0.02, 0.06);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const sp = part(w, box, "#5a564f", s * 0.118, Math.cos(a) * 0.09, Math.sin(a) * 0.09, a);
      sp.scale.set(0.012, 0.13, 0.035);
    }
  };
  const wheels: THREE.Group[] = [];
  const steers: THREE.Group[] = [];
  for (const [x, z] of [
    [TRACK, AXLE_F],
    [-TRACK, AXLE_F],
    [TRACK, AXLE_R],
    [-TRACK, AXLE_R],
  ] as Array<[number, number]>) {
    const w = new THREE.Group();
    w.name = "ride-quad:wheel";
    wheelParts(w, Math.sign(x));
    if (z > 0) {
      const st = new THREE.Group();
      st.position.set(x, WHEEL_R, z);
      st.add(w);
      body.add(st);
      steers.push(st);
    } else {
      w.position.set(x, WHEEL_R, z);
      body.add(w);
    }
    wheels.push(w);
  }

  // One vertex-colored mesh per rigid node (wheels and bars keep their own pivots).
  for (const node of [body, bars, ...wheels]) flattenToonGroup(node, mat);

  let spin = 0;
  let steer = 0;
  let lastYaw: number | null = null;
  let pitch = 0;
  let dist = 0;
  let speedS = 0;
  return {
    group,
    seatHeight: SEAT_HEIGHT,
    bodyR: 0.85,
    animate({ speed, t, dt, rm }) {
      if (dt <= 0) return;
      speedS += (speed - speedS) * (1 - Math.exp(-dt * 8));
      // Wheels roll by the distance covered; +x rotation rolls the top of the wheel toward +Z (forward).
      spin = (spin + (speed * dt) / WHEEL_R) % (Math.PI * 2);
      for (const w of wheels) w.rotation.x = spin;
      // Steering from the turn rate (ride.ts set the yaw before calling animate).
      const yaw = group.rotation.y;
      let rate = 0;
      if (lastYaw !== null) {
        let d = yaw - lastYaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        rate = d / dt;
      }
      lastYaw = yaw;
      const want = speedS > 0.3 ? THREE.MathUtils.clamp(rate * 0.22, -0.45, 0.45) : steer * 0.98;
      steer = angleLerp(steer, want, 1 - Math.exp(-dt * 6));
      for (const st of steers) st.rotation.y = steer;
      bars.rotation.y = steer * 0.8;
      // Pitch with the ground under the axles (the group stands on the ground under the seat).
      const gp = group.position;
      const s = Math.sin(yaw);
      const c = Math.cos(yaw);
      const hf = env.heightAt(gp.x + s * AXLE_F, gp.z + c * AXLE_F);
      const hr = env.heightAt(gp.x + s * AXLE_R, gp.z + c * AXLE_R);
      const want2 = THREE.MathUtils.clamp(Math.atan2(hr - hf, AXLE_F - AXLE_R), -0.5, 0.5);
      pitch += (want2 - pitch) * (1 - Math.exp(-dt * 10));
      body.rotation.x = pitch;
      dist += speed * dt;
      const bob = rm ? 0 : Math.sin(dist * 2.6) * 0.012 * Math.min(1, speedS / 3) + Math.sin(t * 31) * 0.003;
      body.position.y = bob;
      body.rotation.z = rm ? 0 : Math.sin(dist * 1.3 + 0.7) * 0.012 * Math.min(1, speedS / 3) - steer * 0.04;
    },
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
