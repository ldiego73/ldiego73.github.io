/**
 * Accessible text mode of the Chinchaysuyu coast: the whole road narrated stop by stop as plain HTML, with the
 * same content the 3D stations show. `renderCostaTextMode` is pure (no DOM, no three.js) so the page renders it
 * at build time as the no-WebGL / failed-load fallback; the runtime shows the same document in the paper dialog
 * (K, the "Text mode" chip, `world:textmode`) through ./textmode-dialog.ts.
 *
 * Sources (keep it truthful, never invent): every company, stage, knot and stack from src/data/career.ts (the
 * same khipu as the mountain's tambos: ../artifacts.ts khipuFor), the artifacts from career.ts ARTIFACTS
 * (../artifacts.ts artifactUses), the finale's numbers from ./ambient/finale/logic.ts careerStats (the mountain
 * summit's computation), contact links from data/site.ts, stamps from lib/passport.ts CATALOG, the animals from
 * ./wildlife.ts. The cultures name only what each monument shows (./plan.ts CULTURES). It describes only what
 * the coast does: the punku back to Qusqu, the road and its beaches, the seven monuments, the Huanchaco
 * market, the caballito ride, the people and animals, the finale and the map.
 */
import { ARTIFACTS, COMPANIES } from "../../data/career";
import { SITE } from "../../data/site";
import { fmtPeriod } from "../../i18n/ui";
import { CATALOG, requiredStamps } from "../../lib/passport";
import { artifactUses, companyYears, khipuFor } from "../artifacts";
import type { Lang } from "../contract";
import { esc, renderWildlife } from "../textmode";
import { careerStats } from "./ambient/finale/logic";
import { COMPANY_STOPS, CULTURES } from "./plan";
import { COSTA_WILDLIFE } from "./wildlife";

