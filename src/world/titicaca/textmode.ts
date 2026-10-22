/**
 * Accessible text mode of the Collasuyu (Lake Titicaca): the whole shore road narrated stop by stop as plain
 * HTML, with the same content the 3D stations show. `renderTiticacaTextMode` is pure (no DOM, no three.js) so
 * the page renders it at build time as the no-WebGL / failed-load fallback; ./textmode-dialog.ts shows the same
 * document in the runtime's paper dialog (K, the "Text mode" chip, `world:textmode`).
 *
 * Sources (keep it truthful, never invent): the islands' skill groups from src/data/career.ts SKILLS, Taquile's
 * education and certifications from EDUCATION and CERTIFICATIONS (ambient/taquile/logic.ts), the finale's stats
 * from ./plan.ts counts, contact links from data/site.ts, stamp names from lib/passport.ts CATALOG, the field
 * guide from ./wildlife.ts. It describes only what this world does.
 */
import { SITE } from "../../data/site";
import { CATALOG, requiredStamps } from "../../lib/passport";
import type { Lang } from "../contract";
import { esc, renderWildlife } from "../textmode";
import { worldUrl } from "../travel";
import { TRIP_TEXT } from "../travel-panel-logic";
import { taquilePanel } from "./ambient/taquile/logic";
import { statTiles } from "./ambient/titikala/logic";
import { ISLANDS, islandGroup } from "./plan";
import { TITICACA_WILDLIFE } from "./wildlife";

