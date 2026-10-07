/**
 * Accessible text mode: the whole walk narrated station by station as plain HTML.
 * `renderTextMode` is pure (no DOM, no three.js) so world.astro renders it at build time for the
 * no-WebGL / no-JS fallback and the skip link; `createTextMode` shows the same document in a paper
 * dialog over the 3D world. `createOverlay` is the core's shared dialog helper (also used by map.ts):
 * capture-phase Esc, focus trap, focus restore and `world:modal` on open/close.
 * Styles: textmode.css (imported by index.ts and world.astro).
 *
 * Right after the trailhead it narrates the Wasi house (its four rooms: career by company, education and
 * resume, contact, the traveler's table) and the tinkuy crossroads with the Antisuyu branch to the punku,
 * which links to the jungle page. Besides the stations it narrates the wildlife you can meet (wildlife.ts:
 * where, when, what it does) and, in the in-world dialog only, the traveler's passport: stamps collected /
 * missing per world page and section, and the best
 * climb (journey.ts). The passport is read fresh on every open and kept live while open (`world:stamp`,
 * `world:climb`): items update in place and a polite live region announces new stamps.
 */
import { ARTIFACTS, CERTIFICATIONS, COMPANIES, type Company, EDUCATION } from "../data/career";
import { SITE, SOCIALS } from "../data/site";
import { fmtPeriod, t } from "../i18n/ui";
import { CATALOG, loadPassport, WORLD_PAGES, worldOf } from "../lib/passport";
import { aiPoints, artifactUses, hostOfEducation, stationsInOrder } from "./artifacts";
import type { Lang } from "./contract";
import type { WorldData } from "./data";
import { emit, on, type StampKind, type WorldId } from "./events";
import { formatDuration, loadJourney } from "./journey";
import { SELVA_STATIONS } from "./selva/contract";
import { worldUrl } from "./travel";
import { type Species, WILDLIFE } from "./wildlife";

