/**
 * Wasi room panels (part of the lazy interior chunk). One paper panel (the shared field panel, which emits
 * `world:modal` on open/close and takes focus) re-rendered per room:
 *  - sala: the career, company by company, with roles and years, links to the home chapters and the CV;
 *  - estudio: education and certifications, the two resume PDFs, the CV page;
 *  - buzon: email, Calendly, social links and the home page's contact form.
 * The traveler's table (mesa) opens the passport booklet itself (its own button), which carries the
 * postcard action. E closes the panel like Esc (core ignores keys while a modal is open).
 */
import type { Lang } from "../../contract";
import { createFieldPanel, el, linkButton } from "../fields/panel";
import {
  COPY,
  careerRows,
  certRows,
  contactLinks,
  educationRows,
  type Link,
  roomStamp,
  salaLinks,
  studyLinks,
} from "./content";
import type { RoomId } from "./plan";
import "./wasi.css";

export interface RoomPanels {
  /** Opens the room (true when something opened). */
  open(room: RoomId): boolean;
  isOpen(): boolean;
  close(): boolean;
  dispose(): void;
}

const ROOM_DYE: Record<RoomId, string> = {
  sala: "#c4383f",
  estudio: "#2a9d8f",
  buzon: "#dda63c",
  mesa: "#3446a6",
};

function linkEl(l: Link, primary = false): HTMLAnchorElement {
  const a = linkButton(l.href, l.label, l.external, primary);
  if (l.download) a.setAttribute("download", "");
  return a;
}

export function createRoomPanels(hudRoot: HTMLElement, lang: Lang): RoomPanels {
  const panel = createFieldPanel(hudRoot, { name: "wasi", closeLabel: COPY.close[lang] });
  panel.layer.lang = lang;
  const section = panel.title.closest("section");
  // E toggles the panel closed (Esc is handled by the field panel itself).
  const onKey = (e: KeyboardEvent) => {
    if ((e.key === "e" || e.key === "E") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      panel.close();
    }
  };
  panel.layer.addEventListener("keydown", onKey);

  const render: Record<Exclude<RoomId, "mesa">, () => HTMLElement[]> = {
    sala() {
      const list = el("ul", "qnw-list");
      for (const row of careerRows(lang)) {
        const li = el("li");
        const sw = el("span", "qnf-swatch");
        sw.style.setProperty("--qnf-dot", row.dye);
        const box = el("div");
        box.append(el("p", "qnw-name", row.name));
        const roles = el("ul", "qnw-roles");
        for (const r of row.roles) {
          const ri = el("li", undefined, r.role);
          ri.append(el("time", undefined, r.years));
          roles.append(ri);
        }
        box.append(roles);
        li.append(sw, box);
        list.append(li);
      }
      const actions = el("div", "qnf-actions");
      for (const [i, l] of salaLinks(lang).entries()) actions.append(linkEl(l, i === 0));
      return [el("p", "qnf-lede", COPY.salaLede[lang]), list, actions];
    },
    estudio() {
      const edu = el("ul", "qnw-list");
      for (const e of educationRows(lang)) {
        const li = el("li");
        const box = el("div");
        box.append(el("p", "qnw-name", e.title), el("span", "qnw-sub", e.school), el("span", "qnw-years", e.years));
        li.append(box);
        edu.append(li);
      }
      const certs = el("ul", "qnw-list");
      for (const c of certRows()) {
        const li = el("li");
        const box = el("div");
        box.append(el("p", "qnw-name", c.name), el("span", "qnw-years", c.years));
        li.append(box);
        certs.append(li);
      }
      const actions = el("div", "qnf-actions");
      for (const [i, l] of studyLinks(lang).entries()) actions.append(linkEl(l, i === 0));
      return [
        el("p", "qnf-label", COPY.education[lang]),
        edu,
        el("p", "qnf-label", COPY.certs[lang]),
        certs,
        el("p", "qnf-label", COPY.resume[lang]),
        actions,
      ];
    },
    buzon() {
      const c = contactLinks(lang);
      const mail = el("a", "qnw-email", c.email);
      mail.href = c.mailto;
      const mailP = el("p", "qnf-lede");
      mailP.append(mail);
      const actions = el("div", "qnf-actions");
      actions.append(linkEl(c.calendly, true), linkEl(c.form));
      const social = el("div", "qnw-links");
      for (const s of c.social) social.append(linkEl(s));
      return [
        el("p", "qnf-lede", COPY.buzonLede[lang]),
        el("p", "qnf-label", COPY.email[lang]),
        mailP,
        actions,
        el("p", "qnf-label", COPY.social[lang]),
        social,
      ];
    },
  };

  return {
    open(room) {
      if (room === "mesa") {
        // The passport booklet is its own dialog (ambient/passport.ts): press its button.
        const btn = document.querySelector<HTMLButtonElement>(".qn-passport-button");
        if (!btn) return false;
        btn.click();
        return true;
      }
      section?.style.setProperty("--qnf-accent", ROOM_DYE[room]);
      panel.kicker.textContent = `Wasi · ${roomStamp(room).label[lang]}`;
      panel.title.textContent = COPY.title[room][lang];
      panel.body.replaceChildren(...render[room]());
      panel.body.scrollTop = 0;
      panel.open();
      return true;
    },
    isOpen: () => panel.isOpen(),
    close() {
      if (!panel.isOpen()) return false;
      panel.close();
      return true;
    },
    dispose() {
      panel.layer.removeEventListener("keydown", onKey);
      panel.dispose();
    },
  };
}
