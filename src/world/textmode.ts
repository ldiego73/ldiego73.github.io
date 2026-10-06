/**
 * Accessible text mode: the whole walk narrated station by station as plain HTML.
 * `renderTextMode` is pure (no DOM, no three.js) so world.astro renders it at build time for the
 * no-WebGL / no-JS fallback and the skip link; `createTextMode` shows the same document in a paper
 * dialog over the 3D world. `createOverlay` is the core's shared dialog helper (also used by map.ts):
 * capture-phase Esc, focus trap, focus restore and `world:modal` on open/close.
 * Styles: textmode.css (imported by index.ts and world.astro).
 */
import { ARTIFACTS, COMPANIES, type Company } from "../data/career";
import { SITE, SOCIALS } from "../data/site";
import { fmtPeriod, t } from "../i18n/ui";
import { aiPoints, artifactUses, hostOfEducation, stationsInOrder } from "./artifacts";
import type { Lang } from "./contract";
import type { WorldData } from "./data";
import { emit } from "./events";

const COPY = {
  es: {
    title: "Qhapaq Ñan · modo texto",
    lede: "El mismo recorrido del mundo 3D, contado en texto: cada tambo del camino es un capítulo de la carrera de Luis Diego, del valle a la cumbre.",
    toc: "Estaciones del camino",
    gate: "El camino empieza en el valle. Cada tambo de piedra guarda un khipu con los cargos, logros y tecnologías de una empresa; los nudos largos codifican métricas.",
    stack: "Tecnologías",
    knots: "Nudos (logros)",
    hostedEdu: "También cuelga aquí",
    arcadeLink: "Jugar en el arcade",
    contactPage: "Formulario de contacto",
    email: "Correo",
    socials: "Redes",
    workshop: "Taller: proyectos y escritos",
    workshopLede: "Los andenes en construcción del camino guardan lo que se está haciendo ahora.",
    repos: "Repositorios en GitHub",
    posts: "Artículos",
    none: "Sin datos en esta compilación.",
    stars: "estrellas",
    back: "Volver al sitio",
    close: "Cerrar modo texto",
    skip: "Saltar al modo texto",
    open: "Modo texto",
  },
  en: {
    title: "Qhapaq Ñan · text mode",
    lede: "The same walk as the 3D world, told in text: every tambo on the trail is a chapter of Luis Diego's career, from the valley to the summit.",
    toc: "Stations on the trail",
    gate: "The trail starts in the valley. Each stone tambo keeps a khipu with a company's roles, achievements and technologies; long knots encode metrics.",
    stack: "Technologies",
    knots: "Knots (achievements)",
    hostedEdu: "Also hanging here",
    arcadeLink: "Play in the arcade",
    contactPage: "Contact form",
    email: "Email",
    socials: "Socials",
    workshop: "Workshop: projects and writing",
    workshopLede: "The plots under construction along the trail hold what is being built now.",
    repos: "GitHub repositories",
    posts: "Articles",
    none: "No data in this build.",
    stars: "stars",
    back: "Back to site",
    close: "Close text mode",
    skip: "Skip to text mode",
    open: "Text mode",
  },
} as const;

export const textModeCopy = (lang: Lang) => COPY[lang];

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** HTML-escapes text and attribute values. */
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c] ?? c);
const safeHref = (u: string) => (/^(https?:|mailto:|\/)/i.test(u) ? esc(u) : "#");
const link = (href: string, text: string, external = false) =>
  `<a href="${safeHref(href)}"${external ? ' target="_blank" rel="noopener"' : ""}>${esc(text)}</a>`;

/** Element id prefix for station sections (stable: map + skip link can point at them). */
export const textModeId = (id: string, prefix = "kw-tm-") => `${prefix}${id.replace(/[^a-z0-9-]/gi, "")}`;

