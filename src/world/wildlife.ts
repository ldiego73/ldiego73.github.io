/**
 * Field guide of the animals a traveler can meet on the Qhapaq Ñan, for the text mode (textmode.ts).
 * Every line restates what the fauna modules actually do (fauna.ts, ambient/bear.ts, puma.ts, fox.ts,
 * duck.ts, tinamou.ts, sparrows.ts, birds.ts, llama-mount.ts): where they live, when they are out and how
 * they behave. Keep it in sync when a module changes. Pure data (no DOM): also rendered at build time.
 */
import type { L } from "./contract";

export interface Species {
  id: string;
  name: L;
  latin: string;
  where: L;
  when: L;
  does: L;
  /** Passport stamp earned on a good look, if any. */
  stamp?: string;
}

const ALWAYS: L = { es: "De día y de noche.", en: "Day and night." };

export const WILDLIFE: readonly Species[] = [
  {
    id: "llama-ride",
    name: { es: "Llama de montar", en: "Riding llama" },
    latin: "Lama glama",
    where: { es: "En la plaza del inicio del camino, ensillada.", en: "At the trailhead plaza, saddled." },
    when: ALWAYS,
    does: {
      es: "Pulsa E a su lado para montarla: camina más rápido que a pie. E o Esc para bajar; si viajas por el mapa, vuelve sola a la plaza.",
      en: "Press E next to it to ride: it is faster than walking. E or Esc to get off; after fast travel it trots back to the plaza.",
    },
    stamp: "ride:llama",
  },
  {
    id: "caravan",
    name: { es: "Caravana de llamas", en: "Llama caravan" },
    latin: "Lama glama",
    where: {
      es: "Sobre el empedrado del tramo bajo, entre el valle y la quebrada.",
      en: "On the paving of the lower trail, between the valley and the gorge.",
    },
    when: ALWAYS,
    does: {
      es: "Llamas cargueras con mantas teñidas van y vienen por el camino en fila. Si te cruzas con ellas, esperan y se apartan a un lado para dejarte pasar.",
      en: "Pack llamas with dyed blankets walk the trail up and down in single file. When you meet them they wait and step aside to let you pass.",
    },
  },
  {
    id: "alpaca",
    name: { es: "Alpaca", en: "Alpaca" },
    latin: "Vicugna pacos",
    where: {
      es: "Pastando junto al camino, debajo de los tambos de las empresas y cerca del Khipu de escritos.",
      en: "Grazing beside the trail, below the company tambos and near the Writing khipu.",
    },
    when: ALWAYS,
    does: {
      es: "Domésticas y curiosas: si caminas con calma se acercan al borde del camino. Pulsa E junto a una para saludarla. Si corres hacia ellas, el rebaño se dispersa.",
      en: "Domestic and curious: walk calmly and they come over to the edge of the path. Press E next to one to say hi. Run at them and the herd scatters.",
    },
  },
  {
    id: "vicuna",
    name: { es: "Vicuña", en: "Vicuña" },
    latin: "Vicugna vicugna",
    where: {
      es: "En la puna alta: rebaños a lo largo de la mitad superior del camino, junto a la quebrada y cerca de la cumbre.",
      en: "On the high puna: herds along the upper half of the trail, by the gorge and near the summit.",
    },
    when: ALWAYS,
    does: {
      es: "Pastan en rebaño tras una guía. Son ariscas: levantan la cabeza para vigilarte, se alejan si te acercas y huyen a galope si corres.",
      en: "They graze in herds behind a leader. Wary: heads come up to watch you, they drift away as you approach and bolt if you run.",
    },
  },
  {
    id: "vizcacha",
    name: { es: "Vizcacha", en: "Mountain vizcacha" },
    latin: "Lagidium peruanum",
    where: {
      es: "En colonias junto a las rocas grandes cerca del camino.",
      en: "In colonies around the big rocks near the trail.",
    },
    when: ALWAYS,
    does: {
      es: "Toman el sol y dan saltitos alrededor de su roca, moviendo la nariz. Te miran fijo y, si te acercas, se esconden detrás de la roca.",
      en: "They sun themselves and hop around their rock, noses twitching. They stare at you and, if you come close, hide behind the rock.",
    },
  },
  {
    id: "bear",
    name: { es: "Oso de anteojos", en: "Spectacled bear" },
    latin: "Tremarctos ornatus",
    where: {
      es: "En el bosque de neblina del tramo bajo y medio del camino, junto a árboles de unca y aliso.",
      en: "In the cloud forest of the lower and middle trail, by unca and aliso trees.",
    },
    when: { es: "De día y al atardecer; de noche se retira.", en: "By day and into dusk; at night it retires." },
    does: {
      es: "Come bromelias sentado en la ladera, camina despacio y trepa a los árboles a descansar. Si te acercas se para sobre las patas traseras a olfatear y luego se aleja con calma. Nunca ataca.",
      en: "It sits on the slope eating bromeliads, ambles along and climbs trees to rest. If you come close it rears up on its hind legs to sniff, then calmly walks away. Never aggressive.",
    },
    stamp: "fauna:oso",
  },
  {
    id: "tinamou",
    name: { es: "Perdiz andina", en: "Andean tinamou" },
    latin: "Nothoprocta ornata",
    where: {
      es: "Escondida en el ichu al borde del camino, hasta la puna.",
      en: "Hidden in the ichu grass at the trail edge, up to the puna.",
    },
    when: { es: "De día y al atardecer; de noche duerme.", en: "By day and at dusk; it sleeps at night." },
    does: {
      es: "Grupos de dos a cuatro caminan y picotean entre las matas. Al acercarte se quedan inmóviles y de pronto salen volando casi en vertical, planean un trecho y vuelven a caer en la hierba.",
      en: "Coveys of two to four walk and peck among the tufts. As you approach they freeze, then burst up almost vertically, glide a short way and drop back into the grass.",
    },
    stamp: "fauna:perdiz",
  },
  {
    id: "duck",
    name: { es: "Pato de los torrentes", en: "Torrent duck" },
    latin: "Merganetta armata",
    where: {
      es: "En el arroyo de montaña, a ambos lados del puente de losa y en la poza de la cascada.",
      en: "On the mountain stream, either side of the slab bridge, and in the waterfall pool.",
    },
    when: {
      es: "Activos de día; de noche descansan en las rocas.",
      en: "Active by day; at night they rest on the rocks.",
    },
    does: {
      es: "En parejas, se posan en piedras mojadas moviendo la cabeza, nadan contra la corriente, se zambullen y, si te acercas, escapan corriendo sobre el agua aleteando.",
      en: "In pairs they perch on wet rocks bobbing their heads, swim against the current, dive and, if you come close, flutter-run away over the water.",
    },
    stamp: "fauna:pato",
  },
  {
    id: "sparrow",
    name: { es: "Pichitanka (gorrión andino)", en: "Rufous-collared sparrow" },
    latin: "Zonotrichia capensis",
    where: {
      es: "En los bordes del camino, un poco por delante de ti.",
      en: "On the edges of the trail, a little ahead of you.",
    },
    when: { es: "De día; de noche duermen.", en: "By day; they sleep at night." },
    does: {
      es: "Saltan y picotean en el borde, vuelan cuando te acercas y se posan más arriba en el camino.",
      en: "They hop and peck along the curb, fly off as you come near and land again further up the path.",
    },
  },
  {
    id: "tangara",
    name: { es: "Tangara", en: "Tanager" },
    latin: "Thraupidae",
    where: {
      es: "En bandadas pequeñas en los árboles: queñua, aliso, unca, pisonay y chusquea.",
      en: "In small flocks in the trees: queñua, aliso, unca, pisonay and chusquea.",
    },
    when: ALWAYS,
    does: {
      es: "Saltan de rama en rama, giran la cabeza para mirarte y vuelan a otro árbol cuando pasas cerca.",
      en: "They hop between branches, turn their heads to watch you and fly to another tree when you pass close by.",
    },
  },
  {
    id: "colibri",
    name: { es: "Colibrí", en: "Hummingbird" },
    latin: "Trochilidae",
    where: {
      es: "Junto a las flores: lupinos y margaritas al borde del camino, flores del pisonay y bromelias del unca.",
      en: "At the flowers: lupines and daisies by the trail, pisonay blossoms and unca bromeliads.",
    },
    when: ALWAYS,
    does: {
      es: "Se suspenden en el aire frente a cada flor y saltan de una a otra; se apartan cuando te acercas.",
      en: "They hover at each flower and dart from one to the next; they move off when you come close.",
    },
  },
  {
    id: "gallito",
    name: { es: "Gallito de las rocas", en: "Andean cock-of-the-rock" },
    latin: "Rupicola peruvianus",
    where: { es: "En los árboles de unca del bosque de neblina.", en: "In the unca trees of the cloud forest." },
    when: ALWAYS,
    does: {
      es: "El ave nacional del Perú: los machos naranjas hacen reverencias en su danza de cortejo.",
      en: "Peru's national bird: the orange males bow in their courtship display.",
    },
  },
  {
    id: "condor",
    name: { es: "Cóndor andino", en: "Andean condor" },
    latin: "Vultur gryphus",
    where: {
      es: "Planeando en círculos amplios sobre la quebrada del puente y sobre la cumbre.",
      en: "Soaring in wide circles over the bridge gorge and above the summit.",
    },
    when: ALWAYS,
    does: {
      es: "Casi no aletea: se inclina en las curvas, da unos pocos aletazos lentos y de vez en cuando baja en picada y vuelve a subir.",
      en: "It hardly flaps: it banks into its turns, gives a few slow wingbeats and now and then swoops down and climbs back.",
    },
  },
  {
    id: "fox",
    name: { es: "Zorro andino", en: "Andean fox" },
    latin: "Lycalopex culpaeus",
    where: {
      es: "En las laderas, un poco por delante de ti, cruzando el camino.",
      en: "On the slopes a little ahead of you, crossing the trail.",
    },
    when: {
      es: "Sobre todo al atardecer y de noche; a veces de día.",
      en: "Mostly at dusk and through the night; now and then by day.",
    },
    does: {
      es: "Trota con su cola espesa de punta negra, se detiene a mirar por encima del hombro, olfatea o se sienta un momento. Si te acercas mucho, se va trotando.",
      en: "It trots along with its bushy black-tipped tail, stops to look back over its shoulder, sniffs or sits for a moment. Come too close and it trots off.",
    },
    stamp: "fauna:zorro",
  },
  {
    id: "puma",
    name: { es: "Puma", en: "Puma" },
    latin: "Puma concolor",
    where: {
      es: "En miradores sobre el camino (cornisas y bordes de andenes), un poco más adelante.",
      en: "On lookouts above the trail (ledges and terrace edges), a little ahead.",
    },
    when: { es: "Solo de noche.", en: "Night only." },
    does: {
      es: "Echado o sentado, vigila el camino; sus ojos brillan con la luz. Cuando te acercas se levanta, te mira un momento y se escabulle. A veces cruza el camino a lo lejos.",
      en: "Lying or sitting, it watches the trail; its eyes catch the light. As you approach it rises, holds a look and slinks away. Sometimes it crosses the path in the distance.",
    },
    stamp: "fauna:puma",
  },
];