const COPY = {
  es: {
    title: "Chinchaysuyu · el camino de la costa",
    lede: "Mi carrera otra vez, ahora como un largo camino por la costa del Pacífico, de sur a norte, con el mar siempre a la izquierda. Una huaca por cada empresa en la que trabajé, en orden cronológico, inspiradas en las culturas de la costa peruana anteriores a los incas, con el mismo khipu y el mismo contenido que los tambos de la montaña; luego el mercado de artefactos de Huanchaco, un paseo en caballito de totora y, al final, el Inti hundiéndose en la Mamacocha, la madre mar.",
    toc: "Paradas del camino",
    close: "Cerrar",
    skip: "Saltar al modo texto",
    back: "Volver a Qusqu",
    stamp: "Sello del pasaporte",
    bonus: "Sello extra del pasaporte",
    arriveTitle: "Llegar",
    arrive:
      "Llegas por un punku inca de piedra en el extremo sur del camino, desde Qusqu, mirando al norte. En el vano del punku se ve la plaza de Qusqu y un letrero tallado dice «Qusqu». Junto al punku, «E · Volver a Qusqu» te lleva de vuelta a la plaza, a su puerta del Chinchaysuyu. Llevas ropa de viajero: sombrero de ala ancha, polo, short y botas.",
    roadTitle: "El camino",
    road: "El camino de tierra apisonada corre por una terraza costera, a veces junto a la playa y a veces sobre acantilados donde las olas revientan y salta la espuma. En largos tramos lo bordea un muro bajo de tapial del lado de tierra adentro, como el Qhapaq Ñan de la costa; del lado del mar, una fila de piedras marca el borde. Puedes bajar a la arena por donde la pendiente es suave. Dos ríos cruzan la costa hacia el mar por valles verdes con chacras, huarangos y totorales, y el camino los pasa por puentes de madera con barandas de totora. Al este, el desierto con cactus y lomas sube hacia los Andes nevados; mar adentro hay islotes, un farallón y la isla guanera.",
    seaTitle: "El mar",
    sea: "El Pacífico llega hasta el horizonte: olas largas desde el suroeste que, cerca de la playa, se alinean con la orilla y revientan en espuma; el agua sube y baja por la arena con cada serie de olas. El agua es turquesa en lo bajo y azul profundo mar adentro. Al atardecer el sol deja un camino de destellos dorados sobre el agua, y de noche uno plateado bajo la luna. Con el sonido activo se oyen el oleaje, el viento en los acantilados, las gaviotas y los lobos marinos.",
    careerTitle: "La carrera: una huaca por empresa",
    career:
      "Cada empresa en la que trabajé tiene su parada, en orden cronológico de sur a norte. En su plaza hay un khipu con una cuerda por etapa (sus nudos se encienden al acercarte) y un letrero tallado con la empresa, el monumento y los años; detrás se alza el monumento. Al acercarte al khipu se abre el mismo panel que en los tambos de la montaña: cada etapa con su cargo, fechas, lugar, resumen, nudos y tecnologías. «E · Leer» lo vuelve a abrir y E o Esc lo cierra. De noche arden dos braseros en cada huaca.",
    monument: "El monumento",
    knots: "Nudos",
    stack: "Tecnologías",
    edu: "Formación",
    marketTitle: "Mercado de Huanchaco · artefactos",
    market:
      "En la terraza sobre la playa de Huanchaco, cinco puestos de caña y estera rodean una plaza, uno por artefacto: las piezas que construí más de una vez, en distintas empresas. Cada puesto tiene un toldo del color de su artefacto y un mostrador con cosas de la costa (canastas de pescado, mates, ollas, telas dobladas, fruta); al acercarte se abre su panel con lo que es, sus tecnologías y dónde lo usé. Una vendedora atiende el puesto del medio y tres pelícanos esperan junto al de pescado.",
    uses: "Dónde lo usé",
    rideTitle: "El caballito de totora",
    ride: "En la playa bajo el mercado espera un caballito de totora, la balsa de juncos de los pescadores de Huanchaco, y otros secan de pie apoyados en una baranda de caña. «E · Subir al caballito» lo empuja al agua contigo de pie sobre él. Lo diriges con WASD, flechas o joystick (correr rema más fuerte), con inercia; sube y baja con las olas, y una ola que revienta lo empuja hacia la playa. Puedes ir por la bahía, rodear el promontorio con sus lobos marinos y llegar a la playa del norte. Cerca de cualquiera de las dos playas, despacio, «E · Bajar en la playa» o Esc lo varan en la arena y te bajas. Llegar a la otra playa da un sello. Si caminas a la otra playa, el caballito te espera allí.",
    peopleTitle: "Gente",
    people:
      "De día, algunas personas caminan por el camino entre una parada y otra, por su derecha, y se apartan de tu paso; en el mercado atiende una vendedora; unos niños corren en la orilla de la playa de Huanchaco, bajando tras la resaca y subiendo cuando llega la ola; junto a los caballitos esperan pescadores, uno remendando una red. Más allá de las olas, unos pescadores reman de rodillas en sus caballitos. De noche la gente vuelve a casa.",
    wildlife: "Fauna de la costa",
    finaleTitle: "Final: el Inti y la Mamacocha",
    finale: (years: number, companies: number, artifacts: number, knots: number) =>
      `El camino termina en un promontorio sobre el mar. Allí, una plataforma de adobe de dos gradas (cada grada es un escalón) mira al poniente, y en su borde un marco de dos postes y un dintel sostiene un aro dorado por el que se pone el sol; alrededor hay estandartes de colores y dos braseros. La primera vez que subes a la plataforma, la costa lo celebra: el cielo pasa al atardecer, el aro brilla, una bandada de pelícanos pasa en V junto al acantilado, salta una lluvia de conchas y flores amarillas de amancae (no si tu sistema pide reducir el movimiento), suena un breve tema y se abre el panel «¡Lo lograste!» (con tu nombre de viajero si lo pusiste), «Fin del Chinchaysuyu», con ${years} años de camino, ${companies} huacas (empresas), ${artifacts} artefactos en el mercado y ${knots} nudos en producción, y botones para crear tu postal, agendar 60 minutos, descargar el CV, volver a Qusqu o volver al sitio. Después, «E · Ver tu premio» en la plataforma lo vuelve a abrir.`,
    book: "Agendar 60 min",
    cv: "Descargar CV",
    site: "Volver al sitio",
    mapTitle: "El mapa",
    map: "El mapa de papel se abre con M (o el botón Y del mando) y muestra el camino de sur a norte, el mar, las paradas y dónde estás. El viaje rápido entre paradas se abre al llegar al mercado de Huanchaco.",
    passTitle: "Sellos de la costa",
    pass: "Para completar la página del Chinchaysuyu en el pasaporte cuentan:",
    passBonus: "Los animales de la costa dan sellos extra.",
  },
  en: {
    title: "Chinchaysuyu · the coast road",
    lede: "My career again, now as a long road along the Pacific coast, from south to north, the sea always on your left. One huaca for each company I worked at, in chronological order, inspired by the cultures of the Peruvian coast before the Incas, with the same khipu and the same content as the mountain's tambos; then the Huanchaco market of artifacts, a ride on a totora reed boat and, at the end, Inti sinking into the Mamacocha, the mother sea.",
    toc: "Stops on the road",
    close: "Close",
    skip: "Skip to the text mode",
    back: "Back to Qusqu",
    stamp: "Passport stamp",
    bonus: "Bonus passport stamp",
    arriveTitle: "Arriving",
    arrive:
      "You arrive through an Inca stone punku at the south end of the road, from Qusqu, facing north. In the doorway you see Qusqu's plaza, and a carved sign reads “Qusqu”. By the punku, “E · Back to Qusqu” takes you back to the plaza, to its Chinchaysuyu gate. You wear traveler's clothes: a wide-brimmed hat, a polo shirt, shorts and boots.",
    roadTitle: "The road",
    road: "The packed-earth road runs along a coastal terrace, sometimes by the beach and sometimes along cliffs where the waves break and spray flies. Long stretches have a low rammed-earth wall on the landward side, like the coastal Qhapaq Ñan; on the sea side a line of stones marks the edge. You can walk down to the sand wherever the slope is gentle. Two rivers cross the coast to the sea through green valleys with fields, huarango trees and reed beds, and the road crosses them on timber bridges with totora railings. To the east the desert, with cacti and fog meadows, rises toward the snowy Andes; offshore there are rocky islets, a sea stack and the guano island.",
    seaTitle: "The sea",
    sea: "The Pacific reaches the horizon: long waves from the south-west that, near the beach, line up with the shore and break into foam; the water runs up and down the sand with each set of waves. The water is turquoise in the shallows and deep blue further out. At sunset the sun lays a road of golden glints on the water, and at night a silver one under the moon. With sound on you hear the surf, the wind on the cliffs, the gulls and the sea lions.",
    careerTitle: "The career: one huaca per company",
    career:
      "Every company I worked at has its stop, in chronological order from south to north. On its plaza stands a khipu with one cord per stage (its knots light up as you come near) and a carved sign with the company, the monument and the years; the monument rises behind. Near the khipu the same panel opens as at the mountain's tambos: each stage with its role, dates, place, summary, knots and technologies. “E · Read” reopens it and E or Esc closes it. At night two braziers burn at every huaca.",
    monument: "The monument",
    knots: "Knots",
    stack: "Technologies",
    edu: "Education",
    marketTitle: "Huanchaco market · artifacts",
    market:
      "On the terrace above the Huanchaco beach, five cane-and-mat stalls ring a plaza, one per artifact: the pieces I built more than once, at different companies. Each stall has an awning in its artifact's colour and a counter with things of the coast (fish baskets, gourds, pots, folded cloth, fruit); walk up to it and its panel opens with what it is, its technologies and where I used it. A woman keeps the middle stall and three pelicans wait by the fish stall.",
    uses: "Where I used it",
    rideTitle: "The totora reed boat",
    ride: "On the beach below the market waits a caballito de totora, the reed boat of the Huanchaco fishermen, and others dry standing against a cane rail. “E · Board the reed boat” pushes it into the water with you standing on it. Steer with WASD, arrows or the joystick (running paddles harder), with inertia; it rises and falls with the waves, and a breaking wave pushes it toward the beach. You can go about the bay, round the headland with its sea lions and reach the north beach. Near either beach, slowly, “E · Land on the beach” or Esc runs it up the sand and you step off. Reaching the other beach earns a stamp. If you walk to the other beach, the boat waits for you there.",
    peopleTitle: "People",
    people:
      "By day, a few people walk the road between one stop and the next, keeping to their right, and step out of your way; at the market a woman keeps a stall; children run at the edge of the Huanchaco beach, down after the backwash and back up when the wave comes in; by the reed boats wait fishermen, one mending a net. Beyond the waves, a few fishermen paddle kneeling on their reed boats. At night the people go home.",
    wildlife: "Coast wildlife",
    finaleTitle: "The end: Inti and the Mamacocha",
    finale: (years: number, companies: number, artifacts: number, knots: number) =>
      `The road ends on a headland over the sea. There a two-tier adobe platform (each tier one step) faces the west, and on its edge a frame of two posts and a lintel holds a golden ring the sun sets through; banners and two braziers stand around it. The first time you step onto the platform, the coast celebrates: the sky turns to sunset, the ring glows, a flock of pelicans glides past in a V along the cliff, a shower of shells and yellow amancae flowers bursts out (not if your system asks for reduced motion), a short tune plays and the panel “You made it!” opens (with your traveler name if you set one), “End of the Chinchaysuyu”, with ${years} years on the road, ${companies} huacas (companies), ${artifacts} artifacts at the market and ${knots} knots in production, and buttons to make your postcard, book 60 minutes, download the resume, go back to Qusqu or go back to the site. Afterwards “E · See your reward” on the platform opens it again.`,
    book: "Book 60 min",
    cv: "Download resume",
    site: "Back to the site",
    mapTitle: "The map",
    map: "The paper map opens with M (or the gamepad's Y button) and shows the road from south to north, the sea, the stops and where you are. Fast travel between stops opens once you reach the Huanchaco market.",
    passTitle: "Coast stamps",
    pass: "These count toward completing the Chinchaysuyu page of the passport:",
    passBonus: "The coast's animals give bonus stamps.",
  },
} as const;