function companyHtml(c: Company, lang: Lang, level: number): string {
  const cp = COPY[lang];
  const h = `h${level}`;
  const stages = [...c.stages].sort((a, b) => b.start.localeCompare(a.start));
  return stages
    .map((s) => {
      const knots = s.knots.length
        ? `<p class="kw-tm-label">${esc(cp.knots)}</p><ul>${s.knots.map((k) => `<li>${esc(k.text[lang])}</li>`).join("")}</ul>`
        : "";
      const stack = s.stack?.length ? `<p><strong>${esc(cp.stack)}:</strong> ${esc(s.stack.join(", "))}</p>` : "";
      return `<${h}>${esc(s.role[lang])}${c.education ? ` · ${esc(c.name)}` : ""}</${h}>
<p class="kw-tm-meta">${esc(fmtPeriod(lang, s.start, s.end))} · ${esc(s.place[lang])}</p>
<p>${esc(s.summary[lang])}</p>${knots}${stack}`;
    })
    .join("\n");
}

/** The full narration as an HTML string (escaped). `headingLevel` is the level of the document title. */
export function renderTextMode(
  lang: Lang,
  data: WorldData,
  opts: { headingLevel?: 1 | 2; titleId?: string; idPrefix?: string } = {},
): string {
  const cp = COPY[lang];
  const L = (k: Parameters<typeof t>[1]) => t(lang, k);
  const h1 = opts.headingLevel ?? 2;
  const h2 = h1 + 1;
  const h3 = h1 + 2;
  const stations = stationsInOrder().filter((s) => s.kind !== "build");
  const edu = COMPANIES.filter((c) => c.education);
  const sections: string[] = [];
  const toc: string[] = [];
  let n = 0;
  const section = (id: string, title: string, body: string) => {
    n++;
    const sid = textModeId(id, opts.idPrefix);
    toc.push(`<li><a href="#${sid}">${esc(title)}</a></li>`);
    sections.push(
      `<section class="kw-tm-station" id="${sid}" aria-labelledby="${sid}-h"><h${h2} id="${sid}-h"><span class="kw-tm-n">${n}.</span> ${esc(title)}</h${h2}>\n${body}</section>`,
    );
  };

  for (const s of stations) {
    const label = s.label[lang];
    if (s.kind === "gate") section(s.id, label, `<p>${esc(cp.gate)}</p><p>${esc(L("qn.gate.next"))}</p>`);
    else if (s.kind === "company") {
      const c = COMPANIES.find((x) => x.id === s.companyId);
      if (!c) continue;
      let body = companyHtml(c, lang, h3);
      const hosted = edu.filter((e) => hostOfEducation(e) === c.id);
      if (hosted.length)
        body += `<p class="kw-tm-label">${esc(cp.hostedEdu)} · ${esc(L("qn.education"))}</p>${hosted.map((e) => companyHtml(e, lang, h3)).join("\n")}`;
      section(s.id, label, body);
    } else if (s.kind === "bridge") {
      const body = ARTIFACTS.map((a) => {
        const uses = artifactUses(a)
          .map((u) => `<li>${esc(u.company)} · ${esc(u.year)}: ${esc(u.text[lang])}</li>`)
          .join("");
        return `<h${h3}>${esc(a.name[lang])}</h${h3}><p class="kw-tm-meta">${esc(a.tech)}</p><p>${esc(a.summary[lang])}</p>${uses ? `<ul>${uses}</ul>` : ""}`;
      }).join("\n");
      section(s.id, label, `<p>${esc(L("qn.bridge.lede"))}</p>${body}`);
    } else if (s.kind === "arcade") {
      section(s.id, label, `<p>${esc(L("qn.arcade.lede"))}</p><p>${link(`/${lang}/arcade/`, cp.arcadeLink)}</p>`);
    } else if (s.kind === "ai") {
      const pts = aiPoints()
        .map((p) => `<li>${esc(p.where)}: ${esc(p.text[lang])}</li>`)
        .join("");
      section(s.id, label, `<p>${esc(L("qn.ai.lede"))}</p>${pts ? `<ul>${pts}</ul>` : ""}`);
    } else if (s.kind === "contact") {
      const soc = SOCIALS.filter((x) => !x.url.startsWith("mailto:"))
        .map((x) => `<li>${link(x.url, x.name, true)}</li>`)
        .join("");
      section(
        s.id,
        label,
        `<p>${esc(L("qn.contact.lede"))}</p>
<ul class="kw-tm-links">
<li>${link(SITE.calendly, L("qn.contact.book"), true)}</li>
<li>${esc(cp.email)}: ${link(`mailto:${SITE.email}`, SITE.email)}</li>
<li>${link(`/${lang}/#contact`, cp.contactPage)}</li>
<li>${link(SITE.resume[lang], L("qn.contact.resume"))}</li>
</ul>
<p class="kw-tm-label">${esc(cp.socials)}</p><ul class="kw-tm-links">${soc}</ul>`,
      );
    }
  }

  const repos = data.repos.length
    ? `<ul>${data.repos
        .map(
          (r) =>
            `<li>${link(r.url, r.name, true)}${r.language ? ` · ${esc(r.language)}` : ""} · ${esc(r.stars)} ${esc(cp.stars)}${r.description ? `<br>${esc(r.description)}` : ""}</li>`,
        )
        .join("")}</ul>`
    : `<p>${esc(cp.none)}</p>`;
  const posts = data.posts.length
    ? `<ul>${data.posts
        .map((p) => {
          const date = p.date.slice(0, 10);
          return `<li>${link(p.href, p.title, p.source === "medium")} · <time datetime="${esc(date)}">${esc(date)}</time>${p.description ? `<br>${esc(p.description)}` : ""}</li>`;
        })
        .join("")}</ul>`
    : `<p>${esc(cp.none)}</p>`;
  section(
    "workshop",
    cp.workshop,
    `<p>${esc(cp.workshopLede)}</p><h${h3}>${esc(cp.repos)}</h${h3}>${repos}<h${h3}>${esc(cp.posts)}</h${h3}>${posts}`,
  );
  section(
    "summit",
    L("qn.summit.label"),
    `<p>${esc(L("qn.summit.lede"))}</p><ul class="kw-tm-links"><li>${link(SITE.calendly, L("qn.contact.book"), true)}</li><li>${link(`/${lang}/`, cp.back)}</li></ul>`,
  );

  const tid = opts.titleId ?? "kw-tm-title";
  return `<header class="kw-tm-head"><h${h1} id="${tid}" class="kw-tm-title">${esc(cp.title)}</h${h1}>
<p class="kw-tm-lede">${esc(cp.lede)}</p>
<nav class="kw-tm-toc" aria-label="${esc(cp.toc)}"><ol>${toc.join("")}</ol></nav></header>
${sections.join("\n")}`;
}

// ---------------------------------------------------------------- shared core dialog helper

export interface Overlay {
  root: HTMLElement;
  panel: HTMLElement;
  open(focus?: HTMLElement | null): void;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

/**
 * Full-screen paper dialog: role="dialog" + aria-modal, focus trap, Esc (capture phase, so the world
 * never sees it), focus restore, and `world:modal` on open/close. `onKey` sees every other key first
 * (return true to consume it); remaining keys are kept from reaching the world.
 */
export function createOverlay(
  host: HTMLElement,
  o: { className: string; labelledBy: string; onClose?(): void; onKey?(e: KeyboardEvent): boolean },
): Overlay {
  const root = document.createElement("div");
  root.className = `kw-ov ${o.className}`;
  root.hidden = true;
  const panel = document.createElement("div");
  panel.className = "kw-ov-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", o.labelledBy);
  root.append(panel);
  host.append(root);
  let open = false;
  let restore: HTMLElement | null = null;
  const focusables = () =>
    [
      ...panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((n) => !n.hidden && n.offsetParent !== null);
  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      ov.close();
      return;
    }
    if (o.onKey?.(e)) {
      e.stopImmediatePropagation();
      return;
    }
    if (e.key === "Tab") {
      const f = focusables();
      const first = f[0];
      const last = f[f.length - 1];
      if (first && last) {
        if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    // World keys (WASD, E, M, T…) must not reach the game while a dialog is up.
    e.stopImmediatePropagation();
  };
  const onBackdrop = (e: MouseEvent) => {
    if (e.target === root) ov.close();
  };
  const stop = (e: Event) => e.stopPropagation();
  window.addEventListener("keydown", onKeyDown, true);
  root.addEventListener("click", onBackdrop);
  root.addEventListener("pointerdown", stop);
  root.addEventListener("wheel", stop, { passive: true });
  const ov: Overlay = {
    root,
    panel,
    open(focus) {
      if (open) return;
      open = true;
      restore = document.activeElement as HTMLElement | null;
      root.hidden = false;
      emit("world:modal", { open: true });
      requestAnimationFrame(() => (focus ?? focusables()[0] ?? panel)?.focus({ preventScroll: true }));
    },
    close() {
      if (!open) return;
      open = false;
      root.hidden = true;
      emit("world:modal", { open: false });
      o.onClose?.();
      if (restore?.isConnected) restore.focus({ preventScroll: true });
    },
    isOpen: () => open,
    dispose() {
      ov.close();
      window.removeEventListener("keydown", onKeyDown, true);
      root.removeEventListener("click", onBackdrop);
      root.removeEventListener("pointerdown", stop);
      root.removeEventListener("wheel", stop);
      root.remove();
    },
  };
  return ov;
}

/** Moves focus to the previous/next focusable inside the open dialog (gamepad d-pad). */
export function focusStep(container: HTMLElement, dir: -1 | 1) {
  const f = [
    ...container.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  ].filter((n) => !n.hidden && n.offsetParent !== null);
  if (!f.length) return;
  const i = f.indexOf(document.activeElement as HTMLElement);
  const next = f[i < 0 ? 0 : (i + dir + f.length) % f.length];
  next?.focus();
  next?.scrollIntoView?.({ block: "nearest" });
}

// ---------------------------------------------------------------- overlay

export interface TextMode {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  /** The dialog panel (gamepad focus stepping). */
  panel: HTMLElement;
  dispose(): void;
}

export function createTextMode(host: HTMLElement, lang: Lang, data: WorldData): TextMode {
  const cp = COPY[lang];
  const ov = createOverlay(host, { className: "kw-tm", labelledBy: "kw-tm-ov-title" });
  ov.panel.lang = lang;
  ov.panel.tabIndex = -1;
  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    const bar = document.createElement("div");
    bar.className = "kw-tm-bar";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "kw-btn";
    close.innerHTML = `<kbd>Esc</kbd> <span>${esc(cp.close)}</span>`;
    close.addEventListener("click", () => ov.close());
    bar.append(close);
    const doc = document.createElement("article");
    doc.className = "kw-textdoc";
    doc.innerHTML = renderTextMode(lang, data, { headingLevel: 2, titleId: "kw-tm-ov-title", idPrefix: "kw-tmo-" });
    // In-dialog table of contents: scroll inside the panel instead of changing the URL hash.
    doc.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!a) return;
      const target = doc.querySelector<HTMLElement>(a.getAttribute("href") ?? "");
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ block: "start" });
      target.querySelector<HTMLElement>("h2, h3")?.setAttribute("tabindex", "-1");
      target.querySelector<HTMLElement>("h2, h3")?.focus({ preventScroll: true });
    });
    ov.panel.append(bar, doc);
  };
  return {
    panel: ov.panel,
    open() {
      build();
      ov.open(ov.panel.querySelector<HTMLElement>(".kw-tm-bar .kw-btn"));
    },
    close: () => ov.close(),
    toggle() {
      if (ov.isOpen()) ov.close();
      else this.open();
    },
    isOpen: () => ov.isOpen(),
    dispose: () => ov.dispose(),
  };
}