const COPY = {
  es: {
    title: "Collasuyu · el camino del lago Titicaca",
    lede: "Un camino por la orilla sur del lago Titicaca, en el altiplano, a unos 3800 metros: el lago muy azul a un lado, totorales en el agua, puna dorada, chacras con muros de piedra y colinas con andenes al otro, y al fondo, cruzando el lago, los picos nevados de la Cordillera Real. Sopla fuerte el viento del altiplano, desde el lago hacia la orilla: sus ráfagas se ven cruzar como olas por los totorales y el ichu, oscurecen el agua a su paso y agitan las banderas de las islas, la vela de la balsa y los tejidos colgados en Taquile. Es una maqueta compacta: las distancias reales son mucho mayores. Este mundo guarda lo que sé: mis habilidades en las islas flotantes de los uros, y mi formación y certificaciones en Taquile.",
    toc: "Paradas del camino",
    close: "Cerrar",
    skip: "Saltar al modo texto",
    back: "Volver a Qusqu",
    stamp: "Sello del pasaporte",
    bonus: "Sello extra del pasaporte",
    arriveTitle: "Llegar",
    arrive:
      "Llegas desde Qusqu por un punku de piedra, una portada inca trapezoidal con un letrero tallado, al inicio del camino; en su vano se ve una pintura de Haukaypata. Detrás de ti, «E · Volver a Qusqu» te lleva de vuelta a la plaza, a su puerta del Collasuyu. De noche arden dos braseros a sus lados. El viajero va abrigado para el altiplano: sombrero de fieltro marrón con cinta roja, chompa de alpaca tejida con franjas de grecas, chalina roja, pantalón largo y botas.",
    llamaTitle: "Tu llama",
    llama:
      "Unos pasos más allá de la llegada, a la derecha del camino, espera una llama ensillada amarrada a un poste, junto a un abrevadero de piedra y un atado de ichu: lleva una manta tejida de colores, una montura, borlas de lana colgando y pompones en las orejas. A su lado, «E · Montar la llama» te sube; montado avanzas bastante más rápido por el camino, y «E · Bajar» o Esc te baja (ella da un paso al costado). La llama es para el camino: se detiene y te baja al subir a la pasarela de totora, a las islas, a los muelles o a la balsa, al dejar el camino hacia Sillustani, Taquile o la roca Titikala (esos lugares se visitan a pie) y antes de llegar al punku; se queda esperando al borde del camino. Mientras vas en la balsa no aparece su aviso.",
    sillustaniTitle: "Chullpas de Sillustani",
    sillustani:
      "A un lado del camino, un sendero sube a una colina con cuatro chullpas, las torres funerarias de los señores qolla: torres de piedra labrada que se ensanchan hacia arriba, con una cornisa y una pequeña puerta hacia el este. Una está a medio derrumbar, con sus piedras caídas al pie. En la cima hay un círculo de piedras paradas y un letrero que nombra el lugar. Llegar a la cima da un sello extra.",
    urosTitle: "Las islas flotantes de los uros",
    uros: (n: number) =>
      `En una bahía, desde un embarcadero en la orilla, una pasarela flotante de totora (la caña del lago) lleva a ${n} islas flotantes hechas de capas de totora. La pasarela llega primero a la isla central y de ahí a cada una de las demás. Sus pisos son mullidos y se puede caminar por ellos: tienen casas de totora de techos empinados, un fogón de piedras, un poste con una bandera del color de la isla y un letrero pintado con su grupo de habilidades. La isla central tiene una torre mirador de totora, y junto a algunas islas hay balsas amarradas. Cada isla guarda un grupo de las herramientas y prácticas con las que trabajo: estando en ella, «E · Ver habilidades» abre su panel, y con las flechas ← → puedes pasar a las demás islas.`,
    balsaTitle: "La balsa de totora",
    balsa:
      "En la isla más alejada, un muelle de totora sale al agua, y ahí espera una balsa de totora con proa de cabeza de puma y vela de estera. En la punta del muelle, «E · Subir a la balsa» te sube a bordo; vas de pie, empujando con una pértiga larga como los uros. Adelante avanza, atrás frena y retrocede, y los lados giran, también quieto (teclado, joystick o mando); correr la hace ir más rápido. Puedes navegar por todo el lago abierto, sin pasar por la orilla, las islas, la pasarela ni los muelles. Cerca de cualquiera de los dos muelles (el de la isla o el de madera bajo Taquile), yendo despacio, «E · Bajar aquí» o Esc te deja en él. Llegar al otro muelle da un sello. Si llegas a un muelle a pie y la balsa está lejos, el balsero ya la trajo.",
    taquileTitle: "Taquile, isla de tejedores",
    taquile:
      "Más adelante, una colina con andenes entra al lago: Taquile. Desde el camino, un sendero sube y pasa bajo un arco de piedra con un pequeño techo de lajas y un letrero hasta la plaza del pueblo: casas de piedra con techo de paja y puertas azules, y al norte el taller de los tejedores, con un telar de pedales frente a la puerta y un cordel con chullos, fajas y una manta a franjas colgados. En la plaza, hombres sentados tejen chullos a palitos y mujeres hilan con la pushka. Junto al telar, «E · Ver formación» abre un panel tejido como una faja de Taquile:",
    education: "Formación",
    certs: "Certificaciones",
    sunken:
      "Los pescadores dicen que, en las noches quietas, algo brilla bajo el agua no lejos del muelle de Taquile. Cuentan que el lago guarda una ciudad antigua. Quien se acerca de noche y mira con calma recibe un sello extra.",
    muelleTitle: "El muelle de Taquile",
    muelle:
      "Antes de Taquile, un ramal corto baja del camino a un muelle de madera sobre pilotes, el otro extremo del viaje en balsa.",
    peopleTitle: "Gente del lago",
    people:
      "De día, en la isla central una mujer con pollera y sombrero bombín saluda con la mano a quien llega, otra cuida el fogón y dos niños corren en círculos; en las otras islas hay gente tejiendo y amarrando atados de totora. En el lago, tres pescadores de pie en sus balsitas dan vueltas por el agua abierta y de vez en cuando tiran de su cordel. En la puna, una pastora sentada cuida sus alpacas y otra hila de pie junto a sus ovejas. Dos caminantes van y vienen entre el embarcadero de los uros y Taquile, y por todo el camino, en ambos sentidos, pasan viajeros: mujeres con pollera y bombín que cargan su atado en un aguayo a la espalda, hombres con chullo o sombrero de fieltro, algunos también cargados. En los extremos del camino dan la vuelta, y lejos de tu vista a veces aparecen en otro tramo. Al final del camino, en Titikala, hay gente reunida en un pago a la Pachamama (ver más abajo). Al anochecer casi todos vuelven a casa: solo quedan la mujer del fogón, la pastora de las alpacas y, en Titikala, el paqo y un peregrino junto al brasero; las balsitas descansan en el agua.",
    finaleTitle: "Isla del Sol · Titikala, fin del Collasuyu",
    finale:
      "El camino termina en un promontorio que representa la Isla del Sol. En su plaza está la roca sagrada Titikala, «la roca del puma»: una roca larga y rojiza que parece un puma echado, con una mesa de piedra para ofrendas delante, un disco de oro de Inti sobre una estela detrás y un círculo de piedras bajas alrededor, abierto hacia el camino. Por la ladera norte baja una escalinata inca hacia el agua. Según la leyenda inca, aquí Inti hizo salir del lago a Manco Cápac y Mama Ocllo.",
    offering:
      "En el lado este de la plaza, fuera del paso hacia la roca, se hace un pago a la Pachamama: sobre una manta tejida en el suelo está el despacho, con hojas de coca, claveles rojos y blancos, una concha y un paquete de papel, y al lado un brasero de barro. Un paqo arrodillado va colocando las hojas de coca y de rato en rato levanta un k'intu a sus labios; a su alrededor hay peregrinos sentados y una mujer de pie que eleva las manos hacia la roca. Al oeste, una madre con su atado mira jugar a sus niños. De noche solo quedan el paqo y un peregrino, y las brasas del brasero brillan.",
    finaleArrive:
      "La primera vez que llegas a la roca en una visita, suena un breve tema (con el sonido activo), de la roca brota una lluvia de chispas doradas como el sol del amanecer que caen despacio (no si tu sistema pide reducir el movimiento), y el disco de Inti y un halo brillan un momento. Luego se abre el panel «¡Lo lograste!», con tu nombre de viajero si lo pusiste, cuatro cifras reales y botones para crear tu postal, agendar 60 minutos, descargar el CV, volver a Qusqu o volver al sitio. Junto a la roca, la tecla E lo vuelve a abrir. De noche, el disco de Inti brilla tenue.",
    stats: "Las cifras del panel",
    book: "Agendar 60 min",
    cv: "Descargar CV",
    wildlife: "Fauna del lago",
    mapTitle: "El mapa",
    map: "El mapa de papel se abre con M (o el botón Y del mando): el camino de oeste a este, el lago al norte con las islas de los uros y su pasarela, Taquile y la Isla del Sol. El viaje rápido entre lugares se abre al llegar a Taquile.",
    passTitle: "Sellos del Collasuyu",
    required: "Cuentan para completar esta página del pasaporte:",
  },
  en: {
    title: "Collasuyu · the Lake Titicaca road",
    lede: "A road along the southern shore of Lake Titicaca, on the altiplano at some 3,800 metres: the very blue lake on one side, reed beds in the water, golden puna, stone-walled fields and terraced hills on the other, and far across the lake the snowy peaks of the Cordillera Real. The altiplano wind blows hard, off the lake toward the shore: its gusts can be seen rolling like waves across the reed beds and the ichu, darkening the water as they pass, and they shake the islands' flags, the reed boat's sail and the weavings hung out on Taquile. It is a compact model: the real distances are much larger. This world holds what I know: my skills on the Uros floating islands, and my education and certifications on Taquile.",
    toc: "Stops on the road",
    close: "Close",
    skip: "Skip to the text mode",
    back: "Back to Qusqu",
    stamp: "Passport stamp",
    bonus: "Bonus passport stamp",
    arriveTitle: "Arriving",
    arrive:
      "You arrive from Qusqu through a stone punku, a trapezoidal Inca doorway with a carved sign, at the start of the road; in its opening is a painting of Haukaypata. Behind you, “E · Back to Qusqu” takes you back to the plaza, to its Collasuyu gate. At night two braziers burn beside it. The traveler is dressed for the altiplano: a brown felt hat with a red band, a knitted alpaca sweater with patterned bands, a red scarf, long trousers and boots.",
    llamaTitle: "Your llama",
    llama:
      "A few steps past the arrival, on the right of the road, a saddled llama waits tied to a post, by a stone trough and a sheaf of ichu: it wears a colourful woven blanket, a saddle, hanging wool tassels and pompoms on its ears. Beside it, “E · Ride the llama” mounts you; riding, you go a good deal faster along the road, and “E · Dismount” or Esc gets you off (it steps aside). The llama is for the road: it stops and lets you off when you step onto the reed boardwalk, the islands, the piers or the boat, when you leave the road for Sillustani, Taquile or the Titikala rock (those places are visited on foot) and before the punku; it waits at the roadside. While you are on the boat its prompt does not show.",
    sillustaniTitle: "Sillustani chullpas",
    sillustani:
      "Beside the road, a path climbs a hill with four chullpas, the funerary towers of the Qolla lords: towers of dressed stone that widen as they rise, with a cornice and a small doorway facing east. One is half ruined, its stones fallen at its foot. On the top stands a ring of upright stones and a sign that names the place. Reaching the top gives a bonus stamp.",
    urosTitle: "The Uros floating islands",
    uros: (n: number) =>
      `In a bay, from a landing on the shore, a floating boardwalk of totora (the lake's reed) leads to ${n} floating islands made of layers of totora. The boardwalk reaches the central island first and from there each of the others. Their floors are springy and you can walk on them: they have totora huts with steep roofs, a stone hearth, a pole with a flag in the island's colour and a painted board with its group of skills. The central island has a totora watchtower, and reed boats are moored beside some islands. Each island holds one group of the tools and practices I work with: standing on it, “E · See skills” opens its panel, and the ← → arrows browse the other islands.`,
    balsaTitle: "The totora reed boat",
    balsa:
      "On the farthest island, a reed jetty runs out into the water, and a totora boat waits there, with a puma-head prow and a reed-mat sail. At the jetty's tip, “E · Board the reed boat” takes you aboard; you stand, pushing with a long pole like the Uros. Forward moves ahead, back brakes and backs, and the sides turn, even at rest (keyboard, joystick or gamepad); running makes it faster. You can sail all over the open lake, never through the shore, the islands, the boardwalk or the piers. Near either pier (the island's or the wooden one below Taquile), going slowly, “E · Get off here” or Esc puts you on it. Reaching the other pier gives a stamp. If you walk to a pier and the boat is far away, the boatman has already brought it.",
    taquileTitle: "Taquile, island of weavers",
    taquile:
      "Further on, a terraced hill runs out into the lake: Taquile. From the road a path climbs and passes under a stone arch with a little slab roof and a sign, up to the village plaza: stone houses with thatched roofs and blue doors, and on the north side the weavers' workshop, with a pedal loom in front of the door and a line of chullos, belts and a striped manta hung out. On the plaza, seated men knit chullos on needles and women spin with the pushka. By the loom, “E · See education” opens a panel woven like a Taquile belt:",
    education: "Education",
    certs: "Certifications",
    sunken:
      "Fishermen say that on still nights something glows under the water not far from the Taquile pier. Legend says the lake keeps an ancient city. Whoever comes close at night and takes a calm look earns a bonus stamp.",
    muelleTitle: "The Taquile pier",
    muelle:
      "Before Taquile, a short branch leads down from the road to a wooden pier on posts, the other end of the boat trip.",
    peopleTitle: "People of the lake",
    people:
      "By day, on the central island a woman in a pollera and bowler hat waves at whoever arrives, another tends the hearth and two children run in circles; on the other islands people are weaving and binding bundles of totora. On the lake, three fishermen standing in their little reed boats go round the open water and now and then haul on their lines. On the puna a herder sits watching her alpacas and another spins on her feet beside her sheep. Two walkers go back and forth between the Uros landing and Taquile, and all along the road, both ways, travellers come and go: women in polleras and bowler hats carrying their bundle in an aguayo on their backs, men in chullos or felt hats, some loaded too. At the ends of the road they turn back, and out of your sight they sometimes reappear on another stretch. At the end of the road, at Titikala, people are gathered for an offering to the Pachamama (see below). At nightfall almost everyone goes home: only the woman at the hearth, the alpaca herder and, at Titikala, the paqo and one pilgrim by the brazier stay; the little boats rest on the water.",
    finaleTitle: "Isla del Sol · Titikala, end of the Collasuyu",
    finale:
      "The road ends on a headland that stands for the Isla del Sol. On its plaza stands the sacred rock Titikala, “the puma's rock”: a long reddish rock that looks like a crouching puma, with a stone offering table in front of it, a gold disc of Inti on a stela behind it and a ring of low stones round it, open toward the road. Down the north slope an Inca stairway runs to the water. In Inca legend, Inti made Manco Cápac and Mama Ocllo rise from the lake here.",
    offering:
      "On the plaza's east side, off the walk to the rock, an offering to the Pachamama (a pago) is under way: on a woven cloth on the ground lies the despacho, with coca leaves, red and white carnations, a shell and a paper packet, and beside it a clay brazier. A kneeling paqo lays out the coca leaves and now and then lifts a k'intu to his lips; round him sit pilgrims, and a woman stands raising her hands toward the rock. To the west, a mother with her bundle watches her children play. At night only the paqo and one pilgrim stay, and the brazier's embers glow.",
    finaleArrive:
      "The first time you reach the rock on a visit, a short tune plays (with sound on), a shower of sunrise-gold sparks bursts from the rock and drifts slowly down (not if your system asks for reduced motion), and the Inti disc and a halo flare for a moment. Then the panel “You made it!” opens, with your traveler name if you set one, four true figures and buttons to make your postcard, book 60 minutes, download the resume, go back to Qusqu or back to the site. By the rock, the E key opens it again. At night, the Inti disc glows faintly.",
    stats: "The panel's figures",
    book: "Book 60 min",
    cv: "Download resume",
    wildlife: "Wildlife of the lake",
    mapTitle: "The map",
    map: "The paper map opens with M (or the gamepad's Y button): the road from west to east, the lake to the north with the Uros islands and their boardwalk, Taquile and the Isla del Sol. Fast travel between places opens once you reach Taquile.",
    passTitle: "Collasuyu stamps",
    required: "These count toward completing this passport page:",
  },
} as const;