export const costaTextCopy = (lang: Lang) => COPY[lang];

const id = (s: string) => `kw-costa-tm-${s.replace(/[^a-z0-9-]/gi, "")}`;

export function renderCostaTextMode(lang: Lang, opts: { headingLevel?: number; titleId?: string } = {}): string {
  const c = COPY[lang];
  const h1 = opts.headingLevel ?? 1;
  const h2 = Math.min(6, h1 + 1);
  const h3 = Math.min(6, h1 + 2);
  const h4 = Math.min(6, h1 + 3);
  const tid = opts.titleId ?? "kw-costa-tm-title";
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
    const required = requiredStamps("costa").some((x) => x.id === stampId);
    return `<p class="kw-tm-stamp">${esc(required ? c.stamp : c.bonus)}: ${esc(s.label[lang])}</p>`;
  };
  const link = (href: string, text: string, ext = false) =>
    `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${esc(text)}</a>`;

  section("llegar", c.arriveTitle, `<p>${esc(c.arrive)}</p>`);
  section("camino", c.roadTitle, `<p>${esc(c.road)}</p>`);
  section("mar", c.seaTitle, `<p>${esc(c.sea)}</p>`);

  // ---------------------------------------------------------------- the career (the mountain's khipu content)
  const stops = COMPANY_STOPS.map((stop) => {
    const company = COMPANIES.find((x) => x.id === stop.companyId);
    if (!company) return "";
    const stages = [...khipuFor(company.id)]
      .sort(
        (a, b) =>
          Number(!!a.company.education) - Number(!!b.company.education) || b.stage.start.localeCompare(a.stage.start),
      )
      .map((cord) => {
        const s = cord.stage;
        const knots = s.knots.length
          ? `<p class="kw-tm-label">${esc(c.knots)}</p><ul>${s.knots.map((k) => `<li>${esc(k.text[lang])}</li>`).join("")}</ul>`
          : "";
        const stack = s.stack?.length ? `<p><strong>${esc(c.stack)}:</strong> ${esc(s.stack.join(", "))}</p>` : "";
        const edu = cord.company.education ? ` · ${esc(c.edu)} · ${esc(cord.company.name)}` : "";
        return `<h${h4}>${esc(s.role[lang])}${edu}</h${h4}>
<p class="kw-tm-meta">${esc(fmtPeriod(lang, s.start, s.end))} · ${esc(s.place[lang])}</p>
<p>${esc(s.summary[lang])}</p>${knots}${stack}`;
      })
      .join("\n");
    const cu = CULTURES[stop.culture];
    return `<li><h${h3} id="${id(stop.id)}">${esc(company.name)} · ${esc(cu.name[lang])} <span class="kw-tm-meta">(${esc(companyYears(company, lang))})</span></h${h3}>
<p><strong>${esc(c.monument)}:</strong> ${esc(cu.about[lang])}</p>
${stages}
${stampLine(`costa:station:${stop.id}`)}</li>`;
  }).join("\n");
  section("carrera", c.careerTitle, `<p>${esc(c.career)}</p><ol>${stops}</ol>`);

  // ---------------------------------------------------------------- the market
  const arts = ARTIFACTS.map((a) => {
    const uses = artifactUses(a)
      .map((u) => `<li>${esc(u.company)} · ${esc(u.year)}: ${esc(u.text[lang])}</li>`)
      .join("");
    return `<li><h${h3}>${esc(a.name[lang])}</h${h3}><p class="kw-tm-meta">${esc(a.tech)}</p><p>${esc(a.summary[lang])}</p><p class="kw-tm-label">${esc(c.uses)}</p><ul>${uses}</ul></li>`;
  }).join("\n");
  section("mercado", c.marketTitle, `<p>${esc(c.market)}</p><ul>${arts}</ul>${stampLine("costa:station:huanchaco")}`);
  section("caballito", c.rideTitle, `<p>${esc(c.ride)}</p>${stampLine("costa:ride:caballito")}`);
  section("gente", c.peopleTitle, `<p>${esc(c.people)}</p>`);
  section("fauna", c.wildlife, renderWildlife(lang, h3, COSTA_WILDLIFE));

  // ---------------------------------------------------------------- the finale
  const st = careerStats();
  section(
    "final",
    c.finaleTitle,
    `<p>${esc(c.finale(st.years, st.companies, st.artifacts, st.knots))}</p><p>${link(SITE.calendly, c.book, true)} · ${link(SITE.resume[lang], c.cv)} · <a href="/${lang}/world/cusco/?from=costa">${esc(c.back)}</a> · <a href="/${lang}/">${esc(c.site)}</a></p>${stampLine("costa:summit")}`,
  );
  section("mapa", c.mapTitle, `<p>${esc(c.map)}</p>`);
  const req = requiredStamps("costa")
    .map((s) => `<li>${esc(s.label[lang])}</li>`)
    .join("");
  section("sellos", c.passTitle, `<p>${esc(c.pass)}</p><ul>${req}</ul><p>${esc(c.passBonus)}</p>`);

  return `<header class="kw-tm-head"><h${h1} id="${esc(tid)}" class="kw-tm-title">${esc(c.title)}</h${h1}>
<p class="kw-tm-lede">${esc(c.lede)}</p>
<nav class="kw-tm-toc" aria-label="${esc(c.toc)}"><ol>${toc.join("")}</ol></nav></header>
${sections.join("\n")}`;
}
