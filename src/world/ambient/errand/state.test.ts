import { describe, expect, test } from "bun:test";
import { CATALOG } from "../../../lib/passport";
import { STATIONS } from "../../contract";
import { DialogMachine, MISSION_DIALOGS, validateDialogs } from "../../npc-dialogs";
import {
  accept,
  arrive,
  drop,
  emptyErrands,
  errandRows,
  MIN_LEG,
  MISSIONS,
  nextMission,
  offerable,
  sanitizeErrands,
  targetT,
} from "./state";

describe("chasqui errands", () => {
  test("ids match the passport catalog and targets are real stations up the trail", () => {
    for (const m of MISSIONS) {
      expect(CATALOG.some((c) => c.id === m.id && c.kind === "npc")).toBe(true);
      expect(STATIONS.some((s) => s.id === m.to && s.kind !== "build")).toBe(true);
      for (const l of [m.place, m.thanks.who, m.thanks.text]) {
        expect(l.es.trim()).not.toBe("");
        expect(l.en.trim()).not.toBe("");
      }
    }
    // Each relay ends further up than the last.
    const ts = MISSIONS.map(targetT);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
  });

  test("offered in order, one at a time, only when the tambo is a good walk uphill", () => {
    let s = emptyErrands();
    expect(nextMission(s)?.id).toBe("mission:1");
    expect(offerable(s, 0.1)?.id).toBe("mission:1");
    expect(offerable(s, targetT(MISSIONS[0]!) - MIN_LEG + 0.01)).toBeNull();
    // Accepting anything but the next one is ignored.
    expect(accept(s, "mission:2")).toEqual(s);
    s = accept(s, "mission:1");
    expect(s).toEqual({ done: 0, active: "mission:1" });
    expect(nextMission(s)).toBeNull();
    expect(offerable(s, 0)).toBeNull();
  });

  test("arriving at the target completes; other plazas don't", () => {
    let s = accept(emptyErrands(), "mission:1");
    expect(arrive(s, "auna").completed).toBeNull();
    const r = arrive(s, "xepelin");
    expect(r.completed?.id).toBe("mission:1");
    s = r.state;
    expect(s).toEqual({ done: 1, active: null });
    expect(nextMission(s)?.id).toBe("mission:2");
    // Nothing carried: arriving anywhere is a no-op.
    expect(arrive(s, "arcade").completed).toBeNull();
  });

  test("dropping returns the errand to the offer pool", () => {
    const s = drop(accept(emptyErrands(), "mission:1"));
    expect(s).toEqual({ done: 0, active: null });
    expect(nextMission(s)?.id).toBe("mission:1");
  });

  test("all three, then nothing more to offer; passport rows follow the state", () => {
    let s = emptyErrands();
    for (const m of MISSIONS) {
      s = accept(s, m.id);
      expect(errandRows(s).find((r) => r.mission.id === m.id)?.status).toBe("active");
      s = arrive(s, m.to).state;
    }
    expect(s.done).toBe(3);
    expect(nextMission(s)).toBeNull();
    expect(errandRows(s).every((r) => r.status === "done")).toBe(true);
  });

  test("sanitizes stored state", () => {
    expect(sanitizeErrands(null)).toEqual(emptyErrands());
    expect(sanitizeErrands({ done: 9, active: "mission:1" })).toEqual({ done: 3, active: null });
    expect(sanitizeErrands({ done: 1, active: "mission:3" })).toEqual({ done: 1, active: null });
    expect(sanitizeErrands({ done: 1, active: "mission:2" })).toEqual({ done: 1, active: "mission:2" });
    expect(sanitizeErrands({ done: "x" })).toEqual(emptyErrands());
  });

  test("offer dialogs are valid, bilingual, and only the yes branch accepts", () => {
    const errs = validateDialogs([
      {
        id: "errands",
        name: "Chasqui",
        role: { es: "Chasqui", en: "Chasqui" },
        convos: Object.values(MISSION_DIALOGS),
      },
    ]);
    expect(errs).toEqual([]);
    for (const m of MISSIONS) {
      const convo = MISSION_DIALOGS[m.id];
      const accepts = Object.entries(convo.nodes).filter(([, n]) => n.action === "accept");
      expect(accepts.map(([id]) => id)).toEqual(["yes"]);
      // Walk it: intro → choices → "yes" lands on the accepting node.
      const d = new DialogMachine(convo, "es");
      d.revealAll();
      d.advance();
      d.revealAll();
      expect(d.choices.length).toBe(2);
      d.choose(0);
      expect(d.node?.action).toBe("accept");
    }
  });
});
