import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as THREE from "three";
import { asCtx, FakeAudioContext } from "../../../audio/fake-audio";
import { getMusic } from "../../../audio/player";

const g = globalThis as unknown as { window?: EventTarget };
let created = false;
beforeAll(() => {
  if (!g.window) {
    g.window = new EventTarget();
    created = true;
  }
});
afterAll(() => {
  if (created) delete g.window;
});

function fakeEnv(night = false) {
  const v = new THREE.Vector3();
  return {
    lang: "es",
    reducedMotion: false,
    quality: "high",
    camera: new THREE.PerspectiveCamera(),
    trail: { pointAt: (t: number) => v.set(0, t * 40, 0).clone() },
    sky: { isNight: () => night },
    extra: {
      groundAt: () => 0,
      isGrass: () => true,
      isWater: (x: number) => x > 50,
      stream: { t: 0.5, cross: new THREE.Vector3(60, 0, 0), fallBase: new THREE.Vector3(70, 0, 0) },
    },
  };
}

describe("soundscape ambient", () => {
  test("stays silent without unlocked audio, survives events and disposes listeners", async () => {
    const { create } = await import("../soundscape");
    const a = create(fakeEnv() as never, {} as HTMLElement);
    expect(a.prompt).toBeUndefined();
    expect(a.interact).toBeUndefined();
    const p = new THREE.Vector3();
    for (let i = 0; i < 30; i++) a.update(1 / 60, p.set(i * 0.06, 0, 0), i / 60);
    const fire = (name: string, detail: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
    fire("world:stamp", { id: "egg:golden-khipu", kind: "egg", label: { es: "", en: "" } });
    fire("world:modal", { open: true });
    fire("world:weather", { kind: "garua" });
    fire("world:mount", { riding: true, speedMul: 1.6, seatHeight: 0.6 });
    fire("world:teleport", { to: "summit" });
    a.update(1 / 60, p.set(500, 0, 0), 1);
    a.dispose();
    a.dispose();
  });

  test("with live output: footsteps follow walking, none on a teleport jump, all torn down on dispose", async () => {
    const { create } = await import("../soundscape");
    const f = new FakeAudioContext();
    const bus = f.createGain() as unknown as AudioNode;
    const m = getMusic() as { output?: () => unknown };
    const prev = m.output;
    m.output = () => ({ ctx: asCtx(f), sfx: bus, ambient: bus, voices: { play: () => true } });
    try {
      const a = create(fakeEnv() as never, {} as HTMLElement);
      const p = new THREE.Vector3();
      const dt = 1 / 60;
      a.update(dt, p.set(0, 0, 0), 0);
      const loops = f.sources().length;
      expect(loops).toBeGreaterThan(0); // continuous beds built once audio is live
      // walk 2 s at 3.6 u/s -> about 4 footsteps
      let x = 0;
      for (let i = 0; i < 120; i++) {
        x += 3.6 * dt;
        f.currentTime += dt;
        a.update(dt, p.set(x, 0, 0), i * dt);
      }
      const afterWalk = f.sources().length;
      expect(afterWalk - loops).toBeGreaterThan(4);
      // teleport: one big jump then standing still makes no step burst
      a.update(dt, p.set(x + 200, 0, 30), 3);
      const atJump = f.sources().length;
      for (let i = 0; i < 30; i++) {
        f.currentTime += dt;
        a.update(dt, p, 3 + i * dt);
      }
      const shots = f.sources().slice(atJump);
      expect(shots.every((s) => s.kind === "osc")).toBe(true); // only birds may chirp, no noise steps
      a.dispose();
      expect(
        f
          .sources()
          .slice(0, loops)
          .every((s) => s.stopped !== null),
      ).toBe(true);
    } finally {
      m.output = prev;
    }
  });
});
