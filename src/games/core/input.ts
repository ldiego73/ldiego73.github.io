export type Dir = "up" | "down" | "left" | "right";

const KEYS: Record<string, Dir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  W: "up",
  S: "down",
  A: "left",
  D: "right",
};

/**
 * Arrow keys / WASD on the game element (which the shell focuses) plus swipe on touch.
 * Returns an unsubscribe function.
 */
export function onDirection(el: HTMLElement, cb: (dir: Dir) => void): () => void {
  const key = (e: KeyboardEvent) => {
    const d = KEYS[e.key];
    if (!d) return;
    e.preventDefault();
    cb(d);
  };
  let sx = 0;
  let sy = 0;
  let tracking = false;
  const down = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    tracking = true;
    sx = e.clientX;
    sy = e.clientY;
  };
  const move = (e: PointerEvent) => {
    if (!tracking) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    sx = e.clientX;
    sy = e.clientY;
  };
  const up = () => {
    tracking = false;
  };
  el.addEventListener("keydown", key);
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  return () => {
    el.removeEventListener("keydown", key);
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
  };
}

/** Tracks held keys (for continuous movement like paddles and ships). */
export function heldKeys(el: HTMLElement): { has(key: string): boolean; dispose(): void } {
  const held = new Set<string>();
  const down = (e: KeyboardEvent) => {
    if (e.key.startsWith("Arrow") || e.key === " ") e.preventDefault();
    held.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  };
  const up = (e: KeyboardEvent) => held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  const clear = () => held.clear();
  el.addEventListener("keydown", down);
  el.addEventListener("keyup", up);
  el.addEventListener("blur", clear);
  return {
    has: (k) => held.has(k),
    dispose() {
      el.removeEventListener("keydown", down);
      el.removeEventListener("keyup", up);
      el.removeEventListener("blur", clear);
    },
  };
}
