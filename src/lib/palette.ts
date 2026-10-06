/**
 * ⌘K command palette (client). Built on first open from the page's JSON index (#cmdk-data): a modal
 * combobox + listbox with accent-insensitive matching (title, then word starts, subtitle, keywords),
 * grouped results, ↑/↓/Enter/Esc, and actions (theme, language, copy email).
 */

import { switchLang } from "./lang-switch";
import type { PaletteItem } from "./search-index";

interface Copy {
  placeholder: string;
  label: string;
  empty: string;
  groups: Record<PaletteItem["g"], string>;
  copied: string;
  hint: string;
}

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface Entry extends PaletteItem {
  nt: string;
  nw: string[];
  nx: string;
}

export function score(e: Pick<Entry, "nt" | "nw" | "nx">, tokens: string[]): number {
  let total = 0;
  for (const tok of tokens) {
    let best = 0;
    if (e.nt.startsWith(tok)) best = 100;
    else if (e.nw.some((w) => w.startsWith(tok))) best = 80;
    else if (e.nt.includes(tok)) best = 60;
    else if (e.nx.includes(tok)) best = 30;
    if (!best) return 0;
    total += best;
  }
  return total;
}

export const prepare = (it: PaletteItem): Entry => {
  const nt = norm(it.t);
  return { ...it, nt, nw: nt.split(/[\s·\-_/]+/), nx: norm(`${it.s ?? ""} ${it.k ?? ""}`) };
};

const ORDER: PaletteItem["g"][] = ["commands", "pages", "posts", "projects", "games", "repos"];

export function openPalette() {
  const dataEl = document.getElementById("cmdk-data");
  if (!dataEl?.textContent) return;
  const { items, copy } = JSON.parse(dataEl.textContent) as { items: PaletteItem[]; copy: Copy };
  const entries = items.map(prepare);

  const back = document.createElement("div");
  back.className = "cmdk";
  back.innerHTML = `
    <div class="cmdk-panel" role="dialog" aria-modal="true">
      <div class="cmdk-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
        <input type="text" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" />
        <kbd>Esc</kbd>
      </div>
      <div class="cmdk-list" id="cmdk-list" role="listbox"></div>
      <p class="cmdk-hint mono"></p>
    </div>`;
  document.body.append(back);
  // Labels go in through attributes / textContent (no data in markup strings).
  back.querySelector(".cmdk-panel")?.setAttribute("aria-label", copy.label);
  back.querySelector(".cmdk-list")?.setAttribute("aria-label", copy.label);
  const hintEl = back.querySelector(".cmdk-hint");
  if (hintEl) hintEl.textContent = copy.hint;
  const input = back.querySelector("input") as HTMLInputElement;
  input.placeholder = copy.placeholder;
  const list = back.querySelector(".cmdk-list") as HTMLDivElement;
  const restore = document.activeElement as HTMLElement | null;
  document.documentElement.classList.add("cmdk-open");

  let shown: Entry[] = [];
  let active = 0;
  const render = () => {
    const tokens = norm(input.value).trim().split(/\s+/).filter(Boolean);
    let res: Entry[];
    if (!tokens.length) {
      // Empty: commands, pages and the latest posts.
      res = [
        ...entries.filter((e) => e.g === "commands" || e.g === "pages"),
        ...entries.filter((e) => e.g === "posts").slice(0, 3),
      ];
    } else {
      res = entries
        .map((e) => ({ e, s: score(e, tokens) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || ORDER.indexOf(a.e.g) - ORDER.indexOf(b.e.g))
        .slice(0, 30)
        .map((x) => x.e);
    }
    // Group in a stable order, keeping score order inside each group.
    shown = ORDER.flatMap((g) => res.filter((e) => e.g === g));
    active = 0;
    list.replaceChildren();
    if (!shown.length) {
      const p = document.createElement("p");
      p.className = "cmdk-empty";
      p.textContent = copy.empty;
      list.append(p);
      input.removeAttribute("aria-activedescendant");
      return;
    }
    let group: string | null = null;
    shown.forEach((e, i) => {
      if (e.g !== group) {
        group = e.g;
        const h = document.createElement("div");
        h.className = "cmdk-group mono";
        h.setAttribute("role", "presentation");
        h.textContent = copy.groups[e.g];
        list.append(h);
      }
      const o = document.createElement("div");
      o.className = "cmdk-item";
      o.id = `cmdk-o-${i}`;
      o.setAttribute("role", "option");
      o.dataset.i = String(i);
      const tt = document.createElement("span");
      tt.className = "cmdk-t";
      tt.textContent = e.t;
      o.append(tt);
      if (e.s) {
        const s = document.createElement("span");
        s.className = "cmdk-s";
        s.textContent = e.s;
        o.append(s);
      }
      if (e.ext) o.insertAdjacentHTML("beforeend", '<span class="cmdk-ext" aria-hidden="true">↗</span>');
      list.append(o);
    });
    select(0);
  };
  const select = (i: number) => {
    if (!shown.length) return;
    active = (i + shown.length) % shown.length;
    for (const o of list.querySelectorAll(".cmdk-item")) o.setAttribute("aria-selected", "false");
    const o = list.querySelector<HTMLElement>(`#cmdk-o-${active}`);
    if (!o) return;
    o.setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", o.id);
    o.scrollIntoView({ block: "nearest" });
  };
  const close = () => {
    back.remove();
    document.documentElement.classList.remove("cmdk-open");
    restore?.focus?.();
  };
  const run = async (e: Entry | undefined) => {
    if (!e) return;
    if (e.a === "theme") {
      close();
      document.querySelector<HTMLButtonElement>("[data-theme-toggle]")?.click();
      return;
    }
    if (e.a === "lang") {
      close();
      switchLang();
      return;
    }
    if (e.a === "copy-email") {
      try {
        await navigator.clipboard.writeText(e.s ?? "");
        const o = list.querySelector<HTMLElement>(`#cmdk-o-${active} .cmdk-t`);
        if (o) o.textContent = copy.copied;
        setTimeout(close, 700);
      } catch {
        close();
      }
      return;
    }
    if (!e.h) return;
    close();
    if (e.ext) window.open(e.h, "_blank", "noopener");
    else location.href = e.h;
  };

  input.addEventListener("input", render);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      select(active + 1);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      select(active - 1);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      void run(shown[active]);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    } else if (ev.key === "Tab") ev.preventDefault();
  });
  list.addEventListener("pointermove", (ev) => {
    const o = (ev.target as HTMLElement).closest<HTMLElement>(".cmdk-item");
    if (o && Number(o.dataset.i) !== active) select(Number(o.dataset.i));
  });
  list.addEventListener("click", (ev) => {
    const o = (ev.target as HTMLElement).closest<HTMLElement>(".cmdk-item");
    if (o) void run(shown[Number(o.dataset.i)]);
  });
  back.addEventListener("pointerdown", (ev) => {
    if (ev.target === back) close();
  });
  render();
  input.focus();
}
