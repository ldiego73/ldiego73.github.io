import { describe, expect, test } from "bun:test";
import { CATALOG, emptyPassport, passportComplete, requiredStamps, WORLD_PAGES } from "../../../../lib/passport";
import type { WorldId } from "../../../events";
import { GATES } from "../../plan";
import {
  allComplete,
  CONFETTI,
  finaleTiles,
  finaleTitle,
  KNOT_LAYOUT,
  knotOffsets,
  type PassportView,
  pageProgress,
  parseFinale,
  prng,
  roadProgress,
  shouldCelebrate,
  spawnConfetti,
  stepBit,
} from "./logic";

const viewOf = (stamps: Record<string, number>): PassportView => ({
  required: (w: WorldId) => requiredStamps(w).map((s) => s.id),
  has: (id) => Number.isFinite(stamps[id]),
});
const pages = WORLD_PAGES.map((p) => p.id);

describe("khipu of the suyus", () => {
  test("knots spell the number: tens high, units low", () => {
    expect(knotOffsets(0)).toEqual([]);
    expect(knotOffsets(3)).toEqual([
      KNOT_LAYOUT.units,
      KNOT_LAYOUT.units + KNOT_LAYOUT.gap,
      KNOT_LAYOUT.units + 2 * KNOT_LAYOUT.gap,
    ]);
    const k23 = knotOffsets(23);
    expect(k23.filter((o) => o < KNOT_LAYOUT.units)).toHaveLength(2);
    expect(k23.filter((o) => o >= KNOT_LAYOUT.units)).toHaveLength(3);
    // Groups never overlap: nine tens end above the first unit.
    expect(KNOT_LAYOUT.tens + 8 * KNOT_LAYOUT.gap).toBeLessThan(KNOT_LAYOUT.units);
    expect(knotOffsets(250)).toHaveLength(18);
  });

  test("progress per page and per road matches the passport's own completion", () => {
    const stamps: Record<string, number> = {};
    for (const s of requiredStamps("selva")) stamps[s.id] = 1;
    const view = viewOf(stamps);
    const antisuyu = GATES.find((g) => g.id === "antisuyu")!;
    const r = roadProgress(view, antisuyu);
    expect(r.done).toBe(true);
    expect(r.knots).toBe(requiredStamps("selva").length);
    const closed = roadProgress(view, GATES.find((g) => g.id === "collasuyu")!);
    expect(closed).toMatchObject({ knots: 0, done: false, pages: [] });
    const mountain = roadProgress(view, GATES.find((g) => g.id === "qhapaq")!);
    expect(mountain.pages.map((p) => p.world)).toEqual(["qhapaq", "wasi"]);
    expect(mountain.done).toBe(false);
    expect(pageProgress(view, "selva")).toEqual({ world: "selva", got: r.knots, total: r.knots, done: true });
  });

  test("the finale needs every page that exists, like passportComplete", () => {
    const state = emptyPassport();
    expect(allComplete(viewOf(state.stamps), pages)).toBe(false);
    for (const s of CATALOG) if (requiredStamps().includes(s)) state.stamps[s.id] = 1;
    expect(passportComplete(state)).toBe(true);
    expect(allComplete(viewOf(state.stamps), pages)).toBe(true);
    delete state.stamps["cusco:station:qorikancha"];
    expect(allComplete(viewOf(state.stamps), pages)).toBe(passportComplete(state));
  });

  test("celebrates once, on arrival, only when complete", () => {
    expect(shouldCelebrate({ complete: true, celebratedAt: null, nearUsnu: true })).toBe(true);
    expect(shouldCelebrate({ complete: true, celebratedAt: 123, nearUsnu: true })).toBe(false);
    expect(shouldCelebrate({ complete: false, celebratedAt: null, nearUsnu: true })).toBe(false);
    expect(shouldCelebrate({ complete: true, celebratedAt: null, nearUsnu: false })).toBe(false);
    expect(parseFinale("1700000000000")).toBe(1700000000000);
    for (const bad of [null, "", "abc", "-5", "1.5"]) expect(parseFinale(bad)).toBeNull();
  });

  test("finale copy: name or not, true counts", () => {
    expect(finaleTitle("es", "  Ana ")).toBe("¡Lo lograste, Ana!");
    expect(finaleTitle("en", "")).toBe("You made it!");
    const tiles = finaleTiles({ worldsDone: 4, worlds: 4, stamps: 80, stampsTotal: 120 });
    expect(tiles.map((t) => t.value)).toEqual(["4/4", "80/120"]);
  });

  test("confetti rises, falls and settles on the floor", () => {
    const bits = spawnConfetti(20, 2, prng(1));
    expect(bits).toHaveLength(20);
    for (let i = 0; i < 60 * CONFETTI.life; i++) for (const b of bits) stepBit(b, 1 / 60, () => 0);
    for (const b of bits) {
      expect(b.landed).toBe(true);
      expect(b.y).toBeCloseTo(0.02, 6);
    }
  });
});
