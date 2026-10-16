/**
 * The five punkus of Haukaypata: one at the end of each street (./punkus/model.ts builds them, ../plan.ts
 * GATES says where they lead and whether they are open). Near an open gate's plaza face, "E · Viajar al …"
 * travels there (../../travel.ts `travelTo`, which emits `world:travel` and fades out; the target page reads
 * `?from=cusco`); within PREFETCH_R its page and chunks are warmed once (`prefetchWorld`). A closed gate shows
 * "{suyu} · Próximamente" and E only answers with a short note (a polite status line): no travel.
 *
 * At night the braziers beside each gate burn (additive glow sprites, no outline; still flames with
 * prefers-reduced-motion). Collisions: the jambs are circle colliders; closed gates also block the doorway;
 * animals keep out of the doorways. Draw calls: stone 1, glimpses 1, signs 1, plus the night glows.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { vertexToon } from "../../merge-colors";
import { glowSprite, offFontsReady, onFontsReady } from "../../props";
import { prefetchWorld, travelTo } from "../../travel";
import { GATES, gatePoint } from "../plan";
import { DOOR, gateAction, gateInRange, gatePrompt, gatesToPrefetch, gateWorld } from "./punkus/logic";
import { buildPunkus } from "./punkus/model";

const SOON = {
  es: "Este camino aún se está trazando. Pronto podrás cruzar este punku.",
  en: "This road is still being laid. Soon you will be able to cross this punku.",
} as const;

export const create: CreateAmbient = (env, hudRoot): Ambient => {
  const lang = env.lang;
  const models = buildPunkus(lang);
  const group = new THREE.Group();
  group.name = "cusco-punkus";
  const stoneMat = vertexToon();
  const stone = new THREE.Mesh(models.stone, stoneMat);
  stone.name = "cusco-punkus:stone";
  stone.castShadow = true;
  stone.receiveShadow = true;
  const glimpseMat = new THREE.MeshBasicMaterial({
    map: models.glimpse.texture,
    transparent: true,
    opacity: 0.97,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const glimpse = new THREE.Mesh(models.glimpse.geometry, glimpseMat);
  glimpse.name = "cusco-punkus:glimpse";
  env.noOutline(glimpse);
  const signMat = env.toon("#ffffff").clone();
  signMat.map = models.signs.texture;
  const signs = new THREE.Mesh(models.signs.geometry, signMat);
  signs.name = "cusco-punkus:signs";
  group.add(stone, glimpse, signs);
  const glows = models.flames.map((f) => {
    const s = glowSprite(env, f.open ? "#ffb35c" : "#ff9a4a", 2.2);
    s.position.set(f.x, f.y, f.z);
    s.visible = false;
    group.add(s);
    return s;
  });
  env.scene.add(group);
  const redraw = () => models.signs.redraw();
  onFontsReady(redraw);

  // Jambs (two discs a side), and closed doorways.
  const keeps: Array<ReturnType<typeof creatures.keepOut>> = [];
  for (const g of GATES) {
    for (const side of [-1, 1])
      for (const lz of [-0.45, 0.45]) {
        const p = gateWorld(g, side * (DOOR.bottom / 2 + 0.75), lz);
        env.addCollider({ kind: "circle", x: p.x, z: p.z, r: 0.7 });
      }
    if (gateAction(g).kind === "soon") {
      const p = gateWorld(g, 0, 0);
      env.addCollider({ kind: "circle", x: p.x, z: p.z, r: 1.45 });
    }
    const [gx, gz] = gatePoint(g);
    keeps.push(creatures.keepOut(gx, gz, 4));
  }

  // Status line for the closed gates' note.
  const note = document.createElement("p");
  note.className = "kw-map-toast";
  note.setAttribute("role", "status");
  note.hidden = true;
  hudRoot.append(note);
  let noteTimer = 0;

  const prefetched = new Set<string>();
  let near: (typeof GATES)[number] | null = null;
  let busy = false;
  let lastNight: boolean | null = null;

  return {
    update(_dt, avatar, t) {
      near = busy ? null : gateInRange(avatar.x, avatar.z);
      for (const g of gatesToPrefetch(avatar.x, avatar.z)) {
        if (prefetched.has(g.id)) continue;
        prefetched.add(g.id);
        const a = gateAction(g);
        if (a.kind === "travel") prefetchWorld(lang, a.to);
      }
      const night = env.sky.isNight();
      if (night !== lastNight) {
        lastNight = night;
        for (const s of glows) s.visible = night;
      }
      if (night && !env.reducedMotion)
        glows.forEach((s, i) => {
          s.scale.setScalar(2.1 + Math.sin(t * 7.3 + i * 1.7) * 0.18 + Math.sin(t * 13 + i) * 0.08);
        });
    },
    prompt: () => (near ? gatePrompt(near, lang) : null),
    interact() {
      if (!near) return false;
      const a = gateAction(near);
      if (a.kind === "travel") {
        busy = true;
        travelTo(lang, "cusco", a.to);
        return true;
      }
      note.textContent = SOON[lang];
      note.hidden = false;
      note.classList.remove("is-out");
      clearTimeout(noteTimer);
      noteTimer = window.setTimeout(() => {
        note.classList.add("is-out");
        noteTimer = window.setTimeout(() => {
          note.hidden = true;
        }, 600);
      }, 3600);
      return true;
    },
    dispose() {
      clearTimeout(noteTimer);
      offFontsReady(redraw);
      note.remove();
      for (const k of keeps) creatures.removeKeepOut(k);
      group.removeFromParent();
      models.stone.dispose();
      models.glimpse.geometry.dispose();
      models.glimpse.texture.dispose();
      models.signs.geometry.dispose();
      models.signs.texture.dispose();
      stoneMat.dispose();
      glimpseMat.dispose();
      signMat.dispose();
      for (const s of glows) (s.material as THREE.SpriteMaterial).dispose();
    },
  };
};
