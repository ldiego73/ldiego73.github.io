/**
 * A small feria on the edge of a tambo plaza: market stalls (weavings, native potatoes and maize, clay
 * pottery) with a vendor behind each, and a few shoppers with baskets strolling between them. The stalls sit
 * on the side away from the tambo's khipu frame (whose E prompt stays free); vendors return the traveler's
 * greeting ("E · Saludar") with a short bilingual line in a speech bubble.
 */
import * as THREE from "three";
import type { L } from "../../contract";
import { MARKET, within } from "./logic";
import {
  DARKS,
  MAN,
  type PartName,
  POLLERAS,
  PONCHOS,
  rng,
  SKINS,
  type StallKind,
  Static,
  stall,
  WEAVES,
  WOMAN,
} from "./models";
import { damp, Person } from "./person";
import type { Crowd, Palette } from "./rig";
import type { Ctx, Group } from "./types";

const GREET: Record<StallKind, L> = {
  textiles: {
    es: "¡Allillanchu, caminante! Estos tejidos los hicimos en la comunidad.",
    en: "Allillanchu, traveler! We wove these in our community.",
  },
  produce: {
    es: "¡Imaynalla! Papa nativa y maíz de la última cosecha. Buen camino.",
    en: "Imaynalla! Native potatoes and maize from the last harvest. Safe travels.",
  },
  pottery: {
    es: "¡Allin p'unchay! Ollas y cántaros de barro, hechos a mano.",
    en: "Allin p'unchay! Clay pots and jars, made by hand.",
  },
};

interface Stand {
  kind: StallKind;
  /** World positions: stall center, vendor spot, browse spot in front. */
  c: THREE.Vector3;
  vendor: THREE.Vector3;
  front: THREE.Vector3;
  yaw: number;
  p: Person;
  wave: number;
}

export interface FeriaFrame {
  /** Plaza center and yaw (local +Z toward the trail). */
  x: number;
  z: number;
  yaw: number;
  /** -1 / 1: which local X side the stalls go on (away from the khipu frame). */
  side: number;
}

const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length] as T;

