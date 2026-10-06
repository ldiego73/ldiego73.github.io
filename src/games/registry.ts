import type { Achievement, GameMeta } from "./core/types";

/**
 * Arcade catalog. Owned by the site, not by individual games: a game agent may
 * propose copy changes for its entry but never edits this file in parallel work.
 */
export const GAMES: GameMeta[] = [
  {
    slug: "snake",
    marquee: "SNAKE",
    kind: "classic",
    neon: "lime",
    title: { es: "Snake de datos", en: "Data Snake" },
    tagline: { es: "Un flujo de luz que devora paquetes.", en: "A stream of light that eats packets." },
    howTo: {
      es: "Guía el flujo de datos por la red y come paquetes verdes: cada uno lo alarga. Los paquetes ámbar valen más pero se apagan pronto. CACHE te da 4 s de cámara lenta y ZIP te quita 3 segmentos. Fácil: los bordes te teletransportan. Normal: los bordes matan. Difícil: más rápido, puntos dobles, firewalls que aparecen mientras creces y un bug que muerde tu cola.",
      en: "Steer the data stream across the grid and eat lime packets: each one makes it longer. Amber packets are worth more but fade fast. CACHE gives 4 s of slow motion and ZIP sheds 3 segments. Easy: edges wrap around. Normal: edges kill. Hard: faster, double points, firewalls that appear as you grow and a bug that bites your tail.",
    },
    controls: {
      es: ["Flechas o WASD: girar", "Desliza o usa el d-pad en móvil"],
      en: ["Arrows or WASD: turn", "Swipe or use the d-pad on mobile"],
    },
    load: () => import("./snake/index"),
  },
  {
    slug: "pac-bug",
    marquee: "PAC-BUG",
    kind: "classic",
    neon: "amber",
    title: { es: "Pac-Bug", en: "Pac-Bug" },
    tagline: { es: "Come paquetes, esquiva los bugs.", en: "Eat packets, dodge the bugs." },
    howTo: {
      es: "Recorre la red y come todos los paquetes. Cuatro bugs te persiguen: Null Pointer, Memory Leak, Race Condition y Deadlock. Un hotfix te deja cazarlos por unos segundos. Café y LGTM dan puntos extra; acercarte a Deadlock te congela un instante. Limpia 3 niveles para ganar.",
      en: "Walk the network and eat every packet. Four bugs chase you: Null Pointer, Memory Leak, Race Condition and Deadlock. A hotfix lets you hunt them for a few seconds. Coffee and LGTM give bonus points; getting close to Deadlock freezes you for a moment. Clear 3 levels to win.",
    },
    controls: {
      es: ["Flechas o WASD: mover", "Desliza o usa el d-pad en móvil"],
      en: ["Arrows or WASD: move", "Swipe or use the d-pad on mobile"],
    },
    load: () => import("./pac-bug/index"),
  },
  {
    slug: "monolith-breaker",
    marquee: "MONOLITH",
    kind: "classic",
    neon: "violet",
    title: { es: "Monolith Breaker", en: "Monolith Breaker" },
    tagline: { es: "Rompe el monolito en microservicios.", en: "Break the monolith into microservices." },
    howTo: {
      es: "Rebota la pelota con la paleta y rompe cada bloque del monolito. Los bloques oscuros son el core legacy y aguantan más. Algunos sueltan mejoras: Autoscale (paleta más ancha), Retry (más pelotas), Circuit breaker (pelota más lenta) y Strangler Fig (la pelota atraviesa bloques). Esquiva la Tech debt: encoge tu paleta. Al final espera el Big Ball of Mud.",
      en: "Bounce the ball off the paddle and break every block of the monolith. Dark blocks are legacy core and take more hits. Some drop power-ups: Autoscale (wider paddle), Retry (extra balls), Circuit breaker (slower ball) and Strangler Fig (ball pierces blocks). Dodge Tech debt: it shrinks your paddle. The Big Ball of Mud waits at the end.",
    },
    controls: {
      es: ["Flechas / A-D o mouse: mover", "Espacio, clic o toque: lanzar", "Arrastra en móvil"],
      en: ["Arrows / A-D or mouse: move", "Space, click or tap: launch", "Drag on mobile"],
    },
    load: () => import("./monolith-breaker/index"),
  },
  {
    slug: "zero-day-sweeper",
    marquee: "ZERO-DAY",
    kind: "classic",
    neon: "cyan",
    title: { es: "Zero-Day Sweeper", en: "Zero-Day Sweeper" },
    tagline: {
      es: "Encuentra las vulnerabilidades antes del exploit.",
      en: "Find the vulnerabilities before the exploit.",
    },
    howTo: {
      es: "Revisa cada servicio del clúster. Los números dicen cuántas vulnerabilidades hay alrededor. Marca las sospechosas y limpia el resto.",
      en: "Scan every service in the cluster. Numbers tell how many vulnerabilities are adjacent. Flag the suspects and clear the rest.",
    },
    controls: {
      es: [
        "Clic: revisar",
        "Clic derecho o F: marcar",
        "Flechas + Espacio: revisar con cursor",
        "Mantén presionado en móvil: marcar",
      ],
      en: ["Click: scan", "Right click or F: flag", "Arrows + Space: scan with cursor", "Long press on mobile: flag"],
    },
    load: () => import("./zero-day-sweeper/index"),
  },
  {
    slug: "request-invaders",
    marquee: "INVADERS",
    kind: "classic",
    neon: "magenta",
    title: { es: "Request Invaders", en: "Request Invaders" },
    tagline: { es: "Eres el WAF. Llega el DDoS.", en: "You are the WAF. Here comes the DDoS." },
    howTo: {
      es: "Oleadas de requests maliciosos (GET bots, SQLi, XSS, botnets) bajan hacia tu API. Muévete y dispara reglas del WAF. Cada 3 oleadas llega la DDoS Mothership. Atrapa power-ups: Regla mejorada (disparo triple), Caché CDN (bloquea un golpe) y Rate limit (frena a los enemigos).",
      en: "Waves of malicious requests (GET bots, SQLi, XSS, botnets) descend on your API. Move and fire WAF rules. Every 3rd wave the DDoS Mothership arrives. Grab power-ups: Rule upgrade (triple shot), CDN cache (blocks one hit) and Rate limit (slows enemies).",
    },
    controls: {
      es: ["Flechas / A-D: mover", "Espacio / ↑: disparar", "Botones en móvil"],
      en: ["Arrows / A-D: move", "Space / ↑: fire", "On-screen buttons on mobile"],
    },
    load: () => import("./request-invaders/index"),
  },
  {
    slug: "catch-the-bug",
    marquee: "CATCH BUG",
    kind: "original",
    neon: "lime",
    title: { es: "Catch the Bug", en: "Catch the Bug" },
    tagline: { es: "Atrápalos antes de producción.", en: "Catch them before production." },
    howTo: {
      es: "Los bugs avanzan DEV → QA → STAGING → PROD. Tócalos antes de que lleguen a PROD. Cada bug que llega crea un incidente; tres incidentes y se acaba. Atrápalos temprano: DEV vale x3, QA x2, STAGING x1. Los flaky tests necesitan dos toques, los heisenbugs desaparecen a ratos y las regresiones vuelven si las atrapas tarde. Power-ups: Unit tests, Code review y Feature flag.",
      en: "Bugs move DEV → QA → STAGING → PROD. Tap them before they reach PROD. Each bug that gets through opens an incident; three incidents and you're out. Catch them early: DEV pays x3, QA x2, STAGING x1. Flaky tests take two taps, heisenbugs blink out of sight and regressions come back if caught late. Power-ups: Unit tests, Code review and Feature flag.",
    },
    controls: { es: ["Clic o toque: atrapar"], en: ["Click or tap: catch"] },
    load: () => import("./catch-the-bug/index"),
  },
  {
    slug: "incident-commander",
    marquee: "INCIDENT",
    kind: "original",
    neon: "red",
    title: { es: "Incident Commander", en: "Incident Commander" },
    tagline: { es: "Tienes segundos. Elige bien.", en: "You have seconds. Choose well." },
    howTo: {
      es: "Llega una alerta con severidad y métricas. Elige la acción correcta antes de que se acabe el tiempo. Aciertos suman puntos (más en SEV1); errar o no responder quema error budget según la severidad. Algunos incidentes tienen una segunda parte que depende de tu decisión. Sobrevive 12/15/20 incidentes según la dificultad.",
      en: "An alert arrives with a severity and metrics. Pick the right action before time runs out. Good calls score (more on SEV1s); a wrong call or no answer burns error budget by severity. Some incidents have a second part that depends on your call. Survive 12/15/20 incidents depending on difficulty.",
    },
    controls: {
      es: ["1-4 o clic: elegir acción", "Enter: siguiente"],
      en: ["1-4 or click: choose action", "Enter: next"],
    },
    load: () => import("./incident-commander/index"),
  },
  {
    slug: "deploy-hero",
    marquee: "DEPLOY HERO",
    kind: "original",
    neon: "cyan",
    title: { es: "Deploy Hero", en: "Deploy Hero" },
    tagline: { es: "Programa pods en día de release.", en: "Schedule pods on release day." },
    howTo: {
      es: "Eres el scheduler en día de release. Elige un pod de la cola y asígnalo a un nodo donde quepan CPU y memoria, respetando taints (GPU) y afinidad (on-demand). Sobrevive a HPA, rolling updates, nodos NotReady, interrupciones spot y vecinos ruidosos. Usa Karpenter, Cordon & drain y Rollback. Despliega 40; con 3 fallos pierdes. Empaqueta bien y gasta poco.",
      en: "You're the scheduler on release day. Pick a pod from the queue and assign it to a node where CPU and memory fit, respecting taints (GPU) and affinity (on-demand). Survive HPA bursts, rolling updates, NotReady nodes, spot interruptions and noisy neighbors. Use Karpenter, Cordon & drain and Rollback. Deploy 40; 3 failures and you're out. Pack tight, spend little.",
    },
    controls: {
      es: [
        "1-6 o clic en nodo: asignar pod",
        "Flechas: nodo / pod · Enter: asignar",
        "K Karpenter · C Cordon & drain · R Rollback",
      ],
      en: [
        "1-6 or click a node: assign pod",
        "Arrows: node / pod · Enter: assign",
        "K Karpenter · C Cordon & drain · R Rollback",
      ],
    },
    load: () => import("./deploy-hero/index"),
  },
  {
    slug: "keep-alive",
    marquee: "KEEP ALIVE",
    kind: "original",
    neon: "violet",
    title: { es: "Keep the Service Alive", en: "Keep the Service Alive" },
    tagline: { es: "Objetivo: 99.99% de uptime.", en: "Target: 99.99% uptime." },
    howTo: {
      es: "Un sistema distribuido empieza a fallar: APIs, base de datos, balanceador. Escala, reinicia, haz failover o abre el circuit breaker para mantener el uptime. Un día dura 120 s (90 s en difícil); termina con 99.99% o más (99.9% en fácil).",
      en: "A distributed system starts failing: APIs, database, load balancer. Scale, restart, fail over or open the circuit breaker to keep uptime. A day lasts 120 s (90 s on hard); finish at 99.99% or better (99.9% on easy).",
    },
    controls: {
      es: [
        "Clic, toque, Tab o flechas: seleccionar componente",
        "Teclas 1-6: escalar · reiniciar · failover · breaker · renovar cert · rollback",
      ],
      en: [
        "Click, tap, Tab or arrows: select component",
        "Keys 1-6: scale · restart · failover · breaker · renew cert · rollback",
      ],
    },
    load: () => import("./keep-alive/index"),
  },
];

