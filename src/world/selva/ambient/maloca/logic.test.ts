import { describe, expect, test } from "bun:test";
import type { WorldPost } from "../../../data";
import { clothAngles, cloths, DOOR, MAX_CLOTHS, PAINT } from "./logic";

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
