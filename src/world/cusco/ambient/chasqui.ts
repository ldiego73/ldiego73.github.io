/**
 * Chasqui post of Qusqu: a small stone shelter with a thatched lean-to roof against the south wall of the
 * plaza (../plan.ts CHASQUI), with a stone bench, a pututu (conch trumpet) and a bundle of message khipus.
 * The chasqui who waits on the bench is one of the hub's people (./life.ts places them).
 *
 * "E · Hablar con el chasqui" in front of it opens the contact card, the same facts as the mountain's
 * chasqui post (../../hud.ts contact): SITE email (copy), Calendly (book 60 min), the CV and the socials.
 * The shelter is one collider box; one vertex-coloured mesh.
 */
import * as THREE from "three";
import { SITE, SOCIALS } from "../../../data/site";
import { createFieldPanel, el, linkButton } from "../../ambient/fields/panel";
import type { Ambient, CreateAmbient, L } from "../../contract";
import { flattenToonGroup, vertexToon } from "../../merge-colors";
import { Kit, rng, thatchRoof } from "../../props";
import { CHASQUI, stationSpot } from "../plan";
import "./khipu/khipu.css";

const S = {
  kicker: { es: "Puesto del chasqui", en: "Chasqui post" },
  lede: {
    es: "Los chasquis corrían los caminos del Tawantinsuyu llevando mensajes. Este lleva el tuyo: escríbeme, agenda una conversación o descarga mi CV.",
    en: "Chasquis ran the roads of the Tawantinsuyu carrying messages. This one carries yours: write to me, book a conversation or download my resume.",
  },
  book: { es: "Agendar 60 min", en: "Book 60 min" },
  copy: { es: "Copiar correo", en: "Copy email" },
  copied: { es: "Correo copiado", en: "Email copied" },
  cv: { es: "Descargar CV", en: "Download resume" },
  prompt: { es: "E · Hablar con el chasqui", en: "E · Talk to the chasqui" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
} satisfies Record<string, L>;

const PROMPT_R = 2.8;

export const create: CreateAmbient = (env, hudRoot): Ambient => {
  const lang = env.lang;
  const T = (l: L) => l[lang];
  const rand = rng(0xc4a5);

  // ------------------------------------------------------------------ shelter (local: +z toward the plaza)
  const group = new THREE.Group();
  group.name = "cusco-chasqui";
  group.position.set(CHASQUI.x, 0, CHASQUI.z);
  group.rotation.y = CHASQUI.yaw;
  const k = new Kit(env);
  const hw = CHASQUI.w / 2;
  const hd = CHASQUI.d / 2;
  const h = 2.1;
  // Back and side walls of fitted stones (open front).
  for (let y = 0; y < h - 0.1; y += 0.42) {
    for (let x = -hw; x < hw - 0.1; ) {
      const l = Math.min(0.55 + rand() * 0.5, hw - x);
      k.box(l - 0.04, 0.38, 0.5, x + l / 2, y, -hd + 0.25, rand() < 0.3 ? "#8c867b" : "#a39d90");
      x += l;
    }
    for (const sx of [-1, 1])
      for (let z = -hd + 0.5; z < hd - 0.1; ) {
        const l = Math.min(0.5 + rand() * 0.45, hd - z);
        k.box(0.5, 0.38, l - 0.04, sx * (hw - 0.25), y, z + l / 2, rand() < 0.3 ? "#8c867b" : "#a39d90");
        z += l;
      }
  }
  thatchRoof(k, rand, CHASQUI.w - 0.2, CHASQUI.d - 0.2, h, 1.3);
  // Bench, pututu and the message khipus on a peg.
  k.box(2.2, 0.45, 0.6, -0.2, 0, -hd + 0.85, "#958f83");
  k.cyl(0.02, 0.13, 0.42, 1.05, 0.45, -hd + 0.8, "#efe2c8", 7, 0, Math.PI / 2 - 0.2);
  k.cyl(0.06, 0.06, 0.08, 1.24, 0.45 + 0.21, -hd + 0.8, "#d98f6a", 7);
  k.box(0.9, 0.06, 0.06, 0.2, 1.65, -hd + 0.52, "#5e3b22");
  ["#c4383f", "#dda63c", "#2a9d8f", "#3446a6", "#efe6d6"].forEach((c, i) => {
    k.box(0.03, 0.55 + (i % 2) * 0.12, 0.03, -0.12 + i * 0.12, 1.08 - (i % 2) * 0.12, -hd + 0.55, c);
  });
  const built = k.build("cusco-chasqui");
  const mat = vertexToon();
  flattenToonGroup(built, mat);
  group.add(built);
  env.scene.add(group);
  env.addCollider({
    kind: "box",
    x0: CHASQUI.x - hw - 0.05,
    x1: CHASQUI.x + hw + 0.05,
    z0: CHASQUI.z - hd - 0.05,
    z1: CHASQUI.z + hd + 0.4,
  });

  // ------------------------------------------------------------------ contact card
  const panel = createFieldPanel(hudRoot, { name: "chasqui", closeLabel: T(S.closeAria) });
  panel.layer.classList.add("qnc");
  panel.kicker.textContent = T(S.kicker);
  panel.title.textContent = SITE.name;
  const lede = el("p", "qnf-lede", T(S.lede));
  const actions = el("div", "qnf-actions");
  const copy = el("button", "qnf-btn", T(S.copy));
  copy.type = "button";
  copy.addEventListener("click", () => {
    const done = () => {
      copy.textContent = T(S.copied);
    };
    if (navigator.clipboard?.writeText)
      navigator.clipboard.writeText(SITE.email).then(done, () => location.assign(`mailto:${SITE.email}`));
    else location.assign(`mailto:${SITE.email}`);
  });
  const cv = linkButton(SITE.resume[lang], T(S.cv), false);
  cv.setAttribute("download", "");
  actions.append(linkButton(SITE.calendly, T(S.book), true, true), copy, cv);
  const mail = el("p", "qnc-email");
  const mailA = el("a", undefined, SITE.email);
  mailA.href = `mailto:${SITE.email}`;
  mail.append(mailA);
  const socials = el("ul", "qnc-socials");
  for (const s of SOCIALS.filter((x) => !x.url.startsWith("mailto:"))) {
    const li = el("li");
    const a = el("a", undefined, s.name);
    a.href = s.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    li.append(a);
    socials.append(li);
  }
  panel.body.append(lede, actions, mail, socials);

  const spot = stationSpot("chasqui") ?? { x: CHASQUI.x, z: CHASQUI.z - 3 };
  let near = false;
  return {
    update(_dt, avatar) {
      const d = Math.hypot(avatar.x - spot.x, avatar.z - spot.z);
      near = d < PROMPT_R;
      if (panel.isOpen() && d > PROMPT_R + 6) panel.close();
    },
    prompt() {
      if (panel.isOpen()) return near ? T(S.close) : null;
      return near ? T(S.prompt) : null;
    },
    interact() {
      if (panel.isOpen()) {
        panel.close();
        return true;
      }
      if (!near) return false;
      copy.textContent = T(S.copy);
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
      group.removeFromParent();
      built.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      mat.dispose();
    },
  };
};
