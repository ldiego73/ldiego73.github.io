/**
 * Field guide of the animals a traveler can meet on the Antisuyu jungle road, for the jungle text mode
 * (selva/textmode.ts). Same shape as the mountain's guide (../wildlife.ts Species). Every line restates what
 * the fauna ambients actually do (selva/ambient/guacamayos.ts, monos.ts, perezoso.ts, bufeo.ts, caiman.ts,
 * ronsoco.ts, tucan.ts, jaguar.ts, insects.ts): where they live, when they are out and how they behave, and
 * which passport stamp a good look earns (`selva:fauna:*`, CATALOG in src/lib/passport.ts). Keep it in sync
 * when a module changes. Pure data (no DOM): also rendered at build time.
 */
import type { L } from "../contract";
import type { Species } from "../wildlife";

export type { Species };

const ALWAYS: L = { es: "De día y de noche.", en: "Day and night." };

export const SELVA_WILDLIFE: readonly Species[] = [
  {
    id: "guacamayo",
    name: { es: "Guacamayos", en: "Macaws" },
    latin: "Ara macao · Ara ararauna",
    where: {
      es: "En lo alto, cruzando el río y el camino; en parejas sobre dos árboles muertos que sobresalen del bosque (entre el embarcadero y los palafitos, y pasando los puentes del dosel); y en la collpa, la pared de arcilla al otro lado del río frente al mirador del final del camino.",
      en: "High overhead, crossing the river and the road; in pairs on two dead emergent trees above the forest (between the canoe landing and the stilt houses, and past the canopy bridges); and at the collpa, the clay wall across the river from the lookout at the end of the road.",
    },
    when: {
      es: "De día. En la collpa, solo temprano por la mañana (más o menos de 6 a 10).",
      en: "By day. At the collpa, only early in the morning (roughly 6 to 10 am).",
    },
    does: {
      es: "Guacamayos escarlata y azul-amarillos. Parejas y pequeñas bandadas, cada pareja ala con ala, cruzan altas cada medio minuto o así. En los árboles muertos se acicalan entre ellos y giran la cabeza para mirarte, y levantan vuelo si pasas junto al tronco. En la collpa una bandada grande se cuelga de la arcilla para comerla y se mueve por la pared aleteando; cada minuto o dos toda la bandada se espanta, da una vuelta sobre el río y vuelve a la pared. A media mañana se van de a uno y de a dos. De noche duermen en los árboles muertos.",
      en: "Scarlet and blue-and-yellow macaws. Pairs and small flocks, partners wingtip to wingtip, cross high overhead every half minute or so. On the dead trees they preen each other and turn their heads to watch you, and take off if you pass right by the trunk. At the collpa a big flock clings to the clay to eat it and shuffles along the wall with a flutter; every minute or two the whole flock panics, wheels out over the river and comes back to the wall. By mid-morning they leave in ones and twos. At night they sleep on the dead trees.",
    },
    stamp: "selva:fauna:guacamayo",
  },
  {
    id: "mono",
    name: { es: "Mono fraile", en: "Squirrel monkey" },
    latin: "Saimiri sciureus",
    where: {
      es: "En una fila de árboles al borde del camino entre el embarcadero y los palafitos; con calidad alta, otra tropa entre el regatón y la maloca.",
      en: "In a row of trees at the road edge between the canoe landing and the stilt houses; on high quality, another troop between the trader's boat and the maloca.",
    },
    when: {
      es: "De día; de noche duermen juntos en un mismo árbol.",
      en: "By day; at night they sleep huddled together in one tree.",
    },
    does: {
      es: "La tropa recorre la fila de árboles saltando de rama en rama y de árbol en árbol, con los brazos estirados. Entre salto y salto se sientan con la larga cola de punta negra colgando, miran a todos lados a sacudidas y se quedan mirándote. Si te paras debajo de su árbol, se van hacia el otro extremo de la fila.",
      en: "The troop travels along the row of trees, leaping from branch to branch and tree to tree with arms stretched out. Between leaps they sit up with the long black-tipped tail hanging, look around in quick jerks and stare at you. Stop under their tree and they move off toward the other end of the row.",
    },
    stamp: "selva:fauna:mono",
  },
  {
    id: "coto",
    name: { es: "Coto (mono aullador)", en: "Red howler monkey" },
    latin: "Alouatta seniculus",
    where: {
      es: "Con calidad alta, en lo alto del árbol más alto de la fila de los monos fraile.",
      en: "On high quality, at the top of the tallest tree in the squirrel monkeys' row.",
    },
    when: {
      es: "Siempre en su árbol; ruge al amanecer y al atardecer.",
      en: "Always up in its tree; it roars at dawn and at dusk.",
    },
    does: {
      es: "Se queda sentado, mirando a su alrededor o a ti si pasas cerca. Al amanecer y al atardecer echa la cabeza hacia atrás en el largo rugido que da nombre a los aulladores.",
      en: "It sits still, looking around, or at you when you pass close by. At dawn and dusk it throws its head back in the long roar the howlers are named for.",
    },
  },
  {
    id: "perezoso",
    name: { es: "Perezoso de tres dedos", en: "Three-toed sloth" },
    latin: "Bradypus variegatus",
    where: {
      es: "Colgado bajo la rama de un cetico (cecropia): uno junto al camino entre el regatón y la maloca, otro junto a los puentes del dosel, a la altura de la pasarela; con calidad alta, un tercero pasando los palafitos.",
      en: "Hanging under a limb of a cecropia (cetico): one beside the road between the trader's boat and the maloca, one beside the canopy bridges at the height of the walkway; on high quality, a third past the stilt houses.",
    },
    when: ALWAYS,
    does: {
      es: "Avanza boca abajo por su rama, mano tras mano, a unos centímetros por segundo, y luego se queda quieto mucho rato. Si te detienes cerca, gira la cabeza hacia ti, muy despacio.",
      en: "It creeps upside down along its limb, hand over hand, a few centimetres a second, then hangs still for a long while. Stop nearby and it turns its head toward you, very slowly.",
    },
    stamp: "selva:fauna:perezoso",
  },
  {
    id: "bufeo",
    name: { es: "Bufeo colorado", en: "Pink river dolphin" },
    latin: "Inia geoffrensis",
    where: {
      es: "En el río: a lo largo de la ruta en canoa entre el embarcadero y los palafitos, frente al regatón y, con calidad alta, bajo la collpa.",
      en: "In the river: along the canoe route between the canoe landing and the stilt houses, off the trader's boat and, on high quality, below the collpa.",
    },
    when: ALWAYS,
    does: {
      es: "Casi siempre bajo el agua parda; cada pocos segundos uno sale en un arco lento —el lomo rosado y su joroba baja—, deja un anillo en el agua y se hunde con un golpe de la cola. Si vas en canoa, el grupo más cercano se acerca y sale a tu alrededor más seguido.",
      en: "Mostly hidden in the brown water; every few seconds one surfaces in a slow arc —the pink back and its low hump—, leaves a ring on the water and dives with a flick of the flukes. When you paddle the canoe, the nearest pod comes over and surfaces around you more often.",
    },
    stamp: "selva:fauna:bufeo",
  },
  {
    id: "caiman",
    name: { es: "Caimán negro", en: "Black caiman" },
    latin: "Melanosuchus niger",
    where: {
      es: "En el agua tranquila junto a la orilla del lado del camino (por la ruta en canoa y, con calidad alta, frente a la maloca y la collpa) y tomando sol en las playas de arena que no ocupan los ronsocos.",
      en: "In the calm water along the road-side bank (by the canoe route and, on high quality, off the maloca and the collpa) and basking on the sandbars the capybaras do not use.",
    },
    when: {
      es: "De día flota o toma sol en la playa; al anochecer vuelve al agua y de noche sus ojos brillan rojo anaranjado.",
      en: "By day it floats or basks on the sand; at dusk it goes back into the water, and at night its eyes shine orange-red.",
    },
    does: {
      es: "Flotando solo asoman los ojos, la nariz y la línea de escamas del lomo; gira y deriva muy despacio. En la playa se echa con el hocico levantado. Si te acercas (unos 8 m, más si corres o remas hacia él) se desliza al agua o se hunde dejando un anillo, y vuelve a salir cerca de su sitio cuando te vas. Nunca se acerca a ti.",
      en: "Floating, only the eyes, the nostrils and the line of back scutes show; it turns and drifts very slowly. On the sand it lies flat, snout raised. Come close (about 8 m, more if you run or paddle at it) and it slides into the water or slips under with a ring, surfacing near its spot again once you have gone. It never comes toward you.",
    },
    stamp: "selva:fauna:caiman",
  },
  {
    id: "ronsoco",
    name: { es: "Ronsoco", en: "Capybara" },
    latin: "Hydrochoerus hydrochaeris",
    where: {
      es: "En las playas de arena del río frente al embarcadero y frente a los palafitos (y frente al regatón con calidad alta).",
      en: "On the river's sandbars off the canoe landing and off the stilt houses (and off the trader's boat on high quality).",
    },
    when: {
      es: "De día pastan; de noche descansan más, echados en la arena.",
      en: "They graze by day; at night they rest more, lying on the sand.",
    },
    does: {
      es: "Una familia —un macho grande, hembras y crías pegadas a sus madres— pasta en la arena y a ratos se echa. Te miran levantando la cabeza; si te acercas (unos 9 m, 13 si corres; desde la canoa) se quedan quietos un instante y se meten al río por el otro lado de la playa: nadan con solo el lomo y la cabeza fuera, y vuelven a la arena cuando te alejas.",
      en: "A family —a big male, females and pups close to their mothers— grazes on the sand and lies down now and then. They raise their heads to watch you; come close (about 9 m, 13 if you run; from the canoe) and they freeze for a moment, then walk into the river on the far side of the bar: they swim with only backs and heads out, and climb back onto the sand once you are gone.",
    },
    stamp: "selva:fauna:ronsoco",
  },
  {
    id: "garza",
    name: { es: "Garza blanca", en: "Great egret" },
    latin: "Ardea alba",
    where: {
      es: "En la orilla mojada de las mismas playas que los ronsocos.",
      en: "On the wet rim of the same sandbars as the capybaras.",
    },
    when: { es: "De día; de noche se van a dormir lejos.", en: "By day; at night they roost away." },
    does: {
      es: "Acecha en el agua baja: pasos lentos, se congela y lanza el pico a un pez (queda un anillo en el agua). Si te acercas, o si los ronsocos se meten al río, vuela bajo sobre el río hasta otra playa.",
      en: "It stalks the shallows: slow steps, a freeze, a stab at a fish (a ring is left on the water). Come close, or let the capybaras plunge in, and it flies off low over the river to another sandbar.",
    },
  },
  {
    id: "tucan",
    name: { es: "Tucán de garganta blanca", en: "White-throated toucan" },
    latin: "Ramphastos tucanus",
    where: {
      es: "En unos árboles con fruta junto al camino, pasando la maloca; con calidad alta, otro grupo entre los palafitos y el arcade.",
      en: "In a few fruiting trees beside the road past the maloca; on high quality, another group between the stilt houses and the arcade.",
    },
    when: {
      es: "De día; de noche duermen quietos, con la cabeza vuelta sobre la espalda.",
      en: "By day; at night they sleep still, head turned back over the shoulder.",
    },
    does: {
      es: "Saltan de lado por las ramas, alcanzan una fruta con su enorme pico y la lanzan hacia atrás de un cabezazo, y ladean la cabeza para mirarte. A veces vuelan al árbol de al lado: unos aleteos rápidos y un planeo, subiendo y bajando. Si pasas justo debajo (unos 5 m, 8 si corres) se van a otro árbol.",
      en: "They hop sideways along the limbs, reach for a fruit with the huge bill and toss it back with a flick of the head, and cock their heads to look at you. Now and then one flies to the next tree: a few quick wingbeats and a glide, dipping and rising. Pass right under them (about 5 m, 8 if you run) and they move to another tree.",
    },
    stamp: "selva:fauna:tucan",
  },
  {
    id: "jaguar",
    name: { es: "Otorongo (jaguar)", en: "Otorongo (jaguar)" },
    latin: "Panthera onca",
    where: {
      es: "Cruzando el camino bastante más adelante, lejos de las estaciones y de los puentes del dosel; o caminando por una playa del río, visto desde un embarcadero o la canoa.",
      en: "Crossing the road well ahead of you, away from the stations and the canopy bridges; or walking a sandbar of the river, seen from a landing or the canoe.",
    },
    when: {
      es: "Solo de noche, y es raro: el primero suele aparecer al minuto o así de caminar de noche; después, cada uno o dos minutos hasta que tengas su sello, y luego solo cada pocos minutos.",
      en: "Only at night, and rare: the first one usually shows after a minute or so of walking at night; after that, every minute or two until you have its stamp, then only every few minutes.",
    },
    does: {
      es: "Sale del monte y cruza el camino; en el medio se detiene a mirarte —los ojos brillan verde dorado— un par de segundos, y sigue al trote hasta perderse en el bosque. En la playa la recorre a lo largo, se detiene a mirarte y se escurre al río al final. Si te acercas a unos 10 m se da la vuelta y se va enseguida. Nunca ataca ni se acerca.",
      en: "It steps out of the forest and crosses the road; in the middle it stops to look at you —eyes shining green-gold— for a couple of seconds, then trots on and is gone into the forest. On a sandbar it walks the length of it, stops to look at you and slips into the river at the end. Come within about 10 m and it turns away at once. It never attacks or approaches.",
    },
    stamp: "selva:fauna:jaguar",
  },
  {
    id: "morpho",
    name: { es: "Mariposa morfo", en: "Blue morpho" },
    latin: "Morpho menelaus",
    where: {
      es: "Revoloteando sobre el camino, un poco adelante.",
      en: "Fluttering over the road, a little ahead of you.",
    },
    when: {
      es: "De día, en las horas de más sol (más o menos de 8 a 16).",
      en: "By day, in the brightest hours (roughly 8 am to 4 pm).",
    },
    does: {
      es: "Vuelo errático a la altura de la cabeza; cada aletazo muestra el azul eléctrico de arriba y el marrón con ocelos de abajo. Se apartan si caminas hacia ellas.",
      en: "Erratic flight at head height; every wingbeat flashes the electric blue upper side and the brown, eye-spotted underside. They veer off if you walk into them.",
    },
  },
  {
    id: "luciernaga",
    name: { es: "Luciérnagas", en: "Fireflies" },
    latin: "Lampyridae",
    where: {
      es: "Sobre la maleza a ambos lados del camino, a tu alrededor.",
      en: "Over the undergrowth on both sides of the road, all around you.",
    },
    when: { es: "De noche.", en: "At night." },
    does: {
      es: "Destellos verdosos que flotan despacio, cada una a su propio ritmo.",
      en: "Greenish blinks drifting slowly, each on its own rhythm.",
    },
  },
  {
    id: "rana",
    name: { es: "Ranas venenosas", en: "Poison dart frogs" },
    latin: "Dendrobatidae",
    where: { es: "Sobre hojas anchas en el borde del camino.", en: "On broad leaves at the edge of the road." },
    when: ALWAYS,
    does: {
      es: "Ranitas de colores vivos (rojo, amarillo, azul, verde lima, naranja) con la garganta latiendo. Si pasas rozando su hoja, saltan y desaparecen.",
      en: "Tiny frogs in bright colours (red, yellow, blue, lime, orange) with pulsing throats. Brush past their leaf and they hop off and are gone.",
    },
  },
  {
    id: "curuhuinsi",
    name: { es: "Curuhuinsi (hormiga cortadora)", en: "Leafcutter ants" },
    latin: "Atta sp.",
    where: {
      es: "Cruzando el camino en algunos tramos tranquilos, lejos de las estaciones.",
      en: "Crossing the road on a few quiet stretches, away from the stations.",
    },
    when: ALWAYS,
    does: {
      es: "Una columna de hormigas lleva pedacitos de hoja verdes (y algún pétalo rosado) de un lado al otro del camino, y otras vuelven vacías en sentido contrario.",
      en: "A column of ants carries green leaf bits (and the odd pink petal) across the road one way, while others come back empty the other way.",
    },
  },
];
