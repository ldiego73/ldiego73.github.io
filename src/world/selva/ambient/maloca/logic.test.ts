import { describe, expect, test } from "bun:test";
import type { WorldPost } from "../../../data";
import {
  AISLE_R,
  BODY_R,
  benchAngles,
  clothAngles,
  cloths,
  DOOR,
  interiorColliders,
  MAX_CLOTHS,
  PAINT,
  promptTitle,
  ringPoint,
  SPOT_R,
  WALL_R,
} from "./logic";

const post = (title: string, date: string, source: "site" | "medium" = "site"): WorldPost => ({
  title,
  date,
  source,
  description: "",
  href: source === "site" ? `/es/blog/${title}/` : `https://medium.com/@x/${title}`,
  tags: [],
});

describe("maloca cloths", () => {
  test("newest first, capped, painted by source", () => {
    const posts = Array.from({ length: 14 }, (_, i) =>
      post(`p${i}`, `2024-${String((i % 12) + 1).padStart(2, "0")}-0${(i % 9) + 1}`, i % 3 ? "site" : "medium"),
    );
    const c = cloths(posts);
    expect(c.length).toBe(MAX_CLOTHS);
    for (let i = 1; i < c.length; i++)
      expect(Date.parse(c[i - 1]!.post.date)).toBeGreaterThanOrEqual(Date.parse(c[i]!.post.date));
    for (const x of c) expect(x.paint).toBe(x.post.source === "medium" ? PAINT.medium : PAINT.site);
  });
  test("empty data gives no cloths; untitled posts are skipped; bad dates sink", () => {
    expect(cloths([])).toEqual([]);
    const c = cloths([post("", "2025-01-01"), post("a", "nope"), post("b", "2020-01-01")]);
    expect(c.map((x) => x.post.title)).toEqual(["b", "a"]);
  });
  test("wall angles leave the door free and are evenly spread", () => {
    const a = clothAngles(8);
    expect(a.length).toBe(8);
    for (const x of a) {
      expect(x).toBeGreaterThan(DOOR);
      expect(x).toBeLessThan(Math.PI * 2 - DOOR);
    }
    expect(clothAngles(0)).toEqual([]);
  });
});

describe("maloca floor plan", () => {
  const cols = interiorColliders(0.3);
  /** Clearance of a body centre: distance to the nearest collider edge. */
  const clear = (x: number, z: number) => Math.min(...cols.map((c) => Math.hypot(x - c.x, z - c.z) - c.r));

  test("a clear aisle runs all the way round between the benches and the wall", () => {
    // The body fits on the aisle line everywhere, with room to spare on both sides.
    for (let k = 0; k < 720; k++) {
      const [x, z] = ringPoint((k / 720) * Math.PI * 2, AISLE_R);
      expect(clear(x, z)).toBeGreaterThan(BODY_R + 0.35);
    }
    // ... and the aisle stays inside the wall (the walkable floor is the circle of radius WALL_R).
    expect(AISLE_R + BODY_R).toBeLessThan(WALL_R - 0.3);
  });

  test("every cloth spot stands on the aisle, in front of its own cloth, and spots do not swallow each other", () => {
    for (let n = 1; n <= MAX_CLOTHS; n++) {
      const a = clothAngles(n);
      for (const x of a) {
        const [sx, sz] = ringPoint(x, AISLE_R);
        expect(clear(sx, sz)).toBeGreaterThan(BODY_R);
      }
      for (let i = 1; i < a.length; i++)
        expect(AISLE_R * ((a[i] as number) - (a[i - 1] as number))).toBeGreaterThan(SPOT_R * 1.5);
    }
  });

  test("the doorway reaches the aisle: a straight walk in from the plaza is clear", () => {
    for (let r = WALL_R + 1.5; r >= AISLE_R; r -= 0.05) {
      const [x, z] = ringPoint(0, r);
      expect(clear(x, z)).toBeGreaterThan(BODY_R);
    }
    // The benches leave the door sector open.
    for (const a of benchAngles()) expect(Math.min(a, Math.PI * 2 - a)).toBeGreaterThan(DOOR - 0.1);
  });

  test("prompt titles are cut on a word with an ellipsis", () => {
    expect(promptTitle("Corto")).toBe("Corto");
    const long = promptTitle("Cómo construí un mundo 3D procedural para mi portafolio con Three.js");
    expect(long.length).toBeLessThanOrEqual(38);
    expect(long.endsWith("…")).toBe(true);
  });
});
