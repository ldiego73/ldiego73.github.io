/**
 * Accessible text mode of the Antisuyu jungle: the whole road narrated stop by stop as plain HTML, from the
 * punku to the collpa, with the same content the 3D stations show. `renderSelvaTextMode` is pure (no DOM, no
 * three.js) so the page renders it at build time as the no-WebGL / failed-load fallback; `createSelvaTextMode`
 * shows the same document as the world's paper dialog (K, the "Text mode" chip, `world:textmode`), reusing the
 * mountain's overlay helper (focus trap, Esc, world:modal).
 *
 * Sources (keep it truthful, never invent): the trader's wares from src/data/uses.ts + career.ts SKILLS
 * (ambient/regaton/logic.ts), the maloca's bark cloths from the page's posts (ambient/maloca/logic.ts), the
 * stilt houses from career.ts ARTIFACTS + the page's repos (ambient/palafitos/logic.ts), the raft's cabinets
 * from games/registry.ts (ambient/arcade/logic.ts), stamp names from lib/passport.ts CATALOG. It describes
 * only what the jungle world does: the canoe between the embarcadero and the palafitos, the canopy walkway
 * between ceibas, the clay lick at the end of the road and the punku back to the mountain.
 */
import { GAMES } from "../../games/registry";
import { CATALOG } from "../../lib/passport";
import type { Lang } from "../contract";
import type { WorldData } from "../data";
import { createOverlay, esc, renderWildlife, type TextMode } from "../textmode";
import { raftGames } from "./ambient/arcade/logic";
import { cloths, MAX_CLOTHS } from "./ambient/maloca/logic";
import { projects } from "./ambient/palafitos/logic";
import { runs, stalls } from "./ambient/regaton/logic";
import { SELVA_STATIONS } from "./contract";
import { SELVA_WILDLIFE } from "./wildlife";

