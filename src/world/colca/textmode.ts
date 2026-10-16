/**
 * Accessible text mode of the Kuntisuyu: everything the Colca and Nazca road does, as plain HTML.
 * `renderColcaTextMode` is pure (no DOM, no three.js) so the page renders it at build time as the no-WebGL /
 * failed-load fallback; the runtime shows the same document in the paper dialog (K, the "Text mode" chip,
 * `world:textmode`).
 *
 * Sources (keep it truthful): the stages, knots and artifacts from src/data/career.ts (through ./content.ts),
 * the geoglyphs from ./glyphs.ts and ./ambient/nazca/logic.ts, the finale's counts from ./content.ts
 * finaleStats, stamps from lib/passport.ts, links from data/site.ts, the field guide ./wildlife.ts. It
 * describes only what the world does.
 */
import { SITE } from "../../data/site";
import { CATALOG, requiredStamps } from "../../lib/passport";
import type { Lang } from "../contract";
import { esc, renderWildlife } from "../textmode";
import { worldUrl } from "../travel";
import { figures } from "./ambient/nazca/logic";
import { artifactCompanies, artifactUses, colcaStages, finaleStats, span } from "./content";
import { COLCA_WILDLIFE } from "./wildlife";

const COPY = {
  es: {
    title: "Kuntisuyu · el cañón del Colca y la pampa de Nasca",
    lede: "Un camino del Kuntisuyu, el suyu del suroeste: bordea el cañón del Colca, uno de los más profundos del mundo, baja a la pampa de Nasca y vuelve al borde del cañón en la Cruz del Cóndor. Aquí está mi trabajo de arquitectura: los logros de cada etapa de mi carrera guardados en colcas, y los artefactos que construí en varias empresas trazados como geoglifos. Es una maqueta: el Colca y Nasca están a unos 300 km en la realidad; aquí los une un solo camino.",
    toc: "Lugares del camino",
    close: "Cerrar",
    skip: "Saltar al modo texto",
    back: "Volver a Qusqu",
    stamp: "Sello del pasaporte",
    bonus: "Sello extra del pasaporte",
    arriveTitle: "Llegar",
    arrive:
      "Llegas desde Qusqu por un punku de piedra al este del camino, en el borde del cañón, mirando hacia el oeste. Junto al punku, «E · Volver a Qusqu» te lleva de vuelta a la plaza de Qusqu, frente al punku del Kuntisuyu. Llevas la ropa andina de la montaña.",
    roadTitle: "El camino y el cañón",
    road: "El camino va por el borde norte del cañón, a unos pasos del precipicio. Bajo el borde hay una pared de roca y luego andenes, terrazas de cultivo preincas que bajan como escalones, con parcelas verdes, amarillas, doradas y de tierra; más abajo, paredes de roca con franjas de colores y, en el fondo, muy por debajo del camino, el río. Capas de neblina cruzan el cañón, más espesas por la mañana. Al otro lado se ven más andenes y, en el horizonte del sur, los volcanes Sabancaya (con una tenue fumarola), Hualca Hualca y Ampato; detrás del pueblo, al noreste, el Mismi. En la puna hay ichu, tolas, cactus columnares y piedras. Luego el camino gira al norte y baja a la pampa de Nasca, de grava rojiza, y después sube de nuevo hacia el borde del cañón.",
    puebloTitle: "Pueblo collagua",
    pueblo:
      "Al norte del camino, un pueblo al estilo de Yanque o Chivay: una plaza empedrada con una pileta de piedra y arbustos de kantu florecidos, casas de adobe encalado, de adobe y de piedra con techos de paja, de teja o de calamina, y al norte la iglesia blanca colonial andina, con su portada de sillar tallado, dos campanarios con cúpulas y un atrio con arco. Un letrero tallado nombra el pueblo.",
    people:
      "De día, mujeres con la ropa bordada del valle (faldas bordadas con flores y el sombrero blanco bordado de Cabanaconde o el sombrero blanco alto de los collaguas) y hombres con sombrero de fieltro caminan entre la puerta de la iglesia, la pileta y las casas, y se apartan de tu camino; unos niños juegan a la pega en la plaza y se escapan unos pasos si te acercas mucho. Un campesino lleva tres llamas cargadas por el camino entre el pueblo y las colcas, ida y vuelta, y espera si te paras delante. De noche la gente vuelve a casa y las llamas se echan junto al pueblo, con el campesino sentado a su lado.",
    colcasTitle: "Colcas · los logros de cada etapa",
    colcas: (n: number) =>
      `Las colcas eran los depósitos de piedra del Tawantinsuyu, y el valle del Colca toma de ellas su nombre. Al norte del camino, un acantilado escalonado se alza sobre una pequeña plaza; en sus repisas hay ${n} colcas, una por cada etapa de mi carrera, la más antigua abajo a la izquierda y la más reciente arriba a la derecha. De la ventana de cada una cuelga un cordón con un nudo por logro, del color de esa etapa. En la plaza, «E · Abrir las colcas» abre un panel con la empresa, el cargo, los años y el lugar, el resumen, los logros y las herramientas; las flechas pasan de una colca a otra.`,
    stack: "Con",
    edu: "Formación",
    nazcaTitle: "Mirador de Nasca · los artefactos",
    nazca:
      "En la pampa, cada artefacto que construí en varias empresas está trazado como un geoglifo gigante, con líneas claras sobre la grava rojiza, siguiendo las siluetas de figuras reales de Nasca. Junto al camino hay una torre mirador de acero con cuatro tramos de escaleras de madera y una plataforma con baranda; puedes subir. Arriba, la figura hacia la que miras se nombra en pantalla y «E · Leer el geoglifo» abre su panel; junto al camino, el letrero más cercano a cada figura también lo abre. Un letrero en la plaza pide no pisar las líneas. Las figuras miran hacia la torre para leerse derechas desde arriba.",
    figure: "La figura real",
    built: "Dónde lo construí",
    companies: (n: number) => (n === 1 ? "1 empresa" : `${n} empresas`),
    cahuachiTitle: "Cahuachi",
    cahuachi:
      "Al oeste de la pampa, junto al camino, una pequeña pirámide escalonada de adobe en homenaje a Cahuachi, el gran centro ceremonial de la cultura Nasca (el real es un campo de montículos de adobe junto al río Nasca), con muros de adobe derruidos al pie y un letrero tallado. Llegar a su plaza da un sello extra.",
    cruzTitle: "Cruz del Cóndor",
    cruz: "Donde termina el camino, en el borde del cañón, una plataforma de piedra con un parapeto sobre el precipicio, bancas de piedra y una cruz de piedra sobre un pedestal escalonado, como el mirador real del Colca.",
    finale:
      "La primera vez que llegas junto a la cruz, el lugar lo celebra: los cóndores suben del cañón en espiral y dan vueltas sobre ti, salen plumas de cóndor y papel picado de colores desde la cruz (no si tu sistema pide reducir el movimiento), suena un breve tema (con el sonido activo), recibes un sello y se abre el panel «¡Lo lograste!» con tu nombre de viajero si lo pusiste, subtitulado «Fin del Kuntisuyu». Muestra lo que viste en el camino:",
    finaleButtons:
      "y botones para crear tu postal, agendar 60 minutos, descargar el CV, volver a Qusqu o volver al sitio. Después, «E · Ver tu premio» junto a la cruz lo vuelve a abrir.",
    stats: {
      artifacts: "artefactos en la pampa",
      knots: "logros en las colcas",
      stages: "etapas de carrera",
      companies: "empresas",
    },
    book: "Agendar 60 min",
    cv: "Descargar CV",
    site: "Volver al sitio",
    lifeTitle: "Animales",
    life: "Animales que puedes ver en el camino. Verlos de cerca da sellos extra.",
    mapTitle: "El mapa",
    map: "El mapa de papel se abre con M (o el botón Y del mando): el cañón con su río abajo, el camino, las estaciones y los geoglifos. El viaje rápido entre lugares se abre al llegar a la Cruz del Cóndor.",
  },
  en: {
    title: "Kuntisuyu · the Colca canyon and the Nazca pampa",
    lede: "A road of the Kuntisuyu, the south-west quarter: it follows the rim of the Colca canyon, one of the deepest in the world, goes down to the Nazca pampa and comes back to the canyon's rim at the Cruz del Cóndor. Here is my architecture work: the achievements of each stage of my career stored in colcas, and the artifacts I built across companies drawn as geoglyphs. It is a model: the Colca and Nazca are some 300 km apart in reality; here one road joins them.",
    toc: "Places on the road",
    close: "Close",
    skip: "Skip to the text mode",
    back: "Back to Qusqu",
    stamp: "Passport stamp",
    bonus: "Bonus passport stamp",
    arriveTitle: "Arriving",
    arrive:
      "You arrive from Qusqu through a stone punku at the east end of the road, on the canyon's rim, facing west. By the punku, “E · Back to Qusqu” takes you back to the plaza of Qusqu, in front of the Kuntisuyu punku. You wear the mountain's Andean clothes.",
    roadTitle: "The road and the canyon",
    road: "The road runs along the canyon's north rim, a few steps from the drop. Under the rim there is a rock face and then andenes, pre-Inca farming terraces stepping down, with green, yellow, golden and bare plots; lower down, rock walls in coloured bands and, at the bottom, far below the road, the river. Layers of mist cross the canyon, thicker in the morning. Across it there are more terraces and, on the southern skyline, the volcanoes Sabancaya (with a faint fumarole), Hualca Hualca and Ampato; behind the village, to the north-east, Mismi. On the puna there is ichu grass, tola shrubs, columnar cacti and stones. Then the road turns north and goes down to the Nazca pampa, of reddish gravel, and later climbs back toward the canyon's rim.",
    puebloTitle: "Collagua village",
    pueblo:
      "North of the road, a village in the style of Yanque or Chivay: a paved plaza with a stone fountain and flowering kantu bushes, houses of whitewashed adobe, bare adobe and stone with thatched, tiled or tin roofs, and on its north side the white colonial-Andean church, with its carved sillar portal, two bell towers with domes and an atrium with an arched gate. A carved sign names the village.",
    people:
      "By day, women in the valley's embroidered dress (skirts embroidered with flowers and the white embroidered Cabanaconde hat or the tall white Collagua hat) and men in felt hats walk between the church door, the fountain and the houses, and step out of your way; a few children play tag in the plaza and scamper off a few steps if you come very close. A farmer leads three pack llamas along the road between the village and the colcas, there and back, and waits if you stand in his way. At night people go home and the llamas lie down by the village, the farmer sitting beside them.",
    colcasTitle: "Colcas · the achievements of each stage",
    colcas: (n: number) =>
      `Colcas were the stone storehouses of the Tawantinsuyu, and the Colca valley takes its name from them. North of the road, a stepped cliff rises over a small plaza; on its ledges stand ${n} colcas, one per stage of my career, the oldest bottom-left and the newest top-right. From each one's window hangs a cord with one knot per achievement, in that stage's colour. On the plaza, “E · Open the colcas” opens a panel with the company, the role, the years and the place, the summary, the achievements and the tools; the arrows move from one colca to the next.`,
    stack: "With",
    edu: "Education",
    nazcaTitle: "Nazca lookout · the artifacts",
    nazca:
      "On the pampa, each artifact I built across companies is drawn as a giant geoglyph, pale lines on the reddish gravel, after the silhouettes of real Nazca figures. By the road stands a steel lookout tower with four flights of wooden stairs and a railed deck; you can climb it. Up there, the figure you face is named on screen and “E · Read the geoglyph” opens its panel; by the road, the board closest to each figure opens it too. A board at the plaza asks you to keep off the lines. The figures face the tower so they read upright from above.",
    figure: "The real figure",
    built: "Where I built it",
    companies: (n: number) => (n === 1 ? "1 company" : `${n} companies`),
    cahuachiTitle: "Cahuachi",
    cahuachi:
      "West of the pampa, by the road, a small stepped adobe pyramid in tribute to Cahuachi, the great ceremonial centre of the Nazca culture (the real one is a field of adobe mounds by the Nazca river), with broken adobe walls at its foot and a carved sign. Reaching its plaza gives a bonus stamp.",
    cruzTitle: "Cruz del Cóndor",
    cruz: "Where the road ends, on the canyon's rim, a stone platform with a parapet over the drop, stone benches and a stone cross on a stepped pedestal, like the real lookout over the Colca.",
    finale:
      "The first time you reach the cross, the place celebrates: the condors rise out of the canyon in a spiral and circle over you, condor feathers and coloured confetti burst from the cross (not if your system asks for reduced motion), a short tune plays (with sound on), you get a stamp and the panel “You made it!” opens with your traveler name if you set one, subtitled “End of the Kuntisuyu”. It shows what you saw on the road:",
    finaleButtons:
      "and buttons to make your postcard, book 60 minutes, download the resume, go back to Qusqu or back to the site. Afterwards, “E · See your reward” by the cross opens it again.",
    stats: {
      artifacts: "artifacts on the pampa",
      knots: "achievements in the colcas",
      stages: "career stages",
      companies: "companies",
    },
    book: "Book 60 min",
    cv: "Download resume",
    site: "Back to the site",
    lifeTitle: "Wildlife",
    life: "Animals you can meet on the road. A good look earns bonus stamps.",
    mapTitle: "The map",
    map: "The paper map opens with M (or the gamepad's Y button): the canyon with its river below, the road, the stations and the geoglyphs. Fast travel between places opens once you reach the Cruz del Cóndor.",
  },
} as const;

