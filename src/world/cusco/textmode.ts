/**
 * Accessible text mode of the Cusco hub: everything Haukaypata does, as plain HTML. `renderCuscoTextMode` is
 * pure (no DOM, no three.js) so the page renders it at build time as the no-WebGL / failed-load fallback; the
 * runtime shows the same document in the paper dialog (K, the "Text mode" chip, `world:textmode`).
 *
 * Sources (keep it truthful): the gates, their availability and what each suyu holds from ./plan.ts GATES,
 * passport pages and stamps from lib/passport.ts, the contact card from data/site.ts. It describes only what
 * the hub does: the plaza and its usnu, the khipu of the suyus and the finale, the Qorikancha, the
 * twelve-angled stone, the chasqui post, the five punkus, the people, llamas and doves, and the map.
 */
import { SITE, SOCIALS } from "../../data/site";
import { CATALOG, requiredStamps, WORLD_PAGES } from "../../lib/passport";
import type { Lang } from "../contract";
import { esc } from "../textmode";
import { worldUrl } from "../travel";
import { GATES } from "./plan";

const COPY = {
  es: {
    title: "Qusqu · Haukaypata, el centro del Tawantinsuyu",
    lede: "La gran plaza del Qusqu inca, donde empiezan los caminos de los cuatro suyus. Es una maqueta compacta: el Qusqu real era más grande y sus templos estaban repartidos en varias calles, pero los rumbos se mantienen. Al centro se alza un usnu de piedra; alrededor hay muros de piedra labrada inca con puertas y hornacinas trapezoidales, salones de techo de paja (kallankas), la fachada del Qorikancha con su disco de oro, y en las colinas del norte, los muros en zigzag de Sacsayhuamán.",
    toc: "Lugares de la plaza",
    close: "Cerrar",
    skip: "Saltar al modo texto",
    back: "Volver al Qhapaq Ñan",
    stamp: "Sello del pasaporte",
    bonus: "Sello extra del pasaporte",
    arriveTitle: "Llegar",
    arrive:
      "Si llegas por un punku, apareces en su calle, unos pasos antes de la plaza y mirando hacia ella; si entras directo, en el lado sur de la plaza mirando al usnu. Llevas la ropa andina de la montaña.",
    usnuTitle: "El usnu y el khipu de los suyus",
    usnu: "En el centro de la plaza, un usnu: una plataforma ceremonial de tres gradas de piedra labrada, con escalinata al sur. Cada grada es un escalón, así que puedes subir caminando. Arriba, un marco de madera sostiene un gran khipu: una cuerda colgante por cada suyu y una por Qusqu, cada una con su color. Cada nudo es un sello de esa página del pasaporte; los suyus que aún no se abren cuelgan sin nudos.",
    khipu:
      "Junto al khipu, «E · Leer el khipu» abre un panel con tu avance por cada página del pasaporte (sellos que cuentan / sellos de la página) y lo que guarda cada suyu.",
    finale: (pages: string) =>
      `Cuando completas todas las páginas del pasaporte que ya existen (${pages}), la primera vez que llegas al usnu la plaza lo celebra una sola vez: suena un breve tema (con el sonido activo), salta confeti de colores del khipu sobre el usnu (no si tu sistema pide reducir el movimiento) y se abre el panel «¡Lo lograste! Recorriste el Tawantinsuyu», con tu nombre de viajero si lo pusiste: los mundos completados y tus sellos (reunidos / total del pasaporte), y botones para crear tu postal, agendar 60 minutos, descargar el CV o volver al sitio. Después, el panel del khipu tiene un botón para volver a verlo.`,
    book: "Agendar 60 min",
    cv: "Descargar CV",
    qoriTitle: "Qorikancha",
    qori: "En el lado este de la plaza, la fachada del Qorikancha, el templo del Sol (en el Qusqu real está unas calles al sureste): un muro de piedra labrada con una franja de oro, una portada de doble jamba y, encima, un gran disco de oro del Inti. Un letrero tallado lo nombra.",
    stoneTitle: "Hatun Rumiyoc · la piedra de los doce ángulos",
    stone:
      "En la calle del Antisuyu, en el muro de la izquierda saliendo de la plaza, hay una piedra enorme encajada con doce ángulos, sin argamasa, como la de la calle Hatun Rumiyoc. Llegar frente a ella da un sello extra.",
    chasquiTitle: "Puesto del chasqui",
    chasqui:
      "En el suroeste de la plaza, un pequeño refugio de piedra con techo de paja, un pututu (caracola) y un khipu de mensajes, donde espera un chasqui. «E · Hablar con el chasqui» muestra la tarjeta de contacto:",
    email: "Correo",
    gatesTitle: "Los cinco punkus",
    gates:
      "De cada esquina de la plaza sale una calle entre muros de piedra, y otra sale al sur. Cada una termina en un punku, una portada trapezoidal de piedra con un letrero tallado y, en el vano, un vistazo de su mundo. Cerca de un punku abierto, «E · Viajar» te lleva a ese mundo; un punku cerrado tiene una tranca de troncos y un letrero «Próximamente», y no viaja.",
    open: "Abierto",
    closed: "Próximamente",
    go: "Ir",
    lifeTitle: "Gente y animales",
    life: "De día, algunas personas cruzan la plaza entre las calles y las puertas de los salones y se apartan de tu camino; un arriero pasea una pequeña recua de llamas cargadas alrededor de la plaza. Unas tórtolas (palomas nativas de los Andes) picotean entre las losas y levantan vuelo si te acercas. De noche, la gente vuelve a casa (el chasqui sigue en su puesto), las llamas se echan junto al salón del oeste y arden los braseros: en las esquinas del usnu, frente al Qorikancha y junto a cada punku.",
    mapTitle: "El mapa",
    map: "El mapa de papel se abre con M (o el botón Y del mando) y muestra la plaza, las calles y los punkus. El viaje rápido entre lugares se abre al llegar al usnu.",
    passTitle: "Sellos de Qusqu",
  },
  en: {
    title: "Qusqu · Haukaypata, the centre of the Tawantinsuyu",
    lede: "The great plaza of Inca Qusqu, where the roads of the four suyus begin. It is a compact model: the real Qusqu was larger and its temples were spread over several streets, but the bearings are kept. In the middle stands a stone usnu; around it are fine Inca stone walls with trapezoidal doorways and niches, thatched halls (kallankas), the Qorikancha facade with its gold disc, and on the hills to the north, the zigzag walls of Sacsayhuamán.",
    toc: "Places on the plaza",
    close: "Close",
    skip: "Skip to the text mode",
    back: "Back to the Qhapaq Ñan",
    stamp: "Passport stamp",
    bonus: "Bonus passport stamp",
    arriveTitle: "Arriving",
    arrive:
      "Coming through a punku, you appear on its street a few steps before the plaza, facing it; coming straight in, on the south side of the plaza facing the usnu. You wear the mountain's Andean clothes.",
    usnuTitle: "The usnu and the khipu of the suyus",
    usnu: "In the middle of the plaza, an usnu: a ceremonial platform of three dressed-stone tiers with a stair on the south. Each tier is one step, so you can walk up. On top, a wooden frame holds a big khipu: one hanging cord per suyu and one for Qusqu, each in its colour. Every knot is a stamp of that passport page; suyus that are not open yet hang without knots.",
    khipu:
      "Next to the khipu, “E · Read the khipu” opens a panel with your progress on each passport page (stamps that count / stamps on the page) and what each suyu holds.",
    finale: (pages: string) =>
      `Once you complete every passport page that exists so far (${pages}), the first time you reach the usnu the plaza celebrates, once: a short tune plays (with sound on), confetti in khipu colours bursts over the usnu (not if your system asks for reduced motion) and the panel “You made it! You walked the Tawantinsuyu” opens, with your traveler name if you set one: the worlds completed and your stamps (collected / passport total), and buttons to make your postcard, book 60 minutes, download the resume or go back to the site. Afterwards the khipu panel has a button to see it again.`,
    book: "Book 60 min",
    cv: "Download resume",
    qoriTitle: "Qorikancha",
    qori: "On the east side of the plaza, the facade of the Qorikancha, the temple of the Sun (in the real Qusqu it stands a few streets to the south-east): a dressed-stone wall with a gold band, a double-jamb doorway and, above it, a great gold disc of Inti. A carved sign names it.",
    stoneTitle: "Hatun Rumiyoc · the twelve-angled stone",
    stone:
      "On the Antisuyu street, in the wall on your left as you leave the plaza, a huge stone is fitted with twelve angles and no mortar, like the one on Hatun Rumiyoc street. Standing in front of it gives a bonus stamp.",
    chasquiTitle: "Chasqui post",
    chasqui:
      "On the south-west of the plaza, a small thatched stone shelter with a pututu (conch trumpet) and a message khipu, where a chasqui waits. “E · Talk to the chasqui” shows the contact card:",
    email: "Email",
    gatesTitle: "The five punkus",
    gates:
      "A street between stone walls leaves each corner of the plaza, and another leaves to the south. Each ends at a punku, a trapezoidal stone doorway with a carved sign and, in the opening, a glimpse of its world. Near an open punku, “E · Travel” takes you to that world; a closed punku has a bar of logs and a “Coming soon” sign, and does not travel.",
    open: "Open",
    closed: "Coming soon",
    go: "Go",
    lifeTitle: "People and animals",
    life: "By day, a few people cross the plaza between the streets and the hall doors and step out of your way; a herder walks a small train of loaded llamas around the plaza. Some eared doves (native Andean doves) peck between the flagstones and fly up if you come close. At night the people go home (the chasqui stays at the post), the llamas lie down by the west hall and the braziers burn: at the corners of the usnu, in front of the Qorikancha and beside every punku.",
    mapTitle: "The map",
    map: "The paper map opens with M (or the gamepad's Y button) and shows the plaza, the streets and the punkus. Fast travel between places opens once you reach the usnu.",
    passTitle: "Qusqu stamps",
  },
} as const;

