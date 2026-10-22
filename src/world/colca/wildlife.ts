/**
 * Field guide of the animals a traveler can meet on the Kuntisuyu road, for its text mode (./textmode.ts).
 * Same shape as the mountain's guide (../wildlife.ts Species). Every line restates what the fauna ambients
 * actually do (./ambient/condores.ts, vicunas.ts, vizcachas.ts, picaflores.ts, zorro.ts): where they live,
 * when they are out, how they behave and which passport stamp a good look earns (`colca:fauna:*`, CATALOG in
 * src/lib/passport.ts). Keep it in sync when a module changes. Pure data (no DOM): also rendered at build time.
 */
import type { Species } from "../wildlife";

export const COLCA_WILDLIFE: readonly Species[] = [
  {
    id: "condor",
    name: { es: "Cóndor andino", en: "Andean condor" },
    latin: "Vultur gryphus",
    where: {
      es: "Sobre el cañón, cerca del borde y del camino: frente al pueblo, frente a las colcas, donde el camino deja el borde y antes de la Cruz del Cóndor; otro gira a lo ancho del cañón y uno vuela en lo hondo, muy por debajo del borde. Dos se posan en una roca del borde junto a las colcas y otros dos en una roca junto a la Cruz del Cóndor.",
      en: "Over the canyon, close to the rim and the road: in front of the village, in front of the colcas, where the road leaves the rim and before the Cruz del Cóndor; another circles mid-canyon and one flies deep down, far below the rim. Two sit on a rock on the rim by the colcas and two more on a rock by the Cruz del Cóndor.",
    },
    when: {
      es: "Vuelan de día. Temprano por la mañana (más o menos de 6:30 a 10:30) dos de ellos suben frente a la Cruz del Cóndor y pasan muy cerca del mirador. Al atardecer bajan a dormir y de noche no vuelan; los de las rocas se quedan allí día y noche.",
      en: "They fly by day. Early in the morning (roughly 6:30 to 10:30) two of them rise in front of the Cruz del Cóndor and pass very close to the lookout. At dusk they go down to roost and they do not fly at night; the ones on the rocks stay there day and night.",
    },
    does: {
      es: "Planean en círculos grandes y lentos sobre las corrientes de aire caliente, con las alas abiertas y quietas y las puntas como dedos, ladeados hacia el centro del giro; suben y bajan despacio, de muy por debajo del borde hasta por encima; cuando una ráfaga pasa bajo su círculo, la corriente los levanta un poco. De vez en cuando dan unos aletazos hondos. Mientras caminas por el borde, más o menos cada minuto uno deja su círculo, baja planeando y pasa por encima de tu cabeza antes de volver a él (no si tu sistema pide reducir el movimiento). Los posados están erguidos con las alas plegadas y giran la cabeza; temprano por la mañana uno de cada pareja abre las alas al sol.",
      en: "They glide in big, slow circles on the rising warm air, wings spread and still with finger-like tips, banked into the turn; they drift slowly up and down, from far below the rim to above it; when a gust passes under their circle, the updraft lifts them a little. Now and then they give a few deep wingbeats. While you walk along the rim, about once a minute one leaves its circle, glides down and passes over your head before going back to it (not if your system asks for reduced motion). The perched ones sit upright with folded wings and turn their heads; early in the morning one of each pair opens its wings to the sun.",
    },
    stamp: "colca:fauna:condor",
  },
  {
    id: "vicuna",
    name: { es: "Vicuña", en: "Vicuña" },
    latin: "Vicugna vicugna",
    where: {
      es: "En la puna, en dos manadas pequeñas: al norte del camino entre el pueblo y las colcas, y en la ladera por donde el camino vuelve a subir hacia la Cruz del Cóndor.",
      en: "On the puna, in two small herds: north of the road between the village and the colcas, and on the slope where the road climbs back toward the Cruz del Cóndor.",
    },
    when: {
      es: "De día pastan; de noche se echan a descansar.",
      en: "By day they graze; at night they lie down to rest.",
    },
    does: {
      es: "Lomo color canela y vientre blanco. Cada una camina por el terreno de su manada y baja la cabeza a pastar cuando se detiene. Si te acercas mucho, toda la manada se aleja al trote, sin salir de su terreno, y luego vuelve a pastar.",
      en: "Cinnamon back and white belly. Each one walks about its herd's ground and lowers its head to graze when it stops. Come too close and the whole herd trots away together, staying on its ground, then settles to graze again.",
    },
    stamp: "colca:fauna:vicuna",
  },
  {
    id: "vizcacha",
    name: { es: "Vizcacha", en: "Viscacha" },
    latin: "Lagidium peruanum",
    where: {
      es: "Sobre las rocas al pie del acantilado de las colcas y sobre las piedras junto a la Cruz del Cóndor.",
      en: "On the boulders at the foot of the colcas cliff and on the rocks beside the Cruz del Cóndor.",
    },
    when: { es: "De día, tomando sol.", en: "By day, sunning." },
    does: {
      es: "Se sientan sobre su roca con la larga cola enroscada y miran a un lado y a otro a sacudidas. Si te acercas mucho, una salta de su roca y se esconde; vuelve un rato después.",
      en: "They sit up on their rock with the long tail curled and look about in quick turns. Come very close and one hops off its rock and hides; it comes back a while later.",
    },
    stamp: "colca:fauna:vizcacha",
  },
  {
    id: "picaflor",
    name: { es: "Picaflor gigante", en: "Giant hummingbird" },
    latin: "Patagona gigas",
    where: {
      es: "En los arbustos de kantu florecidos alrededor de la plaza del pueblo.",
      en: "At the flowering kantu bushes round the village plaza.",
    },
    when: { es: "De día.", en: "By day." },
    does: {
      es: "El colibrí más grande del mundo (aquí dibujado algo más grande que en la vida real para que se vea): se queda suspendido frente a una flor unos segundos, con las alas convertidas en un borrón, y luego sale disparado hacia otro arbusto.",
      en: "The largest hummingbird in the world (drawn a little larger than life here so it shows): it hovers at a flower for a few seconds, wings a blur, then darts off to another bush.",
    },
    stamp: "colca:fauna:picaflor",
  },
  {
    id: "zorro",
    name: { es: "Zorro andino", en: "Andean fox" },
    latin: "Lycalopex culpaeus",
    where: {
      es: "En la puna al norte del camino, entre las colcas y la bajada a la pampa.",
      en: "On the puna north of the road, between the colcas and the way down to the pampa.",
    },
    when: { es: "Al atardecer y de noche.", en: "At dusk and at night." },
    does: {
      es: "Recorre al trote una vuelta por la puna, con el hocico bajo. Si te ve cerca se detiene y te mira con las orejas paradas; si te acercas mucho, se va corriendo por su camino.",
      en: "It trots a loop over the puna, nose down. If it sees you nearby it stops and watches you, ears up; come very close and it lopes off along its way.",
    },
    stamp: "colca:fauna:zorro",
  },
];
