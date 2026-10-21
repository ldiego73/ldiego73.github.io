/**
 * Taquile: the village of master weavers on its terraced headland, the Collasuyu's school. A path climbs from
 * the road through a stone arch (Taquile's arches have a little gabled roof of stone slabs) to the village
 * plaza: stone houses with thatched roofs and blue doors, and on the north side the weavers' cooperative with a
 * pedal loom in front of it, a half-woven cloth on its warp, and a line of chullos, chumpi belts and a striped
 * manta hung out (the belts and the manta are cloth on the shared wind, ./kit/build.ts `cloth`).
 * The weavers themselves (men knitting chullos, women spinning) are people of ./gente.ts.
 *
 * At the loom, "E · Ver formación" opens a panel woven like a Taquile textile (./taquile/taquile.css): the
 * owner's EDUCATION and CERTIFICATIONS from src/data/career.ts (./taquile/logic.ts). The passport stamp
 * `titicaca:station:taquile` comes from the runtime's visit of the plaza.
 *
 * Draw calls: one vertex-coloured mesh (houses, workshop, arch, loom, the hung textiles), one board. Buildings,
 * the arch's pillars and the loom are colliders; animals keep out of the village.
 */
import * as THREE from "three";
import { createFieldPanel, el } from "../../ambient/fields/panel";
import type { Ambient, CreateAmbient } from "../../contract";
import { creatures } from "../../creatures";
import { on } from "../../events";
import { FONT } from "../../props";
import type { SuyuEnv } from "../../suyu/contract";
import type { TiticacaLayout } from "../layout";
import { LOOM, TAQUILE } from "../plan";
import { Build, frameAt, kitMaterial } from "./kit/build";
import { buildBoards, paperBoard } from "./kit/signs";
import { HOUSES, inLoomRange, TAQUILE_COPY, taquilePanel, WORKSHOP } from "./taquile/logic";
import "./taquile/taquile.css";

const STONE = ["#9b8f7e", "#a89d8a", "#8d8272", "#b3a894"];
const THATCH = "#c4a25c";
const DOOR = "#2f5fa8";
/** Weaving colours of Taquile: red, deep blue, green, white, black, ochre. */
const WEAVE = ["#b8282f", "#2a3f8f", "#2f7a46", "#efe6d6", "#1f1a17", "#d9a23a"];

