/**
 * Bilingual dialog data for the NPC chasquis of the Qhapaq Ñan, plus a tiny pure state machine
 * (typewriter reveal, advance, branch, close) that the DOM view in npcs.ts drives and the tests exercise.
 * Claims about the owner come only from src/data/career.ts; everything else is general engineering lore.
 */
import type { L, Lang } from "./contract";

export interface DChoice {
  label: L;
  next: string;
}

export interface DNode {
  text: L;
  /** Next node id; omitted (and no choices) ends the conversation. */
  next?: string;
  /** 2–3 branches. When present, `next` is ignored. */
  choices?: DChoice[];
}

export interface Convo {
  id: string;
  start: string;
  nodes: Record<string, DNode>;
}

export interface NpcDialog {
  id: string;
  name: string;
  role: L;
  convos: Convo[];
}

const l = (es: string, en: string): L => ({ es, en });

export const NPC_DIALOGS: NpcDialog[] = [
  {
    id: "amauta",
    name: "Amauta Rumi",
    role: l("Guía del camino", "Trail guide"),
    convos: [
      {
        id: "welcome",
        start: "a",
        nodes: {
          a: {
            text: l(
              "Allillanchu, viajero. Camino este Qhapaq Ñan desde antes que tu monolito llegara a producción.",
              "Allillanchu, traveler. I've walked this Qhapaq Ñan since before your monolith reached production.",
            ),
            next: "b",
          },
          b: {
            text: l("¿Qué te trae por el camino?", "What brings you to the trail?"),
            choices: [
              { label: l("¿A dónde voy?", "Where should I go?"), next: "dir" },
              { label: l("Un consejo de arquitectura", "Some architecture advice"), next: "arch" },
              { label: l("Solo paso", "Just passing by"), next: "bye" },
            ],
          },
          dir: {
            text: l(
              "Cada tambo cuesta arriba guarda el khipu de una empresa. El Tambo arcade está subiendo, pasando el puente de cuerdas.",
              "Every tambo uphill keeps one company's khipu. The Arcade Tambo is uphill, past the rope bridge.",
            ),
            next: "dir2",
          },
          dir2: {
            text: l(
              "Y el Puesto del chasqui, en la cumbre, es la casa de Luis. Toca ahí si quieres hablar de trabajo.",
              "And the Chasqui Post at the summit is Luis's house. Knock there if you want to talk shop.",
            ),
          },
          arch: {
            text: l(
              "Dibuja primero el contexto C4. Si no cabe en una pared, no cabe en una cabeza.",
              "Draw the C4 context first. If it doesn't fit on one wall, it doesn't fit in one head.",
            ),
            next: "arch2",
          },
          arch2: {
            text: l(
              "Y hexagonal: el dominio al centro, los adaptadores en los bordes. Como la plaza y sus caminos de entrada.",
              "And hexagonal: the domain in the middle, adapters at the edges. Like the plaza and the paths into it.",
            ),
          },
          bye: {
            text: l(
              "Entonces camina liviano. La montaña no aprueba PRs los viernes.",
              "Then walk light. The mountain doesn't approve PRs on Fridays.",
            ),
          },
        },
      },
      {
        id: "terraces",
        start: "a",
        nodes: {
          a: {
            text: l(
              "Los incas hicieron andenes para que la pendiente no ganara. Hoy los llamamos plataformas.",
              "The Incas built terraces so the slope wouldn't win. Today we call them platforms.",
            ),
            next: "b",
          },
          b: {
            text: l(
              "Cada andén guarda su propia tierra, como un bounded context guarda sus datos. Comparte contratos, no tablas.",
              "Each terrace holds its own soil, like a bounded context holds its own data. Share contracts, not tables.",
            ),
          },
        },
      },
    ],
  },
  {
    id: "killa",
    name: "Killa",
    role: l("Chasqui corredora", "Chasqui runner"),
    convos: [
      {
        id: "relay",
        start: "a",
        nodes: {
          a: {
            text: l(
              "¡No puedo parar mucho! Soy chasqui: corro mi tramo, paso el khipu al siguiente y descanso.",
              "Can't stop long! I'm a chasqui: I run my leg, hand the khipu to the next runner, and rest.",
            ),
            next: "b",
          },
          b: {
            text: l(
              "El Qhapaq Ñan era una cola de mensajes hecha de piernas: postas fijas y el mensaje siempre avanza.",
              "The Qhapaq Ñan was a message queue made of legs: fixed relay posts, and the message always moves forward.",
            ),
            next: "c",
          },
          c: {
            text: l("¿Alguna pregunta antes de que salga?", "Any question before I go?"),
            choices: [
              { label: l("¿Y si un chasqui se cae?", "What if a runner falls?"), next: "dlq" },
              { label: l("¿Qué tan rápido corren?", "How fast do you go?"), next: "speed" },
            ],
          },
          dlq: {
            text: l(
              "El tambo guarda el khipu y alguien reintenta. Entrega al menos una vez: todo receptor debe ser idempotente.",
              "The tambo keeps the khipu and someone retries. At-least-once delivery: every receiver must be idempotent.",
            ),
          },
          speed: {
            text: l(
              "Por relevos, cientos de kilómetros al día. Kafka lo llama throughput; mis rodillas lo llaman de otra forma.",
              "In relays, hundreds of kilometers a day. Kafka calls it throughput; my knees call it something else.",
            ),
          },
        },
      },
      {
        id: "events",
        start: "a",
        nodes: {
          a: {
            text: l(
              "Luis armó eventos con Kafka en Xepelin, y con Kafka, SQS y EventBridge en TopSort. Los dominios hablan por eventos, no por la base del vecino.",
              "Luis wired events with Kafka at Xepelin, and with Kafka, SQS and EventBridge at TopSort. Domains talk through events, not the neighbor's database.",
            ),
            next: "b",
          },
          b: {
            text: l(
              "Consejo: escribe el catálogo de eventos antes del primer productor. Nadie lee un khipu sin la leyenda.",
              "Tip: write the event catalog before the first producer. Nobody reads a khipu without the legend.",
            ),
          },
        },
      },
    ],
  },
  {
    id: "waman",
    name: "Waman",
    role: l("Cargador del rack", "Rack carrier"),
    convos: [
      {
        id: "rack",
        start: "a",
        nodes: {
          a: {
            text: l(
              "Sí, es un rack de servidores. No, no entra como equipaje de mano.",
              "Yes, it's a server rack. No, it doesn't fit as a carry-on.",
            ),
            next: "b",
          },
          b: {
            text: l(
              "Cada pod que cargo pide 4 CPUs y usa media. Así es como las facturas suben montañas.",
              "Every pod I carry requests 4 CPUs and uses half of one. That's how bills climb mountains.",
            ),
            next: "c",
          },
          c: {
            text: l("¿Me ayudas a pensar?", "Help me think?"),
            choices: [
              { label: l("¿Cómo bajas la factura?", "How do you cut the bill?"), next: "finops" },
              { label: l("¿Por qué lo cargas?", "Why carry it at all?"), next: "why" },
            ],
          },
          finops: {
            text: l(
              "Ajusta los requests, deja que Karpenter elija los nodos y mira KubeCost. Así el equipo de Luis bajó 30–40% en TopSort, sin bajar disponibilidad.",
              "Right-size requests, let Karpenter pick the nodes, watch KubeCost. That's how Luis's team cut 30–40% at TopSort without cutting availability.",
            ),
          },
          why: {
            text: l(
              "Costumbre. Multi-región y multi-cloud: siempre llevo una región de repuesto en la espalda.",
              "Habit. Multi-region, multi-cloud: I always carry a spare region on my back.",
            ),
          },
        },
      },
      {
        id: "k8s",
        start: "a",
        nodes: {
          a: {
            text: l(
              "Kubernetes es una red de tambos: los nodos hospedan, los pods llegan y el scheduler decide quién duerme dónde.",
              "Kubernetes is a tambo network: nodes host, pods arrive, and the scheduler decides who sleeps where.",
            ),
            next: "b",
          },
          b: {
            text: l(
              "Cuando un nodo se drena, los pods se van con calma. Casi siempre. Define tus PodDisruptionBudgets.",
              "When a node drains, the pods leave gracefully. Mostly. Define your PodDisruptionBudgets.",
            ),
          },
        },
      },
    ],
  },
  {
    id: "sisa",
    name: "Sisa",
    role: l("Arriera GitOps", "GitOps llama herder"),
    convos: [
      {
        id: "llama",
        start: "a",
        nodes: {
          a: {
            text: l(
              "Te presento a Helmcito. Carga los Helm charts y escupe a quien hace kubectl edit en producción.",
              "Meet Helmcito. He carries the Helm charts and spits at anyone who runs kubectl edit in production.",
            ),
            next: "b",
          },
          b: {
            text: l(
              "Git es la fuente de verdad; ArgoCD recorre el camino haciendo que el clúster se parezca al repo.",
              "Git is the source of truth; ArgoCD walks the trail making the cluster look like the repo.",
            ),
            next: "c",
          },
          c: {
            text: l("Pregunta, Helmcito no muerde.", "Go ahead, Helmcito doesn't bite."),
            choices: [
              {
                label: l("¿Y si alguien cambia algo a mano?", "What if someone changes things by hand?"),
                next: "drift",
              },
              { label: l("¿Helm o Kustomize?", "Helm or Kustomize?"), next: "hk" },
            ],
          },
          drift: {
            text: l(
              "ArgoCD ve el drift y lo regresa. Helmcito también lo ve, y recuerda tu cara.",
              "ArgoCD sees the drift and puts it back. Helmcito sees it too, and remembers your face.",
            ),
          },
          hk: {
            text: l(
              "Los dos: Helm para empaquetar, Kustomize para parchar por ambiente. Terraform y Pulumi construyen el camino mismo.",
              "Both: Helm to package, Kustomize to patch per environment. Terraform and Pulumi build the trail itself.",
            ),
          },
        },
      },
      {
        id: "gitops",
        start: "a",
        nodes: {
          a: {
            text: l(
              "Luis montó GitOps con ArgoCD, Helm y Kustomize en TopSort; en Xepelin, GitHub Actions y Pulumi fueron el estándar.",
              "Luis set up GitOps with ArgoCD, Helm and Kustomize at TopSort; at Xepelin, GitHub Actions and Pulumi were the standard.",
            ),
            next: "b",
          },
          b: {
            text: l(
              "El despliegue favorito de Helmcito es el aburrido.",
              "Helmcito's favorite deploy is the boring one.",
            ),
          },
        },
      },
    ],
  },
  {
    id: "inti",
    name: "Inti",
    role: l("Vigía de observabilidad", "Observability lookout"),
    convos: [
      {
        id: "traces",
        start: "a",
        nodes: {
          a: {
            text: l(
              "Shh. Leo las trazas del camino en esta tableta. Alguien en el tercer tambo tiene el p99 por las nubes.",
              "Shh. I'm reading the trail's traces on this tablet. Someone at the third tambo has a p99 up in the clouds.",
            ),
            next: "b",
          },
          b: {
            text: l(
              "Logs a Loki, trazas a Tempo, métricas a Prometheus y todo en un tablero de Grafana. Como un khipu: nudos son datos, colores son etiquetas.",
              "Logs to Loki, traces to Tempo, metrics to Prometheus, all on one Grafana board. Like a khipu: knots are data, colors are labels.",
            ),
            next: "c",
          },
          c: {
            text: l("¿Qué quieres saber?", "What do you want to know?"),
            choices: [
              { label: l("¿Y si se cae ahora?", "What if it breaks right now?"), next: "inc" },
              { label: l("¿Por qué colores?", "Why the colors?"), next: "kh" },
              { label: l("Nada, sigue", "Nothing, carry on"), next: "bye" },
            ],
          },
          inc: {
            text: l(
              "Incidente: primero detener la hemorragia, luego la causa. Un comandante, un canal, la hora en cada nota. Culpa al proceso, nunca al chasqui.",
              "Incident: first stop the bleeding, then find the cause. One commander, one channel, timestamps in every note. Blame the process, never the chasqui.",
            ),
          },
          kh: {
            text: l(
              "El color decía qué contaba la cuerda. Las labels hacen lo mismo; solo no le des una label a cada llama: la cardinalidad muerde.",
              "The color told you what the cord counted. Labels do the same; just don't give every llama its own label: cardinality bites.",
            ),
          },
          bye: {
            text: l("Sigo mirando. Alguien tiene que hacerlo.", "Back to watching. Someone has to."),
          },
        },
      },
      {
        id: "alerts",
        start: "a",
        nodes: {
          a: {
            text: l(
              "En TopSort, Luis llevó la observabilidad al 100% con Grafana, Loki, Tempo y Prometheus.",
              "At TopSort, Luis took observability to 100% with Grafana, Loki, Tempo and Prometheus.",
            ),
            next: "b",
          },
          b: {
            text: l(
              "Una alerta que nadie atiende es un pututo soplado a medianoche: todos despiertan y nada cambia.",
              "An alert nobody acts on is a pututo blown at midnight: everyone wakes up and nothing changes.",
            ),
          },
        },
      },
    ],
  },
  {
    id: "yupanqui",
    name: "Yupanqui",
    role: l("Guardián del gateway", "Gateway keeper"),
    convos: [
      {
        id: "token",
        start: "a",
        nodes: {
          a: {
            text: l(
              "¡Alto! Token, por favor… Es broma. Soy el API gateway de este tramo.",
              "Halt! Token, please… Kidding. I'm this stretch's API gateway.",
            ),
            next: "b",
          },
          b: {
            text: l(
              "El inca tenía un guardia en cada puente. Nosotros tenemos Kong: autenticación, rate limits y ruteo antes de tocar un servicio.",
              "The Inca kept a guard at every bridge. We have Kong: auth, rate limits and routing before anyone touches a service.",
            ),
            next: "c",
          },
          c: {
            text: l("¿Dudas en la garita?", "Questions at the gate?"),
            choices: [
              { label: l("¿Cuántos gateways hizo Luis?", "How many gateways did Luis build?"), next: "many" },
              { label: l("¿Por qué no llamar directo?", "Why not call services directly?"), next: "direct" },
            ],
          },
          many: {
            text: l(
              "Varios: Kong omnicanal con plugin Lua en Belcorp, Kong al 99.9% de SLA en Auna, API Platforms sobre AWS API Gateway y APISIX → Kong multi-región en TopSort.",
              "Several: omnichannel Kong with a Lua plugin at Belcorp, Kong at 99.9% SLA at Auna, API Platforms on AWS API Gateway, and APISIX → Kong multi-region at TopSort.",
            ),
          },
          direct: {
            text: l(
              "Puedes. Luego cada servicio reimplementa la auth, nadie se pone de acuerdo en los límites y el puente se balancea.",
              "You can. Then every service reimplements auth, nobody agrees on limits, and the bridge starts to sway.",
            ),
          },
        },
      },
      {
        id: "contracts",
        start: "a",
        nodes: {
          a: {
            text: l(
              "El puente de cuerdas que dejaste atrás se rehace cada año, como el Q'eswachaka. Los contratos de API igual: versiónalos y renuévalos antes de que se pudran.",
              "The rope bridge behind you is rewoven every year, like the Q'eswachaka. API contracts too: version them and renew them before they rot.",
            ),
          },
        },
      },
    ],
  },
  {
    id: "chaska",
    name: "Chaska",
    role: l("Aprendiz de la IA", "AI apprentice"),
    convos: [
      {
        id: "claude",
        start: "a",
        nodes: {
          a: {
            text: l(
              "Mi tableta brilla porque Claude Code está revisando mi khipu. Encontró dos nudos atados dos veces.",
              "My tablet glows because Claude Code is reviewing my khipu. It found two knots tied twice.",
            ),
            next: "b",
          },
          b: {
            text: l(
              "La IA en el ciclo de desarrollo no es magia: buen contexto, pasos cortos y pruebas que verifiquen cada paso. Como entrenar a un chasqui nuevo.",
              "AI in the delivery cycle isn't magic: good context, small steps and tests that check each one. Like training a new chasqui.",
            ),
            next: "c",
          },
          c: {
            text: l("¿Te intriga?", "Curious?"),
            choices: [
              { label: l("¿Reemplaza a los ingenieros?", "Does it replace engineers?"), next: "rep" },
              { label: l("¿Dónde aprendo más?", "Where can I learn more?"), next: "where" },
            ],
          },
          rep: {
            text: l(
              "Reemplaza los nudos aburridos. Alguien todavía decide qué debe decir el khipu.",
              "It replaces the boring knots. Someone still decides what the khipu should say.",
            ),
          },
          where: {
            text: l(
              "Busca el Intihuatana de la IA, cerca de la cumbre. Luis usó Claude Code y ChatGPT con sus equipos en Xepelin, y hoy automatiza el ciclo de entrega con IA en Globant.",
              "Look for the AI Intihuatana, near the summit. Luis used Claude Code and ChatGPT with his teams at Xepelin, and now automates the delivery cycle with AI at Globant.",
            ),
          },
        },
      },
      {
        id: "noise",
        start: "a",
        nodes: {
          a: {
            text: l(
              "Del ruido a la señal: un modelo de difusión parte de estática y la limpia paso a paso. Un buen code review funciona igual.",
              "From noise to signal: a diffusion model starts from static and cleans it step by step. A good code review works the same way.",
            ),
          },
        },
      },
    ],
  },
];