export const cuscoTextCopy = (lang: Lang) => COPY[lang];

const id = (s: string) => `kw-cusco-tm-${s.replace(/[^a-z0-9-]/gi, "")}`;

export function renderCuscoTextMode(lang: Lang, opts: { headingLevel?: number; titleId?: string } = {}): string {
  const c = COPY[lang];
  const h1 = opts.headingLevel ?? 1;
  const h2 = Math.min(6, h1 + 1);
  const h3 = Math.min(6, h1 + 2);
  const tid = opts.titleId ?? "kw-cusco-tm-title";
  const toc: string[] = [];
  const sections: string[] = [];
  const section = (key: string, title: string, body: string) => {
    toc.push(`<li><a href="#${id(key)}">${esc(title)}</a></li>`);
    sections.push(
      `<section aria-labelledby="${id(key)}"><h${h2} id="${id(key)}">${esc(title)}</h${h2}>${body}</section>`,
    );
  };
  const stampLine = (stampId: string) => {
    const s = CATALOG.find((x) => x.id === stampId);
    if (!s) return "";
    const required = requiredStamps("cusco").some((x) => x.id === stampId);
    return `<p class="kw-tm-stamp">${esc(required ? c.stamp : c.bonus)}: ${esc(s.label[lang])}</p>`;
  };
  const pages = WORLD_PAGES.map((p) => p.label[lang]).join(", ");
  const link = (href: string, text: string, ext = false) =>
    `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${esc(text)}</a>`;

  section("llegar", c.arriveTitle, `<p>${esc(c.arrive)}</p>`);
  section(
    "usnu",
    c.usnuTitle,
    `<p>${esc(c.usnu)}</p><p>${esc(c.khipu)}</p><p>${esc(c.finale(pages))}</p><p>${link(SITE.calendly, c.book, true)} · ${link(SITE.resume[lang], c.cv)}</p>${stampLine("cusco:station:usnu")}`,
  );
  const gates = GATES.map((g) => {
    const state = g.available ? c.open : c.closed;
    const go =
      g.available && g.world !== "cusco" ? ` · ${link(worldUrl(lang, g.world as "qhapaq", "cusco"), c.go)}` : "";
    return `<li><h${h3}>${esc(g.name[lang])} · ${esc(g.bearing[lang])}</h${h3}><p><strong>${esc(state)}</strong>${go}</p><p>${esc(g.holds[lang])}</p></li>`;
  }).join("");
  section("punkus", c.gatesTitle, `<p>${esc(c.gates)}</p><ul>${gates}</ul>`);
  section("qorikancha", c.qoriTitle, `<p>${esc(c.qori)}</p>${stampLine("cusco:station:qorikancha")}`);
  section("hatun-rumiyoc", c.stoneTitle, `<p>${esc(c.stone)}</p>${stampLine("cusco:station:hatun-rumiyoc")}`);
  const socials = SOCIALS.filter((s) => !s.url.startsWith("mailto:"))
    .map((s) => `<li>${link(s.url, s.name, true)}</li>`)
    .join("");
  section(
    "chasqui",
    c.chasquiTitle,
    `<p>${esc(c.chasqui)}</p><p>${esc(c.email)}: ${link(`mailto:${SITE.email}`, SITE.email)}</p><ul>${socials}</ul><p>${link(SITE.calendly, c.book, true)} · ${link(SITE.resume[lang], c.cv)}</p>${stampLine("cusco:station:chasqui")}`,
  );
  section("vida", c.lifeTitle, `<p>${esc(c.life)}</p>`);
  section("mapa", c.mapTitle, `<p>${esc(c.map)}</p><p><a href="/${lang}/world/?from=cusco">${esc(c.back)}</a></p>`);

  return `<header class="kw-tm-head"><h${h1} id="${esc(tid)}" class="kw-tm-title">${esc(c.title)}</h${h1}>
<p class="kw-tm-lede">${esc(c.lede)}</p>
<nav class="kw-tm-toc" aria-label="${esc(c.toc)}"><ol>${toc.join("")}</ol></nav></header>
${sections.join("\n")}`;
}
