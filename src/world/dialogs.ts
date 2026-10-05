/**
 * Core paper dialogs: photo mode (postcard preview with download/share) and the traveler-name editor.
 * A shared modal helper handles Esc (capture phase, so the world and content never see it),
 * a focus trap and focus restore.
 */
import { type Lang, STATIONS } from "./contract";
import { DYE, fonts } from "./palette";
import { announceTraveler, loadTraveler, saveTraveler, TRAVELER_MAX } from "./traveler";

const COPY = {
  es: {
    photoTitle: "Tu postal del camino",
    download: "Descargar",
    share: "Compartir",
    close: "Cerrar",
    traveler: "Viajero",
    nameTitle: "¿Cómo te llamas, viajero?",
    namePh: "Tu nombre (opcional)",
    save: "Guardar",
    cancel: "Cancelar",
    trail: "En el camino",
    summit: "La cumbre",
    shareText: "Mi paso por el Qhapaq Ñan de Luis Diego",
  },
  en: {
    photoTitle: "Your postcard from the trail",
    download: "Download",
    share: "Share",
    close: "Close",
    traveler: "Traveler",
    nameTitle: "What's your name, traveler?",
    namePh: "Your name (optional)",
    save: "Save",
    cancel: "Cancel",
    trail: "On the trail",
    summit: "The summit",
    shareText: "My walk along Luis Diego's Qhapaq Ñan",
  },
} as const;

// ---------------------------------------------------------------- modal helper

interface Modal {
  el: HTMLElement;
  panel: HTMLElement;
  open(focus?: HTMLElement): void;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

function createModal(host: HTMLElement, labelId: string, onClose: () => void): Modal {
  const el = document.createElement("div");
  el.className = "kw-modal";
  el.hidden = true;
  const panel = document.createElement("div");
  panel.className = "kw-modal-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", labelId);
  el.append(panel);
  host.append(el);
  let open = false;
  let restore: HTMLElement | null = null;
  const focusables = () =>
    [...panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])")].filter(
      (n) => !n.hidden && n.offsetParent !== null,
    );
  const onKey = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      m.close();
      return;
    }
    if (e.key === "Tab") {
      const f = focusables();
      if (!f.length) return;
      const first = f[0] as HTMLElement;
      const last = f[f.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    // Keep world keys (WASD, E, M, T, F…) from reaching the game while a dialog is up.
    e.stopImmediatePropagation();
  };
  const onBackdrop = (e: MouseEvent) => {
    if (e.target === el) m.close();
  };
  window.addEventListener("keydown", onKey, true);
  el.addEventListener("click", onBackdrop);
  const m: Modal = {
    el,
    panel,
    open(focus) {
      if (open) return;
      open = true;
      restore = document.activeElement as HTMLElement | null;
      el.hidden = false;
      requestAnimationFrame(() => (focus ?? focusables()[0])?.focus({ preventScroll: true }));
    },
    close() {
      if (!open) return;
      open = false;
      el.hidden = true;
      onClose();
      restore?.focus?.({ preventScroll: true });
    },
    isOpen: () => open,
    dispose() {
      window.removeEventListener("keydown", onKey, true);
      el.removeEventListener("click", onBackdrop);
      el.remove();
    },
  };
  return m;
}

// ---------------------------------------------------------------- photo mode

export interface Place {
  id: string;
  label: string;
}

