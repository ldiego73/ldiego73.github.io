/**
 * Title (first viewport): the mountain floats like an island in a soft void, slowly turning,
 * with KHIPU in chunky block letters, a BEGIN button and a way back to the site.
 */
import * as THREE from "three";
import type { Lang } from "./contract";
import { loadTraveler, sanitizeName, TRAVELER_MAX } from "./traveler";

const COPY = {
  es: {
    sub: "Qhapaq Ñan · una carrera que se camina cuesta arriba",
    begin: "Comenzar",
    back: "Volver al sitio",
    hint: "o presiona Enter",
    name: "¿Cómo te llamas, viajero?",
    placeholder: "Tu nombre (opcional)",
  },
  en: {
    sub: "Qhapaq Ñan · a career you walk uphill",
    begin: "Begin",
    back: "Back to site",
    hint: "or press Enter",
    name: "What's your name, traveler?",
    placeholder: "Your name (optional)",
  },
} as const;

export interface Title {
  root: HTMLElement;
  /** Camera pose for the slowly turning island. */
  pose(dt: number, aspect: number): { pos: THREE.Vector3; look: THREE.Vector3 };
  /** Sanitized traveler name typed on the title ("" when empty). */
  name(): string;
  hide(): void;
  dispose(): void;
}

export function createTitle(host: HTMLElement, lang: Lang, reducedMotion: boolean, onBegin: () => void): Title {
  const c = COPY[lang];
  const root = document.createElement("section");
  root.className = "kw-title";
  root.setAttribute("aria-labelledby", "kw-title-h");
  const h1 = document.createElement("h1");
  h1.id = "kw-title-h";
  h1.className = "kw-title-word";
  h1.setAttribute("aria-label", "Khipu");
  for (const [i, ch] of [..."KHIPU"].entries()) {
    const s = document.createElement("span");
    s.textContent = ch;
    s.setAttribute("aria-hidden", "true");
    s.style.setProperty("--i", String(i));
    h1.append(s);
  }
  const sub = document.createElement("p");
  sub.className = "kw-title-sub";
  sub.textContent = c.sub;
  // Name + begin live in one form: Enter in the field (or on the button) submits and begins.
  const form = document.createElement("form");
  form.className = "kw-title-form";
  form.noValidate = true;
  const field = document.createElement("label");
  field.className = "kw-name";
  const lab = document.createElement("span");
  lab.className = "kw-name-label";
  lab.textContent = c.name;
  const input = document.createElement("input");
  input.type = "text";
  input.name = "traveler";
  input.className = "kw-name-input";
  input.maxLength = TRAVELER_MAX;
  input.setAttribute("autocomplete", "nickname");
  input.spellcheck = false;
  input.placeholder = c.placeholder;
  input.value = loadTraveler();
  field.append(lab, input);
  const foot = document.createElement("div");
  foot.className = "kw-title-foot";
  const begin = document.createElement("button");
  begin.type = "submit";
  begin.className = "kw-begin";
  begin.textContent = c.begin;
  const hint = document.createElement("span");
  hint.className = "kw-title-hint";
  hint.textContent = c.hint;
  const back = document.createElement("a");
  back.className = "kw-title-back";
  back.href = `/${lang}/`;
  back.textContent = `← ${c.back}`;
  foot.append(begin, hint, back);
  form.append(field, foot);
  root.append(h1, sub, form);
  host.append(root);
  const onSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    onBegin();
  };
  form.addEventListener("submit", onSubmit);
  requestAnimationFrame(() => begin.focus({ preventScroll: true }));

  let angle = -0.6;
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  return {
    root,
    pose(dt, aspect) {
      if (!reducedMotion) angle += dt * 0.045;
      // Pull back on narrow screens so the whole island (and its rock underside) fits.
      const dist = 470 * Math.max(1, 0.82 / aspect);
      pos.set(Math.sin(angle) * dist, 150 + (aspect < 1 ? 90 : 0), Math.cos(angle) * dist);
      look.set(0, aspect < 1 ? -26 : -4, 0);
      return { pos, look };
    },
    name: () => sanitizeName(input.value),
    hide() {
      root.classList.add("gone");
      begin.disabled = true;
      input.disabled = true;
    },
    dispose() {
      form.removeEventListener("submit", onSubmit);
      root.remove();
    },
  };
}
