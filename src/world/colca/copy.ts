/**
 * Kuntisuyu copy shared by the page (build time) and the runtime: the khipu loader's title and steps, the
 * help overlay's controls, the map's sheet copy and the photo place. Pure; Spanish and English.
 */
import type { L, Lang } from "../contract";
import type { LoadStep } from "../loader";
import { suyuLoaderHtml } from "../suyu/copy";

export const COLCA_LOADER = {
  es: {
    title: "Tejiendo el Kuntisuyu…",
    modules: "Reuniendo los hilos",
    terrain: "Cavando el cañón",
    content: "Llenando las colcas",
    ambients: "Despertando a los cóndores",
    ready: "Listo",
  },
  en: {
    title: "Weaving the Kuntisuyu…",
    modules: "Gathering the threads",
    terrain: "Carving the canyon",
    content: "Filling the colcas",
    ambients: "Waking the condors",
    ready: "Ready",
  },
} as const satisfies Record<Lang, Record<LoadStep | "title", string>>;

export const colcaLoaderHtml = (lang: Lang) => suyuLoaderHtml(lang, COLCA_LOADER[lang].title);

export const COLCA_NAME: L = { es: "Kuntisuyu", en: "Kuntisuyu" };
export const COLCA_PLACE: L = { es: "Cañón del Colca · Kuntisuyu", en: "Colca canyon · Kuntisuyu" };

export const COLCA_HELP: { title: L; lines: Record<Lang, string[]> } = {
  title: { es: "Cómo recorrer el Kuntisuyu", en: "How to walk the Kuntisuyu" },
  lines: {
    es: [
      "WASD o flechas: caminar",
      "Shift: correr · Espacio: saltar",
      "E: leer, abrir o cruzar el punku · en móvil, el botón de acción",
      "El camino bordea el cañón del Colca, baja a la pampa de Nasca y vuelve al borde en la Cruz del Cóndor",
      "En las colcas (E) están los logros de cada etapa; en la pampa, cada geoglifo es un artefacto de arquitectura",
      "Sube a la torre del mirador y mira hacia una figura: E la lee",
      "E junto a la mula (al inicio) o la cuatrimoto (al llegar a la pampa): montar · E o Esc: bajar",
      "M: mapa · el viaje rápido se abre al llegar a la Cruz del Cóndor",
      "P: pasaporte y tu postal · F: foto · K: modo texto",
      "V o el botón «Viajar»: ir directo a otro mundo",
      "T: día o noche · N: música · Esc: cerrar",
      "En móvil: joystick a la izquierda, botones a la derecha, arrastra para girar la cámara.",
      "Con mando: stick izquierdo camina, stick derecho gira la cámara, A salta, X interactúa, B vuelve, Y abre el mapa, RB o RT corre, LB toma una foto, LT abre «Viajar», Start muestra esta ayuda.",
    ],
    en: [
      "WASD or arrows: walk",
      "Shift: run · Space: jump",
      "E: read, open or cross the punku · on mobile, the action button",
      "The road follows the rim of the Colca canyon, goes down to the Nazca pampa and back up to the rim at the Cruz del Cóndor",
      "The colcas (E) hold the achievements of each stage; on the pampa, each geoglyph is an architecture artifact",
      "Climb the lookout tower and face a figure: E reads it",
      "E by the mule (at the start) or the quad bike (where the pampa begins): ride · E or Esc: get off",
      "M: map · fast travel opens once you reach the Cruz del Cóndor",
      "P: passport and your postcard · F: photo · K: text mode",
      "V or the “Travel” button: go straight to another world",
      "T: day or night · N: music · Esc: close",
      "On mobile: joystick on the left, buttons on the right, drag to turn the camera.",
      "With a gamepad: left stick walks, right stick turns the camera, A jumps, X interacts, B goes back, Y opens the map, RB or RT runs, LB takes a photo, LT opens Travel, Start shows this help.",
    ],
  },
};

export const COLCA_MAP = {
  title: { es: "Mapa del Kuntisuyu", en: "Map of the Kuntisuyu" },
  canvas: {
    es: "Mapa en papel del Kuntisuyu: el norte arriba; abajo, el cañón del Colca con su río; el camino sale del punku al este, bordea el cañón por el pueblo y las colcas, sube al norte a la pampa de Nasca con sus geoglifos y la torre del mirador, pasa por Cahuachi y vuelve al borde en la Cruz del Cóndor, al oeste.",
    en: "Paper map of the Kuntisuyu: north at the top; at the bottom, the Colca canyon and its river; the road leaves the punku in the east, follows the canyon past the village and the colcas, goes north to the Nazca pampa with its geoglyphs and the lookout tower, passes Cahuachi and returns to the rim at the Cruz del Cóndor, in the west.",
  },
  hintLocked: {
    es: "Llega a la Cruz del Cóndor, al final del camino, para viajar entre lugares.",
    en: "Reach the Cruz del Cóndor at the end of the road to travel between places.",
  },
  unlocked: {
    es: "Ya recorriste el Kuntisuyu: abre el mapa (M) y viaja entre lugares.",
    en: "You walked the Kuntisuyu: open the map (M) and travel between places.",
  },
  legend: {
    es: "Figuras de colores: los geoglifos, cada uno un artefacto.",
    en: "Coloured figures: the geoglyphs, one artifact each.",
  },
} satisfies Record<string, L>;