const COPY = {
  es: {
    title: "Antisuyu · el camino de la selva",
    lede: "Un camino llano por la selva baja, de oeste a este, junto a un río ancho y marrón. Llegas por un punku de piedra desde el Qhapaq Ñan; las paradas del camino se levantan a ambos lados, y al final el camino sube a los puentes del dosel y termina frente a una collpa de guacamayos.",
    toc: "Paradas del camino",
    stations: "Paradas del camino",
    back: "Volver al Qhapaq Ñan",
    backHint: "El punku de piedra al inicio del camino te devuelve a la montaña.",
    close: "Cerrar",
    skip: "Saltar al modo texto",
    stamp: "Sello del pasaporte",
    gate: "Cruzas un punku de piedra, una portada inca trapezoidal con musgo, y entras a la selva. Detrás de ti, el mismo punku te devuelve al Qhapaq Ñan.",
    regaton:
      "Un bote de regatón, el comerciante del río: una canoa larga de motor peque-peque con cabina techada de irapay, amarrada a un muelle. En el muelle extiende su mercancía en puestos: las herramientas con las que trabajo, agrupadas como en la página «Lo que uso». Cada puesto abre su lista.",
    usesLink: "Ver «Lo que uso»",
    maloca: (n: number) =>
      `Una maloca redonda, la casa comunal, con techo cónico de hojas de palma, bancas alrededor de un fogón y, colgadas en la pared, telas de corteza (llanchama) pintadas: una por artículo, las ${n} más recientes primero. Las de rojo achiote son del blog del sitio; las de negro huito, de Medium.`,
    noPosts: "Esta vez no llegaron los artículos, así que las paredes están desnudas.",
    site: "blog del sitio",
    medium: "Medium",
    blogLink: "Ver el blog",
    embarcadero:
      "Un muelle de madera y una escalera que baja por la barranca hasta un embarcadero flotante de balsa, donde espera una canoa tallada de un solo tronco con su remo. En el embarcadero, «E · Subir a la canoa» te sienta en ella y la canoa baja sola por el río, remando a ritmo tranquilo, hasta el muelle de los palafitos. Adelante (W o el joystick) rema más rápido y atrás (S) más despacio; solo puedes bajar en los muelles. Desde los palafitos puedes hacer el viaje de vuelta.",
    palafitos:
      "Una hilera de casas sobre pilotes en la orilla, unidas por pasarelas de tablas, con el muelle de la canoa en el medio. Cada casa es un proyecto de la página de proyectos y lleva un letrero tallado: primero los casos de estudio, luego los repositorios de GitHub con más estrellas.",
    cases: "Casos de estudio",
    repos: "Repositorios en GitHub",
    noRepos: "Esta vez no llegaron los repositorios de GitHub.",
    stars: "estrellas",
    noDesc: "Sin descripción.",
    projectsLink: "Ver proyectos",
    arcade:
      "Una casa flotante sobre troncos de balsa, en una cocha junto al camino, con techo de palma y gabinetes de arcade. En cada gabinete, «E · Jugar» abre el juego real ahí mismo, igual que en el tambo arcade de la montaña.",
    arcadeLink: "Abrir el arcade",
    dosel:
      "Pasado el arcade, el camino deja el suelo y sube a una pasarela de puentes colgantes entre ceibas, a la altura del dosel. Cruzarla entera, de un extremo al otro sin bajarte, da un sello.",
    doselTitle: "Puentes del dosel",
    collpa:
      "El fin del camino: un mirador de madera con una banca, frente a una collpa al otro lado del río, un barranco de arcilla rojiza donde los guacamayos vienen a comer la tierra.",
    collpaSign: "Fin del camino — vuelve por el punku o en canoa.",
    wildlife: "Fauna de la selva",
    backTitle: "De vuelta a la montaña",
    map: "El mapa de papel se abre con M (o el botón Y del mando). El viaje rápido entre paradas se desbloquea al llegar a la collpa, al final del camino.",
  },
  en: {
    title: "Antisuyu · the jungle road",
    lede: "A flat road through the lowland forest, west to east, beside a wide brown river. You arrive through a stone punku from the Qhapaq Ñan; the stops of the road stand on either side, and at the end the road climbs onto the canopy bridges and ends facing a macaw clay lick.",
    toc: "Stops along the road",
    stations: "Stops along the road",
    back: "Back to the Qhapaq Ñan",
    backHint: "The stone punku at the start of the road takes you back to the mountain.",
    close: "Close",
    skip: "Skip to text mode",
    stamp: "Passport stamp",
    gate: "You walk through a stone punku, a mossy trapezoidal Inca doorway, into the jungle. Behind you, the same punku takes you back to the Qhapaq Ñan.",
    regaton:
      "A regatón's boat, the river trader: a long peke-peke motor canoe with a palm-thatched cabin, moored at a dock. On the dock his wares are laid out on stalls: the tools I work with, grouped as on the “Uses” page. Each stall opens its list.",
    usesLink: "See “Uses”",
    maloca: (n: number) =>
      `A round maloca, the communal house, with a conical palm-thatched roof, benches around a fire and, hanging on the wall, painted bark cloths (llanchama): one per article, the ${n} newest first. The achiote-red ones are from the site's blog; the huito-black ones, from Medium.`,
    noPosts: "The articles didn't arrive this time, so the walls are bare.",
    site: "site blog",
    medium: "Medium",
    blogLink: "Read the blog",
    embarcadero:
      "A wooden pier and a stair down the bank to a floating balsa jetty, where a dugout canoe carved from a single trunk waits with its paddle. On the jetty, “E · Board the canoe” seats you in it and the canoe goes down the river on its own, paddling at an easy pace, to the stilt houses' dock. Forward (W or the joystick) paddles faster and back (S) slower; you can only get off at the docks. From the stilt houses you can make the trip back.",
    palafitos:
      "A row of stilt houses on the riverbank, joined by plank boardwalks, with the canoe dock in the middle. Each house is a project from the projects page and has a carved sign: the case studies first, then the most-starred GitHub repositories.",
    cases: "Case studies",
    repos: "GitHub repositories",
    noRepos: "The GitHub repositories didn't arrive this time.",
    stars: "stars",
    noDesc: "No description.",
    projectsLink: "See projects",
    arcade:
      "A floating house on balsa logs, in an oxbow pond beside the road, with a palm roof and arcade cabinets. At each cabinet, “E · Play” opens the real game right there, as in the mountain's arcade tambo.",
    arcadeLink: "Open the arcade",
    dosel:
      "Past the arcade, the road leaves the ground and climbs onto a walkway of hanging bridges between ceiba trees, at canopy height. Crossing it end to end without getting off gives a stamp.",
    doselTitle: "Canopy bridges",
    collpa:
      "The end of the road: a wooden viewpoint with a bench, facing a collpa across the river, a reddish clay cliff where macaws come to eat the earth.",
    collpaSign: "End of the road — head back through the punku or by canoe.",
    wildlife: "Jungle wildlife",
    backTitle: "Back to the mountain",
    map: "The paper map opens with M (or the gamepad's Y button). Fast travel between stops unlocks once you reach the collpa, at the end of the road.",
  },
} as const;

