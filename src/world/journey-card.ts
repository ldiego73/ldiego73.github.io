/**
 * Summit postcard ("Mi postal"): a shareable card of the traveler's whole walk — the current view, their
 * route drawn as a khipu (one cord per tambo, knotted when stamped), climb time, stamps, wildlife seen,
 * weather and the llama ride, plus an invitation back to the site. Available any time from the passport
 * and the summit panel (`world:postcard`); before the first summit it reads "En el camino" with the
 * progress so far. Vertical (1080×1350, feeds) or wide (1200×630, links). Drawn on a 2D canvas.
 *
 * World-aware: on the Antisuyu jungle page (`world: "selva"`, passed by selva/index.ts or read from
 * `document.documentElement.dataset.world`) the card is "Your Antisuyu postcard": the cord shows the jungle
 * stations, the canoe trip and canopy walkway replace climb time and llama ride, wildlife is the jungle's, and
 * the link points to /{lang}/world/selva. The suyu roads (costa, titicaca, colca: `SuyuDef.postcard`) get their
 * own card the same way: their heading, their passport page's stations on the cord, their ride, finds and
 * wildlife, colours of their landscape and their link. The Qusqu hub's card is "Your Tawantinsuyu postcard":
 * one cord per passport page (knotted when the page is complete), pages complete, worlds visited and every
 * stamp. The mountain card is drawn exactly as before. Every figure is a passport count (journey.ts).
 */
import { COMPANIES } from "../data/career";
import type { Lang } from "./contract";
import { createModal } from "./dialogs";
import { formatDuration, type JourneySummary, POSTCARD_WORLDS, type PostcardWorld } from "./journey";
import { DYE, fonts } from "./palette";
import { SELVA_STATIONS, type SelvaStationKind } from "./selva/contract";

export type CardFormat = "story" | "wide";
const SIZE: Record<CardFormat, [number, number]> = { story: [1080, 1350], wide: [1200, 630] };

const COPY = {
  es: {
    reached: "Llegué a la cumbre",
    onWay: "En el camino",
    traveler: "Viajero",
    best: "Mejor subida",
    last: "Última",
    climbs: "subidas",
    stamps: "Sellos",
    wildlife: "Fauna vista",
    weather: "Clima",
    llama: "Paseo en llama",
    yes: "Sí ✓",
    none: "—",
    route: "Mi ruta",
    invite: "Camina el tuyo",
    title: "Tu postal del Qhapaq Ñan",
    story: "Vertical",
    wide: "Horizontal",
    download: "Descargar",
    share: "Compartir",
    copy: "Copiar texto",
    copied: "¡Copiado!",
    close: "Cerrar",
    text: (s: JourneySummary, url: string) =>
      s.reached
        ? `Llegué a la cumbre del Qhapaq Ñan de Luis Diego${s.journey.bestMs ? ` en ${formatDuration(s.journey.bestMs, "es")}` : ""}, con ${s.stamps.got} sellos${s.wildlife.length ? ` y ${s.wildlife.length} animales vistos` : ""}. Camina el tuyo → ${url}`
        : `Voy recorriendo el Qhapaq Ñan de Luis Diego: ${s.route.filter((r) => r.stamped).length} de ${s.route.length} tambos y ${s.stamps.got} sellos. Camina el tuyo → ${url}`,
  },
  en: {
    reached: "I reached the summit",
    onWay: "On the trail",
    traveler: "Traveler",
    best: "Best climb",
    last: "Last",
    climbs: "climbs",
    stamps: "Stamps",
    wildlife: "Wildlife seen",
    weather: "Weather",
    llama: "Llama ride",
    yes: "Yes ✓",
    none: "—",
    route: "My route",
    invite: "Walk yours",
    title: "Your Qhapaq Ñan postcard",
    story: "Vertical",
    wide: "Wide",
    download: "Download",
    share: "Share",
    copy: "Copy text",
    copied: "Copied!",
    close: "Close",
    text: (s: JourneySummary, url: string) =>
      s.reached
        ? `I reached the summit of Luis Diego's Qhapaq Ñan${s.journey.bestMs ? ` in ${formatDuration(s.journey.bestMs, "en")}` : ""}, with ${s.stamps.got} stamps${s.wildlife.length ? ` and ${s.wildlife.length} animals spotted` : ""}. Walk yours → ${url}`
        : `I'm walking Luis Diego's Qhapaq Ñan: ${s.route.filter((r) => r.stamped).length} of ${s.route.length} tambos and ${s.stamps.got} stamps so far. Walk yours → ${url}`,
  },
} as const;

