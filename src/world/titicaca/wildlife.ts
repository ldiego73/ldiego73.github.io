/**
 * Field guide of the animals a traveler can meet on the Collasuyu shore road, for the lake's text mode
 * (./textmode.ts). Same shape as the mountain's guide (../wildlife.ts Species). Every line restates what the
 * fauna ambients actually do (./ambient/aves.ts: grebes, flamingos, gulls; ./ambient/orilla.ts: alpacas, llamas,
 * vizcachas, the frog; ./ambient/puna.ts: geese, ibises, teals, sheep and their dog, cuyes, trout): where they
 * live, when they are out, how they behave, and which bonus passport stamp a good look earns (`titicaca:fauna:*`,
 * CATALOG in src/lib/passport.ts; the puna.ts animals earn none). Keep it in sync when a module changes.
 * Pure data (no DOM): also rendered at build time.
 */
import type { Species } from "../wildlife";

export type { Species };

export const TITICACA_WILDLIFE: readonly Species[] = [
  {
    id: "zambullidor",
    name: { es: "Zambullidor del Titicaca", en: "Titicaca grebe" },
    latin: "Rollandia microptera",
    where: {
      es: "En el agua, entre los totorales de la orilla y alrededor de las islas de los uros.",
      en: "On the water, in the reed beds along the shore and round the Uros islands.",
    },
    when: {
      es: "De día nadan y se zambullen; de noche duermen sobre el agua.",
      en: "By day they swim and dive; at night they sleep on the water.",
    },
    does: {
      es: "Un ave que no vuela, de lomo oscuro, cuello castaño y garganta blanca. Cada uno pasea despacio por su rincón de totoral; de vez en cuando, o si te acercas a unos pasos, se zambulle y reaparece unos metros más allá unos segundos después.",
      en: "A flightless bird with a dark back, a chestnut neck and a white throat. Each one paddles slowly about its patch of reeds; every so often, or if you come within a few steps, it dives and comes up a few metres away some seconds later.",
    },
    stamp: "titicaca:fauna:zambullidor",
  },
  {
    id: "flamenco",
    name: { es: "Parihuana · flamenco andino", en: "Parihuana · Andean flamingo" },
    latin: "Phoenicoparrus andinus",
    where: {
      es: "En la bahía poco profunda entre Taquile y la Isla del Sol, junto al camino.",
      en: "In the shallow bay between Taquile and the Isla del Sol, beside the road.",
    },
    when: {
      es: "De día se alimentan; de noche se quedan quietos con la cabeza recogida.",
      en: "By day they feed; at night they stand still with their heads tucked in.",
    },
    does: {
      es: "Una bandada rosada con plumas de vuelo negras y patas amarillas. Vadean despacio con la cabeza dentro del agua, moviéndola de lado a lado para filtrar su comida; de vez en cuando uno levanta la cabeza y abre las alas. Si te acercas, se alejan caminando.",
      en: "A pink flock with black flight feathers and yellow legs. They wade slowly with their heads in the water, sweeping them side to side to filter their food; now and then one raises its head and spreads its wings. If you come close they walk away.",
    },
    stamp: "titicaca:fauna:flamenco",
  },
  {
    id: "gaviota",
    name: { es: "Gaviota andina", en: "Andean gull" },
    latin: "Chroicocephalus serranus",
    where: {
      es: "Volando en círculos sobre la bahía de los uros, sobre Taquile y sobre la orilla; algunas descansan en el agua junto a las islas.",
      en: "Circling over the Uros bay, over Taquile and over the shore; a few rest on the water by the islands.",
    },
    when: {
      es: "De día vuelan; de noche todas se posan en el agua.",
      en: "They fly by day; at night they all settle on the water.",
    },
    does: {
      es: "Blanca, de alas grises con puntas negras y capucha oscura. Planea en círculos amplios, aleteando a ratos.",
      en: "White, with grey wings tipped in black and a dark hood. It glides in wide circles, flapping now and then.",
    },
    stamp: "titicaca:fauna:gaviota",
  },
  {
    id: "rana",
    name: { es: "Rana gigante del Titicaca", en: "Titicaca water frog" },
    latin: "Telmatobius culeus",
    where: {
      es: "En el fondo del lago, entre los totorales al oeste del muelle de Taquile.",
      en: "On the lake bed, in the reeds west of the Taquile pier.",
    },
    when: {
      es: "Sube a la superficie cada cierto tiempo, unos segundos; más seguido si alguien espera cerca.",
      en: "It comes up every so often, for a few seconds; more often if someone waits nearby.",
    },
    does: {
      es: "Una rana enorme de piel verde oliva llena de pliegues (respira por la piel). Asoma el lomo y los ojos saltones sobre el agua y vuelve a hundirse. Es difícil de ver.",
      en: "A huge frog with baggy olive skin (it breathes through it). It shows its back and bulging eyes above the water and sinks again. It is hard to spot.",
    },
    stamp: "titicaca:fauna:rana",
  },
  {
    id: "alpaca",
    name: { es: "Alpaca", en: "Alpaca" },
    latin: "Vicugna pacos",
    where: {
      es: "En la puna junto al camino, entre el embarcadero de los uros y el muelle de Taquile, cuidadas por una pastora sentada a su lado.",
      en: "On the puna beside the road, between the Uros landing and the Taquile pier, watched by a herder sitting beside them.",
    },
    when: {
      es: "De día pastan; de noche se echan donde están.",
      en: "They graze by day; at night they lie down where they are.",
    },
    does: {
      es: "Un rebaño lanudo de muchos colores que camina unos pasos, baja la cabeza a pastar y la levanta cuando alguien se acerca. Si entras al rebaño, se apartan.",
      en: "A woolly herd in many colours that walks a few steps, puts its heads down to graze and looks up when someone comes close. Walk into the herd and they step aside.",
    },
    stamp: "titicaca:fauna:alpaca",
  },
  {
    id: "llama",
    name: { es: "Llama", en: "Llama" },
    latin: "Lama glama",
    where: {
      es: "En la puna junto al camino, pasando el muelle de Taquile, antes de la bahía de los flamencos.",
      en: "On the puna beside the road past the Taquile pier, before the flamingos' bay.",
    },
    when: {
      es: "De día pastan; de noche se echan donde están.",
      en: "They graze by day; at night they lie down where they are.",
    },
    does: {
      es: "Más altas que las alpacas, de orejas en forma de banana. Pastan, miran alrededor y se apartan si caminas entre ellas.",
      en: "Taller than the alpacas, with banana-shaped ears. They graze, look around and step aside if you walk among them.",
    },
    stamp: "titicaca:fauna:llama",
  },
  {
    id: "vizcacha",
    name: { es: "Vizcacha", en: "Vizcacha" },
    latin: "Lagidium peruanum",
    where: {
      es: "Sentadas sobre rocas en la colina de Sillustani y en las laderas al oeste de Taquile.",
      en: "Sitting on rocks on Sillustani's hill and on the slopes west of Taquile.",
    },
    when: { es: "De día; de noche se esconden.", en: "By day; at night they hide." },
    does: {
      es: "Un roedor gris de orejas largas y cola enroscada. Sentada en su roca, mira a su alrededor; si te acercas, salta detrás de la roca y no vuelve hasta unos segundos después.",
      en: "A grey rodent with long ears and a curled tail. Sitting on its rock it looks about; if you come near it hops off behind the rock and only comes back some seconds later.",
    },
    stamp: "titicaca:fauna:vizcacha",
  },
  {
    id: "huallata",
    name: { es: "Huallata · ganso andino", en: "Huallata · Andean goose" },
    latin: "Oressochen melanopterus",
    where: {
      es: "En el pasto de la orilla, entre el camino y el agua, pasado el punku y antes de Sillustani.",
      en: "On the shore grass between the road and the water, past the punku and before Sillustani.",
    },
    when: {
      es: "De día pastan; de noche se echan sobre el pasto.",
      en: "They graze by day; at night they sit down on the grass.",
    },
    does: {
      es: "Un ganso blanco de alas y cola negras, pico y patas rosados. Camina despacio en un grupo suelto y baja el cuello a pastar.",
      en: "A white goose with black wings and tail and a pink bill and legs. It walks slowly in a loose group and lowers its neck to graze.",
    },
  },
  {
    id: "ibis",
    name: { es: "Yanavico · ibis de la puna", en: "Puna ibis" },
    latin: "Plegadis ridgwayi",
    where: {
      es: "En el pasto húmedo junto al agua, entre el embarcadero de los uros y el muelle de Taquile.",
      en: "On the wet grass by the water, between the Uros landing and the Taquile pier.",
    },
    when: {
      es: "De día buscan comida; de noche se quedan quietos.",
      en: "They feed by day; at night they stand still.",
    },
    does: {
      es: "Un ave oscura, de reflejos verdes en las alas y un pico largo y curvo. Camina despacio hundiendo el pico en el suelo una y otra vez.",
      en: "A dark bird with a green sheen on its wings and a long curved bill. It walks slowly, probing the ground with its bill again and again.",
    },
  },
  {
    id: "pato",
    name: { es: "Pato puna", en: "Puna teal" },
    latin: "Spatula puna",
    where: {
      es: "En los totorales a ambos lados de la pasarela de los uros, cerca de la orilla.",
      en: "In the reeds either side of the Uros boardwalk, near the shore.",
    },
    when: {
      es: "De día nadan y comen; de noche flotan quietos.",
      en: "They swim and feed by day; at night they float still.",
    },
    does: {
      es: "Un pato pardo de flancos barrados, gorro negro, mejillas blancas y pico celeste. Nada despacio en grupitos y de vez en cuando mete la cabeza bajo el agua con la cola hacia arriba.",
      en: "A brown duck with barred flanks, a black cap, white cheeks and a pale blue bill. It paddles slowly in small groups and now and then tips its head under water, tail up.",
    },
  },
  {
    id: "trucha",
    name: { es: "Trucha", en: "Trout" },
    latin: "Oncorhynchus mykiss",
    where: {
      es: "En aguas abiertas, frente a las islas de los uros y al muelle de Taquile.",
      en: "In open water off the Uros islands and the Taquile pier.",
    },
    when: {
      es: "De día, cuando estás cerca, salta cada cierto tiempo; de noche no.",
      en: "By day, when you are nearby, it leaps every so often; not at night.",
    },
    does: {
      es: "Un pez plateado con una franja rosada. Salta fuera del agua en un arco corto y cae dejando un anillo de salpicadura.",
      en: "A silvery fish with a pink stripe. It leaps out of the water in a short arc and falls back, leaving a splash ring.",
    },
  },
  {
    id: "oveja",
    name: { es: "Ovejas y su perro pastor", en: "Sheep and their sheepdog" },
    latin: "Ovis aries · Canis familiaris",
    where: {
      es: "En la puna al sur del camino, entre Sillustani y el embarcadero de los uros, cuidadas por una pastora que hila de pie a su lado.",
      en: "On the puna south of the road, between Sillustani and the Uros landing, watched by a shepherdess spinning on her feet beside them.",
    },
    when: {
      es: "De día pastan; de noche el rebaño y el perro se echan donde están.",
      en: "They graze by day; at night the flock and the dog lie down where they are.",
    },
    does: {
      es: "Un rebaño de ovejas lanudas, blancas y algunas pardas o negras, que camina unos pasos y baja la cabeza a pastar. El perro corre alrededor del rebaño, a veces para un lado y a veces para el otro, y de rato en rato se sienta a mirarlo.",
      en: "A flock of woolly sheep, white with a few brown or black, that walks a few steps and puts its heads down to graze. The dog runs round the flock, now one way, now the other, and every so often sits down to watch it.",
    },
  },
  {
    id: "cuy",
    name: { es: "Cuy", en: "Guinea pig (cuy)" },
    latin: "Cavia porcellus",
    where: {
      es: "En un corral bajo de piedra en la plaza de Taquile.",
      en: "In a low stone pen on Taquile's plaza.",
    },
    when: {
      es: "De día corretean; de noche se juntan en el centro del corral.",
      en: "They scurry about by day; at night they huddle in the middle of the pen.",
    },
    does: {
      es: "Pequeños y redondos, blancos con manchas pardas. Corren de un lado a otro del corral, se paran y mordisquean la alfalfa.",
      en: "Small and round, white with brown patches. They dart from one side of the pen to the other, stop and nibble the alfalfa.",
    },
  },
];
