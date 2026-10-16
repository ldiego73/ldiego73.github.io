/**
 * Coast copy shared by the page (build time) and the runtime: the khipu loader's title and steps, the help
 * overlay's controls, the map's sheet copy and the photo place. Pure; Spanish and English.
 */
import type { L, Lang } from "../contract";
import type { LoadStep } from "../loader";
import { suyuLoaderHtml } from "../suyu/copy";

export const COSTA_LOADER = {
  es: {
    title: "Tejiendo el Chinchaysuyu…",
    modules: "Reuniendo los hilos",
    terrain: "Llenando la Mamacocha",
    content: "Levantando las huacas",
    ambients: "Despertando la costa",
    ready: "Listo",
  },
  en: {
    title: "Weaving the Chinchaysuyu…",
    modules: "Gathering the threads",
    terrain: "Filling the Mamacocha",
    content: "Raising the huacas",
    ambients: "Waking the coast",
    ready: "Ready",
  },
} as const satisfies Record<Lang, Record<LoadStep | "title", string>>;

export const costaLoaderHtml = (lang: Lang) => suyuLoaderHtml(lang, COSTA_LOADER[lang].title);

export const COSTA_NAME: L = { es: "Chinchaysuyu", en: "Chinchaysuyu" };
export const COSTA_PLACE: L = { es: "Chinchaysuyu · la costa", en: "Chinchaysuyu · the coast" };

export const COSTA_HELP: { title: L; lines: Record<Lang, string[]> } = {
  title: { es: "Cómo recorrer la costa", en: "How to walk the coast" },
  lines: {
    es: [
      "WASD o flechas: caminar",
      "Shift: correr · Espacio: saltar",
      "E: leer, hablar, subir o bajar del caballito, o cruzar el punku · en móvil, el botón de acción",
      "El camino va de sur a norte con el mar a la izquierda: una huaca por empresa de mi carrera",
      "Puedes bajar a la playa por donde la pendiente es suave",
      "En el mercado de Huanchaco, sube a un caballito de totora y rema hasta la playa del norte",
      "M: mapa · el viaje rápido se abre al llegar al mercado de Huanchaco",
      "P: pasaporte y tu postal · F: foto · K: modo texto",
      "V o el botón «Viajar»: ir directo a otro mundo",
      "T: día o noche · N: música · Esc: cerrar",
      "En móvil: joystick a la izquierda, botones a la derecha, arrastra para girar la cámara.",
      "Con mando: stick izquierdo camina o rema, stick derecho gira la cámara, A salta, X interactúa, B vuelve, Y abre el mapa, RB o RT corre, LB toma una foto, LT abre «Viajar», Start muestra esta ayuda.",
    ],
    en: [
      "WASD or arrows: walk",
      "Shift: run · Space: jump",
      "E: read, talk, board or leave the reed boat, or cross the punku · on mobile, the action button",
      "The road runs south to north with the sea on your left: one huaca per company of my career",
      "You can go down to the beach wherever the slope is gentle",
      "At the Huanchaco market, board a totora reed boat and paddle to the north beach",
      "M: map · fast travel opens once you reach the Huanchaco market",
      "P: passport and your postcard · F: photo · K: text mode",
      "V or the “Travel” button: go straight to another world",
      "T: day or night · N: music · Esc: close",
      "On mobile: joystick on the left, buttons on the right, drag to turn the camera.",
      "With a gamepad: left stick walks or paddles, right stick turns the camera, A jumps, X interacts, B goes back, Y opens the map, RB or RT runs, LB takes a photo, LT opens Travel, Start shows this help.",
    ],
  },
};

export const COSTA_MAP = {
  title: { es: "Mapa del Chinchaysuyu", en: "Map of the Chinchaysuyu" },
  canvas: {
    es: "Mapa en papel de la costa: el camino de sur (abajo) a norte (arriba), el Pacífico a la izquierda, una huaca por empresa, el mercado de Huanchaco, la playa del norte y el promontorio del final.",
    en: "Paper map of the coast: the road from south (bottom) to north (top), the Pacific on the left, one huaca per company, the Huanchaco market, the north beach and the headland at the end.",
  },
  hintLocked: {
    es: "Llega al mercado de Huanchaco para viajar entre lugares.",
    en: "Reach the Huanchaco market to travel between places.",
  },
  unlocked: {
    es: "Ya conoces la costa: abre el mapa (M) y viaja entre lugares.",
    en: "You know the coast now: open the map (M) and travel between places.",
  },
  legend: {
    es: "Azul: el Pacífico. Cada punto es una parada del camino.",
    en: "Blue: the Pacific. Each dot is a stop on the road.",
  },
} satisfies Record<string, L>;