export const selvaTextCopy = (lang: Lang) => COPY[lang];

const safeHref = (u: string) => (/^(https?:|mailto:|\/)/i.test(u) ? esc(u) : "#");
const link = (href: string, text: string, external = false) =>
  `<a href="${safeHref(href)}"${external ? ' target="_blank" rel="noopener"' : ""}>${esc(text)}</a>`;
const stampName = (lang: Lang, id: string) => CATALOG.find((s) => s.id === id)?.label[lang] ?? id;

/** Element id of a stop's section (stable, so the skip link and the map can point at it). */
export const selvaTextId = (id: string) => `kw-selva-tm-${id.replace(/[^a-z0-9-]/gi, "")}`;

function regatonHtml(lang: Lang, h: number): string {
  const c = COPY[lang];
  const body = stalls()
    .map((s) => {
      const groups = runs(s.wares)
        .map((r) => {
          const items = r.wares
            .map((w) => {
              const name = w.url ? link(w.url, w.name, true) : esc(w.name);
              return `<li>${name}${w.why ? `: ${esc(w.why[lang])}` : ""}</li>`;
            })
            .join("");
          return `${r.group ? `<p class="kw-tm-label">${esc(r.group[lang])}</p>` : ""}<ul>${items}</ul>`;
        })
        .join("");
      return `<h${h}>${esc(s.title[lang])}</h${h}>${s.lede ? `<p>${esc(s.lede[lang])}</p>` : ""}${groups}`;
    })
    .join("\n");
  return `<p>${esc(c.regaton)}</p>${body}<p>${link(`/${lang}/uses/`, c.usesLink)}</p>`;
}

function malocaHtml(lang: Lang, data: WorldData): string {
  const c = COPY[lang];
  const list = cloths(data.posts);
  if (!list.length)
    return `<p>${esc(c.maloca(MAX_CLOTHS))}</p><p>${esc(c.noPosts)}</p><p>${link(`/${lang}/blog/`, c.blogLink)}</p>`;
  const items = list
    .map(({ post }) => {
      const date = post.date.slice(0, 10);
      const ext = post.source === "medium";
      return `<li>${link(post.href, post.title, ext)} · <time datetime="${esc(date)}">${esc(date)}</time> · ${esc(ext ? c.medium : c.site)}${post.description ? `<br>${esc(post.description)}` : ""}</li>`;
    })
    .join("");
  return `<p>${esc(c.maloca(list.length))}</p><ol>${items}</ol><p>${link(`/${lang}/blog/`, c.blogLink)}</p>`;
}

function palafitosHtml(lang: Lang, data: WorldData, h: number): string {
  const c = COPY[lang];
  const all = projects(data.repos);
  const cases = all
    .map((p) => {
      if (p.kind !== "case") return "";
      const uses = p.uses
        .map((u) => `<li>${esc(u.year)} · ${esc(u.company)} · ${esc(u.role[lang])}: ${esc(u.text[lang])}</li>`)
        .join("");
      return `<h${h}>${esc(p.name[lang])}</h${h}><p class="kw-tm-meta">${esc(p.tech)}</p><p>${esc(p.summary[lang])}</p>${uses ? `<ul>${uses}</ul>` : ""}`;
    })
    .join("\n");
  const repos = all.filter((p) => p.kind === "repo");
  const repoHtml = repos.length
    ? `<ul>${repos
        .map((p) =>
          p.kind === "repo"
            ? `<li>${link(p.url, p.name, true)}${p.language ? ` · ${esc(p.language)}` : ""} · ${esc(p.stars)} ${esc(c.stars)}<br>${esc(p.description?.trim() || c.noDesc)}</li>`
            : "",
        )
        .join("")}</ul>`
    : `<p>${esc(c.noRepos)}</p>`;
  return `<p>${esc(c.palafitos)}</p><p class="kw-tm-label">${esc(c.cases)}</p>${cases}<p class="kw-tm-label">${esc(c.repos)}</p>${repoHtml}<p>${link(`/${lang}/projects/`, c.projectsLink)}</p>`;
}