export const create: CreateAmbient = (baseEnv, hudRoot): Ambient => {
  const env = baseEnv as SuyuEnv;
  const lang = env.lang;
  const L = env.suyu.layout as TiticacaLayout;
  const b = new Build();
  const colliders: Array<{ x: number; z: number; r: number }> = [];
  let seed = 11;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  /** A stone house: walls of coursed fieldstone down to the slope, a thatched gable roof, a blue door. */
  const house = (x: number, z: number, yaw: number, w: number, d: number, h = 2.5) => {
    let lo = Infinity;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (const [lx, lz] of [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [-w / 2, d / 2],
      [w / 2, d / 2],
    ] as const)
      lo = Math.min(lo, env.heightAt(x + lx * c + lz * s, z - lx * s + lz * c));
    const floor = Math.max(lo, env.heightAt(x, z));
    const base = lo - 0.6;
    b.frame = frameAt(x, 0, z, yaw);
    // Courses: alternating stone tones for a hand-laid look.
    const courses = Math.ceil((floor + h - base) / 0.5);
    for (let k = 0; k < courses; k++)
      b.box(w, 0.5, d, 0, base + k * 0.5, 0, STONE[(k + Math.floor(r() * 2)) % 4] as string);
    const top = base + courses * 0.5;
    // Thatch gable (ridge along local x), with an overhang.
    const prism = b.own(new THREE.CylinderGeometry(1, 1, 1, 3, 1).rotateY(Math.PI / 2));
    b.add(prism, THATCH, 0, top + 0.6, 0, 0, 0, Math.PI / 2, 1.3, w + 0.7, (d / 2 + 0.45) * 1.16);
    // Blue door and a small window.
    b.box(0.95, 1.7, 0.08, 0, floor, d / 2 + 0.02, DOOR);
    b.box(0.6, 0.5, 0.08, w * 0.3, floor + 1.1, d / 2 + 0.02, "#2a221c");
    b.frame = null;
    colliders.push({ x, z, r: Math.max(w, d) / 2 + 0.2 });
    return floor;
  };

  for (const hs of HOUSES) house(hs.x, hs.z, hs.yaw, hs.w, hs.d);
  const wFloor = house(WORKSHOP.x, WORKSHOP.z, WORKSHOP.yaw, WORKSHOP.w, WORKSHOP.d, 2.9);

  // ------------------------------------------------------------------ the loom and the hung textiles
  const ly = env.heightAt(LOOM.x, LOOM.z);
  b.frame = frameAt(LOOM.x, ly, LOOM.z, LOOM.yaw);
  // Pedal loom: four posts, two beams, the warp (coloured threads) and the cloth woven so far.
  for (const [lx, lz] of [
    [-1, -0.7],
    [1, -0.7],
    [-1, 0.7],
    [1, 0.7],
  ] as const)
    b.box(0.12, 1.5, 0.12, lx, 0, lz, "#6e4a2c");
  b.box(2.2, 0.12, 0.12, 0, 1.4, -0.7, "#5e3b22");
  b.box(2.2, 0.12, 0.12, 0, 0.8, 0.7, "#5e3b22");
  for (let k = 0; k < 17; k++) {
    const x = -0.8 + k * 0.1;
    b.stick(new THREE.Vector3(x, 1.42, -0.7), new THREE.Vector3(x, 0.84, 0.25), 0.012, WEAVE[k % 6] as string, 3);
  }
  // The woven part: bands of colour with a red field (like a chumpi belt laid flat).
  for (let k = 0; k < 6; k++) b.box(1.6, 0.03, 0.08, 0, 0.82, 0.3 + k * 0.08, WEAVE[(k * 2) % 6] as string);
  b.box(0.5, 0.25, 0.4, -1.6, 0, 0.2, "#7a5233");
  b.frame = null;
  colliders.push({ x: LOOM.x, z: LOOM.z, r: 1.3 });
  // A line of chullos and belts hung between two posts beside the workshop.
  const lineA = new THREE.Vector3(WORKSHOP.x - 5.2, wFloor, WORKSHOP.z + 3.4);
  const lineB = new THREE.Vector3(WORKSHOP.x - 1.2, wFloor, WORKSHOP.z + 4.6);
  for (const p of [lineA, lineB]) b.cyl(0.06, 0.07, 2.3, p.x, p.y - 0.1, p.z, "#5e3b22", 5);
  b.stick(lineA.clone().setY(wFloor + 2.1), lineB.clone().setY(wFloor + 2.1), 0.015, "#efe6d6", 3);
  // The belts and the manta are cloth held at the line (./kit/build.ts `cloth`): they swing in the gusts.
  const lineYaw = Math.atan2(lineB.x - lineA.x, lineB.z - lineA.z) + Math.PI / 2;
  const top = wFloor + 2.08;
  for (let k = 1; k < 8; k++) {
    const u = k / 8;
    const p = lineA.clone().lerp(lineB, u);
    if (k % 2) {
      // A chullo: knitted cone with ear flaps.
      b.cyl(0.02, 0.17, 0.42, p.x, wFloor + 1.62, p.z, WEAVE[k % 6] as string, 8);
      b.cyl(0.18, 0.18, 0.08, p.x, wFloor + 1.62, p.z, "#efe6d6", 8);
    } else if (k === 4) {
      // A manta: bands of colour like Taquile's weavings, each band its slice of the one hanging cloth.
      const H = 0.78;
      const bands = [0, 1, 4, 1, 0, 3];
      bands.forEach((c, i) => {
        const h = H / bands.length;
        b.cloth(0.46, h + 0.004, p.x, top - h * (i + 0.5), p.z, WEAVE[c] as string, {
          yaw: lineYaw,
          flex: [i / bands.length, (i + 1) / bands.length],
          segs: [3, 2],
          thick: 0.025 + (i % 2) * 0.004,
        });
      });
    } else
      b.cloth(0.14, 0.9, p.x, top - 0.45, p.z, WEAVE[(k + 1) % 6] as string, {
        yaw: lineYaw,
        flex: [0, 0.8],
        segs: [1, 5],
      });
  }
  colliders.push({ x: lineA.x, z: lineA.z, r: 0.3 }, { x: lineB.x, z: lineB.z, r: 0.3 });

  // ------------------------------------------------------------------ the stone arch on the path up
  const spur = L.spurs.find((s) => s.id === "taquile");
  let archAt: { x: number; z: number; y: number; yaw: number } | null = null;
  if (spur) {
    const u = 0.78;
    const x = spur.a[0] + (spur.b[0] - spur.a[0]) * u;
    const z = spur.a[1] + (spur.b[1] - spur.a[1]) * u;
    const yaw = Math.atan2(spur.b[0] - spur.a[0], spur.b[1] - spur.a[1]);
    const y = env.heightAt(x, z);
    archAt = { x, z, y, yaw };
    b.frame = frameAt(x, y, z, yaw);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 7; k++)
        b.box(0.78, 0.44, 0.78, side * 2.25, -0.6 + k * 0.44, 0, STONE[(k + (side > 0 ? 1 : 0)) % 4] as string);
    }
    // The span: a lintel of long stones, a narrower course over it, and a little gabled roof of slabs.
    b.box(5.4, 0.42, 0.9, 0, 2.48, 0, "#9d9483");
    b.box(3.6, 0.34, 0.8, 0, 2.9, 0, "#b3a894");
    const prism = b.own(new THREE.CylinderGeometry(1, 1, 1, 3, 1).rotateY(Math.PI / 2));
    b.add(prism, "#7f7666", 0, 3.55, 0, 0, 0, Math.PI / 2, 0.55, 4.2, 0.72);
    b.frame = null;
    for (const side of [-1, 1])
      colliders.push({ x: x + Math.cos(yaw) * side * 2.25, z: z - Math.sin(yaw) * side * 2.25, r: 0.6 });
  }

  const geo = b.build();
  const mat = kitMaterial(geo);
  const group = new THREE.Group();
  group.name = "titicaca-taquile";
  if (geo) {
    const m = new THREE.Mesh(geo, mat);
    m.name = "titicaca-taquile:village";
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  // The arch's board, facing down the path.
  const boardSpecs = archAt
    ? [
        {
          i: 0,
          w: 2.6,
          h: 0.62,
          x: archAt.x - Math.sin(archAt.yaw) * 0.58,
          y: archAt.y + 2.7,
          z: archAt.z - Math.cos(archAt.yaw) * 0.58,
          yaw: archAt.yaw + Math.PI,
        },
      ]
    : [];
  const board = buildBoards(
    env,
    "titicaca-taquile:board",
    1,
    512,
    124,
    (ctx, _i, cw, ch) => {
      paperBoard(ctx, cw, ch, "#b8282f");
      ctx.fillStyle = "#1f1a17";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 46px ${FONT.display}`;
      ctx.fillText(TAQUILE_COPY.sign[lang], cw / 2, ch * 0.42);
      ctx.font = `600 20px ${FONT.body}`;
      ctx.fillText(TAQUILE_COPY.signSub[lang], cw / 2, ch * 0.76);
    },
    boardSpecs,
  );
  group.add(board.mesh);
  env.scene.add(group);
  for (const c of colliders) env.addCollider({ kind: "circle", x: c.x, z: c.z, r: c.r });
  const keep = creatures.keepOut(TAQUILE.x, TAQUILE.z - 2, 17);

  // ------------------------------------------------------------------ panel
  const panel = createFieldPanel(hudRoot, { name: "taquile", closeLabel: TAQUILE_COPY.closeAria[lang] });
  panel.layer.classList.add("tq-taquile");
  panel.kicker.textContent = TAQUILE_COPY.kicker[lang];
  panel.title.textContent = TAQUILE_COPY.title[lang];
  const data = taquilePanel(lang);
  const band = (label: string, rows: typeof data.education, cls: string) => {
    const sec = el("section", `tq-band ${cls}`);
    sec.append(el("h3", "tq-band-title", label));
    const list = el("ul", "tq-rows");
    for (const row of rows) {
      const li = el("li", "tq-row");
      const main = el("div", "tq-row-main");
      main.append(el("strong", undefined, row.title));
      if (row.detail) main.append(el("span", undefined, row.detail));
      li.append(main, el("span", "tq-years", row.years));
      list.append(li);
    }
    sec.append(list);
    return sec;
  };
  panel.body.append(
    el("p", "qnf-lede", TAQUILE_COPY.lede[lang]),
    band(TAQUILE_COPY.education[lang], data.education, "tq-band-edu"),
    band(TAQUILE_COPY.certs[lang], data.certs, "tq-band-cert"),
    el("p", "qnf-note", TAQUILE_COPY.note[lang]),
  );

  let modal = 0;
  const offs = [
    on("world:modal", (d) => {
      modal = Math.max(0, modal + (d?.open ? 1 : -1));
    }),
  ];
  let near = false;
  return {
    update(_dt, avatar) {
      near = inLoomRange(avatar.x, avatar.z) && Math.abs(avatar.y - ly) < 2;
      if (panel.isOpen() && !near) panel.close();
    },
    prompt() {
      if (panel.isOpen()) return TAQUILE_COPY.close[lang];
      return near && modal === 0 ? TAQUILE_COPY.prompt[lang] : null;
    },
    interact() {
      if (panel.isOpen()) {
        panel.close();
        return true;
      }
      if (!near) return false;
      panel.open();
      return true;
    },
    escape() {
      if (!panel.isOpen()) return false;
      panel.close();
      return true;
    },
    dispose() {
      for (const off of offs) off();
      creatures.removeKeepOut(keep);
      panel.dispose();
      board.dispose();
      geo?.dispose();
      mat.dispose();
      group.removeFromParent();
    },
  };
};
