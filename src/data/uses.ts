/**
 * /uses: tools, stack and how I work with AI agents. Edit freely; every entry is bilingual.
 * Professional stack comes from career.ts (SKILLS) so both pages stay in sync.
 */
import type { Dye, L } from "./career";

const l = (es: string, en: string): L => ({ es, en });

export interface UseItem {
  name: string;
  why: L;
  url?: string;
}
export interface UseGroup {
  id: string;
  title: L;
  lede?: L;
  dye: Dye;
  items: UseItem[];
}

/** AI-driven lifecycle: SDLC → AIDLC. The tech-lead orchestrator hands work to these agents by phase. */
export const AIDLC: { orchestrator: UseItem; phases: Array<{ phase: L; dye: Dye; agents: UseItem[] }> } = {
  orchestrator: {
    name: "tech-lead",
    why: l(
      "Mi agente orquestador: recibe el objetivo, lo divide y reparte el trabajo entre los agentes especialistas.",
      "My orchestrator agent: takes the goal, breaks it down and hands the work to the specialist agents.",
    ),
  },
  phases: [
    {
      phase: l("Definir", "Define"),
      dye: "ochre",
      agents: [
        {
          name: "spec-writer",
          why: l("Especificaciones y criterios de aceptación.", "Specs and acceptance criteria."),
        },
        { name: "business-doc", why: l("Documentación de negocio.", "Business documentation.") },
      ],
    },
    {
      phase: l("Diseñar", "Design"),
      dye: "indigo",
      agents: [
        { name: "architect", why: l("Arquitectura y decisiones técnicas.", "Architecture and technical decisions.") },
        { name: "planner", why: l("Plan de implementación por pasos.", "Step-by-step implementation plan.") },
      ],
    },
    {
      phase: l("Construir", "Build"),
      dye: "turq",
      agents: [
        { name: "tdd-guide", why: l("Primero las pruebas.", "Tests first.") },
        { name: "backend-engineer", why: l("Implementación.", "Implementation.") },
      ],
    },
    {
      phase: l("Verificar", "Verify"),
      dye: "red",
      agents: [
        { name: "code-reviewer", why: l("Revisión de código.", "Code review.") },
        { name: "security-reviewer", why: l("Revisión de seguridad.", "Security review.") },
        { name: "qa-engineer", why: l("Calidad y pruebas end-to-end.", "Quality and end-to-end testing.") },
      ],
    },
    {
      phase: l("Documentar", "Document"),
      dye: "alpaca",
      agents: [{ name: "doc-updater", why: l("Mantiene la documentación al día.", "Keeps the docs up to date.") }],
    },
  ],
};

export const AI_TOOLS: UseGroup = {
  id: "ai",
  title: l("Agentes, orquestación y skills", "Agents, orchestration and skills"),
  dye: "indigo",
  items: [
    {
      name: "Claude Code",
      url: "https://claude.com/claude-code",
      why: l(
        "Mi agente principal para escribir, revisar y verificar código.",
        "My main agent to write, review and verify code.",
      ),
    },
    {
      name: "Codex",
      url: "https://openai.com/codex",
      why: l("Tareas en paralelo y una segunda opinión.", "Parallel tasks and a second opinion."),
    },
    {
      name: "OpenCode",
      url: "https://opencode.ai/",
      why: l("Otro agente de código en la terminal.", "Another coding agent in the terminal."),
    },
    {
      name: "Orca",
      url: "https://www.onorca.dev",
      why: l("Orquestación de agentes en paralelo.", "Orchestrating agents in parallel."),
    },
    {
      name: "Herdr",
      url: "https://herdr.dev/",
      why: l("Orquestación de agentes, principalmente.", "Agent orchestration, mainly."),
    },
    {
      name: "AI Hero skills",
      url: "https://www.aihero.dev/skills",
      why: l("Skills reutilizables para los agentes.", "Reusable skills for the agents."),
    },
    {
      name: "caveman",
      url: "https://github.com/juliusbrussee/caveman",
      why: l(
        "Respuestas cortas y directas: menos tokens, misma sustancia.",
        "Short, direct answers: fewer tokens, same substance.",
      ),
    },
    {
      name: "ponytail",
      url: "https://github.com/DietrichGebert/ponytail",
      why: l("La solución más simple que funcione. YAGNI primero.", "The simplest solution that works. YAGNI first."),
    },
    {
      name: "impeccable",
      url: "https://impeccable.style/",
      why: l("Skill de diseño de interfaces.", "Interface design skill."),
    },
    {
      name: "archify",
      url: "https://github.com/tt-a1i/archify",
      why: l("Diagramas de arquitectura interactivos.", "Interactive architecture diagrams."),
    },
    {
      name: "RTK",
      url: "https://github.com/rtk-ai/rtk",
      why: l("Reduce los tokens que consume la salida de comandos.", "Cuts the tokens command output consumes."),
    },
    {
      name: "ccusage",
      url: "https://github.com/ccusage/ccusage",
      why: l("Para ver el uso y el costo de los agentes.", "To see agent usage and cost."),
    },
  ],
};

export const SITE_STACK: UseGroup = {
  id: "site",
  title: l("Con qué está hecho este sitio", "What this site is built with"),
  lede: l(
    "Construido junto a agentes en paralelo, cada uno con su contrato y sus archivos, y verificado con tests, capturas y Lighthouse.",
    "Built with agents working in parallel, each with its own contract and files, and verified with tests, screenshots and Lighthouse.",
  ),
  dye: "turq",
  items: [
    {
      name: "Astro",
      url: "https://astro.build",
      why: l("Sitio estático, contenido en MDX.", "Static site, MDX content."),
    },
    {
      name: "Three.js",
      url: "https://threejs.org",
      why: l("El khipu, el arcade y el mundo 3D.", "The khipu, the arcade and the 3D world."),
    },
    { name: "Bun", url: "https://bun.sh", why: l("Instalación, scripts y tests.", "Install, scripts and tests.") },
    { name: "TypeScript", url: "https://www.typescriptlang.org", why: l("Todo el código.", "All the code.") },
    { name: "Biome", url: "https://biomejs.dev", why: l("Formato y lint.", "Format and lint.") },
    {
      name: "Playwright",
      url: "https://playwright.dev",
      why: l("Pruebas end-to-end y capturas.", "End-to-end tests and screenshots."),
    },
    {
      name: "Lighthouse CI",
      url: "https://github.com/GoogleChrome/lighthouse-ci",
      why: l("Core Web Vitals en cada PR y en producción.", "Core Web Vitals on every PR and in production."),
    },
    {
      name: "GitHub Actions + Pages",
      url: "https://pages.github.com",
      why: l("CI y despliegue.", "CI and deploys."),
    },
    { name: "Umami", url: "https://umami.is", why: l("Analítica sin cookies.", "Cookieless analytics.") },
    {
      name: "Web Audio",
      why: l("Música y sonidos generados en el navegador.", "Music and sounds generated in the browser."),
    },
  ],
};

export const DAILY: UseGroup = {
  id: "daily",
  title: l("Editor, terminal y equipo", "Editor, terminal and gear"),
  dye: "ochre",
  items: [
    {
      name: "Zed",
      url: "https://zed.dev",
      why: l("Editor rápido para el día a día.", "Fast editor for everyday work."),
    },
    { name: "Cursor", url: "https://cursor.com", why: l("Editor con IA integrada.", "Editor with built-in AI.") },
    { name: "Ghostty", url: "https://ghostty.org", why: l("Mi terminal.", "My terminal.") },
    { name: "MacBook Pro M5 Pro", why: l("Mi máquina de trabajo.", "My work machine.") },
  ],
};
