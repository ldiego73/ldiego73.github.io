import { describe, expect, test } from "bun:test";
import { GATES, gateArrival, gatePoint } from "../../plan";
import { DOOR, gateAction, gateInRange, gateLocal, gatePrompt, gatesToPrefetch, gateWorld, PROMPT_R } from "./logic";

const by = (id: string) => GATES.find((g) => g.id === id)!;

describe("hub punkus", () => {
  test("local frame: +z faces the plaza, and it round-trips", () => {
    for (const g of GATES) {
      const [gx, gz] = gatePoint(g);
      const toward = gateLocal(g, gx - g.dir[0] * 2, gz - g.dir[1] * 2);
      expect(toward.x).toBeCloseTo(0, 6);
      expect(toward.z).toBeCloseTo(2, 6);
      const w = gateWorld(g, 1.2, 0.7);
      const l = gateLocal(g, w.x, w.z);
      expect(l.x).toBeCloseTo(1.2, 6);
      expect(l.z).toBeCloseTo(0.7, 6);
    }
  });

  test("the prompt shows in front of a doorway only, never at the arrival spot", () => {
    for (const g of GATES) {
      const front = gateWorld(g, 0, 1.5);
      expect(gateInRange(front.x, front.z)?.id).toBe(g.id);
      const behind = gateWorld(g, 0, -2);
      expect(gateInRange(behind.x, behind.z)).toBeNull();
      const a = gateArrival(g);
      expect(gateInRange(a.x, a.z)).toBeNull();
    }
    expect(PROMPT_R).toBeLessThan(DOOR.outer);
  });

  test("open gates travel, closed gates only say coming soon", () => {
    expect(gateAction(by("antisuyu"))).toEqual({ kind: "travel", to: "selva" });
    expect(gateAction(by("qhapaq"))).toEqual({ kind: "travel", to: "qhapaq" });
    expect(gateAction(by("collasuyu"))).toEqual({ kind: "travel", to: "titicaca" });
    for (const g of GATES.filter((x) => !x.available)) expect(gateAction(g)).toEqual({ kind: "soon" });
    expect(gatePrompt(by("antisuyu"), "es")).toBe("E · Viajar al Antisuyu");
    expect(gatePrompt(by("qhapaq"), "en")).toBe("E · Back to the Qhapaq Ñan");
    expect(gatePrompt(by("collasuyu"), "es")).toBe("E · Viajar al Collasuyu");
    expect(gatePrompt(by("chinchaysuyu"), "es")).toBe("E · Viajar al Chinchaysuyu");
    expect(gatePrompt(by("kuntisuyu"), "en")).toBe("Kuntisuyu · Coming soon");
  });

  test("only open worlds are prefetched, near their gate", () => {
    const [ax, az] = gatePoint(by("antisuyu"));
    expect(gatesToPrefetch(ax - 5, az + 5).map((g) => g.id)).toEqual(["antisuyu"]);
    const [cx, cz] = gatePoint(by("kuntisuyu"));
    expect(gatesToPrefetch(cx, cz)).toEqual([]);
    expect(gatesToPrefetch(0, 0)).toEqual([]);
  });
});
