import { describe, expect, test } from "bun:test";
import { UI } from "../i18n/ui";
import { type Convo, DialogMachine, lineCount, NPC_DIALOGS, validateDialogs } from "./npc-dialogs";

const convo: Convo = {
  id: "t",
  start: "a",
  nodes: {
    a: { text: { es: "Hola", en: "Hello" }, next: "b" },
    b: {
      text: { es: "¿Y?", en: "So?" },
      choices: [
        { label: { es: "Uno", en: "One" }, next: "c" },
        { label: { es: "Dos", en: "Two" }, next: "d" },
      ],
    },
    c: { text: { es: "Fin uno", en: "End one" } },
    d: { text: { es: "Fin dos", en: "End two" }, next: "e" },
    e: { text: { es: "Adiós", en: "Bye" } },
  },
};

describe("dialog machine", () => {
  test("typewriter: advance first reveals the whole line, then moves on", () => {
    const m = new DialogMachine(convo, "en");
    expect(m.open).toBe(true);
    expect(m.visibleText()).toBe("");
    expect(m.typing).toBe(true);
    m.tick(0.05, 40); // 2 chars
    expect(m.visibleText()).toBe("He");
    expect(m.advance()).toBe("reveal");
    expect(m.visibleText()).toBe("Hello");
    expect(m.advance()).toBe("choose");
    expect(m.nodeId).toBe("b");
  });

  test("tick never overshoots and reports changes", () => {
    const m = new DialogMachine(convo, "es");
    expect(m.tick(10, 50)).toBe(true);
    expect(m.visibleText()).toBe("Hola");
    expect(m.tick(1)).toBe(false);
  });

  test("choices only appear once the line is revealed, and branch", () => {
    const m = new DialogMachine(convo, "es");
    m.revealAll();
    m.advance();
    expect(m.choices).toHaveLength(0); // still typing "¿Y?"
    expect(m.choose(1)).toBe("choose"); // ignored while typing
    expect(m.nodeId).toBe("b");
    m.revealAll();
    expect(m.choices.map((c) => c.label.es)).toEqual(["Uno", "Dos"]);
    expect(m.choose(1)).toBe("next");
    expect(m.nodeId).toBe("d");
    m.revealAll();
    m.advance();
    expect(m.nodeId).toBe("e");
    m.revealAll();
    expect(m.advance()).toBe("end");
    expect(m.open).toBe(false);
  });

  test("advance on a choice node picks the highlighted choice; selection wraps", () => {
    const m = new DialogMachine(convo, "en");
    m.revealAll();
    m.advance();
    m.revealAll();
    m.moveSel(-1);
    expect(m.sel).toBe(1);
    m.moveSel(1);
    expect(m.sel).toBe(0);
    expect(m.advance()).toBe("next");
    expect(m.nodeId).toBe("c");
    m.revealAll();
    expect(m.advance()).toBe("end");
  });

  test("out-of-range choice is ignored; close ends everything", () => {
    const m = new DialogMachine(convo, "en");
    m.revealAll();
    m.advance();
    m.revealAll();
    expect(m.choose(5)).toBe("choose");
    expect(m.nodeId).toBe("b");
    m.close();
    expect(m.open).toBe(false);
    expect(m.advance()).toBe("end");
    expect(m.text).toBe("");
  });

  test("a missing start node yields a closed machine", () => {
    const m = new DialogMachine({ ...convo, start: "nope" }, "en");
    expect(m.open).toBe(false);
  });
});

describe("NPC dialog data", () => {
  test("graph integrity and es/en completeness", () => {
    expect(validateDialogs()).toEqual([]);
  });

  test("validator catches broken data", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        role: { es: "", en: "Role" },
        convos: [
          {
            id: "c",
            start: "a",
            nodes: {
              a: { text: { es: "a", en: "" }, next: "zz" },
              b: { text: { es: "b", en: "b" }, choices: [{ label: { es: "s", en: "s" }, next: "a" }] },
            },
          },
        ],
      },
    ];
    const errs = validateDialogs(bad);
    expect(errs.some((e) => e.includes("role: missing es"))).toBe(true);
    expect(errs.some((e) => e.includes("missing en"))).toBe(true);
    expect(errs.some((e) => e.includes('next "zz" missing'))).toBe(true);
    expect(errs.some((e) => e.includes("1 choices"))).toBe(true);
  });

  test("6–8 NPCs, unique ids, 1–2 conversations each, ~40 lines, some branching", () => {
    expect(NPC_DIALOGS.length).toBeGreaterThanOrEqual(6);
    expect(NPC_DIALOGS.length).toBeLessThanOrEqual(8);
    expect(new Set(NPC_DIALOGS.map((n) => n.id)).size).toBe(NPC_DIALOGS.length);
    for (const n of NPC_DIALOGS) {
      expect(n.convos.length).toBeGreaterThanOrEqual(1);
      expect(n.convos.length).toBeLessThanOrEqual(2);
    }
    expect(lineCount()).toBeGreaterThanOrEqual(38);
    const branching = NPC_DIALOGS.flatMap((n) => n.convos).filter((c) =>
      Object.values(c.nodes).some((x) => x.choices?.length),
    );
    expect(branching.length).toBeGreaterThanOrEqual(5);
  });

  test("every path of every conversation terminates in both languages", () => {
    for (const lang of ["es", "en"] as const)
      for (const n of NPC_DIALOGS)
        for (const c of n.convos) {
          const walk = (choicePath: number[]) => {
            const m = new DialogMachine(c, lang);
            let guard = 0;
            let pi = 0;
            while (m.open && guard++ < 50) {
              m.revealAll();
              expect(m.text.length).toBeGreaterThan(0);
              if (m.choices.length) m.choose(choicePath[pi++] ?? 0);
              else m.advance();
            }
            expect(m.open).toBe(false);
          };
          for (let i = 0; i < 3; i++) walk([i, i, i]);
        }
  });

  test("lines stay short enough for a speech card", () => {
    for (const n of NPC_DIALOGS)
      for (const c of n.convos)
        for (const x of Object.values(c.nodes)) {
          expect(x.text.es.length).toBeLessThanOrEqual(200);
          expect(x.text.en.length).toBeLessThanOrEqual(200);
        }
  });

  test("NPC UI strings exist in es and en", () => {
    const keys = Object.keys(UI.es).filter((k) => k.startsWith("qn.npc."));
    expect(keys.length).toBeGreaterThanOrEqual(6);
    for (const k of keys) {
      expect((UI.en as Record<string, string>)[k]?.length ?? 0).toBeGreaterThan(0);
      expect((UI.es as Record<string, string>)[k]?.length ?? 0).toBeGreaterThan(0);
    }
    expect(
      Object.keys(UI.en)
        .filter((k) => k.startsWith("qn.npc."))
        .sort(),
    ).toEqual(keys.sort());
  });
});