/** Nearest station within reach of the traveler, else the summit or "on the trail". */
export function placeAt(
  lang: Lang,
  pos: { x: number; z: number },
  t: number,
  stationPos: (id: string) => { x: number; z: number },
): Place {
  let best: Place | null = null;
  let bd = 14;
  for (const s of STATIONS) {
    const p = stationPos(s.id);
    const d = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (d < bd) {
      bd = d;
      best = { id: s.id, label: s.label[lang] };
    }
  }
  if (best) return best;
  if (t > 0.97) return { id: "cumbre", label: COPY[lang].summit };
  return { id: "camino", label: COPY[lang].trail };
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Paper postcard: the shot inside an inked frame, title band with place, traveler and date. */
export async function composePostcard(
  shot: HTMLCanvasElement,
  o: { lang: Lang; place: string; traveler: string; date: Date },
) {
  const f = fonts();
  try {
    await Promise.all([document.fonts?.load(`900 48px ${f.display}`), document.fonts?.load(`600 24px ${f.body}`)]);
  } catch {
    /* fallback fonts are fine */
  }
  const scale = Math.min(1, 1600 / shot.width);
  const sw = Math.round(shot.width * scale);
  const sh = Math.round(shot.height * scale);
  const pad = Math.round(sw * 0.035);
  const band = Math.round(sw * 0.115);
  const W = sw + pad * 2;
  const H = sh + pad + band;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  const ink = "#1f1a17";
  ctx.fillStyle = "#f3ead8";
  ctx.fillRect(0, 0, W, H);
  // Faint woven texture on the paper.
  ctx.fillStyle = "rgb(168 130 95 / 0.06)";
  for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
  ctx.drawImage(shot, pad, pad, sw, sh);
  const lw = Math.max(3, Math.round(W * 0.0028));
  ctx.lineWidth = lw;
  ctx.strokeStyle = ink;
  ctx.strokeRect(pad, pad, sw, sh);
  ctx.strokeRect(lw / 2, lw / 2, W - lw, H - lw);
  // Khipu dye cord under the photo.
  const dyes = [DYE.red, DYE.ochre, DYE.indigo, DYE.turq, DYE.alpaca, DYE.red];
  const cordY = pad + sh + Math.round(band * 0.14);
  const seg = sw / dyes.length;
  for (const [i, d] of dyes.entries()) {
    ctx.fillStyle = d;
    ctx.fillRect(pad + i * seg, cordY, seg, Math.max(4, Math.round(band * 0.06)));
  }
  const textTop = cordY + Math.round(band * 0.12);
  ctx.fillStyle = ink;
  ctx.textBaseline = "top";
  const big = Math.round(band * 0.3);
  ctx.font = `900 ${big}px ${f.display}`;
  ctx.fillText("KHIPU · Qhapaq Ñan", pad, textTop);
  const small = Math.round(band * 0.19);
  ctx.font = `600 ${small}px ${f.body}`;
  ctx.fillStyle = "#5b4a3a";
  ctx.fillText(o.place, pad, textTop + big * 1.15);
  ctx.textAlign = "right";
  const date = o.date.toLocaleDateString(o.lang === "es" ? "es-PE" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  ctx.fillText(date, pad + sw, textTop + big * 1.15);
  if (o.traveler) {
    ctx.fillStyle = ink;
    ctx.font = `700 ${Math.round(small * 1.1)}px ${f.body}`;
    let label = `${COPY[o.lang].traveler}: ${o.traveler}`;
    const max = sw * 0.45;
    while (label.length > 4 && ctx.measureText(label).width > max) label = `${label.slice(0, -2)}…`;
    ctx.fillText(label, pad + sw, textTop + big * 0.12);
  }
  return c;
}

export interface PhotoMode {
  shoot(): Promise<void>;
  isOpen(): boolean;
  dispose(): void;
}

export function createPhotoMode(
  host: HTMLElement,
  lang: Lang,
  o: {
    reducedMotion: boolean;
    capture: () => Promise<HTMLCanvasElement>;
    place: () => Place;
    traveler: () => string;
    onOpenChange: (open: boolean) => void;
  },
): PhotoMode {
  const c = COPY[lang];
  let url: string | null = null;
  let file: File | null = null;
  const modal = createModal(host, "kw-photo-h", () => {
    // Never leak object URLs: revoke as soon as the preview closes.
    if (url) URL.revokeObjectURL(url);
    url = null;
    file = null;
    img.removeAttribute("src");
    o.onOpenChange(false);
  });
  modal.el.classList.add("kw-photo");
  const h = document.createElement("h2");
  h.id = "kw-photo-h";
  h.className = "kw-modal-title";
  h.textContent = c.photoTitle;
  const img = document.createElement("img");
  img.className = "kw-photo-img";
  img.alt = "";
  const row = document.createElement("div");
  row.className = "kw-modal-actions";
  const dl = document.createElement("a");
  dl.className = "kw-btn kw-btn-primary";
  dl.textContent = c.download;
  const share = document.createElement("button");
  share.type = "button";
  share.className = "kw-btn";
  share.textContent = c.share;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "kw-btn";
  close.textContent = c.close;
  row.append(dl, share, close);
  modal.panel.append(h, img, row);
  close.addEventListener("click", () => modal.close());
  share.addEventListener("click", async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: "KHIPU · Qhapaq Ñan", text: c.shareText });
    } catch {
      /* cancelled or unsupported */
    }
  });

  let busy = false;
  const flash = () => {
    if (o.reducedMotion) return;
    const f = document.createElement("div");
    f.className = "kw-flash";
    f.setAttribute("aria-hidden", "true");
    f.innerHTML = '<i class="kw-shutter kw-shutter-a"></i><i class="kw-shutter kw-shutter-b"></i>';
    host.append(f);
    f.addEventListener("animationend", () => f.remove(), { once: true });
    setTimeout(() => f.remove(), 900);
  };

  return {
    async shoot() {
      if (busy || modal.isOpen()) return;
      busy = true;
      try {
        // DOM overlays aren't part of the WebGL canvas, but hide them for the shutter beat anyway.
        host.classList.add("kw-shooting");
        const shot = await o.capture();
        flash();
        host.classList.remove("kw-shooting");
        const place = o.place();
        const date = new Date();
        const card = await composePostcard(shot, { lang, place: place.label, traveler: o.traveler(), date });
        const blob = await new Promise<Blob | null>((r) => card.toBlob(r, "image/png"));
        if (!blob) return;
        const name = `khipu-${place.id}-${ymd(date)}.png`;
        url = URL.createObjectURL(blob);
        file = new File([blob], name, { type: "image/png" });
        img.src = url;
        img.alt = `${c.photoTitle}: ${place.label}`;
        dl.href = url;
        dl.download = name;
        share.hidden = !(typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }));
        o.onOpenChange(true);
        modal.open(dl);
      } finally {
        host.classList.remove("kw-shooting");
        busy = false;
      }
    },
    isOpen: () => modal.isOpen(),
    dispose() {
      if (url) URL.revokeObjectURL(url);
      modal.dispose();
    },
  };
}