// ------------------------------------------------------------------ state machine

export type Step = "reveal" | "next" | "choose" | "end";

/** Pure dialog state: current node, typewriter progress, branching. No DOM, no Three. */
export class DialogMachine {
  nodeId: string | null;
  /** Characters revealed so far (typewriter). */
  shown = 0;
  /** Highlighted choice for keyboard selection. */
  sel = 0;
  private acc = 0;

  constructor(
    readonly convo: Convo,
    readonly lang: Lang,
  ) {
    this.nodeId = convo.nodes[convo.start] ? convo.start : null;
  }

  get open() {
    return this.nodeId !== null;
  }
  get node(): DNode | null {
    return this.nodeId ? (this.convo.nodes[this.nodeId] ?? null) : null;
  }
  get text() {
    return this.node?.text[this.lang] ?? "";
  }
  get typing() {
    return this.open && this.shown < this.text.length;
  }
  /** Choices are offered only once the line is fully revealed. */
  get choices(): DChoice[] {
    return !this.typing ? (this.node?.choices ?? []) : [];
  }
  visibleText() {
    return this.text.slice(0, this.shown);
  }

  /** Typewriter tick; returns true when the visible text changed. */
  tick(dt: number, cps = 48) {
    if (!this.typing) return false;
    this.acc += dt * cps;
    const n = Math.floor(this.acc);
    if (n <= 0) return false;
    this.acc -= n;
    this.shown = Math.min(this.text.length, this.shown + n);
    return true;
  }
  revealAll() {
    this.shown = this.text.length;
    this.acc = 0;
  }

