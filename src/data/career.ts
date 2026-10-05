/**
 * Career data drives the hero khipu, the chapters, the flat CV view and the artifact top cords.
 * Sources: Resume.pdf (2026) and the previous site's experience data. No invented claims.
 */
export type L = { es: string; en: string };
export type Dye = "red" | "indigo" | "ochre" | "turq" | "alpaca";

/** A knot: n = 1 single knot (a shipped thing); n > 1 long knot whose turns encode a digit of a metric. */
export interface Knot {
  id: string;
  n: number;
  text: L;
  metric?: string;
}

export interface Stage {
  id: string;
  role: L;
  start: string; // YYYY-MM
  end?: string; // YYYY-MM, undefined = present
  place: L;
  dye: Dye;
  summary: L;
  knots: Knot[];
  stack?: string[];
}

export interface Company {
  id: string;
  name: string;
  /** Main dye of the pendant cord. */
  dye: Dye;
  stages: Stage[];
  /** Education hangs as a subsidiary of another company's cord. */
  education?: boolean;
}

const l = (es: string, en: string): L => ({ es, en });

export const COMPANIES: Company[] = [
  {
    id: "avances",
    name: "Avances Tecnológicos",
    dye: "alpaca",
    stages: [
      {
        id: "avances-tl",
        role: l("Technical Leader Mobile", "Technical Leader Mobile"),
        start: "2014-01",
        end: "2016-01",
        place: l("Lima, Perú", "Lima, Peru"),
        dye: "alpaca",
        summary: l(
          "Arquitectura de las apps de Yanbal para consultoras y la primera arquitectura de microservicios con Node.js de la empresa.",
          "Architecture for Yanbal's consultant apps and the company's first Node.js microservices architecture.",
        ),
        knots: [
          {
            id: "yanbal-hybrid",
            n: 1,
            text: l(
              "Primera app híbrida para Yanbal con Ionic y Angular.",
              "First hybrid app for Yanbal with Ionic and Angular.",
            ),
          },
          {
            id: "fincyt",
            n: 1,
            text: l(
              "Ganador del concurso Fincyt con la idea de Cuponeo para MYPE.",
              "Winner of the Fincyt contest with the Cuponeo idea for small businesses.",
            ),
          },
          {
            id: "first-ms",
            n: 1,
            text: l(
              "Primera arquitectura de microservicios en Node.js de la empresa.",
              "The company's first Node.js microservices architecture.",
            ),
          },
        ],
        stack: ["Ionic", "Angular", "Node.js"],
      },
    ],
  },
  {
    id: "hundred",
    name: "Hundred",
    dye: "alpaca",
    stages: [
      {
        id: "hundred-ac",
        role: l("Associate Consultant", "Associate Consultant"),
        start: "2016-01",
        end: "2016-09",
        place: l("Lima, Perú", "Lima, Peru"),
        dye: "alpaca",
        summary: l(
          "Consultoría móvil para Belcorp: sincronización, actualizaciones y modularidad.",
          "Mobile consulting for Belcorp: sync, updates and modularity.",
        ),
        knots: [
          {
            id: "sync-50",
            n: 5,
            metric: "50%",
            text: l(
              "50% menos tiempo de sincronización en la app “Gestiona tu Negocio”.",
              "50% less sync time in the “Gestiona tu Negocio” app.",
            ),
          },
          {
            id: "modular",
            n: 1,
            text: l(
              "Primera implementación del patrón modular en las apps de Belcorp.",
              "First modular pattern implementation in Belcorp's apps.",
            ),
          },
        ],
        stack: ["Android", "iOS"],
      },
    ],
  },
  {
    id: "belcorp",
    name: "Belcorp",
    dye: "alpaca",
    stages: [
      {
        id: "belcorp-sa",
        role: l("Arquitecto de Soluciones", "Solutions Architect"),
        start: "2016-09",
        end: "2020-07",
        place: l("Lima, Perú", "Lima, Peru"),
        dye: "alpaca",
        summary: l(
          "De la primera plataforma DevOps móvil a un API Gateway omnicanal con Kong.",
          "From the first mobile DevOps platform to an omnichannel API Gateway on Kong.",
        ),
        knots: [
          {
            id: "kong-omni",
            n: 1,
            text: l(
              "API Gateway omnicanal con Kong: JWT, API Keys y un plugin de autorización en Lua.",
              "Omnichannel API Gateway on Kong: JWT, API keys and a Lua authorization plugin.",
            ),
          },
          {
            id: "mobile-devops",
            n: 1,
            text: l(
              "Primera plataforma DevOps para apps móviles con Jenkins y Fastlane.",
              "First DevOps platform for mobile apps with Jenkins and Fastlane.",
            ),
          },
          {
            id: "stencil-ds",
            n: 1,
            text: l("Design System multi-marca con Stencil.", "Multi-brand design system with Stencil."),
          },
          {
            id: "clean-android",
            n: 1,
            text: l(
              "Clean Architecture en Android con Kotlin y Jetpack.",
              "Clean Architecture on Android with Kotlin and Jetpack.",
            ),
          },
        ],
        stack: ["Kong", "Lua", "Kotlin", "Jenkins", "Stencil", "EventBridge"],
      },
    ],
  },
  {
    id: "auna",
    name: "Auna",
    dye: "indigo",
    stages: [
      {
        id: "auna-sa",
        role: l("Arquitecto de Soluciones", "Solutions Architect"),
        start: "2020-07",
        end: "2021-06",
        place: l("Lima, Perú", "Lima, Peru"),
        dye: "indigo",
        summary: l(
          "La primera app de transformación digital, serverless de punta a punta.",
          "The first digital transformation app, serverless end to end.",
        ),
        knots: [
          {
            id: "telehealth",
            n: 1,
            text: l(
              "Teleconsulta, citas y recetas con microservicios serverless y API Gateway WebSocket.",
              "Telehealth, appointments and prescriptions on serverless microservices and API Gateway WebSocket.",
            ),
          },
          {
            id: "payment-broker",
            n: 1,
            text: l(
              "Payment Broker e Identity Broker para todas las soluciones digitales.",
              "Payment Broker and Identity Broker for every digital product.",
            ),
          },
          {
            id: "biometrics",
            n: 1,
            text: l(
              "Validación de identidad biométrica con Python para firma digital.",
              "Biometric identity validation with Python for digital signatures.",
            ),
          },
        ],
        stack: ["AWS Lambda", "API Gateway", "DynamoDB", "Python", "Ionic"],
      },
      {
        id: "auna-pa",
        role: l("Principal Architect", "Principal Architect"),
        start: "2021-06",
        end: "2022-01",
        place: l("Lima, Perú", "Lima, Peru"),
        dye: "indigo",
        summary: l(
          "Gobierno de arquitectura para toda la organización: CyberSecurity, Arquitectura y Platform.",
          "Architecture governance for the whole organization: CyberSecurity, Architecture and Platform.",
        ),
        knots: [
          {
            id: "auna-ds",
            n: 1,
            text: l(
              "Design System multi-marca con Design Tokens, Style Dictionary y Web Components.",
              "Multi-brand design system with design tokens, Style Dictionary and web components.",
            ),
          },
          {
            id: "tech-radar",
            n: 1,
            text: l("Technology Radar de toda la organización.", "Technology Radar for the whole organization."),
          },
          {
            id: "ibm-to-aws",
            n: 1,
            text: l(
              "API Platform en AWS API Gateway y migración desde IBM API Connect.",
              "API Platform on AWS API Gateway and migration off IBM API Connect.",
            ),
          },
          {
            id: "analytics",
            n: 1,
            text: l(
              "Analytics Framework con Kinesis Stream, Firehose y S3.",
              "Analytics framework with Kinesis Stream, Firehose and S3.",
            ),
          },
        ],
        stack: ["C4 Model", "AWS", "Kinesis", "Auth0", "Sentry", "Strapi"],
      },
      {
        id: "auna-sem",
        role: l("Senior Engineering Manager", "Senior Engineering Manager"),
        start: "2022-01",
        end: "2022-08",
        place: l("Lima, Perú", "Lima, Peru"),
        dye: "ochre",
        summary: l(
          "Seis PODs: Common Components, CyberSecurity, Arquitectura, Platform, Design System y Clínica Digital.",
          "Six PODs: Common Components, CyberSecurity, Architecture, Platform, Design System and Digital Clinic.",
        ),
        knots: [
          {
            id: "kong-sla",
            n: 9,
            metric: "99.9%",
            text: l(
              "Kong Gateway para salud digital con 99.9% de SLA en sistemas críticos de pacientes.",
              "Kong Gateway for digital health at 99.9% SLA for critical patient systems.",
            ),
          },
          {
            id: "pods",
            n: 6,
            metric: "6",
            text: l("Seis PODs liderados.", "Six PODs led."),
          },
          {
            id: "mfe",
            n: 1,
            text: l(
              "Templates de micro frontends con React y Webpack, y de microservicios en .NET y Node.js.",
              "Micro frontend templates with React and Webpack, and microservice templates in .NET and Node.js.",
            ),
          },
        ],
        stack: ["Kong", "React", "Webpack", ".NET", "Node.js"],
      },
    ],
  },
  {
    id: "xepelin",
    name: "Xepelin",
    dye: "ochre",
    stages: [
      {
        id: "xepelin-em",
        role: l("Engineering Manager", "Engineering Manager"),
        start: "2022-08",
        end: "2024-08",
        place: l("Remoto", "Remote"),
        dye: "ochre",
        summary: l(
          "Core Engineering, PaaS, Onboarding y Lending en una fintech que escalaba rápido.",
          "Core Engineering, PaaS, Onboarding and Lending at a fast-scaling fintech.",
        ),
        knots: [
          {
            id: "teams-4",
            n: 4,
            metric: "4",
            text: l("Cuatro equipos liderados.", "Four teams led."),
          },
          {
            id: "xepelin-api",
            n: 1,
            text: l(
              "API Platform interna, externa y pública con AWS API Gateway y una librería Node.js documentada.",
              "Internal, external and public API Platform on AWS API Gateway with a documented Node.js library.",
            ),
          },
          {
            id: "kafka-eda",
            n: 1,
            text: l(
              "Arquitectura orientada a eventos con Kafka, catálogo y librería de eventos.",
              "Event-driven architecture on Kafka with an event catalog and library.",
            ),
          },
          {
            id: "core-ms",
            n: 1,
            text: l(
              "Microservicios core ThirdParty y Documents Manager.",
              "Core microservices ThirdParty and Documents Manager.",
            ),
          },
          {
            id: "ai-dev",
            n: 1,
            text: l(
              "Desarrollo acelerado con IA: Claude Code y ChatGPT en el día a día de los equipos.",
              "AI-accelerated development: Claude Code and ChatGPT in the teams' daily work.",
            ),
          },
          {
            id: "ts-toolkit",
            n: 1,
            text: l(
              "Toolkit en TypeScript: decorators, errores de dominio, monads, logger y configs compartidas.",
              "TypeScript toolkit: decorators, domain errors, monads, logger and shared configs.",
            ),
          },
        ],
        stack: ["TypeScript", "Kafka", "Pulumi", "AWS", "EKS", "GitHub Actions", "Claude Code", "ChatGPT"],
      },
    ],
  },
  {
    id: "complutense",
    name: "U. Complutense",
    dye: "turq",
    education: true,
    stages: [
      {
        id: "master-ai",
        role: l("Máster en Big Data, Data Science e IA", "Master's in Big Data, Data Science & AI"),
        start: "2023-10",
        end: "2024-09",
        place: l("Madrid, España", "Madrid, Spain"),
        dye: "turq",
        summary: l(
          "Ciencia de datos e inteligencia artificial, en paralelo al trabajo en Xepelin.",
          "Data science and artificial intelligence, alongside the work at Xepelin.",
        ),
        knots: [
          {
            id: "master",
            n: 1,
            text: l(
              "Big Data, Data Science e Inteligencia Artificial.",
              "Big Data, Data Science and Artificial Intelligence.",
            ),
          },
        ],
        stack: ["Python", "ML", "Spark"],
      },
    ],
  },
  {
    id: "topsort",
    name: "TopSort",
    dye: "red",
    stages: [
      {
        id: "topsort-infra",
        role: l("Infra Lead", "Infra Lead"),
        start: "2024-11",
        end: "2026-04",
        place: l("Remoto", "Remote"),
        dye: "red",
        summary: l(
          "Bajar la factura sin bajar la disponibilidad, en una operación multi-región y multi-cloud.",
          "Cutting the bill without cutting availability, across a multi-region, multi-cloud operation.",
        ),
        knots: [
          {
            id: "finops",
            n: 3,
            metric: "30–40%",
            text: l(
              "30–40% menos costo de infraestructura con FinOps, Karpenter y KubeCost.",
              "30–40% lower infrastructure cost with FinOps, Karpenter and KubeCost.",
            ),
          },
          {
            id: "kong-migration",
            n: 1,
            text: l(
              "Migración de APISIX a Kong Gateway en clusters multi-región, con Kuma como service mesh.",
              "APISIX to Kong Gateway migration across multi-region clusters, with Kuma as service mesh.",
            ),
          },
          {
            id: "observability",
            n: 1,
            text: l(
              "Observabilidad al 100% con Grafana, Loki, Tempo y Prometheus.",
              "100% observability with Grafana, Loki, Tempo and Prometheus.",
            ),
          },
          {
            id: "topsort-eda",
            n: 1,
            text: l(
              "Arquitectura orientada a eventos con Kafka, SQS y EventBridge.",
              "Event-driven architecture with Kafka, SQS and EventBridge.",
            ),
          },
          {
            id: "gitops",
            n: 1,
            text: l(
              "GitOps con ArgoCD, Helm y Kustomize; IaC con Terraform y Pulumi.",
              "GitOps with ArgoCD, Helm and Kustomize; IaC with Terraform and Pulumi.",
            ),
          },
        ],
        stack: [
          "Kubernetes",
          "GCP",
          "AWS",
          "Karpenter",
          "ArgoCD",
          "Terraform",
          "Kong",
          "Kafka",
          "SQS",
          "EventBridge",
          "Grafana",
        ],
      },
    ],
  },
  {
    id: "globant",
    name: "Globant",
    dye: "ochre",
    stages: [
      {
        id: "globant-tm",
        role: l("Tech Manager", "Tech Manager"),
        start: "2026-04",
        place: l("Remoto", "Remote"),
        dye: "ochre",
        summary: l(
          "Satélites, Integraciones y Cloud & DevSecOps para la migración al nuevo Core INSIS.",
          "Satellites, Integrations and Cloud & DevSecOps for the migration to the new INSIS Core.",
        ),
        knots: [
          {
            id: "insis-50",
            n: 5,
            metric: "50+",
            text: l(
              "Arquitectura de integración del Core INSIS: más de 50 integraciones bajo un patrón común.",
              "INSIS Core integration architecture: 50+ integrations under one shared pattern.",
            ),
          },
          {
            id: "teams-3",
            n: 3,
            metric: "3",
            text: l(
              "Tres equipos y sus Tech Leads: Satélites, Integraciones y Cloud & DevSecOps.",
              "Three teams and their Tech Leads: Satellites, Integrations and Cloud & DevSecOps.",
            ),
          },
          {
            id: "ai-sdlc",
            n: 1,
            text: l(
              "Ciclo de desarrollo automatizado con IA, con prácticas de contexto y calidad.",
              "AI-automated delivery cycle with context and quality practices.",
            ),
          },
          {
            id: "tl-charter",
            n: 1,
            text: l(
              "TL Charter: el rol de Technical Lead frente al de Tech Manager.",
              "TL Charter: the Technical Lead role versus the Tech Manager role.",
            ),
          },
        ],
        stack: ["INSIS", "API contracts", "GitOps", "Observability", "AI"],
      },
    ],
  },
];

