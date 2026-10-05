/**
 * Core controls layered over the world (the content HUD lives in its own root):
 * back link, guided tour, day/night, quality, and the touch joystick + run/jump/E (map + help live in the content HUD).
 */
import type { Lang } from "./contract";

const COPY = {
  es: {
    back: "Sitio",
    backLong: "Volver al sitio",
    tour: "Recorrido",
    photo: "Foto",
    photoLong: "Tomar foto (F)",
    nameEdit: "Editar nombre",
    nameNone: "Tu nombre",
    tourStop: "Detener",
    day: "Pasar a la noche (T)",
    night: "Pasar al día (T)",
    quality: "Calidad",
    high: "Alta",
    low: "Baja",
    run: "Correr",
    jump: "Saltar",
    act: "Interactuar (E)",
    joystick: "Mover",
  },
  en: {
    back: "Site",
    backLong: "Back to site",
    tour: "Guided tour",
    photo: "Photo",
    photoLong: "Take a photo (F)",
    nameEdit: "Edit name",
    nameNone: "Your name",
    tourStop: "Stop",
    day: "Switch to night (T)",
    night: "Switch to day (T)",
    quality: "Quality",
    high: "High",
    low: "Low",
    run: "Run",
    jump: "Jump",
    act: "Interact (E)",
    joystick: "Move",
  },
} as const;

