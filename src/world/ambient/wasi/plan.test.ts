import { describe, expect, test } from "bun:test";
import type { Collider } from "../../contract";
import { STATIONS } from "../../contract";
import { createDecks } from "../../decks";
import { buildLayout } from "../../layout";
import { WASI } from "../../trailhead";
import { llamaHome } from "../mount/logic";
import {
  colliders,
  DOOR,
  FURNITURE,
  HD,
  HW,
  INNER,
  isInsideLocal,
  KEEP_OUT_R,
  MAX_RISE,
  onPlinth,
  PLINTH,
  platform,
  ROOMS,
  roomAt,
  SEATS,
  STEPS,
  seatWorld,
  toLocal,
  toWorld,
  WALK,
  walkables,
  wallBoxes,
  worldBox,
  yearsOf,
} from "./plan";

/** Core's traveler radius (index.ts BODY_R): colliders are grown by it. */
const BODY_R = 0.42;
/** Core's step-up limit (index.ts MAX_STEP). */
const MAX_STEP = 0.9;
const FOOTPRINT: Record<string, number> = Object.fromEntries(
  STATIONS.map((s) => [s.id, s.kind === "gate" ? 4.5 : s.kind === "bridge" ? 0 : 6]),
);

const hits = (c: Collider, x: number, z: number, pad = BODY_R) =>
  c.kind === "circle"
    ? Math.hypot(x - c.x, z - c.z) < c.r + pad
    : x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad;

describe("wasi frame", () => {
  test("toWorld and toLocal invert each other; the door faces the trail (+x)", () => {
    for (const [x, z] of [
      [0, 0],
      [3, -2],
      [-5.5, 4.5],
    ] as const) {
      const w = toWorld(x, z);
      const l = toLocal(w.x, w.z);
      expect(l.x).toBeCloseTo(x, 6);
      expect(l.z).toBeCloseTo(z, 6);
    }
    const door = toWorld(DOOR.x, HD);
    expect(door.x).toBeGreaterThan(WASI.x);
    expect(door.z).toBeCloseTo(WASI.z, 6);
  });

  test("world boxes are exact (the yaw is a quarter turn)", () => {
    const b = worldBox({ x0: -1, z0: -2, x1: 3, z1: 4 });
    expect(b.kind).toBe("box");
    if (b.kind !== "box") return;
    expect(b.x1 - b.x0).toBeCloseTo(6, 6);
    expect(b.z1 - b.z0).toBeCloseTo(4, 6);
  });

  test("inside test and room spots", () => {
    expect(isInsideLocal(0, 0)).toBe(true);
    expect(isInsideLocal(0, HD + 0.5)).toBe(false);
    expect(isInsideLocal(HW, 0)).toBe(false);
    for (const r of ROOMS) {
      expect(roomAt(r.spot.x, r.spot.z)).toBe(r.id);
      expect(isInsideLocal(r.spot.x, r.spot.z)).toBe(true);
    }
    expect(roomAt(0, 3.5)).toBeNull();
  });

  test("the door gap is wide enough for the traveler (and the ridden llama)", () => {
    const front = wallBoxes().filter((b) => b.z0 > 0);
    expect(front).toHaveLength(2);
    const [a, b] = front.sort((p, q) => p.x0 - q.x0);
    expect(b!.x0 - a!.x1).toBeGreaterThan(2 * 0.62 + 0.3);
  });

  test("years from career dates", () => {
    expect(yearsOf("2016-03", "2020-01", "es")).toBe("2016–2020");
    expect(yearsOf("2016-03", "2016-11", "en")).toBe("2016");
    expect(yearsOf("2026-05", undefined, "es")).toBe("2026–hoy");
    expect(yearsOf("2026-05", undefined, "en")).toBe("2026–present");
  });
});

