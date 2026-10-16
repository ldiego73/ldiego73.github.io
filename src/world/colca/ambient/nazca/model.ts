/**
 * Geometry of the Nazca pampa (../nazca.ts): the geoglyph ribbons laid on the ground, the mirador tower
 * (a rust-red steel frame with wooden flights and a railed deck, like the lookout beside the Panamericana) and
 * its walkable decks, and the sign boards' atlas. Three.js only; positions come from ./logic.ts and
 * ../../plan.ts TOWER.
 */
import * as THREE from "three";
import type { DeckSpec } from "../../../decks";
import { canvasTex, FONT, fitFont } from "../../../props";
import { VKit } from "../../kit";
import { noise } from "../../layout";
import { TOWER } from "../../plan";
import { type Figure, worldLines } from "./logic";

/** Ribbons along every figure's lines, a few cm above the ground, with round joints (one geometry). */
export function glyphRibbons(
  list: ReadonlyArray<Figure>,
  heightAt: (x: number, z: number) => number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const pale = new THREE.Color("#e6d3ab");
  const pale2 = new THREE.Color("#d8c094");
  const lift = 0.09;
  const quad = (ax: number, az: number, bx: number, bz: number, w: number) => {
    const dx = bx - ax;
    const dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * (w / 2);
    const nz = (dx / l) * (w / 2);
    const v = [
      [ax - nx, az - nz],
      [ax + nx, az + nz],
      [bx - nx, bz - nz],
      [bx - nx, bz - nz],
      [ax + nx, az + nz],
      [bx + nx, bz + nz],
    ];
    c.copy(pale).lerp(pale2, noise(ax / 9, az / 9, 0x4e));
    for (const [x, z] of v as Array<[number, number]>) {
      pos.push(x, heightAt(x, z) + lift, z);
      col.push(c.r, c.g, c.b);
    }
  };
  const joint = (x: number, z: number, w: number) => {
    const n = 8;
    const y = heightAt(x, z) + lift + 0.004;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      pos.push(
        x,
        y,
        z,
        x + Math.sin(a1) * (w / 2),
        y,
        z + Math.cos(a1) * (w / 2),
        x + Math.sin(a0) * (w / 2),
        y,
        z + Math.cos(a0) * (w / 2),
      );
      for (let k = 0; k < 3; k++) col.push(pale.r, pale.g, pale.b);
    }
  };
  for (const f of list) {
    for (const line of worldLines(f)) {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i] as [number, number];
        const b = line[i + 1] as [number, number];
        // Split long segments so the ribbon follows the ground.
        const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
        for (let k = 0; k < steps; k++) {
          const u0 = k / steps;
          const u1 = (k + 1) / steps;
          quad(
            a[0] + (b[0] - a[0]) * u0,
            a[1] + (b[1] - a[1]) * u0,
            a[0] + (b[0] - a[0]) * u1,
            a[1] + (b[1] - a[1]) * u1,
            f.width,
          );
        }
        joint(a[0], a[1], f.width);
      }
      const last = line[line.length - 1] as [number, number];
      joint(last[0], last[1], f.width);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Tower dimensions (local frame: +x away from the road, the stair starts on the −x face). */
export const T = {
  half: TOWER.half,
  /** Flight run between the landings, landing depth, lane split. */
  run: 1.9,
  lanes: { a: [-3.5, -1.75], b: [-1.75, 0] } as const,
  entry: -6.2,
  rise: TOWER.top / 4,
} as const;