/** Jungle overrides (everything else on the card reads COPY). */
const SELVA_COPY = {
  es: {
    reached: "Llegué a la collpa",
    heading: "KHIPU · Antisuyu",
    title: "Tu postal del Antisuyu",
    canoe: "Viaje en canoa",
    canopy: "Puentes del dosel",
    stations: "Estaciones",
    text: (s: JourneySummary, url: string) =>
      s.reached
        ? `Llegué a la collpa de guacamayos del Antisuyu de Luis Diego, con ${s.stamps.got} sellos de la selva${s.wildlife.length ? ` y ${s.wildlife.length} animales vistos` : ""}. Camina el tuyo → ${url}`
        : `Voy recorriendo el Antisuyu de Luis Diego: ${s.route.filter((r) => r.stamped).length} de ${s.route.length} estaciones y ${s.stamps.got} sellos de la selva. Camina el tuyo → ${url}`,
  },
  en: {
    reached: "I reached the clay lick",
    heading: "KHIPU · Antisuyu",
    title: "Your Antisuyu postcard",
    canoe: "Canoe trip",
    canopy: "Canopy walkway",
    stations: "Stations",
    text: (s: JourneySummary, url: string) =>
      s.reached
        ? `I reached the macaw clay lick of Luis Diego's Antisuyu, with ${s.stamps.got} jungle stamps${s.wildlife.length ? ` and ${s.wildlife.length} animals spotted` : ""}. Walk yours → ${url}`
        : `I'm walking Luis Diego's Antisuyu: ${s.route.filter((r) => r.stamped).length} of ${s.route.length} stations and ${s.stamps.got} jungle stamps so far. Walk yours → ${url}`,
  },
} as const;

/** The suyu roads' and the hub's card copy (everything else reads COPY). `place` is where the road ends. */
interface SuyuCardCopy {
  reached: string;
  heading: string;
  title: string;
  /** The page's ride cell, when it has one. */
  ride?: string;
  text: (s: JourneySummary, url: string) => string;
}
const suyuText = (lang: Lang, suyu: string, place: string, page: string) =>
  lang === "es"
    ? (s: JourneySummary, url: string) =>
        s.reached
          ? `Llegué a ${place} en el ${suyu} de Luis Diego, con ${s.stamps.got} sellos ${page}${s.wildlife.length ? ` y ${s.wildlife.length} animales vistos` : ""}. Camina el tuyo → ${url}`
          : `Voy recorriendo el ${suyu} de Luis Diego: ${s.route.filter((r) => r.stamped).length} de ${s.route.length} estaciones y ${s.stamps.got} sellos ${page}. Camina el tuyo → ${url}`
    : (s: JourneySummary, url: string) =>
        s.reached
          ? `I reached ${place} on Luis Diego's ${suyu}, with ${s.stamps.got} ${page} stamps${s.wildlife.length ? ` and ${s.wildlife.length} animals spotted` : ""}. Walk yours → ${url}`
          : `I'm walking Luis Diego's ${suyu}: ${s.route.filter((r) => r.stamped).length} of ${s.route.length} stations and ${s.stamps.got} ${page} stamps so far. Walk yours → ${url}`;
