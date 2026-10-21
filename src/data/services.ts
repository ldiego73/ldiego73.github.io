/**
 * /services: consulting formats, reference prices, how an engagement starts and the FAQ. Single source for the
 * services page, its OG card and the contact form's format and budget options. Prices are the owner's own
 * reference floors in USD ("from"), taxes not included; the final number goes in the written proposal.
 */
import type { Dye, L } from "./career";

const l = (es: string, en: string): L => ({ es, en });

export type FormatId = "diagnostic" | "project" | "retainer";

export interface Format {
  id: FormatId;
  /** Turns of the long knot drawn above the column: 1, 2, 3 as the commitment grows. */
  knots: number;
  name: L;
  kicker: L;
  pitch: L;
  /** Reference floor in USD. */
  fromUsd: number;
  monthly?: boolean;
  priceNote: L;
  /** "May include": what the format can cover; the written proposal fixes the real scope. */
  items: L[];
  ai: L;
  fit: L;
  cta: L;
}

export const FORMATS: Format[] = [
  {
    id: "diagnostic",
    knots: 1,
    name: l("Diagnóstico", "Assessment"),
    kicker: l("1–2 semanas · alcance cerrado", "1–2 weeks · fixed scope"),
    pitch: l(
      "Una mirada externa a tu arquitectura, tu nube o tu equipo, con un plan priorizado al final.",
      "An outside look at your architecture, your cloud or your team, ending in a prioritized plan.",
    ),
    fromUsd: 1500,
    priceNote: l(
      "Precio fijo · se descuenta si seguimos con un proyecto",
      "Fixed price · credited if we continue with a project",
    ),
    items: [
      l(
        "Entrevistas con el equipo y revisión del código o la cuenta cloud",
        "Team interviews and a review of the code or the cloud account",
      ),
      l("Mapa C4 de la arquitectura actual", "C4 map of the current architecture"),
      l("Riesgos y costos ordenados por impacto", "Risks and costs ranked by impact"),
      l("Plan de 90 días", "A 90-day plan"),
    ],
    ai: l(
      "Análisis del código, la infraestructura y la factura con IA: más cobertura en menos días. Las conclusiones las reviso y firmo yo.",
      "AI-assisted analysis of the code, the infrastructure and the bill: more coverage in fewer days. I review and sign off every conclusion.",
    ),
    fit: l(
      "sientes que algo no escala, o la factura cloud crece más rápido que el negocio.",
      "something feels like it won't scale, or the cloud bill grows faster than the business.",
    ),
    cta: l("Pedir diagnóstico", "Request an assessment"),
  },
  {
    id: "project",
    knots: 2,
    name: l("Proyecto", "Project"),
    kicker: l("Alcance y entregables", "Scope and deliverables"),
    pitch: l(
      "Diseño y construcción de una pieza concreta junto a tu equipo, con traspaso al final.",
      "Design and build of one concrete piece alongside your team, with a handover at the end.",
    ),
    fromUsd: 2500,
    priceNote: l("Cotización según alcance, después de una llamada", "Quoted by scope, after a call"),
    items: [
      l("Plataforma Kubernetes, IaC y GitOps", "Kubernetes platform, IaC and GitOps"),
      l("API gateway o integración por eventos", "API gateway or event-driven integration"),
      l("Arquitectura de app web o mobile", "Web or mobile app architecture"),
      l("Documentación y traspaso al equipo", "Documentation and handover to the team"),
    ],
    ai: l(
      "Construcción con agentes de código y revisión asistida. Cada cambio pasa por revisión humana y pruebas.",
      "Built with coding agents and assisted review. Every change goes through human review and tests.",
    ),
    fit: l(
      "ya sabes qué hay que construir y te falta alguien que lo haya hecho antes.",
      "you know what needs building and you're missing someone who has done it before.",
    ),
    cta: l("Cotizar proyecto", "Get a quote"),
  },
  {
    id: "retainer",
    knots: 3,
    name: l("Acompañamiento", "Retainer"),
    kicker: l("Mensual · horas reservadas", "Monthly · reserved hours"),
    pitch: l(
      "Un arquitecto o líder técnico fraccional para decisiones, revisiones y crecimiento del equipo.",
      "A fractional architect or tech lead for decisions, reviews and growing the team.",
    ),
    fromUsd: 1000,
    monthly: true,
    priceNote: l("10 horas al mes · mínimo 3 meses", "10 hours a month · 3-month minimum"),
    items: [
      l("Revisión de decisiones de arquitectura (ADR)", "Review of architecture decisions (ADRs)"),
      l("Mentoría a Tech Leads", "Mentoring for Tech Leads"),
      l("Gobierno de arquitectura y estándares", "Architecture governance and standards"),
      l("Adopción de IA en el ciclo de desarrollo", "AI adoption across the delivery cycle"),
    ],
    ai: l(
      "Tu equipo aprende el flujo con IA: contexto, revisión y calidad, para que siga funcionando cuando yo no esté.",
      "Your team learns the AI workflow (context, review and quality) so it keeps working when I'm not there.",
    ),
    fit: l(
      "tu equipo crece y necesitas criterio senior sin contratar a tiempo completo.",
      "your team is growing and you need senior judgment without a full-time hire.",
    ),
    cta: l("Hablar del acompañamiento", "Talk about a retainer"),
  },
];

