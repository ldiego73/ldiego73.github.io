/**
 * C4 container-style diagrams for the Artifact Bridge maquettes, one per ARTIFACT in src/data/career.ts.
 * Pure data (no three.js). Labels come only from the artifact's `tech` string (verbatim tool names),
 * from words in its `uses`/`summary` (`from` says which words), or from a small generic C4 vocabulary
 * (clients, producers, consumers, teams, repo). diagrams.test.ts enforces that.
 */
import type { L } from "../../../data/career";

export type NodeKind = "person" | "container" | "gateway" | "queue" | "store" | "plugin" | "system";

export interface C4Node {
  id: string;
  /** A plain string must appear verbatim in the artifact's tech string. */
  label: string | L;
  /** For an L label taken from the artifact's uses/summary: words that must appear there (es, en). */
  from?: L;
  kind: NodeKind;
  /** Column along the flow (0 = left/start) and row across it (0 = center). */
  col: number;
  row: number;
  /** Several copies (multi-brand, clusters, producers). */
  count?: number;
  /** Plugin chips sit on top of this node. */
  on?: string;
}

export interface C4Edge {
  from: string;
  to: string;
}

export interface C4Diagram {
  artifact: string;
  cols: number;
  nodes: C4Node[];
  edges: C4Edge[];
  /** A C4 boundary (dashed frame) around some nodes. */
  boundary?: { label: L; from: L; nodes: string[] };
}

const l = (es: string, en: string): L => ({ es, en });

/** Generic C4 role labels allowed without a source in career.ts. */
export const GENERIC: L[] = [
  l("Productores", "Producers"),
  l("Consumidores", "Consumers"),
  l("Equipos", "Teams"),
  l("Repo", "Repo"),
];