const tawantinsuyuText = (lang: Lang) => (s: JourneySummary, url: string) => {
  const p = s.pages ?? { done: 0, total: s.route.length };
  return lang === "es"
    ? `${s.reached ? "Recorrí todo" : "Voy recorriendo"} el Tawantinsuyu de Luis Diego: ${p.done} de ${p.total} páginas del pasaporte completas y ${s.stamps.got} sellos. Camina el tuyo → ${url}`
    : `${s.reached ? "I walked all of" : "I'm walking"} Luis Diego's Tawantinsuyu: ${p.done} of ${p.total} passport pages complete and ${s.stamps.got} stamps. Walk yours → ${url}`;
};
const SUYU_COPY: Record<"cusco" | "costa" | "titicaca" | "colca", Record<Lang, SuyuCardCopy>> = {
  cusco: {
    es: {
      reached: "Recorrí el Tawantinsuyu",
      heading: "KHIPU · Tawantinsuyu",
      title: "Tu postal del Tawantinsuyu",
      text: tawantinsuyuText("es"),
    },
    en: {
      reached: "I walked the Tawantinsuyu",
      heading: "KHIPU · Tawantinsuyu",
      title: "Your Tawantinsuyu postcard",
      text: tawantinsuyuText("en"),
    },
  },
  costa: {
    es: {
      reached: "Llegué a la Mamacocha",
      heading: "KHIPU · Chinchaysuyu",
      title: "Tu postal del Chinchaysuyu",
      ride: "Caballito de totora",
      text: suyuText("es", "Chinchaysuyu", "la Mamacocha", "de la costa"),
    },
    en: {
      reached: "I reached the Mamacocha",
      heading: "KHIPU · Chinchaysuyu",
      title: "Your Chinchaysuyu postcard",
      ride: "Totora reed-boat ride",
      text: suyuText("en", "Chinchaysuyu", "the Mamacocha", "coast"),
    },
  },
  titicaca: {
    es: {
      reached: "Llegué a la Isla del Sol",
      heading: "KHIPU · Collasuyu",
      title: "Tu postal del Collasuyu",
      ride: "Balsa de totora",
      text: suyuText("es", "Collasuyu", "la Isla del Sol", "del lago"),
    },
    en: {
      reached: "I reached the Isla del Sol",
      heading: "KHIPU · Collasuyu",
      title: "Your Collasuyu postcard",
      ride: "Totora reed boat",
      text: suyuText("en", "Collasuyu", "the Isla del Sol", "lake"),
    },
  },
  colca: {
    es: {
      reached: "Llegué a la Cruz del Cóndor",
      heading: "KHIPU · Kuntisuyu",
      title: "Tu postal del Kuntisuyu",
      text: suyuText("es", "Kuntisuyu", "la Cruz del Cóndor", "del cañón"),
    },
    en: {
      reached: "I reached the Cruz del Cóndor",
      heading: "KHIPU · Kuntisuyu",
      title: "Your Kuntisuyu postcard",
      text: suyuText("en", "Kuntisuyu", "the Cruz del Cóndor", "canyon"),
    },
  },
};

/** Labels of the cells the suyu and hub cards add. */
const CELL = {
  es: { stations: "Estaciones", finds: "Hallazgos", pages: "Páginas completas", visited: "Mundos visitados" },
  en: { stations: "Stations", finds: "Finds", pages: "Pages complete", visited: "Worlds visited" },
} as const;

const INK = "#1f1a17";
const SEPIA = "#5b4a3a";
const PAPER = "#f3ead8";

const stationDye = (id: string) => {
  const co = COMPANIES.find((c) => c.id === id);
  if (co) return DYE[co.dye];
  return (
    (
      { gate: DYE.alpaca, bridge: DYE.turq, arcade: DYE.ochre, ai: DYE.indigo, contact: DYE.red } as Record<
        string,
        string
      >
    )[id] ?? DYE.ochre
  );
};

/** Jungle station dyes by kind (the jungle map's markers use the same ones). */
const SELVA_KIND_DYE: Record<SelvaStationKind, string> = {
  gate: DYE.alpaca,
  uses: DYE.turq,
  blog: DYE.indigo,
  landing: DYE.turq,
  projects: DYE.ochre,
  arcade: DYE.ochre,
  collpa: DYE.red,
};
export const selvaStationDye = (id: string) => {
  const kind = SELVA_STATIONS.find((s) => s.id === id)?.kind;
  return kind ? SELVA_KIND_DYE[kind] : DYE.ochre;
};

export const worldUrl = (lang: Lang, world: PostcardWorld = "qhapaq") =>
  world === "qhapaq" ? `ldiego73.github.io/${lang}/world` : `ldiego73.github.io/${lang}/world/${world}`;

/**
 * Each card's colours: the badge fill once the road's end is reached, the footer dye band and the dye of a
 * route cord. The mountain and the jungle keep the khipu dyes they always had; the suyu roads take their
 * landscape (coast: sea, sand, adobe and sunset; lake: water, totora, Taquile red and Inti gold; canyon:
 * terracotta strata, ichu and the sky over the pampa) and the hub takes the dye of each page's road.
 */
