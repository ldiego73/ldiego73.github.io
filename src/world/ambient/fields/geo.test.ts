import { expect, test } from "bun:test";
import { lxOf, lzOf, sectorGeometry, wx, wz } from "./geo";

test("terrace sector sits behind the plaza (angle π = local -Z) between y0 and y1", () => {
  const g = sectorGeometry(2.6, 4.55, Math.PI - 0.3, Math.PI + 0.3, -0.35, 1.2);
  g.computeBoundingBox();
  const b = g.boundingBox!;
  expect(b.max.z).toBeLessThan(-2.4);
  expect(b.min.z).toBeGreaterThan(-4.6);
  expect(b.min.y).toBeCloseTo(-0.35);
  expect(b.max.y).toBeCloseTo(1.2);
  g.dispose();
});

test("frame local ↔ world round trip", () => {
  const yaw = 0.8;
  const f = { x: 10, z: -4, y: 0, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw) };
  const x = wx(f, 1.5, -2);
  const z = wz(f, 1.5, -2);
  expect(lxOf(f, x, z)).toBeCloseTo(1.5);
  expect(lzOf(f, x, z)).toBeCloseTo(-2);
});
