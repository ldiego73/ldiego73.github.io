import { describe, expect, test } from "bun:test";
import { rng } from "../../../ambient/people/util";
import { CUSHMAS, dressOf, heightJitter, NATURAL, SKIRTS, SPEC, STRIPES, stripeFor, type Who } from "./dress";

const ALL: Who[] = ["man", "crown", "elder", "woman", "teen", "boy", "girl", "swimmer", "youth"];

describe("Antisuyu community dress", () => {
  test("every villager is an Amazonian river-community archetype", () => {
    expect(SPEC.man.top).toBe("cushma");
    expect(SPEC.man.layers?.[0]?.kind).toBe("cushma");
    expect(SPEC.crown.hat).toBe("feather-crown");
    expect(SPEC.elder.age).toBe("elder");
    expect(SPEC.elder.hat).toBe("feather-crown");
    expect(SPEC.woman.layers?.[0]).toMatchObject({ kind: "skirt", region: "kene" });
    expect(SPEC.woman.worn).toContain("beads");
    expect(SPEC.girl.age).toBe("child");
    expect(SPEC.boy.age).toBe("child");
    expect(SPEC.swimmer.top).toBe("bare");
    expect(SPEC.youth.age ?? "adult").toBe("adult");
    for (const w of ALL) expect(SPEC[w].feet).toBe("bare");
  });

  test("cushma stripes contrast with the cloth", () => {
    expect(stripeFor(NATURAL)).toBe(STRIPES[0] as string);
    expect(stripeFor("#5d4636")).toBe(STRIPES[2] as string);
    for (const c of CUSHMAS) expect(stripeFor(c)).not.toBe(c);
  });

  test("palettes: men wear the cushma (wrap group), women and girls the kené skirt, the rest tees and shorts", () => {
    const r = rng(7);
    for (const w of ALL) {
      const d = dressOf(w, r);
      expect(d.skin).toMatch(/^#[0-9a-f]{6}$/);
      if (w === "man" || w === "crown" || w === "elder") {
        expect(d.wrap).toBeDefined();
        expect(d.wrapR).not.toBe(d.wrap);
        expect(d.feather1).toBeDefined();
      } else if (w === "woman" || w === "teen" || w === "girl") {
        expect(SKIRTS.some(([b, l]) => b === d.skirt && l === d.skirtR)).toBe(true);
        expect(d.trim).not.toBe(d.top);
        expect(d.bead1).toBeDefined();
      } else expect(d.legs).toBeDefined();
    }
    expect(dressOf("elder", r).wrap).toBe(NATURAL);
    expect(dressOf("woman", r, { skirt: ["#2b3550", "#efe3c8"], top: "#c2456b" })).toMatchObject({
      skirt: "#2b3550",
      skirtR: "#efe3c8",
      top: "#c2456b",
    });
  });

  test("height jitter stays small (the archetypes carry the proportions)", () => {
    const r = rng(3);
    for (let i = 0; i < 50; i++)
      for (const w of ALL) {
        const k = heightJitter(w, r);
        expect(k).toBeGreaterThan(0.9);
        expect(k).toBeLessThan(1.06);
      }
  });
});
