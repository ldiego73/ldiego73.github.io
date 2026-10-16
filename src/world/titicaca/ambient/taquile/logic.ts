/**
 * Pure rules of Taquile (../taquile.ts): where its buildings, arch and loom stand round the village plaza, when
 * the workshop's prompt shows, and the panel's content: EDUCATION and CERTIFICATIONS from src/data/career.ts,
 * only what is there. No DOM, no three.js (tested in logic.test.ts).
 */
import { CERTIFICATIONS, EDUCATION } from "../../../../data/career";
import type { L, Lang } from "../../../contract";
import { LOOM, TAQUILE } from "../../plan";

/** Stone houses round the plaza: centre, yaw (door on local +z, toward the plaza), width, depth. */
export const HOUSES: ReadonlyArray<{ x: number; z: number; yaw: number; w: number; d: number }> = [
  { x: TAQUILE.x - 11.5, z: TAQUILE.z - 2.5, yaw: Math.PI / 2, w: 5, d: 3.6 },
  { x: TAQUILE.x + 11.5, z: TAQUILE.z - 3, yaw: -Math.PI / 2, w: 5.4, d: 3.8 },
  { x: TAQUILE.x - 10, z: TAQUILE.z + 6.5, yaw: Math.PI / 2 + 0.25, w: 4.4, d: 3.4 },
  { x: TAQUILE.x + 10.5, z: TAQUILE.z + 6, yaw: -Math.PI / 2 - 0.2, w: 4.6, d: 3.4 },
];
/** The weavers' cooperative on the plaza's north side, its door facing the plaza (south, +z). */
export const WORKSHOP = { x: TAQUILE.x, z: TAQUILE.z - 11.5, yaw: 0, w: 8, d: 4.6 } as const;
/** The workshop's prompt radius round the loom. */
export const LOOM_R = 3.6;

export const inLoomRange = (x: number, z: number) => Math.hypot(x - LOOM.x, z - LOOM.z) <= LOOM_R;

export const TAQUILE_COPY = {
  kicker: { es: "Taquile · taller de tejedores", en: "Taquile · the weavers' workshop" },
  title: { es: "Formación y certificaciones", en: "Education and certifications" },
  lede: {
    es: "Como en Taquile, donde el oficio se aprende tejiendo, esto es lo que he estudiado y certificado.",
    en: "As on Taquile, where the craft is learned by weaving, this is what I have studied and been certified in.",
  },
  education: { es: "Formación", en: "Education" },
  certs: { es: "Certificaciones", en: "Certifications" },
  note: {
    es: "En Taquile tejen todos: los hombres tejen a palitos sus chullos y las mujeres hilan con la pushka y tejen en telar. Su arte textil está reconocido por la UNESCO.",
    en: "On Taquile everyone weaves: the men knit their chullos on needles and the women spin with the pushka and weave on looms. Their textile art is recognised by UNESCO.",
  },
  prompt: { es: "E · Ver formación", en: "E · See education" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
  sign: { es: "TAQUILE", en: "TAQUILE" },
  signSub: { es: "Isla de tejedores · formación", en: "Island of weavers · education" },
} satisfies Record<string, L>;

export interface Row {
  title: string;
  detail: string;
  years: string;
}

/** The panel's two woven bands of rows. */
export function taquilePanel(lang: Lang): { education: Row[]; certs: Row[] } {
  return {
    education: EDUCATION.map((e) => ({ title: e.title[lang], detail: e.school, years: e.years })),
    certs: CERTIFICATIONS.map((c) => ({ title: c.name, detail: "", years: c.years })),
  };
}
