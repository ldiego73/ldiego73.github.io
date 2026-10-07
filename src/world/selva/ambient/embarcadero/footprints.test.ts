import { describe, expect, test } from "bun:test";
import { SELVA_STATIONS } from "../../contract";
import { buildSelvaLayout } from "../../layout";
import { inStationFootprint, stationFootprints } from "./footprints";

const L = buildSelvaLayout({ cells: 280 });
const list = stationFootprints(L);

describe("station footprints", () => {
  test("every content station has ground reserved, the gateway none", () => {
    const ids = new Set(list.map((f) => f.station));
    for (const s of SELVA_STATIONS) expect(ids.has(s.id)).toBe(s.id !== "puerto");
  });
  test("cover the maloca centre and the arcade pond but not the road far away", () => {
    const pose = (id: string) => L.stationPose(id);
    const m = pose("maloca");
    const c = Math.cos(m.yaw);
    const s = Math.sin(m.yaw);
    expect(inStationFootprint(list, m.position.x + -7.6 * s, m.position.z + -7.6 * c)).toBe(true);
    const far = L.trail.pointAt(0.5);
    expect(inStationFootprint(list, far.x, far.z)).toBe(false);
  });
});