/** The areas the formats apply to, colored by the khipu's dye roles. */
export const AREAS: Array<{ dye: Dye; name: L }> = [
  { dye: "red", name: l("Cloud y FinOps", "Cloud and FinOps") },
  { dye: "indigo", name: l("Arquitectura y APIs", "Architecture and APIs") },
  { dye: "alpaca", name: l("Web y mobile", "Web and mobile") },
  { dye: "red", name: l("DevSecOps", "DevSecOps") },
  { dye: "ochre", name: l("Liderazgo técnico", "Technical leadership") },
  { dye: "turq", name: l("IA en el desarrollo", "AI in delivery") },
];

export const STEPS: Array<{ title: L; text: L; ai: L }> = [
  {
    title: l("Llamada de 60 min", "60-minute call"),
    text: l("Me cuentas el problema. Sin costo.", "You tell me the problem. Free of charge."),
    ai: l("Resumen de la llamada para validar juntos el contexto.", "A call summary we both check for context."),
  },
  {
    title: l("Propuesta escrita", "Written proposal"),
    text: l(
      "Formato, alcance, tiempos y precio cerrado o rango.",
      "Format, scope, timeline and a fixed price or range.",
    ),
    ai: l("Primer análisis rápido para estimar con datos, no a ojo.", "A quick first analysis to estimate from data."),
  },
  {
    title: l("Trabajo", "Work"),
    text: l("Avances semanales y decisiones por escrito.", "Weekly progress and decisions in writing."),
    ai: l(
      "Agentes de código y revisión asistida; yo reviso cada cambio.",
      "Coding agents and assisted review; I review every change.",
    ),
  },
  {
    title: l("Entrega", "Delivery"),
    text: l("Documentos, código y traspaso a tu equipo.", "Documents, code and handover to your team."),
    ai: l(
      "Documentación y runbooks verificados, y el flujo con IA listo para tu equipo.",
      "Verified docs and runbooks, and the AI workflow ready for your team.",
    ),
  },
];

/** How AI fits the work: it speeds things up, the judgment stays human. */
export const AI_PRINCIPLES: Array<{ title: L; text: L }> = [
  {
    title: l("Acelera, no decide", "It speeds up, it doesn't decide"),
    text: l(
      "Las decisiones de arquitectura quedan por escrito y con mi firma. La IA propone; yo reviso.",
      "Architecture decisions are written down and signed by me. AI proposes; I review.",
    ),
  },
  {
    title: l("Tu código, tus reglas", "Your code, your rules"),
    text: l(
      "Solo uso las herramientas y los datos que tu empresa apruebe.",
      "I only use the tools and data your company approves.",
    ),
  },
  {
    title: l("Se queda con tu equipo", "It stays with your team"),
    text: l(
      "El flujo con IA se documenta y se enseña, para que tu equipo lo siga usando.",
      "The AI workflow is documented and taught, so your team keeps using it.",
    ),
  },
];

export const FAQ: Array<{ q: L; a: L }> = [
  {
    q: l("¿Los precios son finales?", "Are the prices final?"),
    a: l(
      "Son precios mínimos de referencia. El precio exacto queda en la propuesta escrita después de la primera llamada.",
      "They are reference floors. The exact price goes in the written proposal after the first call.",
    ),
  },
  {
    q: l("¿En qué moneda facturas?", "What currency do you bill in?"),
    a: l(
      "En dólares (USD). Los precios publicados son referenciales y no incluyen impuestos.",
      "US dollars (USD). Published prices are for reference and exclude taxes.",
    ),
  },
  {
    q: l("¿Trabajas remoto?", "Do you work remotely?"),
    a: l(
      "Sí, en remoto y en español o inglés. La primera llamada es por videollamada.",
      "Yes, remotely and in Spanish or English. The first call is a video call.",
    ),
  },
];

/** Optional budget ranges for the contact form, in USD. */
export const BUDGETS: L[] = [
  l("Prefiero no decir", "I'd rather not say"),
  l("Menos de USD 1,500", "Under USD 1,500"),
  l("USD 1,500 – 5,000", "USD 1,500 – 5,000"),
  l("Más de USD 5,000", "Over USD 5,000"),
];

/** "Desde USD 1,500" / "From USD 1,000 / month". Thousands use a comma in both languages, as USD prices do. */
export function fromPrice(lang: "es" | "en", f: Pick<Format, "fromUsd" | "monthly">): string {
  const n = f.fromUsd.toLocaleString("en-US");
  const per = f.monthly ? (lang === "es" ? " / mes" : " / month") : "";
  return `${lang === "es" ? "Desde" : "From"} USD ${n}${per}`;
}