describe("wasi collisions on the real trailhead", () => {
  for (const cells of [280, 190, 160]) {
    const L = buildLayout({ cells, footprint: FOOTPRINT });
    for (const w of walkables()) L.addWalkable(w);
    const solids = colliders();
    const plat = platform(L.heightAt);

    /**
     * Rooms reached from the trail with core's movement rules (index.ts canStand + decks.ts): from a cell at
     * height h, a neighbour is entered when it is not solid, it is walkable ground or a deck within a step
     * (≤ h + MAX_STEP), and its ground (that deck, else the terrain) is less than MAX_STEP above h.
     */
    const reachRooms = (withSteps: boolean) => {
      const reg = createDecks();
      for (const d of plat.decks) if (withSteps || !d.id.includes("step")) reg.add(d);
      const S = 0.2;
      const x0 = 18;
      const z0 = 98;
      const nx = Math.ceil((44 - x0) / S);
      const nz = Math.ceil((116 - z0) / S);
      const seen = new Uint8Array(nx * nz);
      const hAt = new Float32Array(nx * nz);
      const start = [Math.round((41 - x0) / S), Math.round((103.4 - z0) / S)] as const;
      const k0 = start[0] + start[1] * nx;
      expect(L.walkable(x0 + start[0] * S, z0 + start[1] * S)).toBe(true);
      seen[k0] = 1;
      hAt[k0] = L.groundAt(x0 + start[0] * S, z0 + start[1] * S);
      const q: number[] = [k0];
      while (q.length) {
        const k = q.pop()!;
        const i = k % nx;
        const j = (k - i) / nx;
        const h = hAt[k]!;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const a = i + di;
          const b = j + dj;
          if (a < 0 || b < 0 || a >= nx || b >= nz || seen[a + b * nx]) continue;
          const x = x0 + a * S;
          const z = z0 + b * S;
          if (solids.some((c) => hits(c, x, z))) continue;
          const d = reg.heightAt(x, z, h + MAX_STEP);
          const base = L.groundAt(x, z);
          const g = d !== null && d > base ? d : base;
          if (!(d !== null || L.walkable(x, z)) || g - h >= MAX_STEP) continue;
          seen[a + b * nx] = 1;
          hAt[a + b * nx] = g;
          q.push(a + b * nx);
        }
      }
      return ROOMS.filter((room) => {
        const p = toWorld(room.spot.x, room.spot.z);
        for (let j = 0; j < nz; j++)
          for (let i = 0; i < nx; i++)
            if (
              seen[i + j * nx] &&
              Math.hypot(x0 + i * S - p.x, z0 + j * S - p.z) < room.r &&
              Math.abs(hAt[i + j * nx]! - plat.floor) < 1e-6
            )
              return true;
        return false;
      }).map((r) => r.id);
    };

    test(`every room is reachable from the trail up the steps and through the door (${cells} cells)`, () => {
      expect(reachRooms(true).sort()).toEqual(ROOMS.map((r) => r.id).sort());
    });

    test(`without the steps the plinth cannot be climbed (${cells} cells)`, () => {
      expect(reachRooms(false)).toEqual([]);
    });

    test(`the platform is level above the terrain with comfortable steps (${cells} cells)`, () => {
      expect(plat.steps).toHaveLength(STEPS);
      expect(STEPS).toBeGreaterThanOrEqual(2);
      expect(STEPS).toBeLessThanOrEqual(3);
      expect(plat.rise).toBeGreaterThan(0.1);
      expect(plat.rise).toBeLessThanOrEqual(MAX_RISE);
      // Every tread is one riser below the previous surface; the walk is one riser below the last tread.
      let prev = plat.floor;
      for (const st of plat.steps) {
        expect(prev - st.y).toBeCloseTo(plat.rise, 9);
        prev = st.y;
      }
      expect(prev - plat.foot).toBeCloseTo(plat.rise, 9);
      // The floor clears the terrain everywhere under the rooms and the terrace.
      for (let x = PLINTH.x0; x <= PLINTH.x1; x += 0.25)
        for (let z = PLINTH.z0; z <= PLINTH.z1; z += 0.25) {
          const p = toWorld(x, z);
          expect(plat.floor).toBeGreaterThan(L.heightAt(p.x, p.z) + 0.05);
        }
      expect(onPlinth(0, 0)).toBe(true);
      expect(onPlinth(0, HD + 0.5)).toBe(true);
      expect(onPlinth(0, PLINTH.z1 + 0.1)).toBe(false);
    });

    test(`walls are only crossed at the door (${cells} cells)`, () => {
      // Just outside every wall (except the porch in front of the door) is grass: not walkable.
      for (let s = -HW + 0.3; s <= HW - 0.3; s += 0.25) {
        for (const [lx, lz] of [
          [s, -HD - 0.5],
          [-HW - 0.5, (s * HD) / HW],
          [HW + 0.5, (s * HD) / HW],
          ...(Math.abs(s) > 1.8 ? [[s, HD + 0.5]] : []),
        ] as Array<[number, number]>) {
          const w = toWorld(lx, lz);
          if (Math.hypot(w.x - WALK[0]![0], w.z - WALK[0]![1]) < 2) continue;
          expect(L.walkable(w.x, w.z)).toBe(false);
        }
        // And the wall line itself is solid away from the door.
        for (const [lx, lz] of [
          [s, -HD + 0.17],
          [-HW + 0.17, (s * HD) / HW],
          [HW - 0.17, (s * HD) / HW],
          ...(Math.abs(s - DOOR.x) > DOOR.w / 2 + 0.05 ? [[s, HD - 0.17]] : []),
        ] as Array<[number, number]>) {
          const w = toWorld(lx, lz);
          expect(solids.some((c) => hits(c, w.x, w.z, 0))).toBe(true);
        }
      }
    });

    test(`the walk joins the paved trail (${cells} cells)`, () => {
      const [ex, ez] = WALK[WALK.length - 1]!;
      expect(L.trailQuery(ex, ez).d).toBeLessThan(L.trail.halfWidth);
    });

    test(`the llama and the gate arch keep their ground (${cells} cells)`, () => {
      const h = llamaHome({
        ...L,
        extra: { trailDistance: (x, z) => ({ d: L.trailQuery(x, z).d, t: L.trailQuery(x, z).t }) },
      });
      expect(Math.hypot(h.x - WASI.x, h.z - WASI.z)).toBeGreaterThan(KEEP_OUT_R + 2);
      for (const c of solids) expect(hits(c, h.x, h.z, 0.6)).toBe(false);
      // Gate arch posts stand across the trail at the gate's t.
      const gate = STATIONS.find((s) => s.id === "gate")!;
      const p = L.trail.pointAt(gate.t);
      for (const c of [...solids, ...walkables()]) expect(hits(c, p.x - (L.trail.halfWidth + 1.1), p.z, 0)).toBe(false);
    });
  }
});

