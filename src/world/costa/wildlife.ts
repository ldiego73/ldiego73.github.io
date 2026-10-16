/**
 * Field guide of the animals a traveler meets on the Chinchaysuyu coast, for the coast's text mode
 * (./textmode.ts). Same shape as the mountain's guide (../wildlife.ts Species). Every line restates what the
 * fauna ambients actually do (./ambient/orilla.ts: sea lions, penguins, crabs; ./ambient/aves.ts: pelicans,
 * gulls, guanays): where they are, when, how they behave and which bonus passport stamp a good look earns
 * (`costa:fauna:*`, CATALOG in src/lib/passport.ts). Keep it in sync when a module changes. Pure data.
 */
import type { L } from "../contract";
import type { Species } from "../wildlife";

const ALWAYS: L = { es: "De día y de noche.", en: "Day and night." };

export const COSTA_WILDLIFE: readonly Species[] = [
  {
    id: "lobo-marino",
    name: { es: "Lobo marino", en: "South American sea lion" },
    latin: "Otaria flavescens",
    where: {
      es: "En las rocas al pie del promontorio que separa la playa de Huanchaco de la playa del norte, y nadando a su alrededor. Se ven bien desde lo alto del acantilado y desde el caballito de totora.",
      en: "On the rocks at the foot of the headland between the Huanchaco beach and the north beach, and swimming round them. They are best seen from the cliff top and from the totora reed boat.",
    },
    when: ALWAYS,
    does: {
      es: "Una colonia echada sobre las rocas, respirando despacio; algunos levantan la cabeza y la mueven de un lado a otro. Tres nadan en círculos alrededor de las rocas, con la cabeza fuera del agua, subiendo y bajando con las olas. Con el sonido activo se les oye ladrar cuando estás cerca.",
      en: "A colony lying on the rocks, breathing slowly; some hold their heads up and turn them about. Three swim in circles round the rocks with their heads out of the water, rising and falling with the waves. With sound on you hear them bark when you are near.",
    },
    stamp: "costa:fauna:lobo-marino",
  },
  {
    id: "pinguino",
    name: { es: "Pingüino de Humboldt", en: "Humboldt penguin" },
    latin: "Spheniscus humboldti",
    where: {
      es: "En las rocas de la punta, junto a la estación Paracas, en el sur del camino.",
      en: "On the rocks of the point by the Paracas station, in the south of the road.",
    },
    when: ALWAYS,
    does: {
      es: "Un grupo de pingüinos de espalda negra, pecho blanco con la banda negra y la mancha rosada en la cara, de pie sobre las rocas; se giran de un lado a otro y algunos se balancean como al caminar.",
      en: "A group of penguins with black backs, white fronts with the black breast band and the pink patch on the face, standing on the rocks; they turn this way and that and some sway as if waddling.",
    },
    stamp: "costa:fauna:pinguino",
  },
  {
    id: "pelicano",
    name: { es: "Pelícano peruano", en: "Peruvian pelican" },
    latin: "Pelecanus thagus",
    where: {
      es: "Volando en fila sobre el mar a lo largo de la costa; uno pesca frente a la playa de Huanchaco; tres esperan junto al puesto de pescado del mercado.",
      en: "Flying in file over the sea along the coast; one fishes off the Huanchaco beach; three wait by the fish stall of the market.",
    },
    when: ALWAYS,
    does: {
      es: "Dos filas de seis planean bajo sobre el oleaje, subiendo y bajando juntos, costa arriba cerca de la orilla y de vuelta más adentro. El pescador planea en círculos, se lanza en picada al mar con las alas plegadas, salpica, se queda flotando un rato y vuelve a levantar vuelo. Los del mercado esperan restos de pescado. Al final del camino, cuando llegas por primera vez, una bandada pasa planeando en V junto al acantilado.",
      en: "Two files of six glide low over the swell, rising and falling together, up the coast near the shore and back further out. The fisher circles, plunges into the sea with its wings folded, splashes, floats a while and takes off again. Those at the market wait for fish scraps. At the end of the road, the first time you arrive, a flock glides past in a V along the cliff.",
    },
    stamp: "costa:fauna:pelicano",
  },
  {
    id: "guanay",
    name: { es: "Guanay", en: "Guanay cormorant" },
    latin: "Leucocarbo bougainvilliorum",
    where: {
      es: "En la isla guanera, mar adentro a mitad del camino (la isla blanca de guano), y en largas filas volando bajo sobre el mar, lejos de la costa.",
      en: "On the guano island offshore halfway along the road (the island white with guano), and in long lines flying low over the sea far from the shore.",
    },
    when: ALWAYS,
    does: {
      es: "Una colonia densa de cormoranes de espalda negra y pecho blanco de pie sobre la cima de la isla, y dos largas hileras que vuelan hacia el norte a ras del agua. Basta con ver la isla desde la costa cercana.",
      en: "A dense colony of black-backed, white-breasted cormorants standing on the island's top, and two long lines flying north just above the water. Seeing the island from the nearby coast is enough.",
    },
    stamp: "costa:fauna:guanay",
  },
  {
    id: "gaviota",
    name: { es: "Gaviota peruana", en: "Belcher's gull" },
    latin: "Larus belcheri",
    where: {
      es: "Sobre la playa de Huanchaco, frente al mercado, y de pie en la arena junto a los caballitos.",
      en: "Over the Huanchaco beach in front of the market, and standing on the sand by the reed boats.",
    },
    when: {
      es: "De día y de noche; solo gritan de día.",
      en: "Day and night; they only call by day.",
    },
    does: {
      es: "Gaviotas blancas de alas negras y pico amarillo con punta roja dan vueltas en círculos sobre la playa, inclinadas en el giro; otras descansan en la arena. Con el sonido activo se oyen sus gritos.",
      en: "White gulls with black wings and a red-tipped yellow bill wheel in circles over the beach, banking into the turn; others rest on the sand. With sound on you hear their cries.",
    },
    stamp: "costa:fauna:gaviota",
  },
  {
    id: "cangrejo",
    name: { es: "Cangrejo carretero", en: "Ghost crab" },
    latin: "Ocypode gaudichaudii",
    where: {
      es: "En la arena junto a la orilla: en la playa de Huanchaco, la playa del norte, bajo el mercado y cerca de la estación Paracas.",
      en: "On the sand near the waterline: on the Huanchaco beach, the north beach, below the market and near the Paracas station.",
    },
    when: ALWAYS,
    does: {
      es: "Esperan quietos junto a sus madrigueras. Si te acercas mucho corren de lado hacia el agua y desaparecen en la arena; vuelven a salir un rato después, cuando ya te alejaste. Para el sello hay que acercarse a uno antes de que se esconda.",
      en: "They wait still by their burrows. Come close and they scuttle sideways toward the water and vanish into the sand; they come back out a while later, once you have moved off. For the stamp you have to get close to one before it hides.",
    },
    stamp: "costa:fauna:cangrejo",
  },
];