const COPY = {
  es: {
    title: "Qhapaq Ñan · modo texto",
    lede: "El mismo recorrido del mundo 3D, contado en texto: cada tambo del camino es un capítulo de la carrera de Luis Diego, del valle a la cumbre.",
    toc: "Estaciones del camino",
    gate: "El camino empieza en el valle. Cada tambo de piedra guarda un khipu con los cargos, logros y tecnologías de una empresa; los nudos largos codifican métricas.",
    stack: "Tecnologías",
    knots: "Nudos (logros)",
    hostedEdu: "También cuelga aquí",
    arcadeLink: "Jugar en el arcade",
    contactPage: "Formulario de contacto",
    email: "Correo",
    socials: "Redes",
    workshop: "Taller: proyectos y escritos",
    workshopLede: "Los andenes en construcción del camino guardan lo que se está haciendo ahora.",
    repos: "Repositorios en GitHub",
    posts: "Artículos",
    none: "Sin datos en esta compilación.",
    stars: "estrellas",
    back: "Volver al sitio",
    close: "Cerrar modo texto",
    skip: "Saltar al modo texto",
    open: "Modo texto",
    wildlife: "Fauna del camino",
    wildlifeLede:
      "Animales que puedes encontrar en el camino, dónde viven, cuándo salen y qué hacen. Algunos dan un sello del pasaporte cuando los ves de cerca.",
    where: "Dónde",
    when: "Cuándo",
    does: "Qué hace",
    gives: "Da el sello",
    passport: "Tu pasaporte",
    passportLede:
      "Los sellos que llevas en este dispositivo, por página (una por mundo) y sección. Se actualiza mientras juegas.",
    got: "conseguido",
    missing: "falta",
    secret: "Sello secreto, aún sin descubrir",
    of: "de",
    stamps: "sellos",
    best: "Mejor subida (contrarreloj de la puerta a la cumbre)",
    noBest: "Aún no hay una subida completa cronometrada.",
    climbs: (n: number) => (n === 1 ? "1 subida" : `${n} subidas`),
    newStamp: "Nuevo sello",
    kinds: {
      station: "Estaciones",
      summit: "Cumbre",
      constellation: "Constelaciones",
      weather: "Clima",
      ride: "Paseos",
      egg: "Secretos",
      field: "Campos de datos",
      npc: "Encargos del chasqui",
      record: "Récords",
      festival: "Fiestas",
      fauna: "Fauna",
      room: "Habitaciones",
    } as Record<string, string>,
    wasi: "Wasi · la casa del camino",
    wasiLede:
      "Junto a la puerta del camino, al oeste del sendero y junto al punto de partida, está la wasi (casa) de Luis Diego, sobre una plataforma de piedra nivelada; un caminito de lajas lleva del sendero a unos escalones de piedra y a su puerta. Adentro hay cuatro espacios; abrir lo que muestra cada uno (tecla E) da un sello en la página Wasi del pasaporte. Puedes sentarte (tecla E) en el poyo de la sala, mirando el khipu de la pared, y en la silla del escritorio del estudio, frente a la laptop; al moverte, saltar o pulsar Esc te levantas.",
    salaLede: "La trayectoria empresa por empresa, de la más reciente a la primera, con sus cargos:",
    estudioLede: "Formación, certificaciones y el CV para llevar.",
    education: "Formación",
    certs: "Certificaciones",
    resumeEs: "CV en español (PDF)",
    resumeEn: "CV en inglés (PDF)",
    buzonLede: "Desde aquí salen los mensajes para Luis Diego:",
    mesaLede:
      "Sobre la mesa del viajero esperan tu pasaporte, con un sello por cada lugar descubierto en cada mundo, y la postal de tu viaje para compartir. El pasaporte se abre con la tecla P; la postal, con el botón «Mi postal» del pasaporte.",
    tinkuy: "Tinkuy · el cruce de caminos",
    tinkuyLede:
      "Donde el caminito de la Wasi llega al sendero, frente a la plaza de la puerta, se cruzan los caminos. Un poste señala los rumbos: el Qhapaq Ñan sube hacia la cumbre, la Wasi espera al otro lado del sendero y un camino de tierra baja hacia el Antisuyu.",
    antisuyuLede:
      "Desde el borde oriental de la plaza, el ramal del Antisuyu desciende hacia el sureste hasta un punku, una portada de piedra trapezoidal. Al cruzarla viajas a la selva: un camino casi llano por el bosque, junto a un gran río que se puede recorrer en canoa, con puentes colgantes en el dosel cerca del final.",
    selvaStops: "Paradas del camino de la selva",
    selvaLink: "Cruzar el punku: ir al camino del Antisuyu",
  },
  en: {
    title: "Qhapaq Ñan · text mode",
    lede: "The same walk as the 3D world, told in text: every tambo on the trail is a chapter of Luis Diego's career, from the valley to the summit.",
    toc: "Stations on the trail",
    gate: "The trail starts in the valley. Each stone tambo keeps a khipu with a company's roles, achievements and technologies; long knots encode metrics.",
    stack: "Technologies",
    knots: "Knots (achievements)",
    hostedEdu: "Also hanging here",
    arcadeLink: "Play in the arcade",
    contactPage: "Contact form",
    email: "Email",
    socials: "Socials",
    workshop: "Workshop: projects and writing",
    workshopLede: "The plots under construction along the trail hold what is being built now.",
    repos: "GitHub repositories",
    posts: "Articles",
    none: "No data in this build.",
    stars: "stars",
    back: "Back to site",
    close: "Close text mode",
    skip: "Skip to text mode",
    open: "Text mode",
    wildlife: "Wildlife on the trail",
    wildlifeLede:
      "Animals you can meet along the trail, where they live, when they are out and what they do. Some give a passport stamp when you get a good look.",
    where: "Where",
    when: "When",
    does: "What it does",
    gives: "Stamp",
    passport: "Your passport",
    passportLede: "The stamps you hold on this device, by page (one per world) and section. It updates while you play.",
    got: "collected",
    missing: "missing",
    secret: "Secret stamp, not found yet",
    of: "of",
    stamps: "stamps",
    best: "Best climb (time trial from the gate to the summit)",
    noBest: "No timed climb completed yet.",
    climbs: (n: number) => (n === 1 ? "1 climb" : `${n} climbs`),
    newStamp: "New stamp",
    kinds: {
      station: "Stations",
      summit: "Summit",
      constellation: "Constellations",
      weather: "Weather",
      ride: "Rides",
      egg: "Secrets",
      field: "Data fields",
      npc: "Chasqui errands",
      record: "Records",
      festival: "Festivals",
      fauna: "Wildlife",
      room: "Rooms",
    } as Record<string, string>,
    wasi: "Wasi · the house on the road",
    wasiLede:
      "By the trailhead gate, west of the path and next to the starting point, stands Luis Diego's wasi (house), on a levelled stone platform; a short flagstone walk leads from the path up a few stone steps to its door. Inside there are four rooms; opening what each one shows (E key) adds a stamp to the Wasi page of the passport. You can sit down (E key) on the sala's adobe bench, facing the wall khipu, and on the chair at the study's desk, in front of the laptop; moving, jumping or pressing Esc stands you up.",
    salaLede: "The career company by company, most recent first, with its roles:",
    estudioLede: "Education, certifications and the resume to take with you.",
    education: "Education",
    certs: "Certifications",
    resumeEs: "Resume in Spanish (PDF)",
    resumeEn: "Resume in English (PDF)",
    buzonLede: "Messages for Luis Diego leave from here:",
    mesaLede:
      "On the traveler's table wait your passport, with a stamp for every place found in every world, and your journey postcard to share. Open the passport with the P key; the postcard with the passport's \"My postcard\" button.",
    tinkuy: "Tinkuy · the crossroads",
    tinkuyLede:
      "Where the Wasi's walk meets the path, across from the gate plaza, the roads meet. A signpost points the ways: the Qhapaq Ñan climbs to the summit, the Wasi waits across the path and a dirt road goes down toward the Antisuyu.",
    antisuyuLede:
      "From the east edge of the plaza, the Antisuyu branch goes down to the south-east to a punku, a trapezoidal stone doorway. Crossing it takes you to the jungle: a mostly flat road through the forest beside a wide river you can travel by canoe, with hanging bridges in the canopy near the end.",
    selvaStops: "Stops on the jungle road",
    selvaLink: "Cross the punku: go to the Antisuyu road",
  },
} as const;