export const titicacaTextCopy = (lang: Lang) => COPY[lang];

const id = (s: string) => `kw-titicaca-tm-${s.replace(/[^a-z0-9-]/gi, "")}`;

export function renderTiticacaTextMode(lang: Lang, opts: { headingLevel?: number; titleId?: string } = {}): string {
  const c = COPY[lang];
  const h1 = opts.headingLevel ?? 1;
  const h2 = Math.min(6, h1 + 1);
  const h3 = Math.min(6, h1 + 2);
  const tid = opts.titleId ?? "kw-titicaca-tm-title";
  const toc: string[] = [];
  const sections: string[] = [];
  const section = (key: string, title: string, body: string) => {
    toc.push(`<li><a href="#${id(key)}">${esc(title)}</a></li>`);
    sections.push(
      `<section aria-labelledby="${id(key)}"><h${h2} id="${id(key)}">${esc(title)}</h${h2}>${body}</section>`,
    );
  };
  const required = new Set(requiredStamps("titicaca").map((s) => s.id));
  const stampLine = (stampId: string) => {
    const s = CATALOG.find((x) => x.id === stampId);
    if (!s) return "";
    return `<p class="kw-tm-stamp">${esc(required.has(stampId) ? c.stamp : c.bonus)}: ${esc(s.label[lang])}</p>`;
  };
  const link = (href: string, text: string, ext = false) =>
    `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${esc(text)}</a>`;
  const back = worldUrl(lang, "cusco", "titicaca");

  section("llegar", c.arriveTitle, `<p>${esc(c.arrive)}</p><p>${link(back, c.back)}</p>`);
  section("llama", c.llamaTitle, `<p>${esc(c.llama)}</p>`);
  section("sillustani", c.sillustaniTitle, `<p>${esc(c.sillustani)}</p>${stampLine("titicaca:station:sillustani")}`);
  const islands = ISLANDS.map((isl) => {
    const g = islandGroup(isl);
    const items = g.items.map((x) => `<li>${esc(x)}</li>`).join("");
    return `<li><h${h3}>${esc(g.group[lang])}</h${h3}><ul>${items}</ul>${stampLine(`titicaca:station:${isl.id}`)}</li>`;
  }).join("");
  section("uros", c.urosTitle, `<p>${esc(c.uros(ISLANDS.length))}</p><ol>${islands}</ol>`);
  section("balsa", c.balsaTitle, `<p>${esc(c.balsa)}</p>${stampLine("titicaca:ride:balsa")}`);
  section(
    "muelle",
    c.muelleTitle,
    `<p>${esc(c.muelle)}</p><p>${esc(c.sunken)}</p>${stampLine("titicaca:egg:sunken-city")}`,
  );
  const t = taquilePanel(lang);
  const rows = (list: typeof t.education) =>
    `<ul>${list.map((r) => `<li><strong>${esc(r.title)}</strong>${r.detail ? ` · ${esc(r.detail)}` : ""} · ${esc(r.years)}</li>`).join("")}</ul>`;
  section(
    "taquile",
    c.taquileTitle,
    `<p>${esc(c.taquile)}</p><h${h3}>${esc(c.education)}</h${h3}>${rows(t.education)}<h${h3}>${esc(c.certs)}</h${h3}>${rows(t.certs)}${stampLine("titicaca:station:taquile")}`,
  );
  section("gente", c.peopleTitle, `<p>${esc(c.people)}</p>`);
  const stats = statTiles()
    .map((s) => `<li>${esc(s.label[lang])}: <strong>${esc(s.value)}</strong></li>`)
    .join("");
  section(
    "titikala",
    c.finaleTitle,
    `<p>${esc(c.finale)}</p><p>${esc(c.offering)}</p><p>${esc(c.finaleArrive)}</p><h${h3}>${esc(c.stats)}</h${h3}><ul>${stats}</ul><p>${link(SITE.calendly, c.book, true)} · ${link(SITE.resume[lang], c.cv)} · ${link(back, c.back)}</p>${stampLine("titicaca:summit")}`,
  );
  section("fauna", c.wildlife, renderWildlife(lang, h3, TITICACA_WILDLIFE));
  section("mapa", c.mapTitle, `<p>${esc(c.map)}</p><p>${esc(TRIP_TEXT[lang])}</p>`);
  const req = CATALOG.filter((s) => required.has(s.id))
    .map((s) => `<li>${esc(s.label[lang])}</li>`)
    .join("");
  section("sellos", c.passTitle, `<p>${esc(c.required)}</p><ul>${req}</ul>`);

  return `<header class="kw-tm-head"><h${h1} id="${esc(tid)}" class="kw-tm-title">${esc(c.title)}</h${h1}>
<p class="kw-tm-lede">${esc(c.lede)}</p>
<nav class="kw-tm-toc" aria-label="${esc(c.toc)}"><ol>${toc.join("")}</ol></nav></header>
${sections.join("\n")}`;
}
