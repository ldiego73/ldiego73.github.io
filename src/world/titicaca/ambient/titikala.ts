/**
 * Titikala (the Collasuyu finale): the lake's reward at the very end of the road, its counterpart of the
 * mountain's summit (src/world/summit.ts + the hud's "¡Lo lograste!" card) and the jungle's kené totem.
 *
 * Where: the plaza on the headland that stands for the Isla del Sol (../plan.ts TITIKALA), where the road ends.
 * In it the sacred rock Titikala, "the puma's rock" (a long weathered red rock that reads as a crouching puma),
 * a stone offering table in front of it, a gold disc of Inti on a stela behind it, a ring of low stones round
 * the plaza (open toward the road) and a carved board; down the headland's north flank an Inca stairway runs
 * to the water. In Inca legend Inti made Manco Cápac and Mama Ocllo rise from the lake here.
 *
 * Arrival: the first time in a page session the traveler comes up to the rock (./titikala/logic.ts ARRIVE_R),
 * the sun celebrates: a fountain of sunrise-gold sparks bursts from the rock and drifts down, the disc and a
 * halo flare, the music plays its summit stinger, the passport gets `titicaca:summit` and, a moment later, the
 * reward panel opens. With prefers-reduced-motion there is no burst (the glow and the panel remain). Afterwards
 * "E · Ver tu premio" at the rock reopens the panel.
 *
 * The panel ("¡Lo lograste, {name}!", the name from ../../traveler.ts, renamed live on `world:traveler`) shows
 * four true stats (skill groups, skills, education entries, certifications, counted from src/data/career.ts) and
 * buttons: the postcard (`world:postcard`), book 60 min (SITE.calendly), download the CV (SITE.resume), back to
 * Qusqu (../../travel.ts) and back to the site.
 *
 * Draw calls: one vertex-coloured mesh (rock, table, stela, ring, stairway), the disc, the board; the sparks and
 * the halo only during the burst. The rock, the table, the stela and the ring stones are colliders; animals
 * keep out of the plaza.
 */
import * as THREE from "three";
import { getMusic } from "../../../audio";
import { SITE } from "../../../data/site";
import { CATALOG } from "../../../lib/passport";
import { createFieldPanel, el, linkButton } from "../../ambient/fields/panel";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { emit, on } from "../../events";
import { vertexToon } from "../../merge-colors";
import { FONT, glowSprite } from "../../props";
import type { SuyuEnv } from "../../suyu/contract";
import { travelTo } from "../../travel";
import { loadTraveler } from "../../traveler";
import { TITIKALA } from "../plan";
import { Build } from "./kit/build";
import { buildBoards, paperBoard } from "./kit/signs";
import {
  arrived,
  BURST,
  burstScale,
  FINALE_COPY,
  finaleTitle,
  glowAt,
  PROMPT_R,
  prng,
  type Spark,
  spawnSparks,
  statTiles,
  stepSpark,
} from "./titikala/logic";
import "./titikala/titikala.css";

export const STAMP_ID = "titicaca:summit";
/** Seconds between the burst and the panel opening (the sparks are in the air by then). */
const PANEL_DELAY = 1.8;
const SPARK_COLORS = ["#ffd36b", "#f2a94e", "#fff1c9", "#e8b631", "#ff8a3d"];