export interface ArtifactUse {
  stage: string;
  text: L;
}

/** Cross-company artifacts: in the khipu they are top cords tied to the knots they span. */
export interface Artifact {
  id: string;
  name: L;
  dye: Dye;
  tech: string;
  summary: L;
  uses: ArtifactUse[];
}

export const ARTIFACTS: Artifact[] = [
  {
    id: "api-gateway",
    name: l("API Gateway y API Platform", "API Gateway & API Platform"),
    dye: "red",
    tech: "Kong · AWS API Gateway · Lua",
    summary: l(
      "Un contrato central para todo el tráfico entre servicios. Lo construí cuatro veces, en cuatro contextos distintos.",
      "One central contract for all service-to-service traffic. I built it four times, in four different contexts.",
    ),
    uses: [
      { stage: "belcorp-sa", text: l("Kong omnicanal con plugin Lua.", "Omnichannel Kong with a Lua plugin.") },
      {
        stage: "auna-pa",
        text: l("AWS API Gateway, migración desde IBM.", "AWS API Gateway, migrated off IBM."),
      },
      { stage: "auna-sem", text: l("Kong al 99.9% de SLA.", "Kong at 99.9% SLA.") },
      {
        stage: "xepelin-em",
        text: l("API Platform interna, externa y pública.", "Internal, external and public API Platform."),
      },
      { stage: "topsort-infra", text: l("APISIX → Kong multi-región.", "APISIX → Kong multi-region.") },
      {
        stage: "globant-tm",
        text: l("Gobierno de exposición de APIs hacia el clúster.", "API exposure governance into the cluster."),
      },
    ],
  },
  {
    id: "design-system",
    name: l("Design System multi-marca", "Multi-brand Design System"),
    dye: "indigo",
    tech: "Stencil · Style Dictionary · Web Components",
    summary: l(
      "Componentes compartidos entre marcas a partir de design tokens.",
      "Components shared across brands, driven by design tokens.",
    ),
    uses: [
      { stage: "belcorp-sa", text: l("Stencil multi-marca.", "Multi-brand Stencil.") },
      {
        stage: "auna-pa",
        text: l("Tokens + Web Components en monorepo.", "Tokens + web components in a monorepo."),
      },
      { stage: "auna-sem", text: l("POD de Design System.", "Design System POD.") },
    ],
  },
  {
    id: "event-driven",
    name: l("Arquitectura orientada a eventos", "Event-driven architecture"),
    dye: "turq",
    tech: "EventBridge · SQS · Kinesis · Kafka",
    summary: l(
      "Eventos como contrato entre dominios, con catálogo y librerías compartidas.",
      "Events as the contract between domains, with a catalog and shared libraries.",
    ),
    uses: [
      { stage: "belcorp-sa", text: l("Librería MCBA + EDA con EventBridge.", "MCBA + EDA library on EventBridge.") },
      { stage: "auna-pa", text: l("Analytics con Kinesis.", "Analytics on Kinesis.") },
      { stage: "xepelin-em", text: l("Kafka con catálogo de eventos.", "Kafka with an event catalog.") },
      {
        stage: "topsort-infra",
        text: l(
          "Kafka, SQS y EventBridge en la plataforma multi-región.",
          "Kafka, SQS and EventBridge on the multi-region platform.",
        ),
      },
    ],
  },
  {
    id: "platform",
    name: l("Platform engineering y DevOps", "Platform engineering & DevOps"),
    dye: "ochre",
    tech: "Jenkins · GitHub Actions · ArgoCD · Terraform · Pulumi",
    summary: l(
      "El camino de un commit a producción: del Jenkins móvil al GitOps multi-región.",
      "The path from commit to production: from mobile Jenkins to multi-region GitOps.",
    ),
    uses: [
      { stage: "belcorp-sa", text: l("DevOps móvil con Jenkins.", "Mobile DevOps with Jenkins.") },
      { stage: "auna-pa", text: l("SonarCloud, Nexus, runners en EKS.", "SonarCloud, Nexus, EKS runners.") },
      {
        stage: "xepelin-em",
        text: l("GitHub Actions y Pulumi como estándar.", "GitHub Actions and Pulumi as the standard."),
      },
      { stage: "topsort-infra", text: l("GitOps con ArgoCD, 30–40% menos costo.", "ArgoCD GitOps, 30–40% cheaper.") },
      {
        stage: "globant-tm",
        text: l("Gap analysis de GitOps y observabilidad.", "GitOps and observability gap analysis."),
      },
    ],
  },
  {
    id: "ai",
    name: l("IA en el ciclo de desarrollo", "AI in the delivery cycle"),
    dye: "turq",
    tech: "Claude Code · ChatGPT · LLM agents · Python",
    summary: l(
      "De la analítica de datos al desarrollo asistido por IA en todos los equipos.",
      "From data analytics to AI-assisted development across every team.",
    ),
    uses: [
      { stage: "auna-sa", text: l("Biometría con Python.", "Biometrics with Python.") },
      {
        stage: "xepelin-em",
        text: l(
          "Desarrollo acelerado con Claude Code y ChatGPT.",
          "Development accelerated with Claude Code and ChatGPT.",
        ),
      },
      { stage: "master-ai", text: l("Máster en IA.", "AI master's degree.") },
      { stage: "globant-tm", text: l("SDLC automatizado con IA.", "AI-automated SDLC.") },
    ],
  },
];

