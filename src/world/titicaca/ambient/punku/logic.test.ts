import { describe, expect, test } from "bun:test";
import { buildTiticacaLayout } from "../../layout";
import { DEFAULT_T } from "../../plan";
import { gateFrame, gateLocal, inPrompt, PROMPT_R } from "./logic";

const L = buildTiticacaLayout({ cells: 80 });

describe("Collasuyu punku", () => {
  test("stands behind the road's start, facing along it; the arrival is out of its prompt", () => {
    const f = gateFrame(L);
    const p = L.trail.pointAt(0);
    expect(Math.hypot(p.x - f.x, p.z - f.z)).toBeCloseTo(1.5, 3);
    const spawn = L.trail.pointAt(DEFAULT_T);
    expect(inPrompt(f, spawn.x, spawn.z)).toBe(false);
    const front = { x: f.x + Math.sin(f.yaw) * 2, z: f.z + Math.cos(f.yaw) * 2 };
    expect(inPrompt(f, front.x, front.z)).toBe(true);
    expect(gateLocal(f, front.x, front.z).z).toBeCloseTo(2, 6);
    const behind = { x: f.x - Math.sin(f.yaw) * 2, z: f.z - Math.cos(f.yaw) * 2 };
    expect(inPrompt(f, behind.x, behind.z)).toBe(false);
    expect(PROMPT_R).toBeGreaterThan(2);
  });
});