export const textModeCopy = (lang: Lang) => COPY[lang];

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** HTML-escapes text and attribute values. */
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c] ?? c);
const safeHref = (u: string) => (/^(https?:|mailto:|\/)/i.test(u) ? esc(u) : "#");
const link = (href: string, text: string, external = false) =>
  `<a href="${safeHref(href)}"${external ? ' target="_blank" rel="noopener"' : ""}>${esc(text)}</a>`;

/** Element id prefix for station sections (stable: map + skip link can point at them). */
export const textModeId = (id: string, prefix = "kw-tm-") => `${prefix}${id.replace(/[^a-z0-9-]/gi, "")}`;

function companyHtml(c: Company, lang: Lang, level: number): string {
  const cp = COPY[lang];
  const h = `h${level}`;
  const stages = [...c.stages].sort((a, b) => b.start.localeCompare(a.start));
  return stages
    .map((s) => {
      const knots = s.knots.length
        ? `<p class="kw-tm-label">${esc(cp.knots)}</p><ul>${s.knots.map((k) => `<li>${esc(k.text[lang])}</li>`).join("")}</ul>`
        : "";
      const stack = s.stack?.length ? `<p><strong>${esc(cp.stack)}:</strong> ${esc(s.stack.join(", "))}</p>` : "";
      return `<${h}>${esc(s.role[lang])}${c.education ? ` · ${esc(c.name)}` : ""}</${h}>
<p class="kw-tm-meta">${esc(fmtPeriod(lang, s.start, s.end))} · ${esc(s.place[lang])}</p>
<p>${esc(s.summary[lang])}</p>${knots}${stack}`;
    })
    .join("\n");
}

/** The field guide (wildlife.ts) as headings + definition lists. */
export function renderWildlife(lang: Lang, level: number, list: ReadonlyArray<Species> = WILDLIFE): string {
  const cp = COPY[lang];
  const label = (id: string) => CATALOG.find((x) => x.id === id)?.label[lang] ?? id;
  return list
    .map(
      (w) => `<h${level}>${esc(w.name[lang])} <span class="kw-tm-latin" lang="la">${esc(w.latin)}</span></h${level}>
<dl class="kw-tm-facts"><dt>${esc(cp.where)}</dt><dd>${esc(w.where[lang])}</dd><dt>${esc(cp.when)}</dt><dd>${esc(w.when[lang])}</dd><dt>${esc(cp.does)}</dt><dd>${esc(w.does[lang])}</dd>${
        w.stamp ? `<dt>${esc(cp.gives)}</dt><dd>${esc(label(w.stamp))}</dd>` : ""
      }</dl>`,
    )
    .join("\n");
}