export const stageById = (id: string) => {
  for (const c of COMPANIES) {
    const s = c.stages.find((x) => x.id === id);
    if (s) return { company: c, stage: s };
  }
  return undefined;
};

export const CERTIFICATIONS = [
  { name: "AWS Solutions Architect – Professional", years: "2024–2027" },
  { name: "AWS Developer – Associate", years: "2024–2027" },
  { name: "AWS Solutions Architect – Associate", years: "2020–2023" },
];

export const EDUCATION = [
  {
    title: l("Máster en Big Data, Data Science e IA", "Master's in Big Data, Data Science & AI"),
    school: "Universidad Complutense de Madrid",
    years: "2023–2024",
  },
  {
    title: l("Ingeniería de Sistemas", "Systems Engineering"),
    school: "Universidad Peruana de las Américas",
    years: "2009–2014",
  },
  {
    title: l("Técnico en Computación y Sistemas", "Computing & Systems Technician"),
    school: "Cimas",
    years: "2005–2009",
  },
];

export const SKILLS: Array<{ group: L; items: string[] }> = [
  {
    group: l("Lenguajes", "Languages"),
    items: ["TypeScript", "JavaScript", "Python", "Go", "Rust", "Kotlin", "Java", ".NET"],
  },
  {
    group: l("Cloud", "Cloud"),
    items: ["AWS", "GCP", "Azure", "Kubernetes", "Karpenter", "Terraform", "Pulumi", "Helm"],
  },
  {
    group: l("Plataforma", "Platform"),
    items: ["Kong", "Kafka", "ArgoCD", "GitHub Actions", "Grafana", "Prometheus", "Loki", "Tempo"],
  },
  {
    group: l("Arquitectura", "Architecture"),
    items: ["Microservices", "Serverless", "EDA", "Micro frontends", "MACH", "C4"],
  },
  { group: l("Datos", "Data"), items: ["Postgres", "DynamoDB", "Redis", "MongoDB", "Redshift", "OpenSearch"] },
];