export const DIAGRAMS: C4Diagram[] = [
  {
    artifact: "api-gateway",
    cols: 3,
    nodes: [
      { id: "int", label: l("Interna", "Internal"), from: l("interna", "Internal"), kind: "person", col: 0, row: -1 },
      { id: "ext", label: l("Externa", "External"), from: l("externa", "external"), kind: "person", col: 0, row: 0 },
      { id: "pub", label: l("Pública", "Public"), from: l("pública", "public"), kind: "person", col: 0, row: 1 },
      { id: "gw", label: "Kong · AWS API Gateway", kind: "gateway", col: 1, row: 0 },
      { id: "lua", label: "Lua", kind: "plugin", col: 1, row: 0, on: "gw" },
      {
        id: "cluster",
        label: l("Clúster", "Cluster"),
        from: l("clúster", "cluster"),
        kind: "system",
        col: 2,
        row: 0,
        count: 3,
      },
    ],
    edges: [
      { from: "int", to: "gw" },
      { from: "ext", to: "gw" },
      { from: "pub", to: "gw" },
      { from: "gw", to: "cluster" },
    ],
  },
  {
    artifact: "design-system",
    cols: 4,
    nodes: [
      { id: "tokens", label: l("Tokens", "Tokens"), from: l("Tokens", "Tokens"), kind: "store", col: 0, row: 0 },
      { id: "sd", label: "Style Dictionary", kind: "container", col: 1, row: 0 },
      { id: "wc", label: "Stencil · Web Components", kind: "container", col: 2, row: 0 },
      {
        id: "brands",
        label: l("Multi-marca", "Multi-brand"),
        from: l("multi-marca", "Multi-brand"),
        kind: "system",
        col: 3,
        row: 0,
        count: 3,
      },
    ],
    edges: [
      { from: "tokens", to: "sd" },
      { from: "sd", to: "wc" },
      { from: "wc", to: "brands" },
    ],
    boundary: { label: l("Monorepo", "Monorepo"), from: l("monorepo", "monorepo"), nodes: ["tokens", "sd", "wc"] },
  },
  {
    artifact: "event-driven",
    cols: 3,
    nodes: [
      { id: "prod", label: l("Productores", "Producers"), kind: "container", col: 0, row: 0, count: 2 },
      { id: "eb", label: "EventBridge", kind: "queue", col: 1, row: -1.5 },
      { id: "sqs", label: "SQS", kind: "queue", col: 1, row: -0.5 },
      { id: "kin", label: "Kinesis", kind: "queue", col: 1, row: 0.5 },
      { id: "kafka", label: "Kafka", kind: "queue", col: 1, row: 1.5 },
      { id: "cons", label: l("Consumidores", "Consumers"), kind: "container", col: 2, row: -0.4, count: 2 },
      {
        id: "catalog",
        label: l("Catálogo de eventos", "Event catalog"),
        from: l("catálogo de eventos", "event catalog"),
        kind: "store",
        col: 2,
        row: 1.5,
      },
    ],
    edges: [
      { from: "prod", to: "eb" },
      { from: "prod", to: "sqs" },
      { from: "prod", to: "kin" },
      { from: "prod", to: "kafka" },
      { from: "eb", to: "cons" },
      { from: "sqs", to: "cons" },
      { from: "kin", to: "cons" },
      { from: "kafka", to: "catalog" },
    ],
  },
  {
    artifact: "platform",
    cols: 4,
    nodes: [
      { id: "repo", label: l("Repo", "Repo"), kind: "store", col: 0, row: 0 },
      { id: "jenkins", label: "Jenkins", kind: "container", col: 1, row: -0.75 },
      { id: "gha", label: "GitHub Actions", kind: "container", col: 1, row: 0.75 },
      { id: "argo", label: "ArgoCD", kind: "container", col: 2, row: -0.4 },
      { id: "iac", label: "Terraform · Pulumi", kind: "container", col: 2, row: 1.2 },
      {
        id: "clusters",
        label: l("Multi-región", "Multi-region"),
        from: l("multi-región", "multi-region"),
        kind: "system",
        col: 3,
        row: 0,
        count: 3,
      },
    ],
    edges: [
      { from: "repo", to: "jenkins" },
      { from: "repo", to: "gha" },
      { from: "jenkins", to: "argo" },
      { from: "gha", to: "argo" },
      { from: "argo", to: "clusters" },
      { from: "iac", to: "clusters" },
    ],
  },
  {
    artifact: "ai",
    cols: 4,
    nodes: [
      { id: "teams", label: l("Equipos", "Teams"), kind: "person", col: 0, row: -0.5, count: 2 },
      { id: "claude", label: "Claude Code", kind: "container", col: 1, row: -1.1 },
      { id: "gpt", label: "ChatGPT", kind: "container", col: 1, row: 0.1 },
      { id: "agents", label: "LLM agents", kind: "gateway", col: 2, row: -0.5 },
      {
        id: "sdlc",
        label: l("SDLC automatizado", "AI-automated SDLC"),
        from: l("SDLC automatizado", "AI-automated SDLC"),
        kind: "system",
        col: 3,
        row: -0.5,
        count: 2,
      },
      { id: "py", label: "Python", kind: "container", col: 1, row: 1.35 },
      {
        id: "bio",
        label: l("Biometría", "Biometrics"),
        from: l("Biometría", "Biometrics"),
        kind: "store",
        col: 2,
        row: 1.35,
      },
    ],
    edges: [
      { from: "teams", to: "claude" },
      { from: "teams", to: "gpt" },
      { from: "claude", to: "agents" },
      { from: "gpt", to: "agents" },
      { from: "agents", to: "sdlc" },
      { from: "py", to: "bio" },
    ],
  },
];

export const diagramFor = (artifactId: string) => DIAGRAMS.find((d) => d.artifact === artifactId);

/** Legend copy per node kind (only the kinds a diagram uses are listed in its panel). */
export const KIND_LEGEND: Record<NodeKind, L> = {
  person: l("Persona o cliente", "Person or client"),
  container: l("Contenedor (servicio, herramienta)", "Container (service, tool)"),
  gateway: l("Punto de entrada / orquestador", "Entry point / orchestrator"),
  queue: l("Cola, bus o stream de eventos", "Queue, bus or event stream"),
  store: l("Datos o artefactos", "Data or artifacts"),
  plugin: l("Plugin", "Plugin"),
  system: l("Sistema destino (varios)", "Target system (several)"),
};

export const usedKinds = (d: C4Diagram): NodeKind[] => {
  const order: NodeKind[] = ["person", "gateway", "plugin", "queue", "container", "store", "system"];
  const set = new Set(d.nodes.map((n) => n.kind));
  return order.filter((k) => set.has(k));
};

export const labelText = (label: string | L, lang: "es" | "en") => (typeof label === "string" ? label : label[lang]);

/** Column positions along the flow for a board of length `len` (pure, for tests and the model). */
export function colX(col: number, cols: number, len: number): number {
  if (cols <= 1) return 0;
  const pad = 0.32;
  return -len / 2 + pad + (col * (len - pad * 2)) / (cols - 1);
}