/** Local → world (same convention as ../../../decks.ts obox and Object3D.rotation.y = yaw). */
export function towerWorld(lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(TOWER.yaw);
  const s = Math.sin(TOWER.yaw);
  return { x: TOWER.x + lx * c + lz * s, z: TOWER.z - lx * s + lz * c };
}
function towerLocal(x: number, z: number): { lx: number; lz: number } {
  const dx = x - TOWER.x;
  const dz = z - TOWER.z;
  const c = Math.cos(TOWER.yaw);
  const s = Math.sin(TOWER.yaw);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

/** The tower's walkable decks: four flights, three landings and the top (heights above `baseY`). */
export function towerDecks(baseY: number): DeckSpec[] {
  const R = T.rise;
  const box = (x0: number, x1: number, z0: number, z1: number) => {
    const c = towerWorld((x0 + x1) / 2, (z0 + z1) / 2);
    return { kind: "obox" as const, x: c.x, z: c.z, yaw: TOWER.yaw, halfW: (x1 - x0) / 2, halfD: (z1 - z0) / 2 };
  };
  const ramp = (x0: number, x1: number, y0: number, y1: number) => (x: number, z: number) => {
    const { lx } = towerLocal(x, z);
    const u = Math.max(0, Math.min(1, (lx - x0) / (x1 - x0)));
    return baseY + y0 + (y1 - y0) * u;
  };
  const [a0, a1] = T.lanes.a;
  const [b0, b1] = T.lanes.b;
  const H = T.half;
  const r = T.run;
  return [
    { id: "nazca:f1", shape: box(T.entry, r, a0, a1), y: ramp(T.entry, r, 0, R) },
    { id: "nazca:l1", shape: box(r, H, a0, b1), y: baseY + R },
    { id: "nazca:f2", shape: box(-r, r, b0, b1), y: ramp(r, -r, R, 2 * R) },
    { id: "nazca:l2", shape: box(-H, -r, a0, b1), y: baseY + 2 * R },
    { id: "nazca:f3", shape: box(-r, r, a0, a1), y: ramp(-r, r, 2 * R, 3 * R) },
    { id: "nazca:l3", shape: box(r, H, a0, b1), y: baseY + 3 * R },
    { id: "nazca:f4", shape: box(-r, r, b0, b1), y: ramp(r, -r, 3 * R, 4 * R) },
    { id: "nazca:top", shape: box(-H, H, -H, H), y: baseY + 4 * R },
  ];
}

/** The tower: frame, flights, landings, deck and railings in one vertex-coloured geometry. */
export function towerGeometry(baseY: number): THREE.BufferGeometry {
  const k = new VKit().at(TOWER.x, baseY, TOWER.z, TOWER.yaw);
  const steel = "#8d4a34";
  const steel2 = "#a3583c";
  const wood = "#9a7048";
  const wood2 = "#7f5a38";
  const H = T.half;
  const R = T.rise;
  const top = TOWER.top;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // Footings and the four legs, with cross braces on each face per storey.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      // Legs reach 2 u below the stair's foot: the pampa under the frame is not quite level.
      k.box(0.7, 2.2, 0.7, sx * H, -2.1, sz * H, "#9c9384");
      k.cyl(0.13, 0.13, top + 3.1, sx * H, -2, sz * H, steel, 6);
    }
  for (let lvl = 0; lvl < 4; lvl++) {
    const y0 = lvl * R;
    const y1 = (lvl + 1) * R;
    for (const [ax, az, bx, bz] of [
      [-H, -H, H, -H],
      [H, -H, H, H],
      [H, H, -H, H],
      [-H, H, -H, -H],
    ] as const) {
      k.stick(V(ax, y0 + 0.2, az), V(bx, y1, bz), 0.05, steel2, 4);
      k.stick(V(bx, y0 + 0.2, bz), V(ax, y1, az), 0.05, steel2, 4);
      k.stick(V(ax, y1, az), V(bx, y1, bz), 0.07, steel, 5);
    }
  }
  // Flights: a sloped plank stringer with treads, and a hand rail on the open side.
  const flight = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) => {
    const n = Math.max(4, Math.round(Math.abs(x1 - x0) / 0.32));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * u;
      const y = y0 + (y1 - y0) * u;
      k.box(Math.abs(x1 - x0) / n + 0.04, 0.09, z1 - z0 - 0.1, x, y - 0.09, (z0 + z1) / 2, i % 2 ? wood : wood2);
    }
    for (const z of [z0 + 0.05, z1 - 0.05]) k.stick(V(x0, y0 - 0.15, z), V(x1, y1 - 0.15, z), 0.06, steel, 4);
    for (const z of [z0 + 0.05, z1 - 0.05]) k.stick(V(x0, y0 + 1.0, z), V(x1, y1 + 1.0, z), 0.035, steel2, 4);
  };
  const [a0, a1] = T.lanes.a;
  const [b0, b1] = T.lanes.b;
  const r = T.run;
  flight(T.entry, r, a0, a1, 0, R);
  flight(r, -r, b0, b1, R, 2 * R);
  flight(-r, r, a0, a1, 2 * R, 3 * R);
  flight(r, -r, b0, b1, 3 * R, 4 * R);
  // Landings.
  for (const [x0, x1, y] of [
    [r, H, R],
    [-H, -r, 2 * R],
    [r, H, 3 * R],
  ] as const)
    k.box(x1 - x0, 0.12, b1 - a0, (x0 + x1) / 2, y - 0.12, (a0 + b1) / 2, wood2);
  // Top deck with planks and a rail all round (posts + two rails).
  for (let i = 0; i < 9; i++)
    k.box((H * 2) / 9 - 0.03, 0.12, H * 2, -H + ((i + 0.5) * (H * 2)) / 9, top - 0.12, 0, i % 2 ? wood : wood2);
  for (const [ax, az, bx, bz] of [
    [-H, -H, H, -H],
    [H, -H, H, H],
    [H, H, -H, H],
    [-H, H, -H, -H],
  ] as const) {
    k.stick(V(ax, top + 1.05, az), V(bx, top + 1.05, bz), 0.05, steel2, 4);
    k.stick(V(ax, top + 0.55, az), V(bx, top + 0.55, bz), 0.04, steel2, 4);
    for (let i = 1; i < 6; i++) {
      const u = i / 6;
      k.cyl(0.04, 0.04, 1.05, ax + (bx - ax) * u, top, az + (bz - az) * u, steel, 4);
    }
  }
  return k.build();
}

