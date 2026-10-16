/**
 * Collasuyu copy shared by the page (build time) and the runtime: the khipu loader's title and steps, the help
 * overlay's controls, the map's sheet copy and the photo place. Pure; Spanish and English.
 */
import type { L, Lang } from "../contract";
import type { LoadStep } from "../loader";
import { suyuLoaderHtml } from "../suyu/copy";

export const TITICACA_LOADER = {
  es: {
    title: "Tejiendo el Collasuyu…",
    modules: "Reuniendo los hilos",
    terrain: "Llenando el lago",
    content: "Trenzando la totora",
    ambients: "Despertando las orillas",
    ready: "Listo",
  },
  en: {
    title: "Weaving the Collasuyu…",
    modules: "Gathering the threads",
    terrain: "Filling the lake",
    content: "Braiding the totora",
    ambients: "Waking the shore",
    ready: "Ready",
  },
} as const satisfies Record<Lang, Record<LoadStep | "title", string>>;

export const titicacaLoaderHtml = (lang: Lang) => suyuLoaderHtml(lang, TITICACA_LOADER[lang].title);

export const TITICACA_NAME: L = { es: "Collasuyu", en: "Collasuyu" };
export const TITICACA_PLACE: L = { es: "Lago Titicaca · Collasuyu", en: "Lake Titicaca · Collasuyu" };

export const TITICACA_HELP: { title: L; lines: Record<Lang, string[]> } = {
  title: { es: "Cómo recorrer el Collasuyu", en: "How to walk the Collasuyu" },
  lines: {
    es: [
      "WASD o flechas: caminar",
      "Shift: correr · Espacio: saltar",
      "E: leer, hablar, subir a la balsa o cruzar el punku · en móvil, el botón de acción",
      "Cruza el muelle de totora hasta las islas de los uros: cada isla guarda un grupo de habilidades",
      "En la balsa: adelante y atrás reman, los lados giran · E o Esc junto a un muelle para bajar",
      "M: mapa · el viaje rápido se abre al llegar a Taquile",
      "P: pasaporte y tu postal · F: foto · K: modo texto",
      "V o el botón «Viajar»: ir directo a otro mundo",
      "T: día o noche · N: música · Esc: cerrar",
      "En móvil: joystick a la izquierda, botones a la derecha, arrastra para girar la cámara.",
      "Con mando: stick izquierdo camina, stick derecho gira la cámara, A salta, X interactúa, B vuelve, Y abre el mapa, RB o RT corre, LB toma una foto, LT abre «Viajar», Start muestra esta ayuda.",
    ],
    en: [
      "WASD or arrows: walk",
      "Shift: run · Space: jump",
      "E: read, talk, board the boat or cross the punku · on mobile, the action button",
      "Cross the totora boardwalk to the Uros islands: each island holds one group of skills",
      "On the boat: forward and back paddle, the sides turn · E or Esc by a pier to get off",
      "M: map · fast travel opens once you reach Taquile",
      "P: passport and your postcard · F: photo · K: text mode",
      "V or the “Travel” button: go straight to another world",
      "T: day or night · N: music · Esc: close",
      "On mobile: joystick on the left, buttons on the right, drag to turn the camera.",
      "With a gamepad: left stick walks, right stick turns the camera, A jumps, X interacts, B goes back, Y opens the map, RB or RT runs, LB takes a photo, LT opens Travel, Start shows this help.",
    ],
  },
};

export const TITICACA_MAP = {
  title: { es: "Mapa del Collasuyu", en: "Map of the Collasuyu" },
  canvas: {
    es: "Mapa en papel de la orilla del lago Titicaca: el camino de oeste a este, el lago al norte con las islas flotantes de los uros, Taquile y la Isla del Sol al final del camino.",
    en: "Paper map of the Lake Titicaca shore: the road from west to east, the lake to the north with the Uros floating islands, Taquile and the Isla del Sol at the end of the road.",
  },
  hintLocked: {
    es: "Llega a Taquile para viajar entre lugares.",
    en: "Reach Taquile to travel between places.",
  },
  unlocked: {
    es: "Ya conoces el lago: abre el mapa (M) y viaja entre lugares.",
    en: "You know the lake now: open the map (M) and travel between places.",
  },
  legend: {
    es: "En el agua, las islas de los uros unidas por su muelle de totora. Rombos: los dos muelles de la balsa y el punku.",
    en: "On the water, the Uros islands joined by their totora boardwalk. Diamonds: the boat's two piers and the punku.",
  },
} satisfies Record<string, L>;
