import { describe, expect, test } from "bun:test";
import { foxParts, pumaParts } from "./models";

describe("night fauna models", () => {
  test("every part is painted and non-empty", () => {
    for (const parts of [pumaParts(), foxParts()]) {
      for (const g of [parts.body, parts.head, parts.upper, parts.lower, parts.tail]) {
        expect(g.attributes.position!.count).toBeGreaterThan(0);
        expect(g.attributes.color).toBeDefined();
      }
    }
  });
  test("puma: ~2 u nose to rump and ~0.75 u at the shoulder (at its 1.1 scale)", () => {
    const p = pumaParts();
    p.body.computeBoundingBox();
    p.head.computeBoundingBox();
    const S = 1.1;
    const rump = p.body.boundingBox!.min.z;
    const nose = p.rig.neck.z + p.head.boundingBox!.max.z;
    expect((nose - rump) * S).toBeGreaterThan(1.8);
    expect((nose - rump) * S).toBeLessThan(2.2);
    // Withers: highest torso point over the front legs (the neck rises in front of it).
    const pos = p.body.attributes.position!;
    let top = 0;
    for (let i = 0; i < pos.count; i++)
      if (Math.abs(pos.getZ(i) - p.rig.shoulder.z) < 0.08) top = Math.max(top, pos.getY(i));
    const shoulder = (p.rig.bodyY + top) * S;
    expect(shoulder).toBeGreaterThan(0.68);
    expect(shoulder).toBeLessThan(0.85);
  });
  test("fox: ~0.45 u at the shoulder (at its 1.05 scale)", () => {
    const f = foxParts();
    f.body.computeBoundingBox();
    const shoulder = (f.rig.bodyY + f.body.boundingBox!.max.y) * 1.05;
    expect(shoulder).toBeGreaterThan(0.4);
    expect(shoulder).toBeLessThan(0.52);
  });
});