// ---------------------------------------------------------------- traveler name editor

export interface NameEditor {
  open(): void;
  isOpen(): boolean;
  dispose(): void;
}

export function createNameEditor(
  host: HTMLElement,
  lang: Lang,
  o: { onSaved: (name: string) => void; onOpenChange: (open: boolean) => void },
): NameEditor {
  const c = COPY[lang];
  const modal = createModal(host, "kw-name-h", () => o.onOpenChange(false));
  const form = document.createElement("form");
  form.className = "kw-name-form";
  form.noValidate = true;
  const h = document.createElement("h2");
  h.id = "kw-name-h";
  h.className = "kw-modal-title";
  h.textContent = c.nameTitle;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "kw-name-input";
  input.maxLength = TRAVELER_MAX;
  input.setAttribute("autocomplete", "nickname");
  input.spellcheck = false;
  input.placeholder = c.namePh;
  input.setAttribute("aria-labelledby", "kw-name-h");
  const row = document.createElement("div");
  row.className = "kw-modal-actions";
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "kw-btn kw-btn-primary";
  save.textContent = c.save;
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "kw-btn";
  cancel.textContent = c.cancel;
  row.append(save, cancel);
  form.append(h, input, row);
  modal.panel.append(form);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = saveTraveler(input.value);
    announceTraveler(name);
    o.onSaved(name);
    modal.close();
  });
  cancel.addEventListener("click", () => modal.close());
  return {
    open() {
      input.value = loadTraveler();
      o.onOpenChange(true);
      modal.open(input);
    },
    isOpen: () => modal.isOpen(),
    dispose: () => modal.dispose(),
  };
}