interface CardTheme {
  accent: string;
  band: readonly string[];
  dye: (id: string, i: number) => string;
}
const KHIPU_BAND = [DYE.red, DYE.ochre, DYE.indigo, DYE.turq, DYE.alpaca] as const;
const cycle = (band: readonly string[]) => (_id: string, i: number) => band[i % band.length] as string;
/** Hub cords: each page in the dye of its road on the usnu's khipu (cusco/plan.ts GATES), the lake in its water. */
const PAGE_DYE: Record<string, string> = {
  qhapaq: DYE.ochre,
  wasi: DYE.alpaca,
  selva: DYE.turq,
  cusco: "#e8b631",
  costa: DYE.red,
  titicaca: "#4f86c4",
  colca: DYE.indigo,
};
const COSTA_BAND = ["#2f7f9a", "#e3c68f", DYE.red, "#e07a3c", DYE.turq] as const;
const LAKE_BAND = ["#4f86c4", "#c9b77a", DYE.red, "#2d5d8f", DYE.ochre] as const;
const CANYON_BAND = ["#c98b5a", "#8a5a35", "#d9b26a", DYE.indigo, "#6f8a4e"] as const;
const THEME: Record<PostcardWorld, CardTheme> = {
  qhapaq: { accent: DYE.ochre, band: KHIPU_BAND, dye: (id) => stationDye(id) },
  selva: { accent: DYE.ochre, band: KHIPU_BAND, dye: (id) => selvaStationDye(id) },
  // The coast's cords are its companies (their career dyes); the market is ochre like the mountain's extras.
  costa: { accent: "#e07a3c", band: COSTA_BAND, dye: (id) => stationDye(id) },
  titicaca: { accent: "#f0b43c", band: LAKE_BAND, dye: cycle(LAKE_BAND) },
  colca: { accent: "#d9a066", band: CANYON_BAND, dye: cycle(CANYON_BAND) },
  cusco: {
    accent: "#e8b631",
    band: [DYE.red, DYE.turq, "#4f86c4", DYE.indigo, DYE.ochre],
    dye: (id) => PAGE_DYE[id] ?? DYE.ochre,
  },
};
/** Download names: the road's name. */
const FILE: Record<PostcardWorld, string> = {
  qhapaq: "qhapaq-nan",
  selva: "antisuyu",
  cusco: "tawantinsuyu",
  costa: "chinchaysuyu",
  titicaca: "collasuyu",
  colca: "kuntisuyu",
};

/** The page's world for the postcard (`data-world` on the page; the Wasi and unknown ids → the mountain). */
const pageWorld = (): PostcardWorld => {
  const w = typeof document !== "undefined" ? document.documentElement.dataset.world : undefined;
  return POSTCARD_WORLDS.find((p) => p === w) ?? "qhapaq";
};

/** Heading, title, reached badge and share text of a card. */
function cardCopy(world: PostcardWorld, lang: Lang) {
  const c = COPY[lang];
  if (world === "qhapaq")
    return { heading: "KHIPU · Qhapaq Ñan", title: c.title, reached: c.reached, text: c.text as SuyuCardCopy["text"] };
  if (world === "selva") return SELVA_COPY[lang] as Pick<SuyuCardCopy, "heading" | "title" | "reached" | "text">;
  return SUYU_COPY[world][lang];
}

/** Draw `img` covering the box (centre crop). */
function cover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  let t = text;
  while (t.length > 3 && ctx.measureText(t).width > max) t = `${t.slice(0, -2)}…`;
  return t;
}