/** Sign atlas: one row per board, drawn on one canvas (one texture, one material). */
export function signAtlas(boards: ReadonlyArray<{ title: string; sub: string }>): {
  texture: THREE.CanvasTexture;
  rows: number;
  redraw(): void;
} {
  const W = 512;
  const RH = 150;
  const draw = (ctx: CanvasRenderingContext2D) => {
    boards.forEach((b, i) => {
      const y0 = i * RH;
      ctx.fillStyle = "#7a5233";
      ctx.fillRect(0, y0, W, RH);
      ctx.globalAlpha = 0.16;
      for (let k = 0; k < 10; k++) {
        ctx.fillStyle = k % 2 ? "#000" : "#fff";
        ctx.fillRect(0, y0 + (k / 10) * RH, W, 2);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#4a2f1b";
      ctx.lineWidth = 8;
      ctx.strokeRect(6, y0 + 6, W - 12, RH - 12);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f7e6c4";
      fitFont(ctx, b.title, "800", FONT.display, 52, W - 40);
      ctx.fillText(b.title, W / 2, y0 + RH * 0.38);
      ctx.fillStyle = "#e6c98f";
      fitFont(ctx, b.sub, "700", FONT.body, 28, W - 40);
      ctx.fillText(b.sub, W / 2, y0 + RH * 0.72);
    });
  };
  const texture = canvasTex(W, RH * boards.length, (ctx) => draw(ctx));
  return {
    texture,
    rows: boards.length,
    redraw() {
      const ctx = (texture.image as HTMLCanvasElement).getContext("2d");
      if (!ctx) return;
      draw(ctx);
      texture.needsUpdate = true;
    },
  };
}

/** Planes for the atlas rows, placed (centre, yaw) and merged; uv rows map to the atlas. */
export function signPlanes(
  places: ReadonlyArray<{ x: number; y: number; z: number; yaw: number; w: number }>,
  rows: number,
) {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  places.forEach((p, i) => {
    const g = new THREE.PlaneGeometry(p.w, p.w * (150 / 512));
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) {
      // Canvas rows top → bottom; uv v is bottom → top (flipY).
      const v = uv.getY(k);
      uv.setY(k, 1 - (i + 1 - v) / rows);
    }
    g.applyMatrix4(m.makeRotationY(p.yaw).setPosition(p.x, p.y, p.z));
    parts.push(g);
  });
  const merged = parts.length ? (mergeAll(parts) as THREE.BufferGeometry) : new THREE.BufferGeometry();
  for (const g of parts) g.dispose();
  return merged;
}

function mergeAll(list: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    const u = g.getAttribute("uv");
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u.getX(i), u.getY(i));
    }
    if (g !== g0) g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