export const create: CreateAmbient = (baseEnv, hudRoot): Ambient => {
  const env = baseEnv as SuyuEnv;
  const lang = env.lang;
  const T = (l: { es: string; en: string }) => l[lang];
  const pl = env.suyu.layout.plazas.find((p) => p.id === "titikala");
  const floorY = pl ? pl.y : env.heightAt(TITIKALA.x, TITIKALA.z);
  /** The rock at the plaza's far (north) side, the table before it, the disc's stela behind it. */
  const rock = { x: TITIKALA.x, z: TITIKALA.z - 5.5 };
  const table = { x: TITIKALA.x, z: TITIKALA.z - 1.4 };
  const stela = { x: TITIKALA.x, z: TITIKALA.z - 9.6 };
  const group = new THREE.Group();
  group.name = "titicaca-titikala";

  // ------------------------------------------------------------------ build
  const b = new Build();
  const rockCols = ["#9a5a43", "#8a4f3b", "#a8664b", "#b07a5a"];
  // The puma's rock: a long weathered body lying along x, haunch and shoulders, the head raised toward the east
  // (+x) with a blunt snout and two ears, forepaws stretched in front: the crouching puma people see in it.
  const lumps: Array<[number, number, number, number, number, number]> = [
    [-0.3, 1.0, 0, 3.6, 1.25, 1.55],
    [-2.9, 1.15, 0.05, 1.55, 1.3, 1.45],
    [1.9, 1.3, -0.05, 1.5, 1.4, 1.5],
    [3.75, 2.25, 0, 0.95, 0.85, 0.9],
    [4.55, 2.0, 0, 0.5, 0.38, 0.48],
    [3.4, 0.35, 0.75, 1.0, 0.32, 0.38],
    [3.4, 0.35, -0.75, 1.0, 0.32, 0.38],
  ];
  lumps.forEach(([x, y, z, sx, sy, sz], i) => {
    const g = b.own(new THREE.IcosahedronGeometry(1, 2));
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      // Weathering: a low lumpy wobble, not rubble.
      const w = 1 + 0.06 * Math.sin(p.getX(k) * 5 + i) * Math.cos(p.getZ(k) * 4 - i);
      p.setXYZ(k, p.getX(k) * w, p.getY(k) * w, p.getZ(k) * w);
    }
    g.computeVertexNormals();
    b.add(g, rockCols[i % 4] as string, rock.x + x, floorY + y - 0.3, rock.z + z, 0, 0, 0, sx, sy, sz);
  });
  for (const s of [-1, 1]) b.cyl(0, 0.26, 0.45, rock.x + 3.55, floorY + 2.75, rock.z + s * 0.45, "#7c4433", 6);
  // The tail curled along the ground behind the haunch.
  b.stick(
    new THREE.Vector3(rock.x - 4.2, floorY + 0.35, rock.z + 0.6),
    new THREE.Vector3(rock.x - 5.4, floorY + 0.3, rock.z + 1.6),
    0.28,
    "#8a4f3b",
    7,
  );
  // Pale lichen streaks.
  for (let i = 0; i < 9; i++)
    b.sph(
      0.35,
      0.06,
      0.25,
      rock.x - 3 + i * 0.75,
      floorY + 2.2 - (i % 3) * 0.3,
      rock.z + (i % 2 ? 0.9 : -0.9),
      "#d8d0a8",
      0,
    );
  // Offering table: a slab on two blocks.
  b.box(2.6, 0.18, 1.2, table.x, floorY + 0.75, table.z, "#a39a8a");
  for (const s of [-1, 1]) b.box(0.5, 0.75, 0.9, table.x + s * 0.9, floorY, table.z, "#8f877b");
  b.sph(0.18, 0.12, 0.18, table.x - 0.6, floorY + 1.0, table.z, "#e8b631", 1);
  b.sph(0.22, 0.1, 0.22, table.x + 0.5, floorY + 0.98, table.z + 0.1, "#3f7f4a", 1);
  // Stela for the disc.
  b.box(1.4, 3.6, 0.9, stela.x, floorY - 0.2, stela.z, "#9d9483");
  b.box(1.9, 0.4, 1.2, stela.x, floorY + 3.4, stela.z, "#b3a894");
  // Ring of low stones, open toward the road (south, +z).
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.5) continue;
    const x = TITIKALA.x + Math.cos(a) * (TITIKALA.r - 0.4);
    const z = TITIKALA.z + Math.sin(a) * (TITIKALA.r - 0.4);
    b.box(
      0.9,
      0.55 + (i % 3) * 0.12,
      0.6,
      x,
      env.heightAt(x, z) - 0.1,
      z,
      ["#a39a8a", "#b2a896", "#968d7e"][i % 3] as string,
      a,
    );
    env.addCollider({ kind: "circle", x, z, r: 0.5 });
  }
  // The Inca stairway down the headland's north flank toward the water.
  for (let k = 0; k < 22; k++) {
    const z = TITIKALA.z - TITIKALA.r - 1 - k * 1.4;
    const x = TITIKALA.x + Math.sin(k * 0.25) * 2.5;
    const y = env.heightAt(x, z);
    if (y < -0.2) break;
    b.box(3.2, 0.45, 1.5, x, y - 0.2, z, k % 2 ? "#a39a8a" : "#968d7e");
    for (const s of [-1, 1]) b.box(0.6, 0.9, 1.4, x + s * 2, y - 0.2, z, "#8a8274");
  }
  const geo = b.build();
  const mat = vertexToon();
  if (geo) {
    const m = new THREE.Mesh(geo, mat);
    m.name = "titicaca-titikala:stone";
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  env.addCollider({ kind: "box", x0: rock.x - 5.6, z0: rock.z - 1.6, x1: rock.x + 5.2, z1: rock.z + 1.8 });
  env.addCollider({ kind: "circle", x: table.x, z: table.z, r: 1.3 });
  env.addCollider({ kind: "circle", x: stela.x, z: stela.z, r: 1.1 });

  // The gold disc of Inti on the stela (its own material: it glows during the burst and faintly at night).
  const discMat = env.toon("#e8b631", { emissive: "#ffb347", emissiveIntensity: 0 }).clone();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.16, 28).rotateX(Math.PI / 2), discMat);
  disc.name = "titicaca-titikala:inti";
  disc.position.set(stela.x, floorY + 2.4, stela.z + 0.55);
  group.add(disc);
  const halo = glowSprite(env, "#ffd36b", 9);
  halo.position.set(rock.x, floorY + 3.2, rock.z);
  halo.visible = false;
  group.add(halo);

  // Board at the plaza's entrance, facing the road.
  const board = buildBoards(
    env,
    "titicaca-titikala:board",
    1,
    512,
    140,
    (ctx, _i, cw, ch) => {
      paperBoard(ctx, cw, ch, "#e8b631");
      ctx.fillStyle = "#1f1a17";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 52px ${FONT.display}`;
      ctx.fillText(FINALE_COPY.sign[lang], cw / 2, ch * 0.42);
      ctx.font = `600 22px ${FONT.body}`;
      ctx.fillText(FINALE_COPY.signSub[lang], cw / 2, ch * 0.76);
    },
    [{ i: 0, w: 2.5, h: 0.68, x: TITIKALA.x - 4.2, y: floorY + 1.25, z: TITIKALA.z + TITIKALA.r - 2, yaw: 0 }],
  );
  group.add(board.mesh);
  const pb = new Build();
  for (const s of [-1, 1])
    pb.cyl(0.06, 0.07, 1.4, TITIKALA.x - 4.2 + s * 1.1, floorY - 0.1, TITIKALA.z + TITIKALA.r - 2.1, "#5e3b22", 5);
  const postGeo = pb.build();
  if (postGeo) group.add(new THREE.Mesh(postGeo, mat));
  env.addCollider({ kind: "circle", x: TITIKALA.x - 4.2, z: TITIKALA.z + TITIKALA.r - 2, r: 1.25 });

  // Burst: instanced sparks (small gold diamonds), no outline.
  const sparkGeo = new THREE.OctahedronGeometry(0.12, 0);
  sparkGeo.scale(1, 1.6, 0.5);
  const sparkMat = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
  const sparks = new THREE.InstancedMesh(sparkGeo, sparkMat, BURST.sparks);
  sparks.name = "titicaca-titikala:sparks";
  sparks.frustumCulled = false;
  sparks.visible = false;
  env.noOutline(sparks);
  const col = new THREE.Color();
  for (let i = 0; i < BURST.sparks; i++) sparks.setColorAt(i, col.set(SPARK_COLORS[i % SPARK_COLORS.length] as string));
  if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
  group.add(sparks);
  env.scene.add(group);
  const keep = creatures.keepOut(TITIKALA.x, TITIKALA.z, TITIKALA.r + 2);

  // ------------------------------------------------------------------ panel
  let traveler = loadTraveler();
  const panel = createFieldPanel(hudRoot, { name: "titikala", closeLabel: T(FINALE_COPY.closeAria) });
  panel.layer.classList.add("tq-finale");
  panel.kicker.textContent = T(FINALE_COPY.kicker);
  const stats = el("dl", "tq-stats");
  stats.append(
    ...statTiles().map((t) => {
      const d = el("div", "tq-stat");
      d.append(el("dt", undefined, T(t.label)), el("dd", undefined, t.value));
      return d;
    }),
  );
  const postcard = el("button", "qnf-btn qnf-btn-primary tq-finale-postcard", T(FINALE_COPY.postcard));
  postcard.type = "button";
  postcard.addEventListener("click", () => {
    panel.close();
    emit("world:postcard", undefined);
  });
  const actions = el("div", "qnf-actions");
  const cv = linkButton(SITE.resume[lang], T(FINALE_COPY.cv), false);
  cv.setAttribute("download", "");
  const back = el("button", "qnf-btn", T(FINALE_COPY.cusco));
  back.type = "button";
  back.addEventListener("click", () => {
    panel.close();
    travelTo(lang, "titicaca", "cusco");
  });
  actions.append(
    linkButton(SITE.calendly, T(FINALE_COPY.book), true),
    cv,
    back,
    linkButton(`/${lang}/`, T(FINALE_COPY.site), false),
  );
  panel.body.append(
    el("p", "qnf-lede", T(FINALE_COPY.lede)),
    el("p", "qnf-label", T(FINALE_COPY.stats)),
    stats,
    postcard,
    actions,
  );
  const openPanel = () => {
    panel.title.textContent = finaleTitle(lang, traveler);
    panel.open();
  };
  const offs = [
    on("world:traveler", (d) => {
      traveler = d?.name ?? "";
      if (panel.isOpen()) panel.title.textContent = finaleTitle(lang, traveler);
    }),
  ];

  // ------------------------------------------------------------------ celebration
  const rand = prng(0x5011);
  let state: Spark[] = [];
  let age = -1;
  let celebrated = false;
  let openIn = -1;
  const dummy = new THREE.Object3D();
  /** Spark frame: x, z from the rock, y from 1.6 u above the plaza; they land on the rock's back or the plaza. */
  const floor = (x: number, z: number) => (Math.abs(x) < 4.2 && Math.abs(z) < 1.4 ? 0.6 : -1.6);
  const celebrate = () => {
    celebrated = true;
    const entry = CATALOG.find((s) => s.id === STAMP_ID);
    emit("world:stamp", { id: STAMP_ID, kind: "summit", label: entry?.label ?? FINALE_COPY.stampLabel });
    try {
      getMusic().stinger("summit");
    } catch {
      /* audio unavailable */
    }
    age = 0;
    if (!env.reducedMotion) {
      // Coordinates relative to the rock, with y relative to 1.6 u above the plaza.
      state = spawnSparks(BURST.sparks, 1.2, SPARK_COLORS.length, rand);
      sparks.visible = true;
    }
    openIn = env.reducedMotion ? 0.4 : PANEL_DELAY;
  };
  const stepBurst = (dt: number) => {
    if (age < 0) return;
    age += dt;
    if (age > BURST.life) {
      age = -1;
      sparks.visible = false;
      return;
    }
    for (const p of state) stepSpark(p, Math.min(dt, 0.05), age, floor);
  };
  const drawBurst = () => {
    const sc = burstScale(age);
    for (let i = 0; i < state.length; i++) {
      const p = state[i] as Spark;
      dummy.position.set(rock.x + p.x, floorY + 1.6 + p.y, rock.z + p.z);
      dummy.rotation.set(p.sx * age, p.sy * age, p.ph);
      dummy.scale.setScalar(sc * (p.landed ? 0.7 : 1));
      dummy.updateMatrix();
      sparks.setMatrixAt(i, dummy.matrix);
    }
    sparks.instanceMatrix.needsUpdate = true;
  };
  // Dev hook (screenshots on slow software GL): run the burst and the panel timer forward without rendering.
  if (import.meta.env?.DEV)
    (window as Window & { __titikala?: unknown }).__titikala = {
      advance(sec: number) {
        for (let k = 0; k < Math.round(sec * 60); k++) {
          stepBurst(1 / 60);
          if (openIn >= 0) openIn = Math.max(0, openIn - 1 / 60);
        }
        if (age >= 0 && !env.reducedMotion) drawBurst();
      },
      state: () => ({ age, celebrated, open: panel.isOpen(), floorY, rock }),
    };

  let inside = false;
  let near = false;
  return {
    update(dt, avatar) {
      const d = Math.hypot(avatar.x - rock.x, avatar.z - rock.z);
      const onPlaza = Math.abs(avatar.y - floorY) < 2.5;
      inside = arrived(inside, onPlaza ? d : Infinity);
      if (inside && !celebrated) celebrate();
      near = onPlaza && d < PROMPT_R;
      if (panel.isOpen() && d > PROMPT_R + 8) panel.close();
      if (openIn >= 0) {
        openIn -= dt;
        if (openIn < 0 && !panel.isOpen() && d < PROMPT_R + 8) openPanel();
      }
      // Glow: the celebration flare, and the disc's faint warmth at night.
      const g = age >= 0 ? glowAt(age) : 0;
      const night = env.sky.isNight() ? 0.25 : 0;
      discMat.emissiveIntensity = Math.max(night, g * 1.4);
      halo.visible = g > 0.01;
      (halo.material as THREE.SpriteMaterial).opacity = g * 0.8;
      stepBurst(dt);
      if (age >= 0 && !env.reducedMotion) drawBurst();
    },
    prompt() {
      if (panel.isOpen()) return near ? T(FINALE_COPY.close) : null;
      return near ? T(FINALE_COPY.view) : null;
    },
    interact() {
      if (panel.isOpen()) {
        panel.close();
        return true;
      }
      if (!near) return false;
      openIn = -1;
      openPanel();
      return true;
    },
    escape() {
      if (!panel.isOpen()) return false;
      panel.close();
      return true;
    },
    dispose() {
      if (import.meta.env?.DEV) delete (window as Window & { __titikala?: unknown }).__titikala;
      for (const off of offs) off();
      creatures.removeKeepOut(keep);
      panel.dispose();
      board.dispose();
      geo?.dispose();
      postGeo?.dispose();
      mat.dispose();
      disc.geometry.dispose();
      discMat.dispose();
      (halo.material as THREE.SpriteMaterial).dispose();
      sparks.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
      group.removeFromParent();
    },
  };
};
