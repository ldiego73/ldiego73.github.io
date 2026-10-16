/**
 * Cusco hub copy shared by the page (build time) and the runtime: the khipu loader's title and steps, the
 * help overlay's controls, the map's sheet copy and the photo place. Pure; Spanish and English.
 */
import type { L, Lang } from "../contract";
import type { LoadStep } from "../loader";
import { suyuLoaderHtml } from "../suyu/copy";

export const CUSCO_LOADER = {
  es: {
    title: "Tejiendo Qusqu…",
    modules: "Reuniendo los hilos",
    terrain: "Asentando las piedras",
    content: "Levantando el usnu",
    ambients: "Despertando Haukaypata",
    ready: "Listo",
  },
  en: {
    title: "Weaving Qusqu…",
    modules: "Gathering the threads",
    terrain: "Setting the stones",
    content: "Raising the usnu",
    ambients: "Waking Haukaypata",
    ready: "Ready",
  },
} as const satisfies Record<Lang, Record<LoadStep | "title", string>>;

export const cuscoLoaderHtml = (lang: Lang) => suyuLoaderHtml(lang, CUSCO_LOADER[lang].title);

export const CUSCO_NAME: L = { es: "Qusqu", en: "Qusqu" };
export const CUSCO_PLACE: L = { es: "Haukaypata · Qusqu", en: "Haukaypata · Qusqu" };

export const CUSCO_HELP: { title: L; lines: Record<Lang, string[]> } = {
  title: { es: "Cómo recorrer Qusqu", en: "How to walk Qusqu" },
  lines: {
    es: [
      "WASD o flechas: caminar",
      "Shift: correr · Espacio: saltar",
      "E: leer, hablar o cruzar un punku · en móvil, el botón de acción",
      "Sube al usnu del centro y lee el khipu de los suyus (E)",
      "Cada calle termina en un punku: E viaja a ese mundo si ya está abierto",
      "M: mapa · el viaje rápido se abre al llegar al usnu",
      "P: pasaporte y tu postal · F: foto · K: modo texto",
      "T: día o noche · N: música · Esc: cerrar",
      "En móvil: joystick a la izquierda, botones a la derecha, arrastra para girar la cámara.",
      "Con mando: stick izquierdo camina, stick derecho gira la cámara, A salta, X interactúa, B vuelve, Y abre el mapa, RB o RT corre, LB toma una foto, Start muestra esta ayuda.",
    ],
    en: [
      "WASD or arrows: walk",
      "Shift: run · Space: jump",
      "E: read, talk or cross a punku · on mobile, the action button",
      "Climb the usnu in the middle and read the khipu of the suyus (E)",
      "Every street ends at a punku: E travels to that world once it is open",
      "M: map · fast travel opens once you reach the usnu",
      "P: passport and your postcard · F: photo · K: text mode",
      "T: day or night · N: music · Esc: close",
      "On mobile: joystick on the left, buttons on the right, drag to turn the camera.",
      "With a gamepad: left stick walks, right stick turns the camera, A jumps, X interacts, B goes back, Y opens the map, RB or RT runs, LB takes a photo, Start shows this help.",
    ],
  },
};

export const CUSCO_MAP = {
  title: { es: "Mapa de Qusqu", en: "Map of Qusqu" },
  canvas: {
    es: "Mapa en papel de Haukaypata: la plaza al centro con el usnu, el norte arriba, y las cinco calles hacia los punkus de los suyus y del Qhapaq Ñan.",
    en: "Paper map of Haukaypata: the plaza in the middle with the usnu, north at the top, and the five streets to the punkus of the suyus and the Qhapaq Ñan.",
  },
  hintLocked: {
    es: "Llega al usnu, en el centro de la plaza, para viajar entre lugares.",
    en: "Reach the usnu in the middle of the plaza to travel between places.",
  },
  unlocked: {
    es: "Ya conoces Haukaypata: abre el mapa (M) y viaja entre lugares.",
    en: "You know Haukaypata now: open the map (M) and travel between places.",
  },
  legend: {
    es: "Rombos: los punkus. Los grises aún están cerrados.",
    en: "Diamonds: the punkus. Grey ones are still closed.",
  },
} satisfies Record<string, L>;
