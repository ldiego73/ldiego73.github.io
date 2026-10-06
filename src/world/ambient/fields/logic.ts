/**
 * Pure helpers for the data stations (Huerto de código, Khipu de escritos). No three.js, no DOM:
 * crop legend by language, star growth on a log scale, terrace arc layout, the playful knot
 * encoding of a post's date, link safety and date formatting. Unit-tested in logic.test.ts.
 */
import type { L, Lang } from "../../contract";

export type CropId = "maize" | "potato" | "quinoa" | "tarwi" | "oca" | "fallow";

export interface Crop {
  id: CropId;
  label: L;
  /** Languages (lowercase) that grow this crop; empty for the catch-all rows. */
  langs: string[];
  /** Legend swatch (main color of the crop). */
  swatch: string;
}

/** The legend, in display order. Languages not listed grow oca; repos without a language lie fallow. */
export const CROPS: Crop[] = [
  {
    id: "maize",
    label: { es: "Maíz (sara)", en: "Maize (sara)" },
    langs: ["typescript", "javascript"],
    swatch: "#e8c23a",
  },
  { id: "potato", label: { es: "Papa", en: "Potato" }, langs: ["python", "jupyter notebook"], swatch: "#9a72b8" },
  { id: "quinoa", label: { es: "Quinua", en: "Quinoa" }, langs: ["go", "rust"], swatch: "#c4383f" },
  {
    id: "tarwi",
    label: { es: "Tarwi (chocho)", en: "Tarwi (Andean lupin)" },
    langs: ["java", "kotlin", "scala", "c#"],
    swatch: "#3446a6",
  },
  { id: "oca", label: { es: "Oca", en: "Oca" }, langs: [], swatch: "#dda63c" },
  { id: "fallow", label: { es: "Barbecho", en: "Fallow" }, langs: [], swatch: "#9a6b47" },
];

const CROP_BY_ID = new Map(CROPS.map((c) => [c.id, c]));
export const cropById = (id: CropId): Crop => CROP_BY_ID.get(id) as Crop;

/** Which crop a repository's main language grows. */
export function cropFor(language: string | null | undefined): CropId {
  const l = (language ?? "").trim().toLowerCase();
  if (!l) return "fallow";
  for (const c of CROPS) if (c.langs.includes(l)) return c.id;
  return "oca";
}

/** Legend text for the "other languages" rows. */
export const LEGEND_NOTE: Record<"oca" | "fallow", L> = {
  oca: { es: "otros lenguajes", en: "other languages" },
  fallow: { es: "sin lenguaje", en: "no language" },
};

/**
 * Growth 0.25…1 from stars on a log scale, relative to the most-starred repo (at least 10 stars as the
 * reference, so a garden of 0–2 star repos stays modest instead of maxing out).
 */
export function growth(stars: number, maxStars: number): number {
  const s = Math.max(0, Number.isFinite(stars) ? stars : 0);
  const ref = Math.max(10, Number.isFinite(maxStars) ? maxStars : 0);
  const k = Math.log1p(s) / Math.log1p(ref);
  return 0.25 + 0.75 * Math.min(1, Math.max(0, k));
}

/** Plants on a terrace for a growth value (density follows stars too). */
export function plantCount(g: number, low: boolean): number {
  const n = Math.round(6 + g * 16);
  return low ? Math.max(3, Math.round(n * 0.5)) : n;
}

export interface Arc {
  /** Angle (radians) of terrace i's center, local frame: 0 = +Z (toward the trail), π = back. */
  center: number[];
  /** Angular width of one terrace. */
  width: number;
}

/**
 * Terraces in an amphitheater around the back of the plaza (the entrance from the trail stays open).
 * Up to 30° per terrace, never more than 220° in total.
 */
export function arcLayout(n: number): Arc {
  const count = Math.max(0, Math.floor(n));
  if (!count) return { center: [], width: 0 };
  const span = Math.min((220 * Math.PI) / 180, count * ((30 * Math.PI) / 180));
  const width = span / count;
  const start = Math.PI - span / 2;
  const center: number[] = [];
  for (let i = 0; i < count; i++) center.push(start + width * (i + 0.5));
  return { center, width };
}

export interface KnotCode {
  year: number;
  month: number;
  /** Tens of the year's last two digits: single knots near the main cord. */
  tens: number;
  /** Units of the year: turns of one long knot (0 = an empty space, as in the khipu decimal system). */
  units: number;
}

/** Playful khipu encoding of a date: tens and units of the year (yy), then the month in single knots. */
export function knotsFor(iso: string): KnotCode | null {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const yy = year % 100;
  return { year, month, tens: Math.floor(yy / 10), units: yy % 10 };
}

/** Only same-site absolute paths or http(s) URLs reach an href. */
export function safeHref(href: string | null | undefined): string | null {
  const h = (href ?? "").trim();
  if (!h) return null;
  if (h.startsWith("/") && !h.startsWith("//")) return h;
  try {
    const u = new URL(h);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** True for links that leave the site (open in a new tab). */
export const isExternal = (href: string) => /^https?:\/\//.test(href);

export function formatDate(iso: string, lang: Lang, withDay = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "es" ? "es-PE" : "en-US", {
    year: "numeric",
    month: "short",
    ...(withDay ? { day: "numeric" } : {}),
    timeZone: "UTC",
  }).format(d);
}

/** Wraps an index into 0…n-1 (prev/next navigation). */
export const wrap = (i: number, n: number) => (n <= 0 ? 0 : ((i % n) + n) % n);
