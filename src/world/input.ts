/** Keyboard, mouse-drag orbit, wheel zoom, a virtual joystick and gamepads, merged into one polled state. */

/** Gamepad buttons the core routes itself (they work while a modal is open, unlike movement). */
export type PadAction = "back" | "map" | "help" | "photo" | "text" | "confirm" | "nav-prev" | "nav-next";

/** Standard-mapping button indices (https://w3c.github.io/gamepad/#remapping). */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

export const PAD_DEADZONE = 0.18;

/** Radial deadzone with rescale: |out| goes 0 → 1 as |in| goes dz → 1. Writes into `out`. */
export function deadzone(x: number, y: number, dz: number, out: { x: number; y: number }) {
  const m = Math.hypot(x, y);
  if (m <= dz || !Number.isFinite(m)) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  out.x = x * k;
  out.y = y * k;
  return out;
}

type PadLike = {
  connected?: boolean;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
};

/** Pressed state of a pad button (triggers count past half travel). */
export const padDown = (gp: PadLike, i: number) => {
  const b = gp.buttons[i];
  return !!b && (b.pressed || b.value > 0.5);
};

export interface Input {
  /** Movement intent in camera space: x = right, y = forward, magnitude 0..1. */
  move(): { x: number; y: number };
  running(): boolean;
  /** Edge-triggered actions, cleared when read. */
  takeJump(): boolean;
  takeInteract(): boolean;
  takeOrbit(): { dx: number; dy: number; zoom: number };
  /** True when the player touched any movement control since the last call. */
  takeManual(): boolean;
  setJoystick(x: number, y: number): void;
  setRunHold(on: boolean): void;
  pressInteract(): void;
  pressJump(): void;
  /** Read the first connected gamepad (call once per frame). No-op when none is connected. */
  poll(dt: number): void;
  /** True while a gamepad is connected (help text, hints). */
  hasPad(): boolean;
  enabled: boolean;
  dispose(): void;
}

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const typing = (e: Event) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
};

