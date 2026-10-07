import { describe, expect, test } from "bun:test";
import { createDecks, standOn, topOf } from "./decks";

/** Station-frame conversion (ambient/fields/geo.ts wx / wz). */
const wx = (cx: number, yaw: number, lx: number, lz: number) => cx + lx * Math.cos(yaw) + lz * Math.sin(yaw);
const wz = (cz: number, yaw: number, lx: number, lz: number) => cz - lx * Math.sin(yaw) + lz * Math.cos(yaw);

describe("decks registry", () => {
  test("empty registry answers null everywhere", () => {
    const d = createDecks();
    expect(d.heightAt(0, 0)).toBeNull();
    expect(d.size).toBe(0);
    expect(standOn(d, 3, 0, 0, 3, 0.9)).toBe(3);
    expect(topOf(d, 3, 0, 0)).toBe(3);
  });

  test("circle, box and the highest deck wins", () => {
    const d = createDecks();
    d.add({ shape: { kind: "circle", x: 0, z: 0, r: 2 }, y: 1 });
    d.add({ shape: { kind: "box", x0: -1, z0: -1, x1: 1, z1: 1 }, y: 2 });
    expect(d.heightAt(0, 0)).toBe(2);
    expect(d.heightAt(1.5, 0)).toBe(1);
    expect(d.heightAt(2.1, 0)).toBeNull();
    expect(d.heightAt(1.5, 1.5)).toBeNull();
  });

  test("maxY caps the query (stacked decks, standing under a high deck)", () => {
    const d = createDecks();
    d.add({ shape: { kind: "box", x0: -2, z0: -2, x1: 2, z1: 2 }, y: 0.5 });
    d.add({ shape: { kind: "box", x0: -2, z0: -2, x1: 2, z1: 2 }, y: 3 });
    expect(d.heightAt(0, 0)).toBe(3);
    expect(d.heightAt(0, 0, 1)).toBe(0.5);
    expect(d.heightAt(0, 0, 0.4)).toBeNull();
  });

  test("functional heights are evaluated at the query point", () => {
    const d = createDecks();
    d.add({ shape: { kind: "box", x0: 0, z0: -1, x1: 4, z1: 1 }, y: (x) => x * 0.25 });
    expect(d.heightAt(2, 0)).toBeCloseTo(0.5, 9);
    expect(d.heightAt(4, 0)).toBeCloseTo(1, 9);
  });

  test("oriented boxes use the station frame convention (round trip of local corners)", () => {
    const d = createDecks();
    const cx = 10;
    const cz = -4;
    for (const yaw of [0, 0.4, Math.PI / 2, 2.3, -1.1]) {
      d.clear();
      d.add({ shape: { kind: "obox", x: cx, z: cz, yaw, halfW: 3, halfD: 1 }, y: 5 });
      for (const [lx, lz] of [
        [2.95, 0.95],
        [-2.95, 0.95],
        [2.95, -0.95],
        [-2.95, -0.95],
        [0, 0],
      ] as const)
        expect(d.heightAt(wx(cx, yaw, lx, lz), wz(cz, yaw, lx, lz))).toBe(5);
      for (const [lx, lz] of [
        [3.1, 0],
        [0, 1.1],
        [-3.1, 0.5],
        [1, -1.1],
      ] as const)
        expect(d.heightAt(wx(cx, yaw, lx, lz), wz(cz, yaw, lx, lz))).toBeNull();
    }
  });

  test("removers and clear", () => {
    const d = createDecks();
    const a = d.add({ shape: { kind: "circle", x: 0, z: 0, r: 1 }, y: 1, id: "a" });
    d.add({ shape: { kind: "circle", x: 0, z: 0, r: 1 }, y: 0.5, id: "b" });
    expect(d.heightAt(0, 0)).toBe(1);
    a();
    a();
    expect(d.heightAt(0, 0)).toBe(0.5);
    expect(d.size).toBe(1);
    d.clear();
    expect(d.heightAt(0, 0)).toBeNull();
  });

  test("standOn: step up within reach, stay under a high deck, never sink below the base", () => {
    const d = createDecks();
    d.add({ shape: { kind: "box", x0: 0, z0: 0, x1: 2, z1: 2 }, y: 1.3 });
    d.add({ shape: { kind: "box", x0: 4, z0: 0, x1: 6, z1: 2 }, y: 3 });
    d.add({ shape: { kind: "box", x0: 8, z0: 0, x1: 10, z1: 2 }, y: 0.2 });
    // Grounded at y = 0.5: the 1.3 deck is a 0.8 step up (reachable); the 3 deck is overhead.
    expect(standOn(d, 0.5, 1, 1, 0.5, 0.9)).toBe(1.3);
    expect(standOn(d, 0.5, 5, 1, 0.5, 0.9)).toBe(0.5);
    // Already on the high deck: it holds.
    expect(standOn(d, 0.5, 5, 1, 3, 0.9)).toBe(3);
    // Airborne (reach 0) under the 1.3 deck: no snapping up through it.
    expect(standOn(d, 0.5, 1, 1, 1.0, 0)).toBe(0.5);
    // A deck below the terrain is ignored.
    expect(standOn(d, 0.5, 9, 1, 0.5, 0.9)).toBe(0.5);
    expect(topOf(d, 0.5, 5, 1)).toBe(3);
    expect(topOf(d, 0.5, 9, 1)).toBe(0.5);
  });
});
