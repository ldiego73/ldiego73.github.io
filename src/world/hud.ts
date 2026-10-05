import "../games/core/shell.css";
import "./hud.css";
import { ARTIFACTS, type Artifact, COMPANIES, type Company } from "../data/career";
import { SITE, SOCIALS } from "../data/site";
import { fmtPeriod, type Lang, t, type UIKey } from "../i18n/ui";
import type { CordSpec } from "./artifacts";
import { aiPoints, artifactUses, companyYears, headlineMetric } from "./artifacts";
import { DYE } from "./props";

/**
 * Hand-inked HUD for the Andean world: paper/cloth cards with dark ink borders, square buttons with a
 * slight offset (this world is hand-inked), a station toast (aria-live), the interact prompt (also a
 * tap target), station panels, a trail minimap and a help overlay. Classes are prefixed `qn-`.
 */
export interface MapStation {
  id: string;
  label: string;
  color: string;
  x: number;
  z: number;
}

export interface Hud {
  root: HTMLElement;
  toast(text: string): void;
  prompt(label: string | null): void;
  /** Show a panel (key de-dupes rebuilds) or hide with null. */
  panel(key: string | null, build?: () => HTMLElement): void;
  panelKey(): string | null;
  setNight(night: boolean): void;
  map(x: number, z: number, near: string | null): void;
  toggleMap(force?: boolean): void;
  toggleHelp(force?: boolean): void;
  /** Closes help / expanded map (not the panel); true if something closed. */
  closeTop(): boolean;
  openGame(title: string): HTMLElement;
  /** Called when the overlay's back button is pressed. */
  onGameClose(cb: () => void): void;
  closeGame(): void;
  gameOpen(): boolean;
  /** Panel builders. */
  company(company: Company, cords: CordSpec[]): HTMLElement;
  artifact(a: Artifact): HTMLElement;
  info(title: string, lede: string, extra?: HTMLElement): HTMLElement;
  ai(): HTMLElement;
  contact(): HTMLElement;
  /** Finale panel at the summit: recap + calls to action. */
  summit(name?: string): HTMLElement;
  /** A row of link buttons (first is primary). */
  actions(links: Array<{ label: string; href: string; external?: boolean; download?: boolean }>): HTMLElement;
  dispose(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const ICON: Record<string, string> = {
  github:
    '<path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 3 .8.1-.7.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7 3.6 3.6 0 0 1 .1-2.7s.8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.8V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/>',
  linkedin:
    '<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.5h4V21H3V9.5Zm6.5 0h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.1c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4V9.5Z"/>',
  medium:
    '<path d="M2 6.5c0-.3.1-.5.3-.7L4.5 3.2V3h6.8l5.3 11.6L21.2 3h6.5v.2l-1.9 1.8a.5.5 0 0 0-.2.5v13.1c0 .2 0 .4.2.5l1.8 1.8v.2h-9.2v-.2l1.9-1.9c.2-.2.2-.2.2-.5V7.9l-5.3 13.3h-.7L8.4 7.9v8.9c0 .4.1.7.4 1l2.5 3v.2H4.2v-.2l2.5-3c.3-.3.4-.6.3-1V6.5Z" transform="scale(.8) translate(1 1)"/>',
  mail: '<path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2.2V17h16V7.2l-8 5.3-8-5.3ZM5.4 7l6.6 4.4L18.6 7H5.4Z"/>',
};

export function createHud(
  root: HTMLElement,
  lang: Lang,
  opts: {
    onInteract(): void;
    /** User closed the panel (button); content suppresses auto-open until the traveler leaves. */
    onPanelClose?(key: string | null): void;
    stations: MapStation[];
    trail: Array<{ x: number; z: number }>;
  },
): Hud {
  const L = (k: UIKey) => t(lang, k);
  const hud = el("div", "qn-hud");
  hud.lang = lang;
  root.appendChild(hud);

  // Toast (station name).
  const toast = el("div", "qn-toast");
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  hud.appendChild(toast);
  let toastTimer = 0;

  // Interact prompt (button doubles as the tap target).
  const promptBtn = el("button", "qn-prompt qn-btn");
  promptBtn.type = "button";
  promptBtn.hidden = true;
  promptBtn.addEventListener("click", () => opts.onInteract());
  hud.appendChild(promptBtn);

  // Panel card.
  const panelWrap = el("section", "qn-panel");
  panelWrap.hidden = true;
  panelWrap.setAttribute("aria-live", "polite");
  const panelClose = el("button", "qn-btn qn-icon qn-panel-close");
  panelClose.type = "button";
  panelClose.setAttribute("aria-label", L("qn.close"));
  panelClose.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const panelBody = el("div", "qn-panel-body");
  panelWrap.append(panelClose, panelBody);
  hud.appendChild(panelWrap);
  let currentKey: string | null = null;
  panelClose.addEventListener("click", () => {
    const k = currentKey;
    setPanel(null);
    opts.onPanelClose?.(k);
  });

  // Corner tools: map + help.
  const tools = el("div", "qn-tools");
  const mapBtn = el("button", "qn-btn qn-icon");
  mapBtn.type = "button";
  mapBtn.setAttribute("aria-label", L("qn.map"));
  mapBtn.setAttribute("aria-pressed", "false");
  mapBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>';
  const helpBtn = el("button", "qn-btn qn-icon");
  helpBtn.type = "button";
  helpBtn.setAttribute("aria-label", L("qn.help"));
  helpBtn.setAttribute("aria-expanded", "false");
  helpBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 9a3 3 0 1 1 4.2 2.8c-.9.4-1.4 1.1-1.4 2.1v.6"/><path d="M12 18h.01"/></svg>';
  tools.append(mapBtn, helpBtn);
  hud.appendChild(tools);

  // Minimap.
  const mapBox = el("figure", "qn-map");
  const mapCanvas = el("canvas", "qn-map-canvas");
  mapCanvas.setAttribute("role", "img");
  mapCanvas.setAttribute("aria-label", L("qn.map"));
  const mapCap = el("figcaption", "qn-map-cap");
  mapBox.append(mapCanvas, mapCap);
  hud.appendChild(mapBox);
  let mapExpanded = false;

  // Help overlay.
  const help = el("div", "qn-help");
  help.hidden = true;
  help.setAttribute("role", "dialog");
  help.setAttribute("aria-modal", "false");
  help.setAttribute("aria-labelledby", "qn-help-title");
  const helpCard = el("div", "qn-card qn-help-card");
  const ht = el("h2", "qn-title", L("qn.help.title"));
  ht.id = "qn-help-title";
  const hl = el("ul", "qn-help-list");
  for (const k of [
    "qn.help.move",
    "qn.help.run",
    "qn.help.interact",
    "qn.help.keys",
    "qn.help.touch",
    "qn.help.tour",
  ] as UIKey[]) {
    hl.appendChild(el("li", "", L(k)));
  }
  const helpClose = el("button", "qn-btn qn-btn-primary", L("qn.close"));
  helpClose.type = "button";
  helpCard.append(ht, hl, helpClose);
  help.appendChild(helpCard);
  hud.appendChild(help);

  // Game overlay.
  const game = el("div", "qn-game");
  game.hidden = true;
  game.setAttribute("role", "dialog");
  game.setAttribute("aria-modal", "true");
  const gameBar = el("div", "qn-game-bar");
  const gameTitle = el("h2", "qn-title");
  gameTitle.id = "qn-game-title";
  game.setAttribute("aria-labelledby", "qn-game-title");
  const gameBack = el("button", "qn-btn");
  gameBack.type = "button";
  gameBack.innerHTML = `<kbd>Esc</kbd> ${L("qn.arcade.back")}`;
  gameBar.append(gameTitle, gameBack);
  const gameHost = el("div", "qn-game-host");
  game.append(gameBar, gameHost);
  // The game overlay lives in its own fixed top layer so it covers the core's page chrome too.
  const gameLayer = el("div", "qn-hud qn-game-layer");
  gameLayer.lang = lang;
  gameLayer.appendChild(game);
  (root.ownerDocument?.body ?? document.body).appendChild(gameLayer);
  let onGameClose: (() => void) | null = null;
  gameBack.addEventListener("click", () => onGameClose?.());

  // ------------------------------------------------------------ minimap drawing
  const xs = opts.trail.map((p) => p.x).concat(opts.stations.map((s) => s.x));
  const zs = opts.trail.map((p) => p.z).concat(opts.stations.map((s) => s.z));
  const minX = Math.min(...xs) - 4;
  const maxX = Math.max(...xs) + 4;
  const minZ = Math.min(...zs) - 4;
  const maxZ = Math.max(...zs) + 4;
  let lastDraw = 0;
  let night = false;
  const drawMap = (ax: number, az: number, near: string | null) => {
    const cssW = mapCanvas.clientWidth || 150;
    const cssH = mapCanvas.clientHeight || 150;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (mapCanvas.width !== Math.round(cssW * dpr)) {
      mapCanvas.width = Math.round(cssW * dpr);
      mapCanvas.height = Math.round(cssH * dpr);
    }
    const ctx = mapCanvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const pad = 10;
    const s = Math.min((cssW - pad * 2) / (maxX - minX), (cssH - pad * 2) / (maxZ - minZ));
    const ox = (cssW - (maxX - minX) * s) / 2;
    const oz = (cssH - (maxZ - minZ) * s) / 2;
    const P = (x: number, z: number) => [ox + (x - minX) * s, oz + (z - minZ) * s] as const;
    const ink = night ? "#e9e4ff" : "#1f1a17";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    opts.trail.forEach((p, i) => {
      const [x, y] = P(p.x, p.z);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.strokeStyle = night ? "#8f87b8" : "#b9b1a3";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    for (const st of opts.stations) {
      const [x, y] = P(st.x, st.z);
      const r = st.id === near ? 6 : 4.2;
      ctx.fillStyle = st.color;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (mapExpanded) {
        ctx.font = `600 11px var(--font-body, sans-serif)`;
        ctx.fillStyle = ink;
        const tw = ctx.measureText(st.label).width;
        ctx.fillText(st.label, x + 8 + tw > cssW - 4 ? x - 8 - tw : x + 8, y + 4);
      }
    }
    const [px, py] = P(ax, az);
    ctx.fillStyle = "#dda63c";
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };

  // ------------------------------------------------------------ panel
  const setPanel = (key: string | null, build?: () => HTMLElement) => {
    if (key === currentKey) return;
    currentKey = key;
    if (!key || !build) {
      panelWrap.classList.remove("is-open");
      panelWrap.hidden = true;
      panelBody.replaceChildren();
      hud.classList.remove("has-panel");
      return;
    }
    panelBody.replaceChildren(build());
    panelWrap.hidden = false;
    hud.classList.add("has-panel");
    panelWrap.classList.remove("is-open");
    void panelWrap.offsetWidth;
    panelWrap.classList.add("is-open");
    const h = panelBody.querySelector("h2");
    if (h) {
      h.id ||= `qn-panel-${key.replace(/[^a-z0-9-]/gi, "")}`;
      panelWrap.setAttribute("aria-labelledby", h.id);
    }
  };

  const setMap = (force?: boolean) => {
    mapExpanded = force ?? !mapExpanded;
    mapBox.classList.toggle("is-expanded", mapExpanded);
    mapBtn.setAttribute("aria-pressed", String(mapExpanded));
    lastDraw = 0;
  };
  const setHelp = (force?: boolean) => {
    const open = force ?? help.hidden;
    help.hidden = !open;
    helpBtn.setAttribute("aria-expanded", String(open));
    if (open) helpClose.focus({ preventScroll: true });
  };
  mapBtn.addEventListener("click", () => setMap());
  helpBtn.addEventListener("click", () => setHelp());
  helpClose.addEventListener("click", () => {
    setHelp(false);
    helpBtn.focus({ preventScroll: true });
  });
  const onMapEv = () => setMap();
  const onHelpEv = () => setHelp();
  window.addEventListener("world:map", onMapEv);
  window.addEventListener("world:help", onHelpEv);

  // ------------------------------------------------------------ builders
  const head = (title: string, sub?: string, dye?: string) => {
    const h = el("header", "qn-head");
    if (dye) {
      const sw = el("span", "qn-swatch");
      sw.style.setProperty("--dye", dye);
      sw.setAttribute("aria-hidden", "true");
      h.appendChild(sw);
    }
    const tt = el("div", "qn-head-text");
    tt.appendChild(el("h2", "qn-title", title));
    if (sub) tt.appendChild(el("p", "qn-sub", sub));
    h.appendChild(tt);
    return h;
  };
  const knotGlyph = (n: number, dye: string) => {
    const g = el("span", "qn-knot");
    g.style.setProperty("--dye", dye);
    g.setAttribute("aria-hidden", "true");
    const turns = Math.max(1, Math.min(9, n));
    for (let i = 0; i < turns; i++) g.appendChild(el("i"));
    if (n > 1) g.classList.add("is-long");
    return g;
  };

  const api: Hud = {
    root: hud,
    toast(text) {
      toast.textContent = text;
      toast.classList.remove("is-on");
      void toast.offsetWidth;
      toast.classList.add("is-on");
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.classList.remove("is-on"), 2600);
    },
    prompt(label) {
      if (!label) {
        promptBtn.hidden = true;
        return;
      }
      const html = `<kbd>E</kbd><span>${label}</span>`;
      if (promptBtn.innerHTML !== html) promptBtn.innerHTML = html;
      promptBtn.hidden = false;
    },
    panel(key, build) {
      setPanel(key, build);
    },
    panelKey: () => currentKey,
    setNight(n) {
      if (n === night) return;
      night = n;
      hud.classList.toggle("is-night", n);
      lastDraw = 0;
    },
    map(x, z, near) {
      const now = performance.now();
      if (now - lastDraw < 120) return;
      lastDraw = now;
      drawMap(x, z, near);
      mapCap.textContent = near ? (opts.stations.find((s) => s.id === near)?.label ?? "") : "";
    },
    toggleMap: setMap,
    toggleHelp: setHelp,
    closeTop() {
      if (!help.hidden) {
        setHelp(false);
        return true;
      }
      if (mapExpanded) {
        setMap(false);
        return true;
      }
      return false;
    },
    openGame(title) {
      gameTitle.textContent = title;
      gameHost.replaceChildren();
      gameHost.className = "qn-game-host";
      gameHost.appendChild(el("p", "qn-game-loading", L("qn.arcade.loading")));
      game.hidden = false;
      hud.classList.add("has-game");
      return gameHost;
    },
    closeGame() {
      game.hidden = true;
      hud.classList.remove("has-game");
      gameHost.replaceChildren();
      gameHost.className = "qn-game-host";
      gameHost.removeAttribute("style");
    },
    gameOpen: () => !game.hidden,
    onGameClose(cb) {
      onGameClose = cb;
    },
    company(company, cords) {
      const card = el("div", "qn-card-in");
      const dye = DYE[company.dye];
      card.appendChild(head(company.name, companyYears(company, lang), dye));
      const metric = headlineMetric(company);
      if (metric) {
        const m = el("p", "qn-metric");
        m.append(el("strong", "", metric.metric), el("span", "", metric.text[lang]));
        card.appendChild(m);
      }
      const list = el("ol", "qn-cords");
      list.setAttribute("aria-label", L("qn.stages"));
      // Newest stage first, like the site; education cords go last.
      const ordered = [...cords].sort(
        (a, b) =>
          Number(!!a.company.education) - Number(!!b.company.education) || b.stage.start.localeCompare(a.stage.start),
      );
      for (const c of ordered) {
        const li = el("li", `qn-cord${c.kind === "sub" ? " is-sub" : ""}`);
        li.style.setProperty("--dye", DYE[c.stage.dye]);
        const top = el("div", "qn-cord-top");
        top.appendChild(el("h3", "qn-role", c.stage.role[lang]));
        const meta = el("p", "qn-period", `${fmtPeriod(lang, c.stage.start, c.stage.end)} · ${c.stage.place[lang]}`);
        top.appendChild(meta);
        if (c.company.education) top.appendChild(el("p", "qn-tag", `${L("qn.education")} · ${c.company.name}`));
        li.appendChild(top);
        li.appendChild(el("p", "qn-summary", c.stage.summary[lang]));
        const knots = el("ul", "qn-knots");
        knots.setAttribute("aria-label", L("qn.knots"));
        for (const k of c.knots) {
          const kl = el("li", "qn-knot-row");
          kl.appendChild(knotGlyph(k.n, DYE[c.stage.dye]));
          const tx = el("span", "qn-knot-text");
          tx.append(k.text[lang]);
          if (k.n > 1) kl.title = `${L("qn.knot.long")} · ${k.n}`;
          kl.appendChild(tx);
          knots.appendChild(kl);
        }
        li.appendChild(knots);
        if (c.stage.stack?.length) {
          const st = el("p", "qn-stack");
          for (const s of c.stage.stack) st.appendChild(el("span", "", s));
          li.appendChild(st);
        }
        list.appendChild(li);
      }
      card.appendChild(list);
      return card;
    },
    artifact(a) {
      const card = el("div", "qn-card-in");
      card.appendChild(head(a.name[lang], a.tech, DYE[a.dye]));
      card.appendChild(el("p", "qn-lede", a.summary[lang]));
      card.appendChild(el("h3", "qn-label", L("qn.uses")));
      const ul = el("ul", "qn-uses");
      for (const u of artifactUses(a)) {
        const li = el("li");
        li.append(el("span", "qn-num", `${u.company} · ${u.year}`), el("span", "", u.text[lang]));
        ul.appendChild(li);
      }
      card.appendChild(ul);
      return card;
    },
    info(title, lede, extra) {
      const card = el("div", "qn-card-in");
      card.appendChild(head(title));
      card.appendChild(el("p", "qn-lede", lede));
      if (extra) card.appendChild(extra);
      return card;
    },
    ai() {
      const card = el("div", "qn-card-in");
      card.appendChild(
        head(L("qn.ai.title"), lang === "es" ? "Del ruido a la señal" : "From noise to signal", DYE.turq),
      );
      card.appendChild(el("p", "qn-lede", L("qn.ai.lede")));
      const ul = el("ul", "qn-uses");
      for (const p of aiPoints()) {
        const li = el("li");
        li.append(el("span", "qn-num", p.where), el("span", "", p.text[lang]));
        ul.appendChild(li);
      }
      card.appendChild(ul);
      return card;
    },
    contact() {
      const card = el("div", "qn-card-in");
      card.appendChild(head(L("qn.contact.title"), SITE.name, DYE.red));
      card.appendChild(el("p", "qn-lede", L("qn.contact.lede")));
      const actions = el("div", "qn-actions");
      const book = el("a", "qn-btn qn-btn-primary", L("qn.contact.book"));
      book.href = SITE.calendly;
      book.target = "_blank";
      book.rel = "noopener";
      const copy = el("button", "qn-btn", L("qn.contact.copy"));
      copy.type = "button";
      copy.addEventListener("click", () => {
        const done = () => {
          copy.textContent = L("qn.contact.copied");
          api.toast(`${L("qn.contact.copied")} · ${SITE.email}`);
        };
        navigator.clipboard?.writeText(SITE.email).then(done, () => {
          location.href = `mailto:${SITE.email}`;
        });
      });
      const cv = el("a", "qn-btn", L("qn.contact.resume"));
      cv.href = SITE.resume[lang];
      cv.setAttribute("download", "");
      actions.append(book, copy, cv);
      card.appendChild(actions);
      const email = el("p", "qn-email qn-num", SITE.email);
      card.appendChild(email);
      const soc = el("ul", "qn-socials");
      for (const s of SOCIALS) {
        const li = el("li");
        const a = el("a", "qn-btn qn-icon");
        a.href = s.url;
        if (!s.url.startsWith("mailto:")) {
          a.target = "_blank";
          a.rel = "noopener";
        }
        a.setAttribute("aria-label", s.name);
        a.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" class="is-fill">${ICON[s.icon] ?? ""}</svg>`;
        li.appendChild(a);
        soc.appendChild(li);
      }
      card.appendChild(soc);
      return card;
    },
    actions(links) {
      const row = el("div", "qn-actions");
      links.forEach((l, i) => {
        const a = el("a", `qn-btn${i === 0 ? " qn-btn-primary" : ""}`, l.label);
        a.href = l.href;
        if (l.external) {
          a.target = "_blank";
          a.rel = "noopener";
        }
        if (l.download) a.setAttribute("download", "");
        row.appendChild(a);
      });
      return row;
    },
    summit(name) {
      const card = el("div", "qn-card-in qn-summit");
      const title = name ? L("qn.summit.title.named").replace("{name}", name) : L("qn.summit.title");
      card.appendChild(head(title, L("qn.summit.label"), DYE.ochre));
      card.appendChild(el("p", "qn-lede", L("qn.summit.lede")));
      const work = COMPANIES.filter((c) => !c.education);
      const first = Math.min(...COMPANIES.flatMap((c) => c.stages.map((s) => Number(s.start.slice(0, 4)))));
      const years = Math.max(1, new Date().getFullYear() - first);
      const knots = COMPANIES.reduce((a, c) => a + c.stages.reduce((b, s) => b + s.knots.length, 0), 0);
      const stats = el("dl", "qn-stats");
      for (const [n, k] of [
        [years, "qn.summit.years"],
        [work.length, "qn.summit.companies"],
        [ARTIFACTS.length, "qn.summit.artifacts"],
        [knots, "qn.summit.knots"],
      ] as Array<[number, UIKey]>) {
        const d = el("div", "qn-stat");
        d.append(el("dt", "", L(k)), el("dd", "qn-num", String(n)));
        stats.appendChild(d);
      }
      card.appendChild(stats);
      card.appendChild(
        api.actions([
          { label: L("qn.contact.book"), href: SITE.calendly, external: true },
          { label: L("qn.contact.resume"), href: SITE.resume[lang], download: true },
          { label: L("qn.summit.back"), href: `/${lang}/` },
        ]),
      );
      return card;
    },
    dispose() {
      clearTimeout(toastTimer);
      window.removeEventListener("world:map", onMapEv);
      window.removeEventListener("world:help", onHelpEv);
      gameLayer.remove();
      hud.remove();
    },
  };
  return api;
}
