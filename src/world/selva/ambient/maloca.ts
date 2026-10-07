/**
 * Maloca de relatos · Blog (station "maloca", kind blog): a big round communal maloca behind the plaza, its
 * conical palm-thatch roof reaching almost to the ground over a low bark wall, four tall house posts, benches
 * in a ring around a fire, and on the wall painted bark cloths (llanchama): one per post, newest first, at most
 * ten, achiote red for the site's blog and huito indigo-black for Medium (maloca/logic.ts). Walking inside
 * fades the roof so the camera sees in. Inside, a clear circular aisle runs between the bench ring and the
 * wall (maloca/logic.ts sizes it), so the traveler can walk all the way round past every cloth; standing in
 * front of one shows "E · Leer: <title>", which opens a paper panel with that post (date, source,
 * description, link) and the list of all cloths; ←/→ browse; a link goes to /{lang}/blog/. Posts come from
 * the page's world data (src/world/data.ts); with none, the walls are bare and the panel says so.
 *
 * Draw calls: walls/benches/posts (one vertex-colored mesh), the roof (one, fadeable), the cloth + sign atlas
 * (one merged mesh), the fire (one unlit flame mesh), the marker.
 */
import * as THREE from "three";
import { createMarker } from "../../ambient/fields/geo";
import { formatDate, safeHref } from "../../ambient/fields/logic";
import { createFieldPanel, el, linkButton } from "../../ambient/fields/panel";
import { fit } from "../../ambient/fields/signs";
import type { CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { worldData } from "../../data";
import { Ease01, FONT, fadeable, Kit, rng } from "../../props";
import type { SelvaEnv } from "../contract";
import {
  A,
  bake,
  coneRoof,
  disposeTree,
  drawCarved,
  signBoards,
  stationCull,
  stationMaterial,
} from "./embarcadero/amazon";
import "./embarcadero/panels.css";
import { at, lxOf, lzOf, nearestSpot, type Spot, stationFrame, stationGroup } from "./embarcadero/station";
import {
  AISLE_R,
  BENCH_R,
  benchAngles,
  type Cloth,
  clothAngles,
  cloths,
  interiorColliders,
  PAINT,
  POST_R,
  POSTS_AT,
  promptTitle,
  SPOT_R,
  WALL_R,
} from "./maloca/logic";

const STATION = "maloca";
const S = {
  kicker: { es: "Maloca de relatos · Blog", en: "Story maloca · Blog" },
  read: { es: "E · Leer: ", en: "E · Read: " },
  look: { es: "E · Ver la maloca", en: "E · Look around" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
  site: { es: "Blog del sitio", en: "Site blog" },
  medium: { es: "Medium", en: "Medium" },
  readPost: { es: "Leer artículo", en: "Read article" },
  blog: { es: "Ver el blog", en: "See the blog" },
  all: { es: "Telas de la maloca", en: "Cloths in the maloca" },
  bareTitle: { es: "Paredes desnudas", en: "Bare walls" },
  bare: {
    es: "Esta vez no llegaron los artículos, así que no hay telas pintadas. Puedes leerlos en el blog.",
    en: "The articles didn't arrive this time, so there are no painted cloths. You can read them on the blog.",
  },
  legend: {
    es: "Rojo achiote: blog del sitio. Negro huito: Medium. La más reciente cuelga junto a la puerta.",
    en: "Achiote red: the site's blog. Huito black: Medium. The newest hangs by the door.",
  },
  board: { es: "MALOCA DE RELATOS · BLOG", en: "STORY MALOCA · BLOG" },
} satisfies Record<string, L>;

/** Maloca centre (local), radius (maloca/logic.ts), wall height, roof eave and apex heights. */
const MC = { x: 0, z: -7.6 };
const R = WALL_R;
const WALL = 1.25;
const EAVE = 1.45;
const APEX = 7.4;
/** Half angle of the door opening (radians, toward +Z: the plaza and the road). */
const DOOR_HALF = 0.3;

export const create: CreateAmbient = (baseEnv, hudRoot) => {
  const env = baseEnv as SelvaEnv;
  const lang = env.lang;
  const T = (l: L) => l[lang];
  const f = stationFrame(env, STATION);
  const rand = rng(0x3a10ca);
  const list = cloths(worldData().posts);
  const angles = clothAngles(list.length);
  // Local position on the ring around the maloca centre (angle 0 = +Z, the door).
  const ring = (a: number, r: number): [number, number] => [MC.x + Math.sin(a) * r, MC.z + Math.cos(a) * r];

  // ------------------------------------------------------------------ build
  const group = stationGroup(f, "selva-maloca");
  const mat = stationMaterial();
  const kit = new Kit(env);
  // Packed earth floor ring (slightly raised so it reads against the plaza) and the low bark wall.
  kit.cyl(R + 0.1, R + 0.15, 0.06, MC.x, -0.02, MC.z, A.mud, 28);
  const segs = 40;
  for (let i = 0; i < segs; i++) {
    const a = ((i + 0.5) / segs) * Math.PI * 2;
    const da = Math.min(a, Math.PI * 2 - a);
    if (da < DOOR_HALF) continue;
    const [x, z] = ring(a, R);
    kit.box((2 * Math.PI * R) / segs + 0.05, WALL, 0.12, x, 0, z, i % 3 ? A.bark : A.weathered, a);
    // Palm-stem posts every other segment.
    if (i % 2 === 0) {
      const [px, pz] = ring(a, R + 0.08);
      kit.cyl(0.07, 0.08, EAVE + 0.1, px, 0, pz, A.wood, 5);
    }
  }
  // Door posts and lintel.
  for (const s of [-1, 1]) {
    const [x, z] = ring(s * DOOR_HALF, R);
    kit.cyl(0.11, 0.12, EAVE + 0.4, x, 0, z, A.woodDark, 6);
  }
  // Four tall house posts with a square of beams under the roof.
  const posts: Array<[number, number]> = [];
  for (const a of POSTS_AT) {
    const [x, z] = ring(a, POST_R);
    posts.push([x, z]);
    kit.cyl(0.16, 0.2, 5.0, x, 0, z, A.woodDark, 7);
  }
  for (let i = 0; i < 4; i++) {
    const a = posts[i] as [number, number];
    const b = posts[(i + 1) % 4] as [number, number];
    kit.stick(new THREE.Vector3(a[0], 4.8, a[1]), new THREE.Vector3(b[0], 4.8, b[1]), 0.1, A.wood);
  }
  // Benches in a ring around the fire, open toward the door (inside the aisle: maloca/logic.ts).
  for (const a of benchAngles()) {
    const [x, z] = ring(a, BENCH_R);
    kit.box(1.35, 0.08, 0.38, x, 0.38, z, A.plank, a);
    for (const k of [-0.5, 0.5]) {
      const [lx, lz] = ring(a + (k * 1.15) / BENCH_R, BENCH_R);
      kit.box(0.1, 0.38, 0.32, lx, 0, lz, A.woodDark, a);
    }
  }
  // Fire: a ring of stones and crossed logs.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    kit.rock(0.16, MC.x + Math.sin(a) * 0.62, 0, MC.z + Math.cos(a) * 0.62, A.stone, rand);
  }
  const log = new THREE.CylinderGeometry(0.06, 0.07, 1.0, 5);
  for (let i = 0; i < 3; i++) kit.add(log, A.woodDark, MC.x, 0.1, MC.z, Math.PI / 2, (i / 3) * Math.PI, 0);
  log.dispose();
  // Cloth rods: a pole hanging under the roof in front of each cloth.
  for (const a of angles) {
    const [x, z] = ring(a, R - 0.22);
    kit.box(1.05, 0.05, 0.05, x, 2.12, z, A.woodDark, a);
  }
  // Station board posts outside, right of the door.
  const boardAt = ring(0.75, R + 2.2);
  for (const s of [-1, 1])
    kit.cyl(
      0.06,
      0.07,
      1.55,
      boardAt[0] + s * 1.2 * Math.cos(0.75),
      0,
      boardAt[1] - s * 1.2 * Math.sin(0.75),
      A.woodDark,
      5,
    );
  group.add(bake(kit, "selva-maloca", mat));

  // Roof: its own mesh (and its own material copy) so it can fade while the traveler is inside.
  const roofMat = stationMaterial();
  const roofKit = new Kit(env);
  coneRoof(roofKit, rand, { r: R + 0.75, y: EAVE, h: APEX - EAVE, ox: MC.x, oz: MC.z });
  const roof = bake(roofKit, "selva-maloca-roof", roofMat);
  group.add(roof);
  const roofFade = fadeable(roof, env);
  const roofEase = new Ease01(0.45, env.reducedMotion);

  // Fire flame: unlit, no outline, flickers (static on reduced motion).
  const flameMat = new THREE.MeshBasicMaterial({
    color: "#ffb347",
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const flameGeo = new THREE.ConeGeometry(0.32, 0.9, 7);
  flameGeo.translate(0, 0.45, 0);
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.set(MC.x, 0.12, MC.z);
  env.noOutline(flame);
  group.add(flame);

  // Cloths (atlas cells 0..n-1) and the station board (cell n).
  const CW = 200;
  const CH = 280;
  const signs = signBoards(
    env,
    list.length + 1,
    CW,
    CH,
    (ctx, i, cw, ch) => {
      if (i === list.length) {
        drawCarved(ctx, cw, ch, "#7a4a2b");
        ctx.fillStyle = "#fbe9c8";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const words = T(S.board).split(" · ");
        for (const [k, w] of words.entries()) {
          const px = fit(ctx, w, (p) => `800 ${p}px ${FONT.display}`, 34, cw - 30);
          ctx.font = `800 ${px}px ${FONT.display}`;
          ctx.fillText(w, cw / 2, ch / 2 + (k - (words.length - 1) / 2) * 44);
        }
        return;
      }
      drawCloth(ctx, list[i] as Cloth, cw, ch, lang);
    },
    [
      ...list.map((_, i) => {
        const a = angles[i] as number;
        const [x, z] = ring(a, R - 0.24);
        // Facing the centre: the plane's +Z normal points inward.
        return { i, w: 0.9, h: 0.9 * (CH / CW), x, y: 1.45, z, ry: a + Math.PI };
      }),
      { i: list.length, w: 2.0, h: 2.0 * (CH / CW) * 0.5, x: boardAt[0], y: 1.15, z: boardAt[1], ry: 0.75 },
    ],
    "selva-maloca",
  );
  group.add(signs.mesh);
  env.scene.add(group);

  // ------------------------------------------------------------------ world registration
  // Walkable: the whole floor inside the wall (one circle; the wall colliders keep the traveler in) and the
  // doorway (joined to the plaza).
  env.addWalkable(at(f, MC.x, MC.z, R));
  for (let r = R - 0.6; r <= R + 1.6; r += 0.6) env.addWalkable(at(f, ...ring(0, r), 1.0));
  // Solid: the wall ring (not the door), the benches (pegs along each seat), the house posts, the fire. The
  // aisle between the benches and the wall stays clear all the way round (maloca/logic.ts tests it).
  for (const c of interiorColliders(DOOR_HALF)) env.addCollider(at(f, MC.x + c.x, MC.z + c.z, c.r));
  const keep = creatures.keepOut(...worldOf(f, MC.x, MC.z), R + 3);
  const cull = stationCull(group, new THREE.Vector3(f.x, f.y, f.z));

  // ------------------------------------------------------------------ panel
  let sel = 0;
  const marker = createMarker(env);
  group.add(marker.mesh);
  const panel = createFieldPanel(hudRoot, {
    name: "maloca",
    closeLabel: T(S.closeAria),
    onNav: list.length ? (d) => select(sel + d) : undefined,
    onClose: () => marker.hide(),
  });
  panel.layer.classList.add("qns");
  panel.kicker.textContent = T(S.kicker);
  const detail = el("div");
  const picks = el("ul", "qnf-picks");
  const pickBtns = list.map((c, i) => {
    const li = el("li");
    const b = el("button", "qnf-pick");
    b.type = "button";
    b.style.setProperty("--qnf-dot", c.paint);
    b.append(el("span", "qnf-cord"), el("span", "qnf-pick-title", c.post.title));
    const time = el("time", undefined, formatDate(c.post.date, lang, false));
    time.dateTime = c.post.date.slice(0, 10);
    b.append(time);
    b.addEventListener("click", () => select(i));
    li.append(b);
    picks.append(li);
    return b;
  });
  const blog = el("div", "qnf-actions");
  blog.append(linkButton(`/${lang}/blog/`, T(S.blog), false));
  if (list.length)
    panel.body.append(detail, el("p", "qnf-label", T(S.all)), picks, el("p", "qnf-note", T(S.legend)), blog);
  else {
    panel.title.textContent = T(S.bareTitle);
    panel.body.append(el("p", "qnf-lede", T(S.bare)), blog);
  }

  const markAt = (i: number) => {
    const [x, z] = ring(angles[i] as number, R - 0.45);
    marker.place(x, 2.45, z);
  };
  const render = () => {
    const c = list[sel];
    if (!c) return;
    const p = c.post;
    panel.title.textContent = p.title;
    detail.replaceChildren();
    const meta = el("p", "qnf-meta");
    const src = el("span");
    const dot = el("span", "qnf-dot");
    dot.style.setProperty("--qnf-dot", c.paint);
    src.append(dot, T(p.source === "medium" ? S.medium : S.site));
    meta.append(src, el("span", undefined, formatDate(p.date, lang)));
    detail.append(meta);
    if (p.description?.trim()) detail.append(el("p", "qnf-lede", p.description));
    if (p.tags?.length) {
      const tags = el("ul", "qnf-tags");
      for (const t of p.tags.slice(0, 6)) tags.append(el("li", undefined, t));
      detail.append(tags);
    }
    const href = safeHref(p.href);
    if (href) {
      const actions = el("div", "qnf-actions");
      actions.append(linkButton(href, T(S.readPost), p.source === "medium", true));
      detail.append(actions);
    }
    for (const [i, b] of pickBtns.entries()) b.setAttribute("aria-pressed", String(i === sel));
  };
  const select = (i: number) => {
    if (!list.length) return;
    sel = (i + list.length) % list.length;
    render();
    markAt(sel);
  };

  // ------------------------------------------------------------------ frame loop
  // One spot per cloth on the aisle right in front of it.
  const spots: Spot[] = angles.map((a) => {
    const [lx, lz] = ring(a, AISLE_R);
    return { lx, lz, r: SPOT_R };
  });
  /** With no posts, one spot just inside the door shows the "bare walls" note. */
  if (!list.length) spots.push({ lx: MC.x, lz: MC.z + R - 1.2, r: 1.6 });
  let near = -1;
  let inside = false;
  let inRange = false;
  return {
    update(dt, avatar, t) {
      if (!cull(env.camera)) {
        near = -1;
        if (panel.isOpen()) panel.close();
        return;
      }
      const lx = lxOf(f, avatar.x, avatar.z);
      const lz = lzOf(f, avatar.x, avatar.z);
      const d = Math.hypot(lx - MC.x, lz - MC.z);
      inside = d < R + 0.3;
      inRange = d < R + 6;
      roofFade.set(Math.max(0.12, roofEase.step(inside ? 0 : 1, dt)));
      near = nearestSpot(spots, lx, lz);
      if (panel.isOpen() && !inRange) panel.close();
      if (!panel.isOpen()) {
        if (near >= 0 && list.length) markAt(near);
        else marker.hide();
      }
      marker.update(dt, t);
      if (!env.reducedMotion) {
        const k = 0.85 + Math.sin(t * 11) * 0.08 + Math.sin(t * 17.3) * 0.06;
        flame.scale.set(1, k, 1);
        flame.rotation.y = t * 0.7;
      }
    },
    prompt() {
      if (panel.isOpen()) return inRange ? T(S.close) : null;
      if (near < 0) return null;
      const c = list[near];
      return c ? `${T(S.read)}${promptTitle(c.post.title)}` : T(S.look);
    },
    interact() {
      if (panel.isOpen()) {
        panel.close();
        return true;
      }
      if (near < 0) return false;
      if (list.length) select(near);
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
      marker.dispose();
      signs.dispose();
      roofFade.dispose();
      creatures.removeKeepOut(keep);
      disposeTree(group);
      mat.dispose();
      roofMat.dispose();
      flameMat.dispose();
    },
  };
};

const worldOf = (f: { x: number; z: number; cos: number; sin: number }, lx: number, lz: number): [number, number] => [
  f.x + lx * f.cos + lz * f.sin,
  f.z - lx * f.sin + lz * f.cos,
];

/** A painted llanchama (bark cloth): pale bark, a geometric design in the post's paint, the title and date. */
function drawCloth(ctx: CanvasRenderingContext2D, c: Cloth, w: number, h: number, lang: "es" | "en") {
  let s = c.seed || 1;
  const rnd = () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return s / 4294967296;
  };
  ctx.fillStyle = "#dcc7a1";
  ctx.fillRect(0, 0, w, h);
  // Bark fibres.
  ctx.strokeStyle = "rgba(120,90,50,0.22)";
  ctx.lineWidth = 1.5;
  for (let x = 6; x < w; x += 7) {
    ctx.beginPath();
    ctx.moveTo(x + rnd() * 3, 0);
    ctx.lineTo(x + rnd() * 3, h);
    ctx.stroke();
  }
  // Ragged edges.
  ctx.fillStyle = "#1f1a17";
  for (let y = 0; y < h; y += 9) {
    ctx.fillRect(0, y, 2 + rnd() * 4, 6);
    ctx.fillRect(w - 2 - rnd() * 4, y, 6, 6);
  }
  // Design: nested steps and zigzag bands (a different arrangement per post).
  ctx.strokeStyle = c.paint;
  ctx.fillStyle = c.paint;
  ctx.lineWidth = 7;
  const top = 18;
  const bottom = h * 0.64;
  const kind = Math.floor(rnd() * 3);
  for (let band = 0; band < 3; band++) {
    const y0 = top + ((bottom - top) / 3) * band;
    const bh = (bottom - top) / 3 - 8;
    ctx.beginPath();
    if (kind === 0 || band === 1) {
      // Zigzag.
      const n = 4 + Math.floor(rnd() * 3);
      for (let k = 0; k <= n; k++) ctx.lineTo(16 + ((w - 32) * k) / n, y0 + (k % 2 ? bh : 6));
      ctx.stroke();
    } else if (kind === 1) {
      // Stepped diamonds.
      const cx = w / 2;
      const cy = y0 + bh / 2;
      for (let r = bh / 2; r > 6; r -= 12) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r * 1.6, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r * 1.6, cy);
        ctx.closePath();
        ctx.stroke();
      }
    } else {
      // Rows of dots and a border line.
      ctx.fillRect(16, y0 + 4, w - 32, 5);
      for (let x = 24; x < w - 16; x += 22) {
        ctx.beginPath();
        ctx.arc(x, y0 + bh / 2 + 4, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Title and date.
  ctx.fillStyle = "#1f1a17";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const words = c.post.title.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  ctx.font = `800 22px ${FONT.display}`;
  for (const word of words) {
    const t = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(t).width > w - 24 && cur) {
      lines.push(cur);
      cur = word;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 3);
  if (lines.length > 3) shown[2] = `${shown[2]}…`;
  for (const [i, l] of shown.entries()) ctx.fillText(l, w / 2, h * 0.72 + i * 24);
  ctx.font = `600 15px ${FONT.mono}`;
  ctx.fillStyle = c.paint === PAINT.medium ? "#2b3550" : "#7a2a1d";
  ctx.fillText(formatDate(c.post.date, lang, false), w / 2, h - 16);
}
