/** Site theme palette (Khipu tokens), used by the site's own 3D scenes, not by arcade games. */
export interface SitePalette {
  bg: string;
  bgDeep: string;
  surface: string;
  line: string;
  fg: string;
  muted: string;
  red: string;
  indigo: string;
  ochre: string;
  turq: string;
  alpaca: string;
  cotton: string;
  accent: string;
  dark: boolean;
}

const read = (style: CSSStyleDeclaration, name: string, fallback: string) =>
  style.getPropertyValue(name).trim() || fallback;

/** Reads the live CSS tokens from :root. Safe to call every theme change. */
export function readPalette(root: HTMLElement = document.documentElement): SitePalette {
  const s = getComputedStyle(root);
  const bg = read(s, "--bg", "#13151b");
  return {
    bg,
    bgDeep: read(s, "--bg-deep", "#0e1015"),
    surface: read(s, "--surface", "#1b1e26"),
    line: read(s, "--line", "#2c303b"),
    fg: read(s, "--fg", "#ece8e0"),
    muted: read(s, "--muted", "#a19e95"),
    red: read(s, "--red", "#d0444b"),
    indigo: read(s, "--indigo", "#6b7fdc"),
    ochre: read(s, "--ochre", "#dda63c"),
    turq: read(s, "--turq", "#38b8a7"),
    alpaca: read(s, "--alpaca", "#a8825f"),
    cotton: read(s, "--cotton", "#e6e0d3"),
    accent: read(s, "--accent", "#c4383f"),
    dark: luminance(bg) < 0.4,
  };
}

function luminance(hex: string): number {
  const m = hex.replace("#", "");
  if (m.length < 6) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(m.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Calls cb whenever the effective theme changes (toggle or OS preference). */
export function onThemeChange(cb: () => void): () => void {
  const root = document.documentElement;
  const mo = new MutationObserver(cb);
  mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener("change", cb);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", cb);
  };
}