export function createInput(surface: HTMLElement, opts: { onPad?(action: PadAction): void } = {}): Input {
  const down = new Set<string>();
  // Gamepad state (reused every frame: no allocations besides the browser's getGamepads array).
  const padPrev: boolean[] = [];
  const padMove = { x: 0, y: 0 };
  const padLook = { x: 0, y: 0 };
  let padRun = false;
  let padNav = 0;
  let padConnected = false;
  let jump = false;
  let interact = false;
  let manual = false;
  let joy = { x: 0, y: 0 };
  let runHold = false;
  let odx = 0;
  let ody = 0;
  let zoom = 0;

  const state: Input = {
    enabled: true,
    move() {
      if (!state.enabled) return { x: 0, y: 0 };
      let x = joy.x + padMove.x;
      let y = joy.y + padMove.y;
      for (const k of down) {
        const v = MOVE_KEYS[k];
        if (v) {
          x += v[0];
          y += v[1];
        }
      }
      const m = Math.hypot(x, y);
      return m > 1 ? { x: x / m, y: y / m } : { x, y };
    },
    running: () => runHold || padRun || down.has("ShiftLeft") || down.has("ShiftRight"),
    takeJump() {
      const j = jump;
      jump = false;
      return j;
    },
    takeInteract() {
      const i = interact;
      interact = false;
      return i;
    },
    takeOrbit() {
      const o = { dx: odx, dy: ody, zoom };
      odx = ody = zoom = 0;
      return o;
    },
    takeManual() {
      const m = manual;
      manual = false;
      return m;
    },
    setJoystick(x, y) {
      joy = { x, y };
      if (x || y) manual = true;
    },
    setRunHold(on) {
      runHold = on;
    },
    pressInteract() {
      interact = true;
    },
    pressJump() {
      jump = true;
      manual = true;
    },
    hasPad: () => padConnected,
    poll(dt) {
      const list = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : null;
      let gp: Gamepad | null = null;
      if (list) for (const g of list) if (g?.connected && (!gp || g.mapping === "standard")) gp = g;
      padConnected = !!gp;
      if (!gp) {
        padMove.x = padMove.y = 0;
        padRun = false;
        padPrev.length = 0;
        return;
      }
      const pad = gp;
      const edge = (i: number) => {
        const now = padDown(pad, i);
        const was = padPrev[i] ?? false;
        padPrev[i] = now;
        return now && !was;
      };
      deadzone(gp.axes[0] ?? 0, gp.axes[1] ?? 0, PAD_DEADZONE, padMove);
      padMove.y = -padMove.y;
      deadzone(gp.axes[2] ?? 0, gp.axes[3] ?? 0, PAD_DEADZONE, padLook);
      padRun = padDown(gp, PAD.RB) || padDown(gp, PAD.RT) || padDown(gp, PAD.L3);
      const a = edge(PAD.A);
      const x = edge(PAD.X);
      const up = edge(PAD.UP);
      const dn = edge(PAD.DOWN);
      // Left stick flicks also step through lists while a modal is open.
      const ly = padMove.y;
      const nav = ly > 0.6 ? 1 : ly < -0.6 ? -1 : 0;
      const flick = nav !== padNav ? nav : 0;
      padNav = nav;
      if (edge(PAD.B)) opts.onPad?.("back");
      if (edge(PAD.Y)) opts.onPad?.("map");
      if (edge(PAD.START)) opts.onPad?.("help");
      if (edge(PAD.SELECT)) opts.onPad?.("text");
      const lb = edge(PAD.LB);
      if (state.enabled) {
        if (padMove.x || padMove.y) manual = true;
        odx += padLook.x * 600 * dt;
        ody += padLook.y * 420 * dt;
        if (a) {
          jump = true;
          manual = true;
        }
        if (x) interact = true;
        if (up) zoom -= 1;
        if (dn) zoom += 1;
        if (lb) opts.onPad?.("photo");
      } else {
        padMove.x = padMove.y = 0;
        padRun = false;
        if (a || x) opts.onPad?.("confirm");
        if (up || flick > 0) opts.onPad?.("nav-prev");
        if (dn || flick < 0) opts.onPad?.("nav-next");
      }
    },
    dispose() {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      surface.removeEventListener("pointerdown", onPDown);
      window.removeEventListener("pointermove", onPMove);
      window.removeEventListener("pointerup", onPUp);
      window.removeEventListener("pointercancel", onPUp);
      surface.removeEventListener("wheel", onWheel);
    },
  };

  const onDown = (e: KeyboardEvent) => {
    if (!state.enabled || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (MOVE_KEYS[e.code]) {
      manual = true;
      e.preventDefault();
    }
    if (e.code === "Space") {
      if (!e.repeat) jump = true;
      manual = true;
      e.preventDefault();
    }
    if (e.code === "KeyE" && !e.repeat) interact = true;
    down.add(e.code);
  };
  const onUp = (e: KeyboardEvent) => down.delete(e.code);
  const onBlur = () => down.clear();

  // Drag to orbit (any pointer that starts on the 3D surface).
  let drag: { id: number; x: number; y: number } | null = null;
  const onPDown = (e: PointerEvent) => {
    if (!state.enabled || drag) return;
    surface.focus?.({ preventScroll: true });
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    odx += e.clientX - drag.x;
    ody += e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const onPUp = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) drag = null;
  };
  const onWheel = (e: WheelEvent) => {
    if (!state.enabled) return;
    e.preventDefault();
    zoom += Math.sign(e.deltaY);
  };

  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", onBlur);
  surface.addEventListener("pointerdown", onPDown);
  window.addEventListener("pointermove", onPMove);
  window.addEventListener("pointerup", onPUp);
  window.addEventListener("pointercancel", onPUp);
  surface.addEventListener("wheel", onWheel, { passive: false });
  return state;
}