export function createFeria(
  env: Ctx["env"],
  crowd: Crowd,
  staticMat: THREE.Material,
  frame: FeriaFrame,
  nStalls: number,
  nShoppers: number,
  bubble: (text: string, at: THREE.Vector3) => void,
): Group {
  const R = rng(4242);
  const cos = Math.cos(frame.yaw);
  const sin = Math.sin(frame.yaw);
  const toWorld = (lx: number, lz: number, out = new THREE.Vector3()) => {
    out.x = frame.x + lx * cos + lz * sin;
    out.z = frame.z - lx * sin + lz * cos;
    out.y = env.extra.groundAt(out.x, out.z);
    return out;
  };
  const kinds: StallKind[] = ["textiles", "produce", "pottery"];
  // A row of stalls on the open grass just past the plaza edge (plaza walkable to |x| ≈ 5, trail at z ≳ 4.5),
  // fronts toward the plaza so the traveler can step up to each one.
  const rows: Array<[number, number]> =
    nStalls >= 3
      ? [
          [7.1, -2.6],
          [7.0, -0.1],
          [6.9, 2.4],
        ]
      : [
          [7.0, -1.4],
          [6.95, 1.2],
        ];
  const center = toWorld(frame.side * 6, 0);
  const vendorWear: PartName[][] = [];
  const shopperWear: PartName[][] = [];
  for (let i = 0; i < nStalls; i++)
    vendorWear.push(i === 1 ? [...MAN, "chullo"] : [...WOMAN, i === 0 ? "montera" : "sombrero"]);
  for (let i = 0; i < nShoppers; i++)
    shopperWear.push(
      i % 2 ? [...MAN, i === 3 ? "sombrero" : "chullo"] : [...WOMAN, i === 0 ? "sombrero" : "montera", "basket"],
    );

  const outfit = (man: boolean): Palette => [
    pick(R, SKINS),
    man ? pick(R, PONCHOS) : pick(R, POLLERAS),
    pick(R, WEAVES),
    pick(R, DARKS),
  ];

  // ---- stalls (one merged static mesh) + colliders
  const st = new Static();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const stands: Stand[] = [];
  for (let i = 0; i < nStalls; i++) {
    const [ax, lz] = rows[i] as [number, number];
    const lx = frame.side * ax;
    const c = toWorld(lx, lz);
    const fr = toWorld(frame.side * (ax - 1.55), lz);
    const vd = toWorld(frame.side * (ax + 1.0), lz);
    // Stall +Z faces the plaza (local -side * X).
    const yaw = Math.atan2(fr.x - c.x, fr.z - c.z);
    const base = c.y;
    q.setFromAxisAngle(up, yaw);
    m.compose(c, q, new THREE.Vector3(1, 1, 1));
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    stall(st, kinds[i] as StallKind, 101 + i * 17, m, (x, z) => {
      const wx = c.x + x * cy + z * sy;
      const wz = c.z - x * sy + z * cy;
      return env.heightAt(wx, wz) - base;
    });
    env.addCollider({ kind: "circle", x: c.x, z: c.z, r: 1.05 });
    const p = new Person({
      kind: "vendor",
      crowd,
      idx: crowd.alloc(),
      wear: vendorWear[i] as PartName[],
      palette: outfit(i === 1),
      scale: i === 1 ? 1.02 : 0.94,
      girth: i === 1 ? 1.05 : 1.04,
      radius: 0.36,
      seed: 31 + i * 5.3,
    });
    p.place(vd.x, vd.z, yaw + 0);
    stands.push({ kind: kinds[i] as StallKind, c, vendor: vd, front: fr, yaw, p, wave: 0 });
  }
  const stallGeo = st.build();
  const stallMesh = new THREE.Mesh(stallGeo, staticMat);
  stallMesh.name = "people:feria-stalls";
  stallMesh.castShadow = true;
  stallMesh.receiveShadow = true;
  env.scene.add(stallMesh);

  // ---- shoppers
  const shoppers = Array.from({ length: nShoppers }, (_, i) => {
    const p = new Person({
      kind: "shopper",
      crowd,
      idx: crowd.alloc(),
      wear: shopperWear[i] as PartName[],
      palette: outfit(i % 2 === 1),
      scale: i % 2 ? 1.0 : 0.92 + R() * 0.04,
      girth: 1.02,
      radius: 0.34,
      seed: 77 + i * 9.1,
    });
    const s = stands[i % stands.length] as Stand;
    p.place(s.front.x + (R() - 0.5), s.front.z + (R() - 0.5));
    p.u = i % stands.length;
    p.timer = 2 + R() * 6;
    p.state = "browse";
    return p;
  });

  // Strolling spots on the plaza (besides the stall fronts).
  const strolls = [toWorld(frame.side * 3, 1.6), toWorld(frame.side * 2.6, -1.2), toWorld(frame.side * 4, 2.8)];

  let open: boolean | null = null;
  let tick = 0;
  let near: Stand | null = null;
  let visibleNow = true;
  const tgt = new THREE.Vector3();

  const animate = (p: Person, c: Ctx, talk: number) => {
    const b = p.bones;
    p.rest(c.clock, c.rm);
    p.gait(c.dt, c.rm);
    if (talk > 0) {
      // Wave back with a little bow of the head.
      b.armR.rotation.set(-2.5 + Math.sin(c.clock * 9) * (c.rm ? 0 : 0.18), 0, -0.25);
      b.head.rotation.x = 0.12 * Math.min(1, talk);
    }
    p.commit();
  };

  const group: Group = {
    name: "feria",
    center,
    radius: 10,
    update(c, visible) {
      const isOpen = within(c.time, MARKET[0], MARKET[1]);
      if (isOpen !== open || c.jump) {
        // First frame or a clock jump: set the market straight away.
        if (open === null || c.jump) {
          for (const s of stands) s.p.setActive(isOpen);
          for (const p of shoppers) p.setActive(isOpen);
        }
        open = isOpen;
      }
      // Opening / closing time: people arrive and pack up while the traveler isn't looking.
      if (tick++ % 15 === 0) {
        for (const s of stands)
          if (s.p.active !== isOpen && !c.seen(s.vendor.x, s.vendor.y + 1, s.vendor.z, 80)) s.p.setActive(isOpen);
        for (const p of shoppers) if (p.active !== isOpen && !c.seen(p.x, p.y + 1, p.z, 80)) p.setActive(isOpen);
      }
      if (visible !== visibleNow) {
        visibleNow = visible;
        if (!visible) {
          for (const s of stands) s.p.hide();
          for (const p of shoppers) p.hide();
        }
      }
      // Who is the traveler greeting? The vendor whose stall front they stand at.
      near = null;
      if (isOpen) {
        let bd = 2.6;
        for (const s of stands) {
          if (!s.p.active) continue;
          const d = Math.min(
            Math.hypot(s.front.x - c.avatar.x, s.front.z - c.avatar.z),
            Math.hypot(s.vendor.x - c.avatar.x, s.vendor.z - c.avatar.z) - 0.4,
          );
          if (d < bd) {
            bd = d;
            near = s;
          }
        }
      }
      if (!visible) return;
      for (const s of stands) {
        const p = s.p;
        if (!p.active) continue;
        p.x = s.vendor.x;
        p.z = s.vendor.z;
        p.y = s.vendor.y;
        p.speed = 0;
        s.wave = Math.max(0, s.wave - c.dt);
        // Face the nearest shopper or the traveler at the stall front; otherwise the plaza.
        let fx = s.c.x + (s.c.x - s.vendor.x);
        let fz = s.c.z + (s.c.z - s.vendor.z);
        let bd = 3.2;
        for (const sh of shoppers) {
          const d = Math.hypot(sh.x - s.front.x, sh.z - s.front.z);
          if (d < bd) {
            bd = d;
            fx = sh.x;
            fz = sh.z;
          }
        }
        if (Math.hypot(c.avatar.x - s.front.x, c.avatar.z - s.front.z) < 3.4) {
          fx = c.avatar.x;
          fz = c.avatar.z;
        }
        p.face(fx, fz, c.dt, 3);
        p.resolve(0);
        animate(p, c, s.wave);
        // Tend the goods now and then (arms forward over the table).
        if (s.wave <= 0 && !c.rm && Math.sin(c.clock * 0.35 + p.seed) > 0.6) {
          p.bones.armL.rotation.x = -0.9;
          p.bones.armR.rotation.x = -0.8 + Math.sin(c.clock * 2.4) * 0.12;
          p.bones.torso.rotation.x = 0.25;
          p.commit();
        }
      }
      for (const p of shoppers) {
        if (!p.active) continue;
        p.timer -= c.dt;
        if (p.state === "walk") {
          const d = p.seek(p.tx, p.tz, 0.95, c.dt);
          if (d < 0.35) {
            p.state = "browse";
            p.timer = 4 + ((p.seed * 13.7 + c.clock) % 5);
          }
        } else {
          p.speed = damp(p.speed, 0, 6, c.dt);
          const s = stands[p.u] as Stand;
          if (p.u >= 0 && p.u < stands.length) p.face(s.c.x, s.c.z, c.dt, 3);
          p.resolve(0.5);
          if (p.timer <= 0) {
            // Next: another stall (mostly) or a stroll across the plaza.
            const k = Math.floor((p.seed * 3.1 + c.clock * 1.7) % (stands.length + 1));
            if (k < stands.length && k !== p.u) {
              const s2 = stands[k] as Stand;
              p.u = k;
              tgt.set(s2.front.x, 0, s2.front.z);
              // Spread along the stall front.
              const off = ((p.seed * 7.3) % 1.2) - 0.6;
              p.tx = tgt.x + Math.cos(s2.yaw) * off;
              p.tz = tgt.z - Math.sin(s2.yaw) * off;
            } else {
              const sp = strolls[Math.floor((p.seed + c.clock) % strolls.length)] as THREE.Vector3;
              p.u = -1;
              p.tx = sp.x;
              p.tz = sp.z;
            }
            p.state = "walk";
          }
        }
        p.y = env.extra.groundAt(p.x, p.z);
        animate(p, c, 0);
        if (p.state === "browse" && p.u >= 0 && !c.rm) {
          // Look over the goods: point, weigh a potato, nod.
          const k = Math.sin(c.clock * 0.8 + p.seed);
          if (k > 0.3) {
            p.bones.armL.rotation.x = -0.75 - (k - 0.3) * 0.5;
            p.bones.head.rotation.x = 0.2;
            p.commit();
          }
        }
      }
    },
    prompt(c) {
      if (!near) return null;
      return c.env.lang === "es" ? "E · Saludar" : "E · Greet";
    },
    interact(c) {
      if (!near) return false;
      near.wave = 2.4;
      const head = new THREE.Vector3(near.vendor.x, near.vendor.y + 2.0, near.vendor.z);
      bubble(GREET[near.kind][c.env.lang], head);
      return true;
    },
    drawCalls: () => 1,
    points: () => stands.map((s) => ({ x: s.front.x, z: s.front.z })),
    people: () => stands.filter((s) => s.p.active).length + shoppers.filter((p) => p.active).length,
    dispose() {
      for (const s of stands) s.p.dispose();
      for (const p of shoppers) p.dispose();
      stallGeo.dispose();
      stallMesh.removeFromParent();
    },
  };
  return group;
}
