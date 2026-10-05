import "./audio.css";
import type { AudioState } from "./contract";
import { getMusic } from "./player";

const NS = "http://www.w3.org/2000/svg";

function labels() {
  const es = (document.documentElement.lang || "").toLowerCase().startsWith("es");
  return es
    ? { mute: "Silenciar música", unmute: "Activar música", volume: "Volumen de la música" }
    : { mute: "Mute music", unmute: "Unmute music", volume: "Music volume" };
}

function icon(): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("au-icon");
  const add = (cls: string, d: string, fill = false) => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("class", cls);
    if (fill) p.setAttribute("fill", "currentColor");
    else {
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", "currentColor");
      p.setAttribute("stroke-width", "2");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
    }
    svg.append(p);
  };
  add("au-cone", "M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z", true);
  add("au-wave au-wave-1", "M15 9.5a3.5 3.5 0 0 1 0 5");
  add("au-wave au-wave-2", "M17.5 7a7 7 0 0 1 0 10");
  add("au-x", "M15.5 9.5l5 5M20.5 9.5l-5 5");
  return svg;
}

/** Ready-made speaker toggle (+ optional volume slider) bound to the shared music player. */
export function createAudioControl(opts: { compact?: boolean } = {}): HTMLElement {
  const music = getMusic();
  const wrap = document.createElement("div");
  wrap.className = opts.compact ? "au-control au-compact" : "au-control";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "au-btn";
  btn.append(icon());
  wrap.append(btn);

  let range: HTMLInputElement | null = null;
  if (!opts.compact) {
    range = document.createElement("input");
    range.type = "range";
    range.className = "au-volume";
    range.min = "0";
    range.max = "1";
    range.step = "0.05";
    wrap.append(range);
    range.addEventListener("input", () => {
      void music.unlock();
      const v = Number(range?.value);
      music.setVolume(v);
      if (v > 0 && music.state.muted) music.setMuted(false);
    });
  }

  const render = (s: AudioState) => {
    const l = labels();
    btn.setAttribute("aria-label", s.muted ? l.unmute : l.mute);
    btn.title = s.muted ? l.unmute : l.mute;
    btn.setAttribute("aria-pressed", String(!s.muted));
    wrap.dataset.muted = String(s.muted || s.volume === 0);
    if (range) {
      range.setAttribute("aria-label", l.volume);
      range.value = String(s.volume);
    }
  };

  btn.addEventListener("click", () => {
    void music.unlock();
    music.setMuted(!music.state.muted);
  });

  render(music.state);
  let seen = false;
  const off = music.onChange((s) => {
    if (wrap.isConnected) seen = true;
    else if (seen) return off();
    render(s);
  });
  return wrap;
}
