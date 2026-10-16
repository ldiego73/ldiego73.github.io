/**
 * Colcas: the cliff-side stone granaries that give the canyon its name, here one per stage of the owner's
 * career (./../content.ts colcaStages, from src/data/career.ts), each storing that stage's knots, its
 * achievements. Beside the road on the rim, north of it, a stepped rock face (./colcas/logic.ts TIERS) rises
 * from a small paved plaza; the colcas stand on its ledges, oldest stage bottom-left, newest top-right. Every
 * colca is a stone-and-mud box with a small window and a cord hanging from it with one knot per achievement
 * in the stage's dye (a khipu on the granary, the way the Inca accounted for what each colca held).
 *
 * On the plaza, "E · Abrir las colcas" opens the panel (../../ambient/fields/panel.ts): kicker "Colca n de N ·
 * Company", the role as title, years and place, the stage summary, its knots (achievements, with the metric
 * when there is one) and its stack; ←/→ (or the buttons) move between colcas, and the list picks one. The
 * open colca's window glows. Education (the master's) is marked as such.
 *
 * Draw calls: the cliff and the plaza paving 1, the colcas with their cords 1, the sign 1, the glow 1 while
 * open. The cliff is a collider band; fauna keeps out of the plaza.
 */
import * as THREE from "three";
import { createFieldPanel, el } from "../../ambient/fields/panel";
import type { CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { vertexToon } from "../../merge-colors";
import { DYE, glowSprite } from "../../props";
import type { SuyuEnv } from "../../suyu/contract";
import { colcaStages, span } from "../content";
import { signBoard, VKit } from "../kit";
import type { ColcaLayout } from "../layout";
import { CRAG_LINE_Z } from "../plan";
import { atPlaza, colcaSlots, knotDrops, step, TIERS } from "./colcas/logic";
import "../colca.css";

const S = {
  prompt: { es: "E · Abrir las colcas", en: "E · Open the colcas" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
  kicker: { es: "Colca {n} de {total} · {company}", en: "Colca {n} of {total} · {company}" },
  knots: { es: "Lo que guarda · logros", en: "What it holds · achievements" },
  stack: { es: "Con qué", en: "With" },
  edu: {
    es: "Formación: el máster cuelga del khipu junto a la carrera, como en la portada del sitio.",
    en: "Education: the master's hangs on the khipu with the career, as on the site's home page.",
  },
  prev: { es: "Anterior", en: "Previous" },
  next: { es: "Siguiente", en: "Next" },
  all: { es: "Todas las colcas", en: "All the colcas" },
  note: {
    es: "Las colcas eran los depósitos de piedra del Tawantinsuyu: guardaban maíz, papa y chuño, y se contaban con khipus. El valle del Colca toma de ellas su nombre.",
    en: "Colcas were the stone storehouses of the Tawantinsuyu: they kept maize, potatoes and chuño, and were accounted for with khipus. The Colca valley takes its name from them.",
  },
  sign: { es: "COLCAS", en: "COLCAS" },
  signSub: { es: "Los logros de cada etapa", en: "The achievements of each stage" },
} satisfies Record<string, L>;

const STONE = ["#e2cfb2", "#d6c2a4", "#e8d6bb"];
const ROCK = ["#b7967e", "#a98a74", "#c2a089", "#ae8f78"];

export const create: CreateAmbient = (baseEnv, hudRoot) => {
  const env = baseEnv as SuyuEnv;
  const layout = env.suyu.layout as ColcaLayout;
  const lang = env.lang;
  const T = (l: L) => l[lang];
  const stages = colcaStages();
  const slots = colcaSlots(stages.length);
  const plaza = layout.plaza("colcas");
  // Frame: on the cliff foot north of the plaza, facing the road (+z, yaw 0).
  const lineZ = CRAG_LINE_Z;
  const O = new THREE.Vector3(plaza.x, plaza.y, lineZ);

  // ------------------------------------------------------------------ cliff + plaza (one mesh)
  let seed = 0xc01c;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const cliff = new VKit().at(O.x, O.y, O.z);
  TIERS.forEach((tier, k) => {
    const prevTop = k ? (TIERS[k - 1] as (typeof TIERS)[number]).top : -3;
    for (let x = -tier.half; x < tier.half; ) {
      const w = 2.4 + rand() * 3.4;
      const h = tier.top - prevTop + (rand() - 0.3) * 0.6;
      // Blocks reach back into the mesa; their fronts jitter so the face is not a ruler line.
      const front = -tier.back + (rand() - 0.5) * 0.5;
      cliff.box(
        w + 0.3,
        h,
        14,
        x + w / 2,
        prevTop,
        front - 7,
        ROCK[Math.floor(rand() * ROCK.length)] as string,
        (rand() - 0.5) * 0.08,
      );
      x += w;
    }
  });
  // A few fallen boulders at the foot.
  for (let i = 0; i < 7; i++)
    cliff.rock(0.5 + rand() * 0.8, (rand() - 0.5) * 40, -0.2, 1 + rand() * 1.2, "#8a7464", rand);
  // Plaza: a ring of set stones and a paved disc (local, relative to the cliff frame).
  const pz = plaza.z - O.z;
  cliff.cyl(plaza.r, plaza.r, 0.12, plaza.x - O.x, -0.06, pz, "#b9a888", 24);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 14)
    cliff.box(1.0, 0.22, 0.45, plaza.x - O.x + Math.sin(a) * plaza.r, -0.05, pz + Math.cos(a) * plaza.r, "#8e8474", a);
  const cliffGeo = cliff.build();

  // ------------------------------------------------------------------ colcas + cords (one mesh)
  const colcaKit = new VKit().at(O.x, O.y, O.z);
  const windows: THREE.Vector3[] = [];
  for (const sl of slots) {
    const st = stages[sl.index];
    if (!st) continue;
    const c = STONE[sl.index % STONE.length] as string;
    const w = 2.1;
    const h = 2.4;
    colcaKit.box(w, h, 1.5, sl.x, sl.y, sl.z, c);
    // Mud-plastered upper band and a flat slab roof with an overhang.
    colcaKit.box(w + 0.04, 0.35, 1.52, sl.x, sl.y + h - 0.45, sl.z, "#b9a283");
    colcaKit.box(w + 0.5, 0.18, 1.9, sl.x, sl.y + h, sl.z + 0.1, "#7c6b5a");
    // Window: a dark square opening on the front face, with a stone lintel.
    const wy = sl.y + h * 0.6;
    colcaKit.box(0.5, 0.52, 0.06, sl.x, wy - 0.26, sl.z + 0.75, "#2a211b");
    colcaKit.box(0.8, 0.12, 0.12, sl.x, wy + 0.27, sl.z + 0.78, "#6e5f50");
    windows.push(new THREE.Vector3(O.x + sl.x, O.y + wy, O.z + sl.z + 0.95));
    // The cord with one knot per achievement, in the stage's dye.
    const dye = DYE[st.stage.dye] ?? "#dda63c";
    const len = Math.min(1.9, sl.y + 0.2);
    colcaKit.cyl(0.035, 0.035, len, sl.x + 0.45, wy - 0.3 - len, sl.z + 0.8, dye, 5);
    for (const d of knotDrops(st.knots.length, len))
      colcaKit.sphere(0.085, sl.x + 0.45, wy - 0.3 - d, sl.z + 0.8, dye, 1, 1.2, 6);
  }
  const colcaGeo = colcaKit.build();

  const mat = vertexToon();
  const cliffMesh = new THREE.Mesh(cliffGeo, mat);
  cliffMesh.name = "colca-colcas:cliff";
  cliffMesh.castShadow = true;
  cliffMesh.receiveShadow = true;
  const colcaMesh = new THREE.Mesh(colcaGeo, mat);
  colcaMesh.name = "colca-colcas:granaries";
  colcaMesh.castShadow = true;
  colcaMesh.receiveShadow = true;
  env.scene.add(cliffMesh, colcaMesh);

  const sign = signBoard(env.toon as (c: string) => THREE.Material, {
    w: 2.6,
    title: T(S.sign),
    sub: T(S.signSub),
    stone: true,
  });
  // On the plaza's road side, left of the way in, facing the road.
  sign.mesh.position.set(plaza.x - 4.2, plaza.y + 1.0, plaza.z + 3.6);
  sign.mesh.rotation.y = 0.35;
  env.scene.add(sign.mesh);
  const glow = glowSprite(env, "#ffd27a", 2.6);
  glow.visible = false;
  env.scene.add(glow);

  // The cliff blocks walking into it (a band of box colliders along its foot).
  env.addCollider({ kind: "box", x0: O.x - 24, x1: O.x + 24, z0: O.z - 40, z1: O.z + 0.4 });
  const keep = creatures.keepOut(plaza.x, plaza.z, plaza.r + 1);

  // ------------------------------------------------------------------ panel
  let current = 0;
  const panel = createFieldPanel(hudRoot, {
    name: "colcas",
    closeLabel: T(S.closeAria),
    onNav: (dir) => show(step(current, dir, stages.length)),
  });
  panel.layer.classList.add("qnk", "qnk-colcas");
  const meta = el("p", "qnf-meta");
  const summary = el("p", "qnf-lede");
  const knotsLabel = el("p", "qnf-label", T(S.knots));
  const knots = el("ul", "qnk-knots");
  const stackLabel = el("p", "qnf-label", T(S.stack));
  const stack = el("ul", "qnf-tags");
  const edu = el("p", "qnf-note", T(S.edu));
  const nav = el("div", "qnf-nav");
  const prev = el("button", "qnf-btn", "←");
  prev.type = "button";
  prev.setAttribute("aria-label", T(S.prev));
  const next = el("button", "qnf-btn", "→");
  next.type = "button";
  next.setAttribute("aria-label", T(S.next));
  const counter = el("span");
  nav.append(prev, counter, next);
  prev.addEventListener("click", () => show(step(current, -1, stages.length)));
  next.addEventListener("click", () => show(step(current, 1, stages.length)));
  const allLabel = el("p", "qnf-label", T(S.all));
  const picks = el("ul", "qnf-picks qnk-picks");
  const pickBtns = stages.map((st, i) => {
    const li = el("li");
    const b = el("button", "qnf-pick");
    b.type = "button";
    b.style.setProperty("--qnf-dot", DYE[st.stage.dye] ?? "#dda63c");
    b.append(
      el("span", "qnf-cord"),
      el("span", "qnf-pick-title", st.company.name),
      el("time", undefined, st.stage.start.slice(0, 4)),
    );
    b.addEventListener("click", () => show(i));
    li.append(b);
    picks.append(li);
    return b;
  });
  panel.body.append(
    meta,
    summary,
    knotsLabel,
    knots,
    stackLabel,
    stack,
    edu,
    nav,
    allLabel,
    picks,
    el("p", "qnf-note", T(S.note)),
  );

  function show(i: number) {
    current = i;
    const st = stages[i];
    if (!st) return;
    panel.kicker.textContent = T(S.kicker)
      .replace("{n}", String(i + 1))
      .replace("{total}", String(stages.length))
      .replace("{company}", st.company.name);
    panel.title.textContent = T(st.stage.role);
    meta.textContent = `${span(st.stage.start, st.stage.end, lang)} · ${T(st.stage.place)}`;
    summary.textContent = T(st.stage.summary);
    knots.replaceChildren(
      ...st.knots.map((k) => {
        const li = el("li");
        li.style.setProperty("--qnf-dot", DYE[st.stage.dye] ?? "#dda63c");
        if (k.metric) li.append(el("strong", "qnk-metric", k.metric));
        li.append(el("span", undefined, T(k.text)));
        return li;
      }),
    );
    const tags = st.stage.stack ?? [];
    stackLabel.hidden = !tags.length;
    stack.hidden = !tags.length;
    stack.replaceChildren(...tags.map((t) => el("li", undefined, t)));
    edu.hidden = !st.education;
    counter.textContent = `${i + 1} / ${stages.length}`;
    pickBtns.forEach((b, k) => {
      b.setAttribute("aria-pressed", String(k === i));
    });
    const w = windows[i];
    if (w) glow.position.copy(w);
  }

  let near = false;
  let t = 0;
  return {
    update(dt, avatar) {
      t += dt;
      near = atPlaza(avatar, { ...plaza, y: env.heightAt(plaza.x, plaza.z) });
      if (panel.isOpen() && !near) panel.close();
      glow.visible = panel.isOpen();
      if (glow.visible && !env.reducedMotion) glow.scale.setScalar(2.4 + Math.sin(t * 3) * 0.25);
    },
    prompt() {
      if (!near) return null;
      return panel.isOpen() ? T(S.close) : T(S.prompt);
    },
    interact() {
      if (panel.isOpen()) {
        panel.close();
        return true;
      }
      if (!near) return false;
      show(current);
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
      creatures.removeKeepOut(keep);
      cliffMesh.removeFromParent();
      colcaMesh.removeFromParent();
      cliffGeo.dispose();
      colcaGeo.dispose();
      mat.dispose();
      sign.mesh.removeFromParent();
      sign.dispose();
      glow.removeFromParent();
      (glow.material as THREE.SpriteMaterial).dispose();
    },
  };
};
