import { fmtPeriod } from "../../i18n/ui";
import type { CordSpec } from "./model";
import type { Khipu } from "./scene";

const webgl = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

/**
 * Lazy-mounts a khipu scene into a stage element once it nears the viewport.
 * The stage provides [data-tags] and [data-tip] children for HTML labels.
 * Returns a promise for the scene so sections (artifacts) can drive it.
 */
export function initKhipuStage(stage: HTMLElement, mode: "hero" | "artifacts"): Promise<Khipu | null> {
  const lang = stage.dataset.lang === "en" ? "en" : "es";
  const tagsEl = stage.querySelector<HTMLElement>("[data-tags]");
  const tip = stage.querySelector<HTMLElement>("[data-tip]");
  if (!webgl()) {
    stage.classList.add("no-webgl");
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const { createKhipu } = await import("./scene");
        const showTip = (cord: CordSpec | null, x: number, y: number) => {
          if (!tip) return;
          if (!cord?.stage) {
            tip.hidden = true;
            return;
          }
          const s = cord.stage;
          tip.innerHTML = "";
          const title = document.createElement("strong");
          title.textContent = `${cord.company.name} · ${s.role[lang]}`;
          const when = document.createElement("span");
          when.className = "mono";
          when.textContent = fmtPeriod(lang, s.start, s.end);
          const body = document.createElement("span");
          body.textContent = s.summary[lang];
          tip.append(title, when, body);
          tip.hidden = false;
          const w = stage.clientWidth;
          tip.style.left = `${Math.min(w - 270, Math.max(0, x + 16))}px`;
          tip.style.top = `${Math.max(0, y - 40)}px`;
        };
        const k = createKhipu(stage, {
          lang,
          mode,
          onHover: showTip,
          onSelect: (cord) => {
            if (mode !== "hero") return;
            const target = document.getElementById(`chapter-${cord.companyId}`);
            if (target && matchMedia("(pointer: fine)").matches) target.scrollIntoView({ behavior: "smooth" });
          },
        });
        const drawTags = () => {
          if (!tagsEl) return;
          tagsEl.replaceChildren(
            ...k.tags().map(({ cord, x, y }) => {
              const d = document.createElement("span");
              d.className = "tag";
              d.style.left = `${x}px`;
              d.style.top = `${y}px`;
              const name = document.createElement("b");
              name.textContent = cord.company.name.split(" ")[0] ?? cord.company.name;
              const year = document.createElement("span");
              year.textContent = cord.company.stages[0]?.start.slice(0, 4) ?? "";
              d.append(name, year);
              return d;
            }),
          );
        };
        requestAnimationFrame(drawTags);
        new ResizeObserver(() => requestAnimationFrame(drawTags)).observe(stage);
        resolve(k);
      },
      { rootMargin: "200px" },
    );
    io.observe(stage);
  });
}
