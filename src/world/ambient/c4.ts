/**
 * C4 in 3D on the Artifact Bridge (Q'eswachaka): beside every artifact cord that bridge.ts ties to the
 * railing, a tabletop maquette swings up outside the opposite railing when the traveler approaches and
 * folds away when they leave. Each maquette is a C4 container-style diagram built only from that
 * artifact's tech string and uses (c4/diagrams.ts). "E · Ver arquitectura" opens a panel with the
 * artifact summary and a legend. Maquettes are built lazily on first approach and disposed when far.
 */
import * as THREE from "three";
import { ARTIFACTS, type Artifact } from "../../data/career";
import type { CreateAmbient } from "../contract";
import { DYE } from "../props";
import { diagramFor, KIND_LEGEND, labelText, usedKinds } from "./c4/diagrams";
import { BOARD_D, buildMaquette, kindColor, MAQ_SCALE, type Maquette } from "./c4/maquette";
import { createXPanel, h } from "./exhibits/panel";

interface Spot {
  art: Artifact;
  /** Deck point at the cord (world). */
  p: THREE.Vector3;
  tan: THREE.Vector3;
  right: THREE.Vector3;
  side: 1 | -1;
  maq: Maquette | null;
  progress: number;
  open: boolean;
}

const COPY = {
  prompt: { es: "E · Ver arquitectura", en: "E · See architecture" },
  kicker: { es: "Arquitectura · C4 contenedores", en: "Architecture · C4 containers" },
  legend: { es: "Leyenda", en: "Legend" },
  arrow: {
    es: "Relación: el flujo va del puente hacia afuera y sube un andén por columna",
    en: "Relation: the flow runs outward from the bridge, one terrace up per column",
  },
  boundary: { es: "Límite", en: "Boundary" },
  hint: {
    es: "La maqueta junto a la cuerda sube un andén por cada columna del diagrama.",
    en: "The maquette beside the cord climbs one terrace per diagram column.",
  },
  close: { es: "Cerrar", en: "Close" },
} as const;

/** The nearest cord's maquette unfolds within OPEN_R and folds beyond CLOSE_R; build lazily inside BUILD_R, dispose past DROP_R. */
const OPEN_R = 3.4;
const CLOSE_R = 4.2;
const BUILD_R = 6;
const DROP_R = 32;
const PROMPT_R = 1.6;
const UNFOLD_S = 1.3;

