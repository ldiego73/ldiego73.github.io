import { describe, expect, test } from "bun:test";
import { mountHome } from "../../../ambient/mount/logic";
import { buildTiticacaLayout } from "../../layout";
import { DEFAULT_T, ROAD_HALF } from "../../plan";
import { gateFrame, PROMPT_R } from "../punku/logic";
import { LLAMA_COPY, layBy, MOUNT_RANGE } from "./logic";

const L = buildTiticacaLayout({ cells: 120 });

describe("Collasuyu llama lay-by", () => {
  const bay = layBy(L.trail);
  test("on dry land, south of the road, touching the road band", () => {
    expect(L.landField(bay.x, bay.z)).toBeGreaterThan(2);
    expect(L.isWater(bay.x, bay.z)).toBe(false);
    const d = L.trailQuery(bay.x, bay.z).d;
    expect(d).toBeGreaterThan(ROAD_HALF + 1.5);
    expect(d - bay.r).toBeLessThan(ROAD_HALF);
    expect(bay.nz).toBeGreaterThan(0.8);
  });

  test("the llama waits off the road, clear of the punku prompt and the spawn", () => {
    L.addWalkable({ kind: "circle", x: bay.x, z: bay.z, r: bay.r });
    const gate = gateFrame(L);
    const spawn = L.trail.pointAt(DEFAULT_T);
    const td = (x: number, z: number) => L.trailQuery(x, z);
    const h = mountHome({
      plaza: bay,
      station: bay,
      walkable: L.walkable,
      heightAt: L.groundAt,
      trailDistance: td,
      halfWidth: ROAD_HALF,
      avoid: [
        [gate.x, gate.z, PROMPT_R + MOUNT_RANGE + 0.5],
        [spawn.x, spawn.z, 2],
        [bay.x, bay.z, 1.4],
      ],
      roadDir: L.trail.tangentAt(bay.t),
    });
    expect(Math.hypot(h.x - bay.x, h.z - bay.z)).toBeGreaterThan(1.4);
    expect(L.walkable(h.x, h.z)).toBe(true);
    expect(td(h.x, h.z).d).toBeGreaterThanOrEqual(ROAD_HALF + 1.4);
    expect(Math.hypot(h.x - gate.x, h.z - gate.z)).toBeGreaterThan(PROMPT_R + MOUNT_RANGE);
    expect(Math.hypot(h.x - spawn.x, h.z - spawn.z)).toBeGreaterThan(MOUNT_RANGE);
  });

  test("bilingual prompt", () => {
    expect(LLAMA_COPY.mount.es).toContain("llama");
    expect(LLAMA_COPY.mount.en).toContain("llama");
  });
});