/** Secret finds keep their names hidden until found (same rule as the passport panel). */
const isSecret = (kind: StampKind) => kind === "egg" || kind === "fauna";

/** One passport line: the label (or "secret"), and its state for screen readers. */
export function passportItem(lang: Lang, id: string, got: boolean): string {
  const cp = COPY[lang];
  const st = CATALOG.find((x) => x.id === id);
  if (!st) return "";
  const name = got || !isSecret(st.kind) ? st.label[lang] : cp.secret;
  return `<span class="kw-tm-mark" aria-hidden="true">${got ? "✓" : "·"}</span> ${esc(name)} <span class="kw-tm-state">(${esc(got ? cp.got : cp.missing)})</span>`;
}

/** Stamp-kind groups of one world page, in catalog order. */
const pageGroups = (world: WorldId) => {
  const list = CATALOG.filter((x) => worldOf(x) === world);
  const kinds: StampKind[] = [];
  for (const st of list) if (!kinds.includes(st.kind)) kinds.push(st.kind);
  return { list, groups: kinds.map((kind) => ({ kind, list: list.filter((x) => x.kind === kind) })) };
};

/**
 * The passport, one part per world page (WORLD_PAGES) and inside it one group per stamp kind, in catalog
 * order: counts, collected / missing items, best climb. Pages are headings at `level`, groups one below.
 */
export function renderPassport(
  lang: Lang,
  stamps: Readonly<Record<string, unknown>>,
  journey: { bestMs: number | null; climbs: number },
  level: number,
): string {
  const cp = COPY[lang];
  const has = (id: string) => typeof stamps[id] === "number";
  const count = (list: ReadonlyArray<{ id: string }>) =>
    `<span class="kw-tm-count">${list.filter((x) => has(x.id)).length} ${esc(cp.of)} ${list.length}</span>`;
  const total = CATALOG.length;
  const got = CATALOG.filter((x) => has(x.id)).length;
  const pages = WORLD_PAGES.map((page) => {
    const { list, groups } = pageGroups(page.id);
    const body = groups
      .map(({ kind, list: items }) => {
        const lis = items
          .map(
            (x) =>
              `<li data-stamp="${esc(x.id)}" class="${has(x.id) ? "is-got" : "is-missing"}">${passportItem(lang, x.id, has(x.id))}</li>`,
          )
          .join("");
        return `<h${level + 1} data-group="${esc(`${page.id}:${kind}`)}">${esc(cp.kinds[kind] ?? kind)} ${count(items)}</h${level + 1}><ul class="kw-tm-stamps">${lis}</ul>`;
      })
      .join("\n");
    return `<h${level} data-page="${esc(page.id)}">${esc(page.label[lang])} ${count(list)}</h${level}>\n${body}`;
  }).join("\n");
  const best = journey.bestMs
    ? `${esc(formatDuration(journey.bestMs, lang))} · ${esc(cp.climbs(journey.climbs))}`
    : esc(cp.noBest);
  return `<p>${esc(cp.passportLede)}</p>
<p class="kw-tm-summary"><strong class="kw-tm-total">${got} ${esc(cp.of)} ${total}</strong> ${esc(cp.stamps)}</p>
<p><strong>${esc(cp.best)}:</strong> <span class="kw-tm-best">${best}</span></p>
${pages}`;
}

/** Room heading: the passport label of that Wasi room (single source of the room names). */
const roomLabel = (lang: Lang, room: string) => CATALOG.find((x) => x.id === `wasi:${room}`)?.label[lang] ?? room;