export const create: CreateAmbient = (env, hudRoot) => {
  const lang = env.lang;
  const spots: Spot[] = [];
  let located = false;
  let scale = MAQ_SCALE;
  let tries = 0;
  const up = new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4();
  const deckW = THREE.MathUtils.clamp(env.trail.halfWidth * 0.75, 1.3, 2.0);

  /** Finds bridge.ts's cord groups (bridge > inner > unnamed Group per artifact, in ARTIFACTS order; the merged deck is a Group named "bridge-deck"). */
  const locate = () => {
    tries++;
    const bridge = env.scene.getObjectByName("bridge");
    const inner = bridge?.children[0];
    if (!inner) return;
    const cords = inner.children.filter((c) => c.type === "Group" && !c.name.startsWith("bridge-deck"));
    if (cords.length !== ARTIFACTS.length) return;
    bridge?.updateMatrixWorld(true);
    const out = new THREE.Vector3();
    cords.forEach((cord, i) => {
      const art = ARTIFACTS[i]!;
      if (!diagramFor(art.id)) return;
      const tie = cord.getWorldPosition(new THREE.Vector3());
      cord.getWorldDirection(out);
      out.y = 0;
      out.normalize();
      const p = tie.clone().addScaledVector(out, -(deckW / 2 + 0.04));
      p.y = tie.y - 0.95;
      const tan = env.trail.tangentAt(env.trail.nearestT(p.x, p.z), new THREE.Vector3());
      tan.y = 0;
      tan.normalize();
      const right = new THREE.Vector3(-tan.z, 0, tan.x);
      // Always on the climber's right: content's artifact panel covers the left of the screen.
      const side: 1 | -1 = 1;
      spots.push({ art, p, tan, right, side, maq: null, progress: 0, open: false });
    });
    located = spots.length > 0;
    // Neighbouring maquettes (all on the right) must not overlap: fit the board's depth in the spacing.
    let gap = Infinity;
    for (let i = 1; i < spots.length; i++) gap = Math.min(gap, spots[i]!.p.distanceTo(spots[i - 1]!.p));
    scale = Number.isFinite(gap) ? Math.min(MAQ_SCALE, (gap * 0.9) / BOARD_D) : MAQ_SCALE;
  };
  locate();

  const build = (s: Spot) => {
    const d = diagramFor(s.art.id);
    if (!d) return;
    const m = buildMaquette(env, d, s.art, {
      lang,
      side: s.side,
      hingeZ: deckW / 2 + 0.34,
      scale,
      low: env.quality === "low",
      rm: env.reducedMotion,
    });
    basis.makeBasis(s.tan, up, s.right);
    m.group.quaternion.setFromRotationMatrix(basis);
    m.group.position.set(s.p.x, s.p.y + 0.62, s.p.z);
    env.scene.add(m.group);
    s.maq = m;
  };

  const panel = createXPanel(hudRoot, { name: "c4", closeLabel: COPY.close[lang], lang });
  let active: Spot | null = null;
  let shown: Spot | null = null;

  const render = (s: Spot) => {
    const a = s.art;
    const d = diagramFor(a.id);
    const dye = DYE[a.dye];
    (panel.body.parentElement?.parentElement as HTMLElement | null)?.style.setProperty("--qnx-dye", dye);
    panel.kicker.textContent = COPY.kicker[lang];
    panel.title.textContent = a.name[lang];
    const out: HTMLElement[] = [h("p", "qnx-tech", a.tech), h("p", "qnx-text", a.summary[lang])];
    if (d) {
      out.push(h("h3", "qnx-h3", COPY.legend[lang]));
      const ul = h("ul", "qnx-legend");
      for (const k of usedKinds(d)) {
        const li = h("li");
        const sw = h("span", "qnx-sw");
        sw.style.background = kindColor(k, dye);
        sw.setAttribute("aria-hidden", "true");
        const names = d.nodes.filter((n) => n.kind === k).map((n) => labelText(n.label, lang));
        const txt = h("span", undefined, `${KIND_LEGEND[k][lang]} `);
        txt.append(h("small", undefined, `· ${names.join(", ")}`));
        li.append(sw, txt);
        ul.append(li);
      }
      if (d.boundary) {
        const li = h("li");
        const sw = h("span", "qnx-sw is-boundary");
        sw.setAttribute("aria-hidden", "true");
        li.append(sw, h("span", undefined, `${COPY.boundary[lang]}: ${d.boundary.label[lang]}`));
        ul.append(li);
      }
      const li = h("li");
      const sw = h("span", "qnx-sw is-arrow");
      sw.setAttribute("aria-hidden", "true");
      li.append(sw, h("span", undefined, COPY.arrow[lang]));
      ul.append(li);
      out.push(ul, h("p", "qnx-hint", COPY.hint[lang]));
    }
    panel.body.replaceChildren(...out);
    shown = s;
  };

  return {
    update(dt, avatar, t) {
      if (!located) {
        // bridge.ts is content's; ambients load after content, but retry a few frames just in case.
        if (tries < 120) locate();
        if (!located) return;
      }
      active = null;
      let best = PROMPT_R;
      let built = false;
      // Only the nearest cord's maquette unfolds (neighbours are ~3 u apart).
      let nearest: Spot | null = null;
      let nd = Infinity;
      for (const s of spots) {
        const d = Math.hypot(s.p.x - avatar.x, s.p.z - avatar.z);
        if (d < nd) {
          nd = d;
          nearest = s;
        }
      }
      for (const s of spots) {
        const d = Math.hypot(s.p.x - avatar.x, s.p.z - avatar.z);
        if (!s.maq && d < BUILD_R && !built) {
          build(s);
          built = true;
        }
        if (s.maq && d > DROP_R) {
          s.maq.dispose();
          s.maq = null;
          s.progress = 0;
          s.open = false;
          continue;
        }
        if (s !== nearest) s.open = false;
        else if (d < OPEN_R) s.open = true;
        else if (d > CLOSE_R) s.open = false;
        if (s.maq) {
          const target = s.open ? 1 : 0;
          if (env.reducedMotion) s.progress = target;
          else if (s.progress !== target) {
            const step = dt / UNFOLD_S;
            s.progress = target > s.progress ? Math.min(1, s.progress + step) : Math.max(0, s.progress - step * 1.4);
          }
          s.maq.set(s.progress);
          if (s.progress > 0) s.maq.update(t, env.camera);
        }
        if (d < best) {
          best = d;
          active = s;
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
      for (const s of spots) s.maq?.dispose();
      spots.length = 0;
    },
  };
};