/** The route as a khipu: a primary cord with one pendant per station, knotted when stamped. */
function drawRoute(
  ctx: CanvasRenderingContext2D,
  s: JourneySummary,
  x: number,
  y: number,
  w: number,
  h: number,
  u: number,
) {
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, w, Math.max(3, u * 0.5));
  const n = s.route.length;
  const gap = w / n;
  const theme = THEME[s.world];
  s.route.forEach((r, i) => {
    const cx = x + gap * (i + 0.5);
    const len = h * (0.7 + ((i * 37) % 5) * 0.06);
    ctx.strokeStyle = r.stamped ? theme.dye(r.id, i) : "rgb(91 74 58 / 0.35)";
    ctx.lineWidth = Math.max(3, u * 0.55);
    ctx.lineCap = "round";
    ctx.setLineDash(r.stamped ? [] : [u * 0.8, u * 0.8]);
    ctx.beginPath();
    ctx.moveTo(cx, y + u * 0.4);
    ctx.lineTo(cx, y + len);
    ctx.stroke();
    ctx.setLineDash([]);
    if (r.stamped) {
      ctx.fillStyle = theme.dye(r.id, i);
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.ellipse(cx, y + len * (0.38 + k * 0.3), u * 0.85, u * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  if (s.reached) {
    // The summit sun at the end of the cord.
    const sx = x + w + u * 1.6;
    const sy = y + u * 0.2;
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(sx, sy, u * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = Math.max(2, u * 0.3);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a) * u * 1.5, sy + Math.sin(a) * u * 1.5);
      ctx.lineTo(sx + Math.cos(a) * u * 2.1, sy + Math.sin(a) * u * 2.1);
      ctx.stroke();
    }
  }
}

export async function composeJourneyCard(
  shot: HTMLCanvasElement,
  s: JourneySummary,
  o: { lang: Lang; traveler: string; format: CardFormat },
): Promise<HTMLCanvasElement> {
  const c = COPY[o.lang];
  const sc = SELVA_COPY[o.lang];
  const cc = cardCopy(s.world, o.lang);
  const theme = THEME[s.world];
  const f = fonts();
  try {
    await Promise.all([
      document.fonts?.load(`900 48px ${f.display}`),
      document.fonts?.load(`600 24px ${f.body}`),
      document.fonts?.load(`500 20px ${f.mono}`),
    ]);
  } catch {
    /* fallback fonts are fine */
  }
  const [W, H] = SIZE[o.format];
  const wide = o.format === "wide";
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d") as CanvasRenderingContext2D;
  const u = W / 100; // layout unit
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgb(168 130 95 / 0.06)";
  for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);

  const pad = wide ? u * 3.2 : u * 5;
  // Photo: top block (story) or left half (wide).
  const ph = wide
    ? { x: pad, y: pad, w: W * 0.5 - pad * 1.5, h: H - pad * 2 }
    : { x: pad, y: pad, w: W - pad * 2, h: H * 0.38 };
  cover(ctx, shot, ph.x, ph.y, ph.w, ph.h);
  const lw = Math.max(3, Math.round(W * 0.003));
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.strokeRect(ph.x, ph.y, ph.w, ph.h);
  ctx.strokeRect(lw / 2, lw / 2, W - lw, H - lw);
  // Badge on the photo.
  const badge = s.reached ? cc.reached : c.onWay;
  ctx.font = `800 ${Math.round(u * (wide ? 1.9 : 2.6))}px ${f.display}`;
  const bw = ctx.measureText(badge).width + u * 3;
  const bh = u * (wide ? 3.6 : 4.8);
  ctx.fillStyle = s.reached ? theme.accent : PAPER;
  ctx.fillRect(ph.x + u * 1.5, ph.y + u * 1.5, bw, bh);
  ctx.strokeRect(ph.x + u * 1.5, ph.y + u * 1.5, bw, bh);
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText(badge, ph.x + u * 3, ph.y + u * 1.5 + bh / 2);

  // Text column.
  const col = wide
    ? { x: W * 0.5 + pad * 0.5, y: pad, w: W * 0.5 - pad * 1.5 }
    : { x: pad, y: ph.y + ph.h + u * 4, w: W - pad * 2 };
  let y = col.y;
  ctx.textBaseline = "top";
  ctx.fillStyle = INK;
  let big = u * (wide ? 4 : 6.2);
  ctx.font = `900 ${big}px ${f.display}`;
  // Longer road names ("Chinchaysuyu", "Tawantinsuyu") shrink to the column instead of running off the card.
  const headW = ctx.measureText(cc.heading).width;
  if (headW > col.w) {
    big *= col.w / headW;
    ctx.font = `900 ${big}px ${f.display}`;
  }
  ctx.fillText(cc.heading, col.x, y);
  y += big * 1.12;
  if (o.traveler) {
    ctx.font = `700 ${u * (wide ? 2 : 2.8)}px ${f.body}`;
    ctx.fillStyle = SEPIA;
    ctx.fillText(fitText(ctx, `${c.traveler}: ${o.traveler}`, col.w), col.x, y);
    y += u * (wide ? 2.9 : 4);
  }
  // Route khipu.
  y += u * (wide ? 1 : 1.5);
  ctx.font = `600 ${u * (wide ? 1.4 : 1.9)}px ${f.mono}`;
  ctx.fillStyle = SEPIA;
  ctx.fillText(c.route.toUpperCase(), col.x, y);
  y += u * (wide ? 2.4 : 3.2);
  const routeH = wide ? u * 9 : u * 14;
  drawRoute(ctx, s, col.x, y, col.w - u * 4, routeH, wide ? u * 0.75 : u);
  y += routeH + u * (wide ? 2 : 3);

  // Stats: best | stamps, wildlife (full width, up to two lines), weather | llama.
  const j = s.journey;
  const time = j.bestMs ? formatDuration(j.bestMs, o.lang) : c.none;
  const lab = u * (wide ? 1.3 : 1.8);
  const val = u * (wide ? 1.9 : 2.7);
  const half = col.w / 2;
  /** One labelled value; returns the height used (wraps to `maxLines`). */
  const cell = (k: string, v: string, x: number, top: number, w: number, maxLines = 1) => {
    ctx.font = `600 ${lab}px ${f.mono}`;
    ctx.fillStyle = SEPIA;
    ctx.fillText(k.toUpperCase(), x, top);
    ctx.font = `700 ${val}px ${f.body}`;
    ctx.fillStyle = INK;
    const lines: string[] = [];
    let line = "";
    for (const word of v.split(" ")) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > w - u * 2) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, maxLines);
    if (lines.length > maxLines)
      shown[maxLines - 1] = fitText(ctx, `${shown[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`, w - u * 2);
    shown.forEach((l, i) => {
      ctx.fillText(l, x, top + lab * 1.45 + i * val * 1.18);
    });
    return lab * 1.45 + shown.length * val * 1.18;
  };
  const gapY = u * (wide ? 1.6 : 2.4);
  const best = j.climbs > 1 ? `${time} · ${j.climbs} ${c.climbs}` : time;
  const yesNo = (b: boolean) => (b ? c.yes : c.none);
  const ratio = (r: { got: number; total: number }) => `${r.got} / ${r.total}`;
  const k = CELL[o.lang];
  const stations = ratio({ got: s.route.filter((r) => r.stamped).length, total: s.route.length });
  const finds = s.finds.total ? { k: k.finds, v: ratio(s.finds) } : null;
  // Per world: the cell beside the stamps, then the row under the wildlife (one or two cells).
  // Mountain: climb clock, weather and llama. Jungle: canoe, canopy walkway and stations. Suyu roads: their ride
  // (when they have one), stations and bonus finds. Hub: pages complete, worlds visited and the best climb.
  type Cell = { k: string; v: string } | null;
  let first: Cell;
  let row: Cell[];
  if (s.world === "qhapaq") {
    first = { k: c.best, v: best };
    row = [
      { k: c.weather, v: s.weather.length ? s.weather.map((l) => l[o.lang]).join(", ") : c.none },
      { k: c.llama, v: yesNo(s.rodeLlama) },
    ];
  } else if (s.world === "selva") {
    first = { k: sc.canoe, v: yesNo(s.rodeCanoe) };
    row = [
      { k: sc.canopy, v: yesNo(s.canopy) },
      { k: sc.stations, v: stations },
    ];
  } else if (s.world === "cusco") {
    const p = s.pages ?? { done: 0, visited: 0, total: s.route.length };
    first = { k: k.pages, v: `${p.done} / ${p.total}` };
    row = [
      { k: k.visited, v: `${p.visited} / ${p.total}` },
      { k: c.best, v: best },
    ];
  } else {
    const ride = SUYU_COPY[s.world][o.lang].ride;
    first = ride ? { k: ride, v: yesNo(s.rode) } : { k: k.stations, v: stations };
    row = (ride ? [{ k: k.stations, v: stations }, finds] : [finds]).filter(Boolean);
  }
  y +=
    Math.max(
      first ? cell(first.k, first.v, col.x, y, half) : 0,
      cell(c.stamps, ratio(s.stamps), col.x + half, y, half),
    ) + gapY;
  y +=
    cell(c.wildlife, s.wildlife.length ? s.wildlife.map((l) => l[o.lang]).join(", ") : c.none, col.x, y, col.w, 2) +
    gapY;
  row.forEach((r, i) => {
    if (r) cell(r.k, r.v, col.x + half * i, y, half);
  });

  // Footer: dye band + invitation.
  const fy = H - pad - u * (wide ? 3 : 4);
  const dyes = theme.band;
  const seg = col.w / dyes.length;
  dyes.forEach((d, i) => {
    ctx.fillStyle = d;
    ctx.fillRect(col.x + i * seg, fy - u * 1.4, seg, Math.max(4, u * 0.5));
  });
  ctx.fillStyle = INK;
  ctx.font = `700 ${u * (wide ? 1.9 : 2.6)}px ${f.body}`;
  ctx.fillText(`${c.invite} →`, col.x, fy);
  const room = col.w - ctx.measureText(`${c.invite} →`).width - u * 2;
  ctx.textAlign = "right";
  // The link shrinks to the room beside the invitation (the suyu paths are longer than the mountain's).
  const url = worldUrl(o.lang, s.world);
  let urlPx = u * (wide ? 1.7 : 2.3);
  ctx.font = `600 ${urlPx}px ${f.mono}`;
  const urlW = ctx.measureText(url).width;
  if (urlW > room) {
    urlPx *= room / urlW;
    ctx.font = `600 ${urlPx}px ${f.mono}`;
  }
  ctx.fillText(url, col.x + col.w, fy + u * 0.2);
  ctx.textAlign = "left";
  return cv;
}