const t = (es: string, en: string) => ({ es, en });

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "production-survivor",
    title: t("Production Survivor", "Production Survivor"),
    description: t("Resuelve 5 incidentes.", "Resolve 5 incidents."),
    rule: { kind: "stat", game: "incident-commander", key: "resolved", gte: 5 },
  },
  {
    id: "on-call-veteran",
    title: t("On-call Veteran", "On-call Veteran"),
    description: t("Juega Incident Commander 10 veces.", "Play Incident Commander 10 times."),
    rule: { kind: "plays", game: "incident-commander", gte: 10 },
  },
  {
    id: "bug-hunter",
    title: t("Bug Hunter", "Bug Hunter"),
    description: t("Atrapa 100 bugs.", "Catch 100 bugs."),
    rule: { kind: "stat", game: "catch-the-bug", key: "bugs", gte: 100 },
  },
  {
    id: "kubernetes-master",
    title: t("Kubernetes Master", "Kubernetes Master"),
    description: t("Completa Deploy Hero.", "Complete Deploy Hero."),
    rule: { kind: "wins", game: "deploy-hero", gte: 1 },
  },
  {
    id: "five-nines",
    title: t("Five Nines", "Five Nines"),
    description: t(
      "Termina Keep the Service Alive con 99.99% de uptime.",
      "Finish Keep the Service Alive at 99.99% uptime.",
    ),
    rule: { kind: "wins", game: "keep-alive", gte: 1 },
  },
  {
    id: "monolith-slayer",
    title: t("Monolith Slayer", "Monolith Slayer"),
    description: t("Rompe un monolito completo.", "Break a whole monolith."),
    rule: { kind: "stat", game: "monolith-breaker", key: "levels", gte: 1 },
  },
  {
    id: "zero-day-hunter",
    title: t("Zero-Day Hunter", "Zero-Day Hunter"),
    description: t("Limpia un clúster sin caer en un exploit.", "Clear a cluster without hitting an exploit."),
    rule: { kind: "wins", game: "zero-day-sweeper", gte: 1 },
  },
  {
    id: "ddos-mitigated",
    title: t("DDoS Mitigated", "DDoS Mitigated"),
    description: t("Sobrevive 3 oleadas de Request Invaders.", "Survive 3 waves of Request Invaders."),
    rule: { kind: "stat", game: "request-invaders", key: "waves", gte: 3 },
  },
  {
    id: "packet-hoarder",
    title: t("Packet Hoarder", "Packet Hoarder"),
    description: t("Come 500 paquetes.", "Eat 500 packets."),
    rule: { kind: "stat", game: "pac-bug", key: "packets", gte: 500 },
  },
  {
    id: "long-khipu",
    title: t("Flujo largo", "Long Stream"),
    description: t("Come 30 paquetes en una partida de Snake.", "Eat 30 packets in one Snake run."),
    rule: { kind: "stat", game: "snake", key: "knots30", gte: 1 },
  },
  {
    id: "works-on-my-machine",
    title: t("Works On My Machine", "Works On My Machine"),
    description: t("Pierde 10 veces.", "Lose 10 times."),
    rule: { kind: "losses-total", gte: 10 },
  },
  {
    id: "full-stack-player",
    title: t("Full-Stack Player", "Full-Stack Player"),
    description: t("Juega los 9 juegos del arcade.", "Play all 9 arcade games."),
    rule: { kind: "played-all" },
  },
  {
    // Cross reward: granted when the world passport (Qhapaq Ñan) is complete; unlocks the aguayo cabinet skin.
    id: "qhapaq-nan-walker",
    title: t("Caminante del Qhapaq Ñan", "Qhapaq Ñan Walker"),
    description: t(
      "Completa el pasaporte del mundo andino. Recompensa: cabinas de aguayo.",
      "Complete the Andean world passport. Reward: aguayo cabinets.",
    ),
    rule: { kind: "stat", game: "world", key: "passport", gte: 1 },
  },
];

export const gameBySlug = (slug: string) => GAMES.find((g) => g.slug === slug);