  /** Space/E: finish the line, else go to the next node, else close. With choices, picks the highlighted one. */
  advance(): Step {
    if (!this.open) return "end";
    if (this.typing) {
      this.revealAll();
      return "reveal";
    }
    const n = this.node!;
    if (n.choices?.length) return this.choose(this.sel);
    return this.goto(n.next);
  }

  choose(i: number): Step {
    const c = this.choices[i];
    if (!c) return "choose";
    return this.goto(c.next);
  }

  moveSel(d: number) {
    const k = this.choices.length;
    if (k) this.sel = (this.sel + d + k) % k;
  }

  close() {
    this.nodeId = null;
    this.shown = 0;
  }

  private goto(id: string | undefined): Step {
    if (!id || !this.convo.nodes[id]) {
      this.close();
      return "end";
    }
    this.nodeId = id;
    this.shown = 0;
    this.acc = 0;
    this.sel = 0;
    return this.node?.choices?.length ? "choose" : "next";
  }
}

/** Integrity check used by the tests (and handy in dev): missing nodes, empty strings, bad branch counts. */
export function validateDialogs(list: NpcDialog[] = NPC_DIALOGS): string[] {
  const errs: string[] = [];
  const has = (x: L | undefined, where: string) => {
    for (const lg of ["es", "en"] as const) if (!x?.[lg]?.trim()) errs.push(`${where}: missing ${lg}`);
  };
  for (const npc of list) {
    has(npc.role, `${npc.id}.role`);
    if (!npc.convos.length) errs.push(`${npc.id}: no convos`);
    for (const c of npc.convos) {
      const at = `${npc.id}.${c.id}`;
      if (!c.nodes[c.start]) errs.push(`${at}: start "${c.start}" missing`);
      for (const [id, n] of Object.entries(c.nodes)) {
        has(n.text, `${at}.${id}`);
        if (n.next && !c.nodes[n.next]) errs.push(`${at}.${id}: next "${n.next}" missing`);
        if (n.choices) {
          if (n.choices.length < 2 || n.choices.length > 3) errs.push(`${at}.${id}: ${n.choices.length} choices`);
          for (const ch of n.choices) {
            has(ch.label, `${at}.${id}.choice`);
            if (!c.nodes[ch.next]) errs.push(`${at}.${id}: choice → "${ch.next}" missing`);
          }
        }
      }
    }
  }
  return errs;
}

/** Number of dialog lines (nodes) across every NPC. */
export const lineCount = (list: NpcDialog[] = NPC_DIALOGS) =>
  list.reduce((s, n) => s + n.convos.reduce((a, c) => a + Object.keys(c.nodes).length, 0), 0);
