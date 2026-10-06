/**
 * Andean dark constellations (yana phuyu, "dark clouds") of the Milky Way, Mayu ("river").
 * Pure data shared by the sky band (canvas) and the lore panel (inline SVG): silhouettes are SVG path
 * strings in a local box measured in degrees of sky, so both renderers stay in sync.
 * Sources: the Huarochirí manuscript (c. 1608, ch. 29) and G. Urton, "At the Crossroads of the Earth
 * and the Sky" (1981). Text is kept modest on purpose.
 */
import type { L } from "../../contract";

export type ConstellationId = "yacana" | "machacuay" | "hanpatu";

export interface Constellation {
  id: ConstellationId;
  name: string;
  label: L;
  text: L;
  /** Silhouette path, local units = degrees of sky; box is [0, w] × [0, h], y down. */
  path: string;
  w: number;
  h: number;
  /** Placement on the band: center along the Milky Way (u, degrees) and across it (v, degrees, + = up in the texture). */
  u: number;
  v: number;
  /** Bright stars inside the silhouette (local box coords), e.g. the llama's eyes. */
  eyes?: Array<[number, number]>;
}

export const CONSTELLATIONS: Constellation[] = [
  {
    id: "machacuay",
    name: "Mach'acuay",
    label: { es: "Mach'acuay, la serpiente", en: "Mach'acuay, the serpent" },
    text: {
      es: "Una franja oscura y ondulante que corre por la Vía Láctea desde cerca de Adhara (Can Mayor) hasta la Cruz del Sur. En la comunidad de Misminay (Cusco), estudiada por Gary Urton, la serpiente celeste se vincula con la temporada de lluvias, cuando las serpientes vuelven a verse en la tierra.",
      en: "A dark, winding lane running along the Milky Way from near Adhara (Canis Major) to the Southern Cross. In the community of Misminay (Cusco), studied by Gary Urton, the sky serpent is tied to the rainy season, when snakes are seen again on the earth.",
    },
    path: "M0 7 C4 2 8 2 11 6 S18 11 22 7 S30 1 34 6 S40 10 42 7 C43 5 45 4 46 5 C47 6 46 8 44 9 C41 11 38 12 34 9 S27 5 23 10 S15 13 11 9 S4 6 1 9 Z",
    w: 46,
    h: 13,
    u: 22,
    v: -1.5,
  },
  {
    id: "hanpatu",
    name: "Hanp'atu",
    label: { es: "Hanp'atu, el sapo", en: "Hanp'atu, the toad" },
    text: {
      es: "Una pequeña nube oscura cerca de la Cruz del Sur, entre la cabeza de la Serpiente y la Llama. Para los agricultores andinos el sapo anuncia el agua: su aparición en el cielo se asocia con el comienzo de las lluvias y de la siembra, cuando los sapos cantan en los campos.",
      en: "A small dark cloud near the Southern Cross, between the Serpent's head and the Llama. For Andean farmers the toad announces water: its appearance in the sky is linked to the start of the rains and of planting, when toads sing in the fields.",
    },
    path: "M1 6 C1 3 3 1 6 1.5 C7 0 9 0 10 1.5 C13 1 15 3 15 6 C17 7 17 9 15 9.5 C14 11 11 12 8 12 C5 12 2 11 1 9.5 C-1 9 -1 7 1 6 Z",
    w: 16,
    h: 12,
    u: 53,
    v: 1.5,
  },
  {
    id: "yacana",
    name: "Yacana",
    label: { es: "Yacana, la llama", en: "Yacana, the llama" },
    text: {
      es: "La gran llama oscura de la Vía Láctea. Sus ojos son las estrellas brillantes Alfa y Beta Centauri, llamadas Llamacñawin, «ojos de la llama». El manuscrito de Huarochirí cuenta que Yacana camina por el medio del río celeste y que a medianoche bebe el agua del mar; si no lo hiciera, el mundo se inundaría. Se la asocia con el cuidado y la fertilidad de los rebaños.",
      en: 'The great dark llama of the Milky Way. Its eyes are the bright stars Alpha and Beta Centauri, called Llamacñawin, "eyes of the llama". The Huarochirí manuscript tells that Yacana walks along the middle of the sky river and drinks seawater at midnight; if it did not, the world would flood. It is linked to the care and fertility of the herds.',
    },
    // Head and long neck on the left (toward the Southern Cross), body and legs trailing toward Scorpius.
    path: "M2 6 C2 3 4 1 6 2 L7 0 L8 2.5 C9 3 9.5 5 9 7 C9.5 9 11 10 14 10 C19 9.5 25 9.5 29 10.5 C31 11 32 13 31.5 15 L32 21 L30 21 L29.5 16 C27 17 24 17 22 16.5 L21 21 L19 21 L19 16.5 C16 16.5 14 16 13 15 L12.5 21 L10.5 21 L10.8 14 C9 12.5 7 10 6 8 C4 8 2 7.5 2 6 Z",
    w: 33,
    h: 21,
    u: 84,
    v: 0.5,
    eyes: [
      [4.6, 4.6],
      [6.8, 4.0],
    ],
  },
];

export const constellationById = (id: string) => CONSTELLATIONS.find((c) => c.id === id);

/** Southern Cross stars, band coords (u, v) in degrees: drawn bright between the Toad and the Llama. */
export const CRUX: Array<[number, number, number]> = [
  [63.5, 3.2, 1],
  [63.9, -2.6, 0.9],
  [61.6, 0.6, 0.8],
  [66.0, 0.2, 0.7],
];