// ---------------------------------------------------------------- dialog

export interface JourneyDialog {
  open(): Promise<void>;
  isOpen(): boolean;
  dispose(): void;
}

export function createJourneyDialog(
  host: HTMLElement,
  lang: Lang,
  o: {
    capture: () => Promise<HTMLCanvasElement>;
    summary: () => JourneySummary;
    traveler: () => string;
    onOpenChange: (open: boolean) => void;
    /** The page's world; defaults to `document.documentElement.dataset.world` (unknown or "wasi" → mountain). */
    world?: PostcardWorld;
  },
): JourneyDialog {
  const world = o.world ?? pageWorld();
  const c = COPY[lang];
  const { title, heading, text } = cardCopy(world, lang);
  let url: string | null = null;
  let file: File | null = null;
  let shot: HTMLCanvasElement | null = null;
  let format: CardFormat = "story";
  const modal = createModal(host, "kw-journey-h", () => {
    if (url) URL.revokeObjectURL(url);
    url = null;
    file = null;
    shot = null;
    img.removeAttribute("src");
    o.onOpenChange(false);
  });
  modal.el.classList.add("kw-photo", "kw-journey");
  const h = document.createElement("h2");
  h.id = "kw-journey-h";
  h.className = "kw-modal-title";
  h.textContent = title;
  const tabs = document.createElement("div");
  tabs.className = "kw-journey-tabs";
  tabs.setAttribute("role", "group");
  const tab = (f: CardFormat, label: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "kw-btn kw-journey-tab";
    b.textContent = label;
    b.dataset.format = f;
    b.addEventListener("click", () => {
      if (format === f) return;
      format = f;
      void render();
    });
    return b;
  };
  tabs.append(tab("story", c.story), tab("wide", c.wide));
  const img = document.createElement("img");
  img.className = "kw-photo-img kw-journey-img";
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
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "kw-btn";
  copy.textContent = c.copy;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "kw-btn";
  close.textContent = c.close;
  row.append(dl, share, copy, close);
  modal.panel.append(h, tabs, img, row);

  const shareText = () => text(o.summary(), `https://${worldUrl(lang, world)}/`);
  close.addEventListener("click", () => modal.close());
  share.addEventListener("click", async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: heading, text: shareText() });
    } catch {
      /* cancelled or unsupported */
    }
  });
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareText());
      copy.textContent = c.copied;
      setTimeout(() => (copy.textContent = c.copy), 1600);
    } catch {
      /* clipboard blocked */
    }
  });

  const render = async () => {
    if (!shot) return;
    for (const b of tabs.querySelectorAll<HTMLButtonElement>("button"))
      b.setAttribute("aria-pressed", String(b.dataset.format === format));
    const card = await composeJourneyCard(shot, o.summary(), { lang, traveler: o.traveler(), format });
    const blob = await new Promise<Blob | null>((r) => card.toBlob(r, "image/png"));
    if (!blob) return;
    if (url) URL.revokeObjectURL(url);
    const name = `khipu-${FILE[world]}-${format}.png`;
    url = URL.createObjectURL(blob);
    file = new File([blob], name, { type: "image/png" });
    img.src = url;
    img.alt = `${title}. ${shareText()}`;
    dl.href = url;
    dl.download = name;
    share.hidden = !(typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }));
  };

  let busy = false;
  return {
    async open() {
      if (busy || modal.isOpen()) return;
      busy = true;
      try {
        host.classList.add("kw-shooting");
        shot = await o.capture();
        host.classList.remove("kw-shooting");
        await render();
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
