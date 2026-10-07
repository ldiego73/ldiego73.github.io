/** Pure layout acceptance tests: navigation surfaces, river landings and baked terrain agree in XZ. */
import { describe, expect, test } from "bun:test";
import { Vector3 } from "three";
import { CANOPY_T, SELVA_STATIONS } from "./contract";
import { buildSelvaLayout } from "./layout";

const layout = buildSelvaLayout({ cells: 280 });

describe("Antisuyu layout", () => {
  test("a lowland road advances west to east without doubling back", () => {
    expect(layout.trail.length).toBeGreaterThanOrEqual(750);
    expect(layout.trail.length).toBeLessThanOrEqual(900);
    expect(layout.trail.pointAt(1).x - layout.trail.pointAt(0).x).toBeGreaterThan(500);
    let lastX = -Infinity;
    for (let i = 0; i <= 1000; i++) {
      const p = layout.trail.pointAt(i / 1000);
      expect(p.x).toBeGreaterThan(lastX);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(10);
      expect(layout.walkable(p.x, p.z)).toBe(true);
      expect(layout.isWater(p.x, p.z)).toBe(false);
      expect(layout.isGround(p.x, p.z)).toBe(false);
      expect(layout.trail.nearestT(p.x, p.z)).toBeCloseTo(i / 1000, 4);
      expect(layout.trailQuery(p.x, p.z).y).toBeCloseTo(p.y, 4);
      lastX = p.x;
    }
    const out = new Vector3();
    expect(layout.trail.pointAt(0.3, out)).toBe(out);
    expect(layout.trail.tangentAt(0.3, out)).toBe(out);
    expect(out.length()).toBeCloseTo(1, 8);
    expect(layout.trail.pointAt(-1)).toEqual(layout.trail.pointAt(0));
    expect(layout.trail.pointAt(2)).toEqual(layout.trail.pointAt(1));
  });

  test("ordered station poses honor offsets and stand on flat walkable plazas", () => {
    expect(layout.plazas.map((p) => p.id)).toEqual(SELVA_STATIONS.map((s) => s.id));
    for (const [i, s] of SELVA_STATIONS.entries()) {
      if (i > 0) expect(s.t).toBeGreaterThan((SELVA_STATIONS[i - 1] as typeof s).t);
      const pl = layout.plazas[i] as (typeof layout.plazas)[number];
      const pose = layout.stationPose(s.id);
      const road = layout.trail.pointAt(s.t);
      expect(Math.hypot(pose.position.x - road.x, pose.position.z - road.z)).toBeCloseTo(s.offset, 8);
      expect(layout.walkable(pose.position.x, pose.position.z)).toBe(true);
      expect(pose.position.y).toBeCloseTo(pl.y, 4);
      expect(layout.isGround(pl.x, pl.z)).toBe(false);
      for (let k = 0; k < 24; k++) {
        const a = (k * Math.PI) / 12;
        const x = pl.x + Math.cos(a) * pl.r;
        const z = pl.z + Math.sin(a) * pl.r;
        expect(layout.heightAt(x, z)).toBeCloseTo(pl.y, 4);
        expect(layout.walkable(x, z)).toBe(true);
        expect(layout.isGround(x, z)).toBe(false);
      }
      // The connector strip is navigable all the way from road to plaza.
      for (let j = 0; j <= 20; j++) {
        expect(layout.walkable(road.x + ((pl.x - road.x) * j) / 20, road.z + ((pl.z - road.z) * j) / 20)).toBe(true);
      }
    }
    const p = layout.stationPose("puerto");
    p.position.set(999, 999, 999);
    expect(layout.stationPose("puerto").position.x).not.toBe(999);
    expect(() => layout.stationPose("missing")).toThrow("unknown station");
  });

  test("river banks approach all three landings and canoe segments stay on water", () => {
    for (const id of ["embarcadero", "palafitos", "regaton"]) {
      const p = layout.stationPose(id).position;
      expect(layout.riverDist(p.x, p.z)).toBeGreaterThan(6);
      expect(layout.riverDist(p.x, p.z)).toBeLessThanOrEqual(12);
      expect(layout.isWater(p.x, p.z)).toBe(false);
    }
    expect(layout.river.pts.length).toBe(layout.river.halfWidth.length);
    for (const [i, [x, z]] of layout.river.pts.entries()) {
      expect(layout.river.halfWidth[i] as number).toBeGreaterThanOrEqual(7);
      expect(layout.river.halfWidth[i] as number).toBeLessThanOrEqual(14);
      expect(layout.heightAt(x, z)).toBeLessThan(layout.river.level);
      expect(layout.isWater(x, z)).toBe(true);
      expect(layout.isGround(x, z)).toBe(false);
      expect(layout.walkable(x, z)).toBe(false);
    }
    for (let i = 1; i < layout.canoe.path.length; i++) {
      const [ax, az] = layout.canoe.path[i - 1] as [number, number];
      const [bx, bz] = layout.canoe.path[i] as [number, number];
      for (let j = 0; j <= 10; j++) {
        const x = ax + ((bx - ax) * j) / 10;
        const z = az + ((bz - az) * j) / 10;
        expect(layout.isWater(x, z)).toBe(true);
        expect(layout.riverDist(x, z)).toBeLessThan(0);
      }
    }
    for (const [end, id] of [
      [layout.canoe.from, "embarcadero"],
      [layout.canoe.to, "palafitos"],
    ] as const) {
      expect(end.y).toBe(layout.river.level);
      const p = layout.stationPose(id).position;
      expect(Math.hypot(end.x - p.x, end.z - p.z)).toBeLessThan(17);
    }
    expect(layout.canoe.path[0]).toEqual([layout.canoe.from.x, layout.canoe.from.z]);
    expect(layout.canoe.path.at(-1)).toEqual([layout.canoe.to.x, layout.canoe.to.z]);
  });

  test("canopy ramps join ground continuously and rise above the hollow", () => {
    expect(layout.canopyDeckAt(CANOPY_T[0] - 0.001)).toBeNull();
    expect(layout.canopyDeckAt(CANOPY_T[1] + 0.001)).toBeNull();
    let last = 0;
    let peak = 0;
    for (let i = 0; i <= 35; i++) {
      const t = CANOPY_T[0] + i * 0.002;
      const p = layout.trail.pointAt(t);
      const deck = layout.canopyDeckAt(t) as number;
      const ground = layout.heightAt(p.x, p.z);
      expect(Number.isFinite(deck)).toBe(true);
      if (i > 0) expect(Math.abs(deck - last)).toBeLessThanOrEqual(0.9);
      expect(layout.groundAt(p.x, p.z)).toBeCloseTo(deck, 3);
      expect(layout.isGround(p.x, p.z)).toBe(false);
      peak = Math.max(peak, deck - ground);
      last = deck;
    }
    expect(peak).toBeGreaterThanOrEqual(8);
    for (const t of CANOPY_T) {
      const p = layout.trail.pointAt(t);
      expect(layout.canopyDeckAt(t)).toBeCloseTo(layout.heightAt(p.x, p.z), 8);
    }
    const p = layout.trail.pointAt(0.86);
    const tg = layout.trail.tangentAt(0.86);
    const x = p.x - tg.z * 20;
    const z = p.z + tg.x * 20;
    expect(layout.groundAt(x, z)).toBe(layout.heightAt(x, z));
  });

  test("registered areas override water and colliders retain their geometry", () => {
    const other = buildSelvaLayout({ cells: 40 });
    const [x, z] = other.river.pts[80] as [number, number];
    expect(other.walkable(x, z)).toBe(false);
    other.addWalkable({ kind: "circle", x, z, r: 2 });
    expect(other.walkable(x, z)).toBe(true);
    other.addWalkable({ kind: "box", x0: 490, x1: 500, z0: 490, z1: 500 });
    expect(other.walkable(495, 495)).toBe(true);
    expect(other.walkable(501, 495)).toBe(false);
    const collider = { kind: "circle", x: 10, z: 20, r: 3 } as const;
    other.addCollider(collider);
    expect(other.colliders).toEqual([collider]);
    expect(other.isGround(450, 200)).toBe(true);
    expect(other.isGround(600, 200)).toBe(false);
  });

  test("finite terrain agrees with grid triangles and covers the world", () => {
    const { n, size, h } = layout.grid;
    expect(size).toBeGreaterThanOrEqual(1000);
    expect(size).toBeLessThanOrEqual(1100);
    expect(h.length).toBe((n + 1) ** 2);
    for (const y of h) expect(Number.isFinite(y)).toBe(true);
    for (const [x, z] of [...layout.river.pts, ...layout.plazas.map((p) => [p.x, p.z] as [number, number])]) {
      expect(x).toBeGreaterThan(layout.bounds.x0);
      expect(x).toBeLessThan(layout.bounds.x1);
      expect(z).toBeGreaterThan(layout.bounds.z0);
      expect(z).toBeLessThan(layout.bounds.z1);
    }
    const i = 100;
    const j = 120;
    const a = h[j * (n + 1) + i] as number;
    const b = h[(j + 1) * (n + 1) + i] as number;
    const c = h[(j + 1) * (n + 1) + i + 1] as number;
    const d = h[j * (n + 1) + i + 1] as number;
    for (const [u, v] of [
      [0.2, 0.3],
      [0.8, 0.7],
    ] as const) {
      const y = u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
      expect(
        layout.heightAt(layout.bounds.x0 + ((i + u) * size) / n, layout.bounds.z0 + ((j + v) * size) / n),
      ).toBeCloseTo(y, 8);
    }
  });

  test("deterministic rebuild stays within the 280-cell timing budget", () => {
    const start = performance.now();
    const again = buildSelvaLayout({ cells: 280 });
    const elapsed = performance.now() - start;
    // ~120 ms on a laptop; shared CI runners are several times slower, so only catch real regressions there.
    expect(elapsed).toBeLessThan(process.env.CI ? 2500 : 400);
    expect(again.grid.h).toEqual(layout.grid.h);
    expect(again.river).toEqual(layout.river);
    expect(again.canoe).toEqual(layout.canoe);
    expect(again.plazas).toEqual(layout.plazas);
    expect(again.trail.length).toBe(layout.trail.length);
    expect(() => buildSelvaLayout({ cells: 0 })).toThrow(RangeError);
    expect(() => buildSelvaLayout({ cells: 2.5 })).toThrow(RangeError);
  });
});
