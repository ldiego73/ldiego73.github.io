/**
 * Field guide of the animals a traveler meets on the Chinchaysuyu coast, for the coast's text mode
 * (./textmode.ts). Same shape as the mountain's guide (../wildlife.ts Species). Every line restates what the
 * fauna ambients actually do (./ambient/orilla.ts: sea lions, penguins, crabs; ./ambient/aves.ts: pelicans,
 * gulls, guanays; ./ambient/tierra.ts: viringo dogs, burros, goats, cañanes, sanderlings, boobies; the riding
 * horse of ./ambient/caballo.ts, listed like the mountain's riding llama): where they are, when, how they behave
 * and which bonus passport stamp a good look earns, if any (`costa:fauna:*`, CATALOG in src/lib/passport.ts).
 * Keep it in sync when a module changes. Pure data.
 */
import type { L } from "../contract";
import type { Species } from "../wildlife";

const ALWAYS: L = { es: "De día y de noche.", en: "Day and night." };

export const COSTA_WILDLIFE: readonly Species[] = [
  {
    id: "caballo-de-paso",
    name: { es: "Caballo de paso peruano", en: "Peruvian Paso horse" },
    latin: "Equus caballus",
    where: {
      es: "Ensillado junto al camino, del lado del mar, a pocos pasos del punku de la llegada.",
      en: "Saddled beside the road, on the sea side, a few steps from the punku where you arrive.",
    },
    when: ALWAYS,
    does: {
      es: "Pulsa E a su lado para montarlo: avanza más rápido que a pie en el paso llano, su andar lateral. E o Esc para bajar; en la plaza de cada parada te bajas y te espera al borde del camino, y si viajas por el mapa vuelve a su sitio.",
      en: "Press E next to it to ride: it is faster than walking, in the paso llano, its lateral gait. E or Esc to get off; at each stop's plaza you get off and it waits by the roadside, and after fast travel it is back at its spot.",
    },
  },
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
      es: "Una colonia echada sobre las rocas, dormitando; algunos levantan la cabeza y miran a su alrededor, abren la boca para ladrar o se rascan con una aleta. Tres nadan en círculos alrededor de las rocas, con la cabeza fuera del agua, subiendo y bajando con las olas. Con el sonido activo se les oye ladrar cuando estás cerca.",
      en: "A colony lying on the rocks, dozing; some hold their heads up and look about, open their mouths to bark or scratch with a flipper. Three swim in circles round the rocks with their heads out of the water, rising and falling with the waves. With sound on you hear them bark when you are near.",
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
      es: "Un grupo de pingüinos de espalda negra, pecho blanco con la banda negra y la mancha rosada en la cara, de pie sobre las rocas; se giran de un lado a otro, se acicalan y se sacuden.",
      en: "A group of penguins with black backs, white fronts with the black breast band and the pink patch on the face, standing on the rocks; they turn this way and that, preen and shake themselves.",
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
  {
    id: "viringo",
    name: { es: "Perro sin pelo del Perú (viringo)", en: "Peruvian hairless dog (viringo)" },
    latin: "Canis lupus familiaris",
    where: {
      es: "Dos en la plaza del mercado de Huanchaco y uno en la plaza de la primera huaca.",
      en: "Two on the Huanchaco market plaza and one on the plaza of the first huaca.",
    },
    when: ALWAYS,
    does: {
      es: "Perros esbeltos de piel gris pizarra sin pelo, con manchas rosadas y orejas alzadas. Trotan por la plaza, se detienen a olfatear el suelo y giran la cabeza hacia ti cuando estás cerca.",
      en: "Slender dogs with bare slate-grey skin, pink blotches and pricked ears. They trot about the plaza, stop to sniff the ground and turn their heads to you when you are near.",
    },
  },
  {
    id: "burro",
    name: { es: "Burro", en: "Donkey" },
    latin: "Equus asinus",
    where: {
      es: "En los valles verdes de los dos ríos, tierra adentro del camino: dos en el segundo valle y uno en el primero.",
      en: "In the green valleys of the two rivers, inland of the road: two in the second valley and one in the first.",
    },
    when: ALWAYS,
    does: {
      es: "Burros grises de hocico y vientre claros y orejas largas. Pastan con la cabeza gacha y caminan despacio de una mata a otra; si te acercas levantan la cabeza y te miran.",
      en: "Grey donkeys with pale muzzles and bellies and long ears. They graze with their heads down and amble from one patch to the next; come close and they lift their heads to look at you.",
    },
  },
  {
    id: "cabra",
    name: { es: "Cabra", en: "Goat" },
    latin: "Capra hircus",
    where: {
      es: "En las lomas tierra adentro del camino, poco antes de la pirámide de Caral.",
      en: "On the hills inland of the road, a little before the Caral pyramid.",
    },
    when: ALWAYS,
    does: {
      es: "Un pequeño rebaño de cabras blancas, pardas y oscuras ramonea por el desierto: caminan un trecho, bajan la cabeza a comer y vuelven a moverse, sin alejarse unas de otras.",
      en: "A small herd of white, brown and dark goats browses the desert: they walk a stretch, lower their heads to feed and move on again, keeping close together.",
    },
  },
  {
    id: "canan",
    name: { es: "Cañán", en: "Cañán (desert lizard)" },
    latin: "Dicrodon guttulatum",
    where: {
      es: "En la arena del desierto junto al camino, tierra adentro, en tres tramos del sur, del centro y del norte.",
      en: "On the desert sand beside the road, inland, along three stretches in the south, the middle and the north.",
    },
    when: ALWAYS,
    does: {
      es: "Lagartijas arenosas de manchas claras y cola larga que toman sol y a ratos hacen flexiones. Si te acercas corren a su madriguera y desaparecen en la arena; vuelven a salir cuando ya te alejaste.",
      en: "Sandy lizards with pale spots and long tails that bask and now and then do push-ups. Come close and they dash to their burrow and vanish into the sand; they come back out once you have moved off.",
    },
  },
  {
    id: "playero",
    name: { es: "Playero blanco", en: "Sanderling" },
    latin: "Calidris alba",
    where: {
      es: "En el borde del agua de las dos playas de caballitos: la de Huanchaco y la del norte.",
      en: "At the water's edge of both reed-boat beaches: Huanchaco and the north beach.",
    },
    when: ALWAYS,
    does: {
      es: "Pequeñas aves blancas y grises que siguen el borde del agua: bajan por la arena cuando la ola se retira y suben corriendo cuando vuelve, y se detienen a picotear.",
      en: "Small white and grey birds that follow the edge of the water: they run down the sand as the wave draws back and scurry up when it comes in, stopping to peck.",
    },
  },
  {
    id: "piquero",
    name: { es: "Piquero peruano", en: "Peruvian booby" },
    latin: "Sula variegata",
    where: {
      es: "Sobre el mar junto a la orilla, entre Pachacamac y el recinto Chancay.",
      en: "Over the sea near the shore, between Pachacamac and the Chancay compound.",
    },
    when: ALWAYS,
    does: {
      es: "Aves de cabeza y pecho blancos y alas pardas que vuelan en círculos sobre el agua; una tras otra pliegan las alas, se lanzan en picada al mar con una salpicadura, flotan un momento y vuelven a levantar vuelo. Si tu sistema pide reducir el movimiento, planean quietas.",
      en: "Birds with white heads and breasts and brown wings that wheel over the water; one after another they fold their wings and plunge into the sea with a splash, float a moment and take off again. If your system asks for reduced motion, they glide still.",
    },
  },
];
