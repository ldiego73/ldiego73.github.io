/**
 * Tambo exhibits: beside every company tambo (on the side opposite its khipu frame) stands one object
 * built from that company's real stack, e.g. Auna's server rack at 99.9% SLA, TopSort's event queues,
 * Belcorp's gateway doorway with the Lua plugin chip. "E · Ver logro" opens a small panel with ONE knot
 * from src/data/career.ts (text, metric, role, period). The prompt range is kept outside content's
 * khipu spot (see exhibits/logic.ts) so it never steals E from the tambo.
 */
import * as THREE from "three";
import { type CreateAmbient, STATIONS } from "../contract";
import { DYE } from "../props";
import { type Achievement, achievementOf, exhibitLayout, inExhibitRange, period } from "./exhibits/logic";
import { buildExhibit, type ExhibitModel, exhibitRadius } from "./exhibits/models";
import { createXPanel, h } from "./exhibits/panel";

interface Item {
  id: string;
  model: ExhibitModel;
  ach: Achievement;
  x: number;
  z: number;
  anchor: { x: number; z: number };
  focus: { x: number; z: number };
  near: boolean;
}

const COPY = {
  prompt: { es: "E · Ver logro", en: "E · See achievement" },
  kicker: { es: "Logro", en: "Achievement" },
  role: { es: "Rol", en: "Role" },
  period: { es: "Periodo", en: "Period" },
  place: { es: "Lugar", en: "Place" },
  stack: { es: "Stack", en: "Stack" },
  close: { es: "Cerrar", en: "Close" },
} as const;

const NEAR = 70;

export const create: CreateAmbient = (env, hudRoot) => {
  const lang = env.lang;
  const items: Item[] = [];
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  for (const st of STATIONS) {
    if (st.kind !== "company" || !st.companyId) continue;
    const tambo = env.scene.getObjectByName(`tambo:${st.id}`);
    const ach = achievementOf(st.companyId);
    if (!tambo || !ach) continue;
    const kx = tambo.getObjectByName("khipu")?.position.x ?? 2.2;
    const r = exhibitRadius(st.companyId);
    const lay = exhibitLayout(kx, r);
    const model = buildExhibit(env, st.companyId, { lang, low: env.quality === "low", rm: env.reducedMotion });
    if (!model) continue;
    tambo.updateMatrixWorld(true);
    const toWorld = (x: number, z: number) => {
      tambo.localToWorld(v.set(x, 0, z));
      return { x: v.x, z: v.z };
    };
    const c = toWorld(lay.center.x, lay.center.z);
    const anchor = toWorld(lay.anchor.x, lay.anchor.z);
    const focus = toWorld(lay.focus.x, lay.focus.z);
    const plaza = toWorld(0, 1.8);
    tambo.getWorldQuaternion(q);
    e.setFromQuaternion(q, "YXZ");
    model.group.position.set(c.x, env.heightAt(c.x, c.z), c.z);
    model.group.rotation.y = e.y + lay.turn;
    env.scene.add(model.group);
    // Walkable pad joining the plaza to the viewing spot; the object itself is solid.
    env.addWalkable({ kind: "circle", x: anchor.x, z: anchor.z, r: 1.4 });
    env.addWalkable({ kind: "circle", x: (anchor.x + plaza.x) / 2, z: (anchor.z + plaza.z) / 2, r: 1.3 });
    // Wide exhibits get a short chain of circles along their local x axis.
    const yaw = model.group.rotation.y;
    for (const k of r >= 1.15 ? [-0.5, 0, 0.5] : [0]) {
      const x = c.x + Math.cos(yaw) * k * r;
      const z = c.z - Math.sin(yaw) * k * r;
      env.addCollider({ kind: "circle", x, z, r: r >= 1.15 ? r * 0.6 : r * 0.85 });
    }
    items.push({ id: st.id, model, ach, x: c.x, z: c.z, anchor, focus, near: true });
  }

  const panel = createXPanel(hudRoot, { name: "exhibit", closeLabel: COPY.close[lang], lang });
  let active: Item | null = null;
  let shown: Item | null = null;

  const render = (it: Item) => {
    const { company, stage, knot } = it.ach;
    (panel.body.parentElement?.parentElement as HTMLElement | null)?.style.setProperty("--qnx-dye", DYE[stage.dye]);
    panel.kicker.textContent = `${COPY.kicker[lang]} · ${stage.role[lang]}`;
    panel.title.textContent = company.name;
    const out: HTMLElement[] = [];
    if (knot.metric) {
      const m = h("p", "qnx-metric");
      m.append(h("b", undefined, knot.metric));
      out.push(m);
    }
    out.push(h("p", "qnx-text", knot.text[lang]));
    const dl = h("dl", "qnx-meta");
    const row = (k: string, val: string) => dl.append(h("dt", undefined, k), h("dd", undefined, val));
    row(COPY.role[lang], stage.role[lang]);
    row(COPY.period[lang], period(stage, lang));
    row(COPY.place[lang], stage.place[lang]);
    if (stage.stack?.length) row(COPY.stack[lang], stage.stack.join(" · "));
    out.push(dl);
    panel.body.replaceChildren(...out);
    shown = it;
  };

  return {
    update(_dt, avatar, t) {
      active = null;
      let best = Infinity;
      for (const it of items) {
        const d = Math.hypot(it.x - avatar.x, it.z - avatar.z);
        const near = d < NEAR;
        if (near !== it.near) {
          it.near = near;
          for (const o of it.model.moving) o.visible = near;
        }
        if (!near) continue;
        it.model.update(t);
        if (d < best && inExhibitRange(avatar.x, avatar.z, it.anchor, it.focus)) {
          best = d;
          active = it;
        }
      }
    },
    prompt: () => (active ? COPY.prompt[lang] : null),
    interact() {
      if (!active) return false;
      if (panel.isOpen() && shown === active) {
        panel.close();
        return true;
      }
      render(active);
      panel.open();
      return true;
    },
    escape() {
      if (!panel.isOpen()) return false;
      panel.close();
      return true;
    },
    dispose() {
      panel.dispose();
      for (const it of items) it.model.dispose();
      items.length = 0;
    },
  };
};
