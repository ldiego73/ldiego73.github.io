import { describe, expect, test } from "bun:test";
import { STATIONS } from "../contract";
import { buildLayout, HALF_WIDTH, type Layout, RIVER_LEVEL } from "../layout";
import {
  alisoModel,
  chusqueaModel,
  lupineModel,
  pisonayModel,
  quenuaModel,
  uncaModel,
  yellowFlowerModel,
} from "./models";
import { perchRecords } from "./perches";
import { COUNTS, type FloraPlan, planFlora, TREE_R, type TreeKind } from "./placement";

// Mirrors content.ts STATION_FOOTPRINT (as eggs/placement.test.ts), so plazas match the shipped world.
const FOOTPRINT: Record<string, number> = Object.fromEntries(
  STATIONS.map((s) => [
    s.id,
    s.kind === "arcade"
      ? 10.5
      : s.kind === "contact"
        ? 7.5
        : s.kind === "company"
          ? 6
          : s.kind === "bridge"
            ? 0
            : s.kind === "build"
              ? 5
              : 4.5,
  ]),
);
// Same grids as index.ts: high quality builds the 280-cell terrain, low the 190-cell one.
const L = buildLayout({ cells: 280, footprint: FOOTPRINT });
const Llow: Layout = buildLayout({ cells: 190, footprint: FOOTPRINT });
const high = planFlora(L, "high");
const low = planFlora(Llow, "low");
const TREES: TreeKind[] = ["quenua", "aliso", "unca", "pisonay", "chusquea"];
const COVER = ["ichuTall", "ichuShort", "ichuDry", "lupine", "yellow"] as const;
const all = (p: FloraPlan) => Object.values(p).flat();

describe("flora placement", () => {
  test("deterministic", () => {
    const again = planFlora(L, "high");
    expect(JSON.stringify(again)).toBe(JSON.stringify(high));
  });

  test("fills most of the budget, low has fewer than high", () => {
    for (const k of COVER) {
      expect(high[k].length).toBeGreaterThan(COUNTS.high[k] * 0.8);
      expect(low[k].length).toBeLessThan(high[k].length);
    }
    for (const k of ["quenua", "aliso", "unca", "chusquea"] as const) {
      expect(high[k].length).toBeGreaterThan(COUNTS.high[k] * 0.6);
      expect(low[k].length).toBeLessThanOrEqual(high[k].length);
    }
    expect(high.pisonay.length).toBeGreaterThanOrEqual(2);
  });

  test("nothing on the trail, the plazas, the stream or the river", () => {
    for (const [plan, lay] of [
      [high, L],
      [low, Llow],
    ] as const)
      for (const i of all(plan)) {
        expect(lay.trailQuery(i.x, i.z).d).toBeGreaterThan(HALF_WIDTH + 0.4);
        expect(lay.streamDist(i.x, i.z)).toBeGreaterThan(1.5);
        expect(lay.heightAt(i.x, i.z)).toBeGreaterThan(RIVER_LEVEL + 0.5);
        for (const p of lay.plazas) expect(Math.hypot(i.x - p.x, i.z - p.z)).toBeGreaterThan(p.r);
        expect(Number.isFinite(i.y)).toBe(true);
        expect(Math.abs(i.y - lay.heightAt(i.x, i.z))).toBeLessThan(0.3);
      }
  });

  test("trees keep their crowns off the path and away from the tambos", () => {
    for (const k of TREES)
      for (const t of high[k]) {
        expect(L.trailQuery(t.x, t.z).d).toBeGreaterThan(HALF_WIDTH + TREE_R[k].pad - 0.01);
        if (k === "pisonay") continue;
        for (const p of L.plazas) expect(Math.hypot(t.x - p.x, t.z - p.z)).toBeGreaterThan(p.r + 4);
      }
  });

  test("altitude bands: lower forest low, queñua higher, few trees near the summit", () => {
    const median = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1] as number;
    expect(median(high.quenua.map((t) => t.y))).toBeGreaterThan(median(high.aliso.map((t) => t.y)));
    expect(Math.max(...high.chusquea.map((t) => t.y))).toBeLessThan(34);
    const trees = TREES.flatMap((k) => high[k]);
    const nearSummit = trees.filter((t) => t.y > 66).length;
    expect(nearSummit).toBeLessThan(trees.length * 0.06);
  });

  test("some perches are within the birds' flush distance (4 u) of walkable ground", () => {
    const P = perchRecords(
      high,
      {
        quenua: quenuaModel(),
        aliso: alisoModel(),
        unca: uncaModel(),
        pisonay: pisonayModel(),
        chusquea: chusqueaModel(false),
      },
      lupineModel(false),
      yellowFlowerModel(false),
    );
    let reach = 0;
    for (let i = 0; i < P.trees.length; i += 5) {
      const x = P.trees[i] as number;
      const z = P.trees[i + 2] as number;
      let d = L.trailQuery(x, z).d - HALF_WIDTH;
      for (const p of L.plazas) d = Math.min(d, Math.hypot(x - p.x, z - p.z) - p.r);
      if (d < 4) reach++;
    }
    expect(reach).toBeGreaterThan(60);
    expect(P.flowers.length / 4).toBeGreaterThan(300);
  });

  test("flowers line the trail edges", () => {
    for (const k of ["lupine", "yellow"] as const) {
      const close = high[k].filter((i) => L.trailQuery(i.x, i.z).d < HALF_WIDTH + 6).length;
      expect(close).toBeGreaterThan(high[k].length * 0.6);
    }
  });
});
