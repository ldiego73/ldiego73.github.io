/**
 * What the Wasi rooms say, as plain data (no DOM): every fact comes from src/data/career.ts and
 * src/data/site.ts, every string is bilingual. rooms.ts renders it into the panels.
 */
import { CERTIFICATIONS, COMPANIES, EDUCATION } from "../../../data/career";
import { SITE, SOCIALS } from "../../../data/site";
import { CATALOG } from "../../../lib/passport";
import type { L, Lang } from "../../contract";
import { DYE } from "../../palette";
import { type RoomId, yearsOf } from "./plan";

export const COPY = {
  close: { es: "Cerrar", en: "Close" },
  prompt: {
    sala: { es: "E · Ver trayectoria", en: "E · See career" },
    estudio: { es: "E · Ver formación y CV", en: "E · See education and CV" },
    buzon: { es: "E · Escribir al chasqui", en: "E · Contact" },
    mesa: { es: "E · Abrir pasaporte", en: "E · Open passport" },
  },
  title: {
    sala: { es: "Trayectoria", en: "Career" },
    estudio: { es: "Formación y CV", en: "Education and CV" },
    buzon: { es: "Contacto", en: "Contact" },
    mesa: { es: "Pasaporte", en: "Passport" },
  },
  salaLede: {
    es: "Una cuerda por empresa en el khipu de la pared; cada nudo, un rol.",
    en: "One cord per company on the wall khipu; every knot, a role.",
  },
  chapters: { es: "Ver capítulos", en: "Read the chapters" },
  openCv: { es: "Abrir CV", en: "Open CV" },
  education: { es: "Formación", en: "Education" },
  certs: { es: "Certificaciones", en: "Certifications" },
  resume: { es: "Descargar CV", en: "Download CV" },
  resumeEs: { es: "CV en español (PDF)", en: "CV in Spanish (PDF)" },
  resumeEn: { es: "CV en inglés (PDF)", en: "CV in English (PDF)" },
  buzonLede: {
    es: "El chasqui lleva tu mensaje. Escribe, agenda una llamada o sígueme.",
    en: "The chasqui carries your message. Write, book a call or follow along.",
  },
  email: { es: "Correo", en: "Email" },
  calendly: { es: "Agendar una llamada", en: "Book a call" },
  social: { es: "Redes", en: "Elsewhere" },
  contactForm: { es: "Formulario de contacto", en: "Contact form" },
} satisfies Record<string, L | Record<string, L>>;

/** Room → passport stamp (ids and labels exactly as in the passport CATALOG). */
export function roomStamp(room: RoomId): { id: string; kind: "room"; label: L } {
  const id = `wasi:${room}`;
  const entry = CATALOG.find((s) => s.id === id);
  if (!entry) throw new Error(`missing passport stamp ${id}`);
  return { id, kind: "room", label: entry.label };
}

export interface CareerRow {
  name: string;
  dye: string;
  roles: Array<{ role: string; years: string }>;
}

/** Companies in career order (education lives in the study), each with its roles and years. */
export function careerRows(lang: Lang): CareerRow[] {
  return COMPANIES.filter((c) => !c.education).map((c) => ({
    name: c.name,
    dye: DYE[c.dye],
    roles: c.stages.map((s) => ({ role: s.role[lang], years: yearsOf(s.start, s.end, lang) })),
  }));
}

/** Every cord on the wall khipu: one per company (education included), knots = its stages. */
export function khipuCords(): Array<{ id: string; dye: string; knots: number }> {
  return COMPANIES.map((c) => ({ id: c.id, dye: DYE[c.dye], knots: c.stages.length }));
}

export function educationRows(lang: Lang): Array<{ title: string; school: string; years: string }> {
  return EDUCATION.map((e) => ({ title: e.title[lang], school: e.school, years: e.years }));
}

export const certRows = (): Array<{ name: string; years: string }> => CERTIFICATIONS.map((c) => ({ ...c }));

export interface Link {
  label: string;
  href: string;
  external: boolean;
  download?: boolean;
}

export function studyLinks(lang: Lang): Link[] {
  return [
    { label: COPY.resumeEs[lang], href: SITE.resume.es, external: false, download: true },
    { label: COPY.resumeEn[lang], href: SITE.resume.en, external: false, download: true },
    { label: COPY.openCv[lang], href: `/${lang}/cv/`, external: false },
  ];
}

export function salaLinks(lang: Lang): Link[] {
  return [
    { label: COPY.chapters[lang], href: `/${lang}/#story`, external: false },
    { label: COPY.openCv[lang], href: `/${lang}/cv/`, external: false },
  ];
}

export function contactLinks(lang: Lang): {
  email: string;
  mailto: string;
  calendly: Link;
  social: Link[];
  form: Link;
} {
  return {
    email: SITE.email,
    mailto: `mailto:${SITE.email}`,
    calendly: { label: COPY.calendly[lang], href: SITE.calendly, external: true },
    // The email already has its own row.
    social: SOCIALS.filter((s) => s.icon !== "mail").map((s) => ({ label: s.name, href: s.url, external: true })),
    form: { label: COPY.contactForm[lang], href: `/${lang}/#contact`, external: false },
  };
}