/** The Wasi house at the trailhead: exterior, then its four rooms and what each one shows. */
function wasiHtml(lang: Lang, h3: number): string {
  const cp = COPY[lang];
  const L = (k: Parameters<typeof t>[1]) => t(lang, k);
  const h = `h${h3}`;
  const h4 = `h${Math.min(6, h3 + 1)}`;
  const latest = (c: Company) => c.stages.reduce((m, s) => (s.start > m ? s.start : m), "");
  const companies = COMPANIES.filter((c) => !c.education).sort((a, b) => latest(b).localeCompare(latest(a)));
  const sala = companies
    .map((c) => {
      const stages = [...c.stages].sort((a, b) => b.start.localeCompare(a.start));
      const first = stages[stages.length - 1]?.start ?? "";
      const open = stages.some((s) => !s.end);
      const last = open ? undefined : stages.reduce((m, s) => ((s.end ?? "") > m ? (s.end ?? "") : m), "");
      const roles = stages
        .map((s) => `<li>${esc(s.role[lang])} · ${esc(fmtPeriod(lang, s.start, s.end))}</li>`)
        .join("");
      return `<${h4}>${esc(c.name)}</${h4}><p class="kw-tm-meta">${esc(fmtPeriod(lang, first, last))}</p><ul>${roles}</ul>`;
    })
    .join("\n");
  const edu = EDUCATION.map((e) => `<li>${esc(e.title[lang])} · ${esc(e.school)} · ${esc(e.years)}</li>`).join("");
  const certs = CERTIFICATIONS.map((c) => `<li>${esc(c.name)} · ${esc(c.years)}</li>`).join("");
  const soc = SOCIALS.filter((x) => !x.url.startsWith("mailto:"))
    .map((x) => `<li>${link(x.url, x.name, true)}</li>`)
    .join("");
  return `<p>${esc(cp.wasiLede)}</p>
<${h}>${esc(roomLabel(lang, "sala"))}</${h}><p>${esc(cp.salaLede)}</p>${sala}
<${h}>${esc(roomLabel(lang, "estudio"))}</${h}><p>${esc(cp.estudioLede)}</p><p class="kw-tm-label">${esc(cp.education)}</p><ul>${edu}</ul><p class="kw-tm-label">${esc(cp.certs)}</p><ul>${certs}</ul>
<ul class="kw-tm-links"><li>${link(SITE.resume.es, cp.resumeEs)}</li><li>${link(SITE.resume.en, cp.resumeEn)}</li></ul>
<${h}>${esc(roomLabel(lang, "buzon"))}</${h}><p>${esc(cp.buzonLede)}</p>
<ul class="kw-tm-links">
<li>${esc(cp.email)}: ${link(`mailto:${SITE.email}`, SITE.email)}</li>
<li>${link(SITE.calendly, L("qn.contact.book"), true)}</li>
<li>${link(`/${lang}/#contact`, cp.contactPage)}</li>
</ul>
<p class="kw-tm-label">${esc(cp.socials)}</p><ul class="kw-tm-links">${soc}</ul>
<${h}>${esc(roomLabel(lang, "mesa"))}</${h}><p>${esc(cp.mesaLede)}</p>`;
}

/** The tinkuy signpost and the Antisuyu branch to the punku, with a plain link to the jungle page. */
function tinkuyHtml(lang: Lang, h3: number): string {
  const cp = COPY[lang];
  const stops = SELVA_STATIONS.map((s) => `<li>${esc(s.label[lang])}</li>`).join("");
  return `<p>${esc(cp.tinkuyLede)}</p><p>${esc(cp.antisuyuLede)}</p>
<p><a class="kw-tm-travel" href="${esc(worldUrl(lang, "selva"))}">${esc(cp.selvaLink)}</a></p>
<h${h3}>${esc(cp.selvaStops)}</h${h3}><ol>${stops}</ol>`;
}

/** The full narration as an HTML string (escaped). `headingLevel` is the level of the document title. */
export function renderTextMode(
  lang: Lang,
  data: WorldData,
  opts: {
    headingLevel?: 1 | 2;
    titleId?: string;
    idPrefix?: string;
    /** Adds an (empty) passport section first; the in-world dialog fills it from the traveler's storage. */
    passport?: boolean;
  } = {},
): string {
  const cp = COPY[lang];
  const L = (k: Parameters<typeof t>[1]) => t(lang, k);
  const h1 = opts.headingLevel ?? 2;
  const h2 = h1 + 1;
  const h3 = h1 + 2;
  const stations = stationsInOrder().filter((s) => s.kind !== "build");
  const edu = COMPANIES.filter((c) => c.education);
  const sections: string[] = [];
  const toc: string[] = [];
  let n = 0;
  const section = (id: string, title: string, body: string) => {
    n++;
    const sid = textModeId(id, opts.idPrefix);
    toc.push(`<li><a href="#${sid}">${esc(title)}</a></li>`);
    sections.push(
      `<section class="kw-tm-station" id="${sid}" aria-labelledby="${sid}-h"><h${h2} id="${sid}-h"><span class="kw-tm-n">${n}.</span> ${esc(title)}</h${h2}>\n${body}</section>`,
    );
  };

  if (opts.passport) section("passport", cp.passport, `<div class="kw-tm-passport"></div>`);
  for (const s of stations) {
    const label = s.label[lang];
    if (s.kind === "gate") {
      section(s.id, label, `<p>${esc(cp.gate)}</p><p>${esc(L("qn.gate.next"))}</p>`);
      // The trailhead is also the crossroads: the Wasi house and the road to the other worlds.
      section("wasi", cp.wasi, wasiHtml(lang, h3));
      section("tinkuy", cp.tinkuy, tinkuyHtml(lang, h3));
    } else if (s.kind === "company") {
      const c = COMPANIES.find((x) => x.id === s.companyId);
      if (!c) continue;
      let body = companyHtml(c, lang, h3);
      const hosted = edu.filter((e) => hostOfEducation(e) === c.id);
      if (hosted.length)
        body += `<p class="kw-tm-label">${esc(cp.hostedEdu)} · ${esc(L("qn.education"))}</p>${hosted.map((e) => companyHtml(e, lang, h3)).join("\n")}`;
      section(s.id, label, body);
    } else if (s.kind === "bridge") {
      const body = ARTIFACTS.map((a) => {
        const uses = artifactUses(a)
          .map((u) => `<li>${esc(u.company)} · ${esc(u.year)}: ${esc(u.text[lang])}</li>`)
          .join("");
        return `<h${h3}>${esc(a.name[lang])}</h${h3}><p class="kw-tm-meta">${esc(a.tech)}</p><p>${esc(a.summary[lang])}</p>${uses ? `<ul>${uses}</ul>` : ""}`;
      }).join("\n");
      section(s.id, label, `<p>${esc(L("qn.bridge.lede"))}</p>${body}`);
    } else if (s.kind === "arcade") {
      section(s.id, label, `<p>${esc(L("qn.arcade.lede"))}</p><p>${link(`/${lang}/arcade/`, cp.arcadeLink)}</p>`);
    } else if (s.kind === "ai") {
      const pts = aiPoints()
        .map((p) => `<li>${esc(p.where)}: ${esc(p.text[lang])}</li>`)
        .join("");
      section(s.id, label, `<p>${esc(L("qn.ai.lede"))}</p>${pts ? `<ul>${pts}</ul>` : ""}`);
    } else if (s.kind === "contact") {
      const soc = SOCIALS.filter((x) => !x.url.startsWith("mailto:"))
        .map((x) => `<li>${link(x.url, x.name, true)}</li>`)
        .join("");
      section(
        s.id,
        label,
        `<p>${esc(L("qn.contact.lede"))}</p>
<ul class="kw-tm-links">
<li>${link(SITE.calendly, L("qn.contact.book"), true)}</li>
<li>${esc(cp.email)}: ${link(`mailto:${SITE.email}`, SITE.email)}</li>
<li>${link(`/${lang}/#contact`, cp.contactPage)}</li>
<li>${link(SITE.resume[lang], L("qn.contact.resume"))}</li>
</ul>
<p class="kw-tm-label">${esc(cp.socials)}</p><ul class="kw-tm-links">${soc}</ul>`,
      );
    }
  }

  const repos = data.repos.length
    ? `<ul>${data.repos
        .map(
          (r) =>
            `<li>${link(r.url, r.name, true)}${r.language ? ` · ${esc(r.language)}` : ""} · ${esc(r.stars)} ${esc(cp.stars)}${r.description ? `<br>${esc(r.description)}` : ""}</li>`,
        )
        .join("")}</ul>`
    : `<p>${esc(cp.none)}</p>`;
  const posts = data.posts.length
    ? `<ul>${data.posts
        .map((p) => {
          const date = p.date.slice(0, 10);
          return `<li>${link(p.href, p.title, p.source === "medium")} · <time datetime="${esc(date)}">${esc(date)}</time>${p.description ? `<br>${esc(p.description)}` : ""}</li>`;
        })
        .join("")}</ul>`
    : `<p>${esc(cp.none)}</p>`;
  section("wildlife", cp.wildlife, `<p>${esc(cp.wildlifeLede)}</p>${renderWildlife(lang, h3)}`);
  section(
    "workshop",
    cp.workshop,
    `<p>${esc(cp.workshopLede)}</p><h${h3}>${esc(cp.repos)}</h${h3}>${repos}<h${h3}>${esc(cp.posts)}</h${h3}>${posts}`,
  );
  section(
    "summit",
    L("qn.summit.label"),
    `<p>${esc(L("qn.summit.lede"))}</p><ul class="kw-tm-links"><li>${link(SITE.calendly, L("qn.contact.book"), true)}</li><li>${link(`/${lang}/`, cp.back)}</li></ul>`,
  );

  const tid = opts.titleId ?? "kw-tm-title";
  return `<header class="kw-tm-head"><h${h1} id="${tid}" class="kw-tm-title">${esc(cp.title)}</h${h1}>
<p class="kw-tm-lede">${esc(cp.lede)}</p>
<nav class="kw-tm-toc" aria-label="${esc(cp.toc)}"><ol>${toc.join("")}</ol></nav></header>
${sections.join("\n")}`;
}

// ---------------------------------------------------------------- shared core dialog helper

export interface Overlay {
  root: HTMLElement;
  panel: HTMLElement;
  open(focus?: HTMLElement | null): void;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

/**
 * Full-screen paper dialog: role="dialog" + aria-modal, focus trap, Esc (capture phase, so the world
 * never sees it), focus restore, and `world:modal` on open/close. `onKey` sees every other key first
 * (return true to consume it); remaining keys are kept from reaching the world.
 */
export function createOverlay(
  host: HTMLElement,
  o: { className: string; labelledBy: string; onClose?(): void; onKey?(e: KeyboardEvent): boolean },
): Overlay {
  const root = document.createElement("div");
  root.className = `kw-ov ${o.className}`;
  root.hidden = true;
  const panel = document.createElement("div");
  panel.className = "kw-ov-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", o.labelledBy);
  root.append(panel);
  host.append(root);
  let open = false;
  let restore: HTMLElement | null = null;
  const focusables = () =>
    [
      ...panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((n) => !n.hidden && n.offsetParent !== null);
  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      ov.close();
      return;
    }
    if (o.onKey?.(e)) {
      e.stopImmediatePropagation();
      return;
    }
    if (e.key === "Tab") {
      const f = focusables();
      const first = f[0];
      const last = f[f.length - 1];
      if (first && last) {
        if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    // World keys (WASD, E, M, T…) must not reach the game while a dialog is up.
    e.stopImmediatePropagation();
  };
  const onBackdrop = (e: MouseEvent) => {
    if (e.target === root) ov.close();
  };
  const stop = (e: Event) => e.stopPropagation();
  window.addEventListener("keydown", onKeyDown, true);
  root.addEventListener("click", onBackdrop);
  root.addEventListener("pointerdown", stop);
  root.addEventListener("wheel", stop, { passive: true });
  const ov: Overlay = {
    root,
    panel,
    open(focus) {
      if (open) return;
      open = true;
      restore = document.activeElement as HTMLElement | null;
      root.hidden = false;
      emit("world:modal", { open: true });
      requestAnimationFrame(() => (focus ?? focusables()[0] ?? panel)?.focus({ preventScroll: true }));
    },
    close() {
      if (!open) return;
      open = false;
      root.hidden = true;
      emit("world:modal", { open: false });
      o.onClose?.();
      if (restore?.isConnected) restore.focus({ preventScroll: true });
    },
    isOpen: () => open,
    dispose() {
      ov.close();
      window.removeEventListener("keydown", onKeyDown, true);
      root.removeEventListener("click", onBackdrop);
      root.removeEventListener("pointerdown", stop);
      root.removeEventListener("wheel", stop);
      root.remove();
    },
  };
  return ov;
}

/** Moves focus to the previous/next focusable inside the open dialog (gamepad d-pad). */
export function focusStep(container: HTMLElement, dir: -1 | 1) {
  const f = [
    ...container.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  ].filter((n) => !n.hidden && n.offsetParent !== null);
  if (!f.length) return;
  const i = f.indexOf(document.activeElement as HTMLElement);
  const next = f[i < 0 ? 0 : (i + dir + f.length) % f.length];
  next?.focus();
  next?.scrollIntoView?.({ block: "nearest" });
}

// ---------------------------------------------------------------- overlay

export interface TextMode {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  /** The dialog panel (gamepad focus stepping). */
  panel: HTMLElement;
  dispose(): void;
}

export function createTextMode(host: HTMLElement, lang: Lang, data: WorldData): TextMode {
  const cp = COPY[lang];
  const ov = createOverlay(host, { className: "kw-tm", labelledBy: "kw-tm-ov-title" });
  ov.panel.lang = lang;
  ov.panel.tabIndex = -1;
  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    const bar = document.createElement("div");
    bar.className = "kw-tm-bar";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "kw-btn";
    close.innerHTML = `<kbd>Esc</kbd> <span>${esc(cp.close)}</span>`;
    close.addEventListener("click", () => ov.close());
    bar.append(close);
    const doc = document.createElement("article");
    doc.className = "kw-textdoc";
    doc.innerHTML = renderTextMode(lang, data, {
      headingLevel: 2,
      titleId: "kw-tm-ov-title",
      idPrefix: "kw-tmo-",
      passport: true,
    });
    passportBox = doc.querySelector<HTMLElement>(".kw-tm-passport");
    live = document.createElement("p");
    live.className = "kw-tm-live";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    // In-dialog table of contents: scroll inside the panel instead of changing the URL hash.
    doc.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!a) return;
      const target = doc.querySelector<HTMLElement>(a.getAttribute("href") ?? "");
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ block: "start" });
      target.querySelector<HTMLElement>("h2, h3")?.setAttribute("tabindex", "-1");
      target.querySelector<HTMLElement>("h2, h3")?.focus({ preventScroll: true });
    });
    ov.panel.append(bar, doc, live);
  };
  // ---- passport: fresh from storage on open, then patched in place while open
  let passportBox: HTMLElement | null = null;
  let live: HTMLElement | null = null;
  const stamps: Record<string, number> = {};
  const refreshPassport = () => {
    if (!passportBox) return;
    for (const k of Object.keys(stamps)) delete stamps[k];
    Object.assign(stamps, loadPassport().stamps);
    passportBox.innerHTML = renderPassport(lang, stamps, loadJourney(), 4);
  };
  const markStamp = (id: string) => {
    if (!passportBox || typeof stamps[id] === "number") return;
    const st = CATALOG.find((x) => x.id === id);
    if (!st) return;
    stamps[id] = Date.now();
    const li = passportBox.querySelector<HTMLElement>(`li[data-stamp="${CSS.escape(id)}"]`);
    if (li) {
      li.className = "is-got";
      li.innerHTML = passportItem(lang, id, true);
    }
    const world = worldOf(st);
    const counted = (list: ReadonlyArray<{ id: string }>) =>
      `${list.filter((x) => typeof stamps[x.id] === "number").length} ${cp.of} ${list.length}`;
    const { list, groups } = pageGroups(world);
    const group = groups.find((g) => g.kind === st.kind);
    const groupCount = passportBox.querySelector<HTMLElement>(
      `[data-group="${CSS.escape(`${world}:${st.kind}`)}"] .kw-tm-count`,
    );
    if (groupCount && group) groupCount.textContent = counted(group.list);
    const pageCount = passportBox.querySelector<HTMLElement>(`[data-page="${CSS.escape(world)}"] .kw-tm-count`);
    if (pageCount) pageCount.textContent = counted(list);
    const total = passportBox.querySelector<HTMLElement>(".kw-tm-total");
    if (total)
      total.textContent = `${CATALOG.filter((x) => typeof stamps[x.id] === "number").length} ${cp.of} ${CATALOG.length}`;
    if (live && ov.isOpen()) live.textContent = `${cp.newStamp}: ${st.label[lang]}`;
  };
  const offs = [
    on("world:stamp", (d) => {
      if (d?.id) markStamp(d.id);
    }),
    on("world:climb", (d) => {
      if (d?.phase !== "done" || !passportBox) return;
      // journey.ts saves the record before announcing it.
      const best = passportBox.querySelector<HTMLElement>(".kw-tm-best");
      const j = loadJourney();
      if (best && j.bestMs) best.textContent = `${formatDuration(j.bestMs, lang)} · ${cp.climbs(j.climbs)}`;
    }),
  ];
  return {
    panel: ov.panel,
    open() {
      build();
      refreshPassport();
      if (live) live.textContent = "";
      ov.open(ov.panel.querySelector<HTMLElement>(".kw-tm-bar .kw-btn"));
    },
    close: () => ov.close(),
    toggle() {
      if (ov.isOpen()) ov.close();
      else this.open();
    },
    isOpen: () => ov.isOpen(),
    dispose() {
      for (const off of offs) off();
      ov.dispose();
    },
  };
}
