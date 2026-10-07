import { describe, expect, test } from "bun:test";
import { SKILLS } from "../../../../data/career";
import { AI_TOOLS, AIDLC, DAILY, SITE_STACK } from "../../../../data/uses";
import { crateCount, runs, stalls } from "./logic";

describe("regatón stalls", () => {
  const s = stalls();
  test("follow the /uses page order and carry every item exactly once", () => {
    expect(s.map((x) => x.id)).toEqual(["aidlc", "ai", "site", "daily", "pro"]);
    const agents = AIDLC.phases.reduce((n, p) => n + p.agents.length, 0);
    expect(s[0]!.wares.length).toBe(1 + agents);
    expect(s[0]!.wares[0]!.name).toBe(AIDLC.orchestrator.name);
    expect(s[1]!.wares.map((w) => w.name)).toEqual(AI_TOOLS.items.map((i) => i.name));
    expect(s[2]!.wares.map((w) => w.name)).toEqual(SITE_STACK.items.map((i) => i.name));
    expect(s[3]!.wares.map((w) => w.name)).toEqual(DAILY.items.map((i) => i.name));
    expect(s[4]!.wares.length).toBe(SKILLS.reduce((n, g) => n + g.items.length, 0));
  });
  test("links come only from the data", () => {
    for (const st of s)
      for (const w of st.wares) {
        if (!w.url) continue;
        const src = [...AI_TOOLS.items, ...SITE_STACK.items, ...DAILY.items].find((i) => i.name === w.name);
        expect(src?.url).toBe(w.url);
      }
  });
  test("every stall is bilingual", () => {
    for (const st of s) {
      expect(st.title.es && st.title.en).toBeTruthy();
      expect(st.tab.es && st.tab.en).toBeTruthy();
    }
  });
  test("AIDLC runs group the agents by phase, in order", () => {
    const r = runs(s[0]!.wares);
    expect(r.length).toBe(1 + AIDLC.phases.length);
    expect(r.slice(1).map((x) => x.group?.en)).toEqual(AIDLC.phases.map((p) => p.phase.en));
  });
  test("crate count is capped", () => {
    expect(crateCount(s[4]!, 10)).toBe(10);
    expect(crateCount(s[3]!)).toBe(DAILY.items.length);
  });
});
