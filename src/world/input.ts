/** Keyboard, mouse-drag orbit, wheel zoom and a virtual joystick, merged into one polled state. */
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

export function createInput(surface: HTMLElement): Input {
  const down = new Set<string>();
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
      let x = joy.x;
      let y = joy.y;
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
    running: () => runHold || down.has("ShiftLeft") || down.has("ShiftRight"),
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