describe("furniture", () => {
  test("every piece stands inside the rooms and clear of the door", () => {
    for (const f of FURNITURE) {
      expect(f.box.x0).toBeGreaterThanOrEqual(INNER.x0 - 1e-6);
      expect(f.box.x1).toBeLessThanOrEqual(INNER.x1 + 1e-6);
      expect(f.box.z0).toBeGreaterThanOrEqual(INNER.z0 - 1e-6);
      expect(f.box.z1).toBeLessThanOrEqual(INNER.z1 + 1e-6);
      const doorway =
        f.box.x1 > DOOR.x - DOOR.w / 2 - 0.5 && f.box.x0 < DOOR.x + DOOR.w / 2 + 0.5 && f.box.z1 > HD - 1.5;
      expect(doorway).toBe(false);
    }
  });
});

describe("seats", () => {
  const BODY_R = 0.42;
  const clear = (x: number, z: number) =>
    colliders().every((c) =>
      c.kind === "circle"
        ? Math.hypot(x - c.x, z - c.z) >= c.r + BODY_R
        : x <= c.x0 - BODY_R || x >= c.x1 + BODY_R || z <= c.z0 - BODY_R || z >= c.z1 + BODY_R,
    );
  test("stand-up points are inside the house, outside every collider", () => {
    for (const s of SEATS) {
      expect(isInsideLocal(s.stand.x, s.stand.z)).toBe(true);
      const w = toWorld(s.stand.x, s.stand.z);
      expect(clear(w.x, w.z)).toBe(true);
    }
  });
  test("each seat sits on its furniture and in its room", () => {
    const on = (id: string, x: number, z: number) => {
      const b = FURNITURE.find((f) => f.id === id)!.box;
      return x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
    };
    const sala = SEATS.find((s) => s.room === "sala")!;
    const desk = SEATS.find((s) => s.room === "estudio")!;
    expect(on("banca", sala.x, sala.z)).toBe(true);
    expect(on("desk", desk.x, desk.z)).toBe(true);
    for (const s of SEATS) {
      const a = ROOMS.find((r) => r.id === s.room)!.area;
      expect(s.x > a.x0 && s.x < a.x1 && s.z > a.z0 && s.z < a.z1).toBe(true);
    }
  });
  test("the poyo seat faces the wall khipu side, the desk seat faces the laptop (back wall)", () => {
    const sala = seatWorld(SEATS.find((s) => s.room === "sala")!, 0);
    const desk = seatWorld(SEATS.find((s) => s.room === "estudio")!, 0);
    // World facing → local: the khipu hangs on the left wall (−lx) ahead of the poyo (+lz).
    const dir = (yaw: number) => {
      const w = toWorld(0, 0);
      const p = { x: w.x + Math.sin(yaw), z: w.z + Math.cos(yaw) };
      return toLocal(p.x, p.z);
    };
    const sd = dir(sala.yaw);
    expect(sd.z).toBeGreaterThan(0.7);
    expect(sd.x).toBeLessThan(-0.3);
    const dd = dir(desk.yaw);
    expect(dd.z).toBeCloseTo(-1);
    expect(sala.y).toBeCloseTo(0.59);
    expect(sala.id).toBe("wasi:sala");
  });
});
