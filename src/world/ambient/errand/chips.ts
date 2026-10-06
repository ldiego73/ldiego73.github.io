/**
 * Shared top-left stack for the trail chips (errand objective from npcs.ts, time-trial clock from
 * ambient/ghost.ts): whichever module mounts first creates it, so the chips line up under the name chips
 * without knowing about each other.
 */
import "./chips.css";

const ID = "qn-trail-chips";

export function trailChips(hudRoot: HTMLElement): HTMLElement {
  let stack = hudRoot.querySelector<HTMLElement>(`#${ID}`);
  if (!stack) {
    stack = document.createElement("div");
    stack.id = ID;
    stack.className = "qn-trail-chips";
    hudRoot.appendChild(stack);
  }
  return stack;
}

/** A chip: an icon slot, a small caps label and a value line. `order` keeps the errand above the clock. */
export function makeChip(kind: "errand" | "clock", order: number) {
  const chip = document.createElement("div");
  chip.className = `qn-trail-chip is-${kind}`;
  chip.style.order = String(order);
  chip.hidden = true;
  const icon = document.createElement("span");
  icon.className = "qn-trail-chip-icon";
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "qn-trail-chip-label";
  const value = document.createElement("span");
  value.className = "qn-trail-chip-value";
  chip.append(icon, label, value);
  return { chip, label, value };
}

/** Removes the stack once its last chip is gone (on dispose). */
export function releaseChips(stack: HTMLElement) {
  if (!stack.childElementCount) stack.remove();
}