function arcadeHtml(lang: Lang): string {
  const c = COPY[lang];
  const games = raftGames(GAMES)
    .map((g) => `<li>${link(`/${lang}/arcade/${g.slug}/`, g.title[lang])}: ${esc(g.tagline[lang])}</li>`)
    .join("");
  return `<p>${esc(c.arcade)}</p><ul>${games}</ul><p>${link(`/${lang}/arcade/`, c.arcadeLink)}</p>`;
}

/** The full narration as an HTML string (escaped). `headingLevel` is the level of the document title. */
export function renderSelvaTextMode(
  lang: Lang,
  data: WorldData,
  o: { headingLevel?: 1 | 2; titleId?: string } = {},
): string {
  const c = COPY[lang];
  const h1 = o.headingLevel ?? 1;
  const h2 = h1 + 1;
  const h3 = h1 + 2;
  const tid = o.titleId ?? "kw-selva-tm-title";
  const toc: string[] = [];
  const sections: string[] = [];
  let n = 0;
  const section = (id: string, title: string, body: string) => {
    n++;
    const sid = selvaTextId(id);
    toc.push(`<li><a href="#${sid}">${esc(title)}</a></li>`);
    sections.push(
      `<section class="kw-tm-station" id="${sid}" aria-labelledby="${sid}-h"><h${h2} id="${sid}-h"><span class="kw-tm-n">${n}.</span> ${esc(title)}</h${h2}>\n${body}</section>`,
    );
  };
  const stamp = (id: string) => `<p class="kw-tm-meta">${esc(c.stamp)}: ${esc(stampName(lang, id))}</p>`;

  for (const s of [...SELVA_STATIONS].sort((a, b) => a.t - b.t)) {
    const label = s.label[lang];
    if (s.kind === "gate") section(s.id, label, `<p>${esc(c.gate)}</p>`);
    else if (s.kind === "uses") section(s.id, label, regatonHtml(lang, h3));
    else if (s.kind === "blog") section(s.id, label, malocaHtml(lang, data));
    else if (s.kind === "landing") section(s.id, label, `<p>${esc(c.embarcadero)}</p>${stamp("selva:ride:canoe")}`);
    else if (s.kind === "projects") section(s.id, label, palafitosHtml(lang, data, h3));
    else if (s.kind === "arcade") {
      section(s.id, label, arcadeHtml(lang));
      // The canopy walkway lies between the arcade and the collpa (CANOPY_T 0.83–0.9).
      section("dosel", c.doselTitle, `<p>${esc(c.dosel)}</p>${stamp("selva:field:dosel")}`);
    } else if (s.kind === "collpa")
      section(s.id, label, `<p>${esc(c.collpa)}</p><p><strong>${esc(c.collpaSign)}</strong></p>`);
  }
  section("fauna", c.wildlife, renderWildlife(lang, h3, SELVA_WILDLIFE));
  section(
    "volver",
    c.backTitle,
    `<p>${esc(c.map)}</p><p>${esc(c.backHint)}</p><p><a href="/${lang}/world/">${esc(c.back)}</a></p>`,
  );

  return `<header class="kw-tm-head"><h${h1} id="${esc(tid)}" class="kw-tm-title">${esc(c.title)}</h${h1}>
<p class="kw-tm-lede">${esc(c.lede)}</p>
<nav class="kw-tm-toc" aria-label="${esc(c.toc)}"><ol>${toc.join("")}</ol></nav></header>
${sections.join("\n")}`;
}

export function createSelvaTextMode(host: HTMLElement, lang: Lang, data: WorldData): TextMode {
  const c = COPY[lang];
  const ov = createOverlay(host, { className: "kw-tm", labelledBy: "kw-selva-tmo-title" });
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
    close.innerHTML = `<kbd>Esc</kbd> <span>${esc(c.close)}</span>`;
    close.addEventListener("click", () => ov.close());
    bar.append(close);
    const doc = document.createElement("article");
    doc.className = "kw-textdoc";
    doc.innerHTML = renderSelvaTextMode(lang, data, { headingLevel: 2, titleId: "kw-selva-tmo-title" });
    ov.panel.append(bar, doc);
  };
  return {
    panel: ov.panel,
    open() {
      build();
      ov.open(ov.panel.querySelector<HTMLElement>(".kw-tm-bar .kw-btn"));
    },
    close: () => ov.close(),
    toggle() {
      if (ov.isOpen()) ov.close();
      else this.open();
    },
    isOpen: () => ov.isOpen(),
    dispose: () => ov.dispose(),
  };
}