export const colcaTextCopy = (lang: Lang) => COPY[lang];

const id = (s: string) => `kw-colca-tm-${s.replace(/[^a-z0-9-]/gi, "")}`;

export function renderColcaTextMode(lang: Lang, opts: { headingLevel?: number; titleId?: string } = {}): string {
  const c = COPY[lang];
  const h1 = opts.headingLevel ?? 1;
  const h2 = Math.min(6, h1 + 1);
  const h3 = Math.min(6, h1 + 2);
  const tid = opts.titleId ?? "kw-colca-tm-title";
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
    const required = requiredStamps("colca").some((x) => x.id === stampId);
    return `<p class="kw-tm-stamp">${esc(required ? c.stamp : c.bonus)}: ${esc(s.label[lang])}</p>`;
  };
  const link = (href: string, text: string, ext = false) =>
    `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${esc(text)}</a>`;
  const qusqu = worldUrl(lang, "cusco", "colca");

  section("llegar", c.arriveTitle, `<p>${esc(c.arrive)}</p><p>${link(qusqu, c.back)}</p>`);
  section("camino", c.roadTitle, `<p>${esc(c.road)}</p>`);
  section(
    "pueblo",
    c.puebloTitle,
    `<p>${esc(c.pueblo)}</p><p>${esc(c.people)}</p>${stampLine("colca:station:pueblo")}`,
  );

  const stages = colcaStages();
  const colcas = stages
    .map((st) => {
      const knots = st.knots
        .map((k) => `<li>${k.metric ? `<strong>${esc(k.metric)}</strong> · ` : ""}${esc(k.text[lang])}</li>`)
        .join("");
      const stack = st.stage.stack?.length ? `<p>${esc(c.stack)}: ${esc(st.stage.stack.join(", "))}</p>` : "";
      const meta = `${esc(span(st.stage.start, st.stage.end, lang))} · ${esc(st.stage.place[lang])}${st.education ? ` · ${esc(c.edu)}` : ""}`;
      return `<li><h${h3}>${st.index + 1}. ${esc(st.company.name)} · ${esc(st.stage.role[lang])}</h${h3}><p>${meta}</p><p>${esc(st.stage.summary[lang])}</p><ul>${knots}</ul>${stack}</li>`;
    })
    .join("");
  section(
    "colcas",
    c.colcasTitle,
    `<p>${esc(c.colcas(stages.length))}</p><ol class="kw-tm-list">${colcas}</ol>${stampLine("colca:station:colcas")}`,
  );

  const figs = figures()
    .map((f) => {
      const a = f.artifact;
      const uses = artifactUses(a)
        .map(
          (u) =>
            `<li><strong>${esc(u.company)}</strong> · ${esc(u.role[lang])} (${esc(span(u.start, u.end, lang))}): ${esc(u.text[lang])}</li>`,
        )
        .join("");
      return `<li><h${h3}>${esc(f.glyph.name[lang])} · ${esc(a.name[lang])}</h${h3}><p>${esc(a.tech)} · ${esc(c.companies(artifactCompanies(a).length))}</p><p>${esc(a.summary[lang])}</p><p>${esc(c.built)}:</p><ul>${uses}</ul><p>${esc(c.figure)}: ${esc(f.glyph.real[lang])}</p></li>`;
    })
    .join("");
  section(
    "nazca",
    c.nazcaTitle,
    `<p>${esc(c.nazca)}</p><ul class="kw-tm-list">${figs}</ul>${stampLine("colca:station:nazca")}`,
  );
  section("cahuachi", c.cahuachiTitle, `<p>${esc(c.cahuachi)}</p>${stampLine("colca:station:cahuachi")}`);

  const st = finaleStats();
  const statList = (["artifacts", "knots", "stages", "companies"] as const)
    .map((k) => `<li><strong>${st[k]}</strong> ${esc(c.stats[k])}</li>`)
    .join("");
  section(
    "cruz",
    c.cruzTitle,
    `<p>${esc(c.cruz)}</p><p>${esc(c.finale)}</p><ul>${statList}</ul><p>${esc(c.finaleButtons)}</p><p>${link(SITE.calendly, c.book, true)} · ${link(SITE.resume[lang], c.cv)} · ${link(qusqu, c.back)} · ${link(`/${lang}/`, c.site)}</p>${stampLine("colca:station:cruz")}${stampLine("colca:summit")}`,
  );
  section("fauna", c.lifeTitle, `<p>${esc(c.life)}</p>${renderWildlife(lang, h3, COLCA_WILDLIFE)}`);
  section("mapa", c.mapTitle, `<p>${esc(c.map)}</p>`);

  return `<header class="kw-tm-head"><h${h1} id="${esc(tid)}" class="kw-tm-title">${esc(c.title)}</h${h1}>
<p class="kw-tm-lede">${esc(c.lede)}</p>
<nav class="kw-tm-toc" aria-label="${esc(c.toc)}"><ol>${toc.join("")}</ol></nav></header>
${sections.join("\n")}`;
}