const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  tour: svg('<path d="M5 20V5"/><path d="M5 5h11l-2.5 3.5L16 12H5"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
  sun: svg(
    '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  ),
  moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  camera: svg('<path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.4"/>'),
  pencil: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  quality: svg('<path d="M4 18h16"/><path d="M7 18V12M12 18V8M17 18V5"/>'),
  run: svg('<circle cx="14" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2v4M6 11l3-3 4 1 3 3 3 .5"/><path d="M11 15l2-5"/>'),
  jump: svg('<path d="M12 19V6M6.5 11.5L12 6l5.5 5.5"/><path d="M5 21h14"/>'),
};

export interface Chrome {
  root: HTMLElement;
  setTour(on: boolean): void;
  setNight(night: boolean): void;
  setQuality(q: "low" | "high"): void;
  /** Ambient interact prompt (NPCs, fauna); null hides it. */
  setPrompt(text: string | null): void;
  /** Shows the traveler's name on the small edit chip (empty → "Your name"). */
  setTraveler(name: string): void;
  show(on: boolean): void;
  dispose(): void;
}

export function createChrome(
  host: HTMLElement,
  lang: Lang,
  h: {
    onTour(): void;
    onPhoto(): void;
    onEditName(): void;
    onDayNight(): void;
    onQuality(): void;
    onInteract(): void;
    onJump(): void;
    onRun(on: boolean): void;
    onJoystick(x: number, y: number): void;
  },
): Chrome {
  const c = COPY[lang];
  const root = document.createElement("div");
  root.className = "kw-chrome";
  root.innerHTML = `
    <a class="kw-btn kw-back" href="/${lang}/" aria-label="${c.backLong}">${ICON.back}<span>${c.back}</span></a>
    <button type="button" class="kw-namechip" data-k="name" aria-label="${c.nameEdit}" title="${c.nameEdit}">${ICON.pencil}<span class="kw-namechip-v"></span></button>
    <nav class="kw-tools" aria-label="${lang === "es" ? "Controles del mundo" : "World controls"}">
      <button type="button" class="kw-btn" data-k="tour" aria-pressed="false">${ICON.tour}<span>${c.tour}</span></button>
      <button type="button" class="kw-btn" data-k="photo" aria-label="${c.photoLong}" title="${c.photoLong}">${ICON.camera}<span>${c.photo}</span></button>
      <button type="button" class="kw-btn kw-icon" data-k="daynight" aria-label="${c.day}" title="${c.day}">${ICON.moon}</button>
      <button type="button" class="kw-btn kw-icon kw-q" data-k="quality" aria-label="${c.quality}" title="${c.quality}">${ICON.quality}<span class="kw-q-v"></span></button>
    </nav>
    <p class="kw-prompt" role="status" aria-live="polite" hidden></p>
    <div class="kw-touch" aria-hidden="false">
      <div class="kw-joy" role="application" aria-label="${c.joystick}"><div class="kw-joy-knob"></div></div>
      <div class="kw-pads">
        <button type="button" class="kw-pad kw-pad-e" data-k="act" aria-label="${c.act}">E</button>
        <button type="button" class="kw-pad" data-k="jump" aria-label="${c.jump}">${ICON.jump}</button>
        <button type="button" class="kw-pad" data-k="run" aria-label="${c.run}" aria-pressed="false">${ICON.run}</button>
      </div>
    </div>`;
  host.append(root);
  const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  const tourBtn = q<HTMLButtonElement>('[data-k="tour"]');
  const dnBtn = q<HTMLButtonElement>('[data-k="daynight"]');
  const qBtn = q<HTMLButtonElement>('[data-k="quality"]');
  const runBtn = q<HTMLButtonElement>('[data-k="run"]');
  const promptEl = q<HTMLElement>(".kw-prompt");
  let lastPrompt: string | null = null;

  const onClick = (e: MouseEvent) => {
    const k = (e.target as HTMLElement).closest<HTMLElement>("[data-k]")?.dataset.k;
    if (k === "tour") h.onTour();
    else if (k === "photo") h.onPhoto();
    else if (k === "name") h.onEditName();
    else if (k === "daynight") h.onDayNight();
    else if (k === "quality") h.onQuality();
  };
  root.addEventListener("click", onClick);
  // Touch pads act on press, not click, so they feel immediate.
  const onPad = (e: PointerEvent) => {
    const k = (e.target as HTMLElement).closest<HTMLElement>(".kw-pad")?.dataset.k;
    if (!k) return;
    e.preventDefault();
    if (k === "act") h.onInteract();
    if (k === "jump") h.onJump();
    if (k === "run") {
      const on = runBtn.getAttribute("aria-pressed") !== "true";
      runBtn.setAttribute("aria-pressed", String(on));
      h.onRun(on);
    }
  };
  const pads = q<HTMLElement>(".kw-pads");
  pads.addEventListener("pointerdown", onPad);

  // Joystick
  const joy = q<HTMLElement>(".kw-joy");
  const knob = q<HTMLElement>(".kw-joy-knob");
  let jid: number | null = null;
  const jmove = (e: PointerEvent) => {
    if (e.pointerId !== jid) return;
    const r = joy.getBoundingClientRect();
    const rad = r.width / 2;
    let x = (e.clientX - (r.left + rad)) / rad;
    let y = (e.clientY - (r.top + rad)) / rad;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    knob.style.transform = `translate(${x * rad * 0.55}px, ${y * rad * 0.55}px)`;
    h.onJoystick(x, -y);
  };
  const jdown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    jid = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    jmove(e);
  };
  const jup = (e: PointerEvent) => {
    if (e.pointerId !== jid) return;
    jid = null;
    knob.style.transform = "";
    h.onJoystick(0, 0);
  };
  joy.addEventListener("pointerdown", jdown);
  joy.addEventListener("pointermove", jmove);
  joy.addEventListener("pointerup", jup);
  joy.addEventListener("pointercancel", jup);

  return {
    root,
    setTour(on) {
      tourBtn.setAttribute("aria-pressed", String(on));
      tourBtn.innerHTML = `${on ? ICON.stop : ICON.tour}<span>${on ? c.tourStop : c.tour}</span>`;
    },
    setNight(night) {
      const label = night ? c.night : c.day;
      dnBtn.innerHTML = night ? ICON.sun : ICON.moon;
      dnBtn.setAttribute("aria-label", label);
      dnBtn.title = label;
    },
    setQuality(v) {
      q<HTMLElement>(".kw-q-v").textContent = v === "high" ? c.high : c.low;
      qBtn.setAttribute("aria-label", `${c.quality}: ${v === "high" ? c.high : c.low}`);
    },
    setTraveler(name) {
      const v = q<HTMLElement>(".kw-namechip-v");
      v.textContent = name || c.nameNone;
      v.title = name;
    },
    setPrompt(text) {
      if (text === lastPrompt) return;
      lastPrompt = text;
      promptEl.hidden = !text;
      promptEl.textContent = text ?? "";
    },
    show(on) {
      root.classList.toggle("on", on);
    },
    dispose() {
      root.removeEventListener("click", onClick);
      pads.removeEventListener("pointerdown", onPad);
      root.remove();
    },
  };
}
