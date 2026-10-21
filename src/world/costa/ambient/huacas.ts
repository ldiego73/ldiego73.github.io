/**
 * The career on the coast: one monument per working company (./huacas/models.ts, a pre-Inca culture each,
 * from Nasca in the south to Chan Chan in the north) and the fishermen's market of Huanchaco with one stall per
 * cross-company artifact (./huacas/market.ts). Each company station has, on its plaza, the same khipu as the
 * company's tambo on the mountain (../../cords.ts buildKhipu with ../../artifacts.ts khipuFor) and a carved sign
 * (company, culture, years). The panels are the mountain's own (../../hud.ts in `bare` mode: company stages
 * and knots, artifact uses), so the coast tells exactly the same career as the Qhapaq Ñan.
 *
 * Reading: within a spot's radius (the khipu, a stall) its panel opens on its own, like the mountain's tambos;
 * "E · Leer" reopens it after it was closed, E or Esc closes it. Entering a station shows its name in a toast.
 * The Nasca station also draws the hummingbird of the Nazca lines on the hillside behind it.
 * At night two braziers burn at every monument (flames + additive glows, only near the camera).
 *
 * Draw calls: the monuments and stalls (one vertex-coloured mesh for all), the friezes and mantles (one atlas
 * mesh), the signs (one), the flames (one instanced), plus each khipu (cords.ts; small, distance-culled by the
 * runtime's detail cull) and the glows near the camera. Colliders: each monument's walls and platforms.
 */
import * as THREE from "three";
import { ARTIFACTS, COMPANIES } from "../../../data/career";
import { khipuFor } from "../../artifacts";
import type { Ambient, CreateAmbient, L } from "../../contract";
import { buildKhipu, type KhipuModel } from "../../cords";
import { creatures } from "../../creatures";
import { createHud } from "../../hud";
import { vertexToon } from "../../merge-colors";
import { canvasTex, DYE, FONT, glowSprite, offFontsReady, onFontsReady, redraw } from "../../props";
import { windSway } from "../../style-gl";
import type { SuyuEnv } from "../../suyu/contract";
import { inkMask } from "../../toon";
import { Geo } from "../kit";
import type { CostaLayout } from "../layout";
import { COMPANY_STOPS, CULTURES, STATION } from "../plan";
import { buildAtlas, Quads } from "./huacas/atlas";
import { type Frame, pickSpot, rectAabb, toWorld, yearsLabel } from "./huacas/logic";
import { buildStall, STALLS } from "./huacas/market";
import { BUILDERS, type Build, KHIPU_AT, SIGN_AT, signPosts } from "./huacas/models";

const COPY = {
  read: { es: "E · Leer", en: "E · Read" },
  close: { es: "E · Cerrar", en: "E · Close" },
  marketTitle: { es: "Mercado de Huanchaco", en: "Huanchaco market" },
  marketLede: {
    es: "Cinco puestos de pescadores, uno por artefacto: las piezas que construí más de una vez, en distintas empresas. Acércate a cada puesto para leerlo. Junto al mar esperan los caballitos de totora.",
    en: "Five fishermen's stalls, one per artifact: the pieces I built more than once, at different companies. Walk up to each stall to read it. By the sea the totora reed boats are waiting.",
  },
  marketSign: { es: "MERCADO DE HUANCHACO", en: "HUANCHACO MARKET" },
  marketSub: { es: "Artefactos de mi carrera", en: "Artifacts of my career" },
} satisfies Record<string, L>;

type SpotKind = "company" | "artifact" | "info";
interface Spot {
  id: string;
  kind: SpotKind;
  x: number;
  z: number;
  r: number;
  priority: number;
  panel: () => HTMLElement;
}

/** Hummingbird of the Nazca lines as polylines in a unit frame (u across, v along the beak). */
const HUMMINGBIRD: Array<Array<[number, number]>> = [
  [
    [0, 1],
    [0, 0.44],
  ],
  [
    [0.05, 0.44],
    [0.08, 0.36],
    [0.05, 0.3],
    [-0.05, 0.3],
    [-0.08, 0.36],
    [-0.05, 0.44],
    [0.05, 0.44],
  ],
  [
    [0.05, 0.3],
    [0.07, 0.12],
    [0.62, 0.06],
    [0.98, -0.06],
    [0.92, -0.14],
    [0.56, -0.12],
    [0.07, -0.06],
    [0.05, -0.36],
  ],
  [
    [-0.05, 0.3],
    [-0.07, 0.12],
    [-0.62, 0.06],
    [-0.98, -0.06],
    [-0.92, -0.14],
    [-0.56, -0.12],
    [-0.07, -0.06],
    [-0.05, -0.36],
  ],
  [
    [0.05, -0.36],
    [0.16, -0.72],
    [0.06, -0.62],
    [0, -0.78],
    [-0.06, -0.62],
    [-0.16, -0.72],
    [-0.05, -0.36],
  ],
  [
    [0.3, 0.03],
    [0.36, -0.1],
  ],
  [
    [0.5, 0.0],
    [0.56, -0.12],
  ],
  [
    [0.72, -0.04],
    [0.76, -0.12],
  ],
  [
    [-0.3, 0.03],
    [-0.36, -0.1],
  ],
  [
    [-0.5, 0.0],
    [-0.56, -0.12],
  ],
  [
    [-0.72, -0.04],
    [-0.76, -0.12],
  ],
];

export const create: CreateAmbient = (baseEnv, hudRoot): Ambient => {
  const env = baseEnv as SuyuEnv;
  const lang = env.lang;
  const T = (l: L) => l[lang];
  const L = env.suyu.layout as CostaLayout;
  const root = new THREE.Group();
  root.name = "costa-huacas";
  env.scene.add(root);

  const g = new Geo();
  const quads: THREE.BufferGeometry[] = [];
  const spots: Spot[] = [];
  const zones: Array<{ id: string; label: string; x: number; z: number; r: number }> = [];
  const fires: THREE.Vector3[] = [];
  const khipus: Array<{ k: KhipuModel; x: number; z: number }> = [];
  const signQuads: Array<{ frame: Frame; cell: number }> = [];
  const signCells: Array<{ title: string; sub: string; foot: string; dye: string }> = [];
  const keeps: Array<ReturnType<typeof creatures.keepOut>> = [];
  const m4 = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const frameMatrix = (f: Frame) =>
    m4
      .clone()
      .compose(new THREE.Vector3(f.x, f.y, f.z), q4.clone().setFromAxisAngle(up, f.yaw), new THREE.Vector3(1, 1, 1));
  const frameOf = (id: string): Frame => {
    const pose = env.stationPose(id);
    return { x: pose.position.x, z: pose.position.z, y: L.groundAt(pose.position.x, pose.position.z), yaw: pose.yaw };
  };
  const addColliders = (f: Frame, b: Build) => {
    for (const r of b.rects) env.addCollider(rectAabb(f, r, 0.15));
    for (const c of b.circles) {
      const p = toWorld(f, c.x, c.z);
      env.addCollider({ kind: "circle", x: p.x, z: p.z, r: c.r });
    }
  };

  // Hud in panels-only mode (the suyu runtime owns the corner tools, help and map).
  let dismissed: string | null = null;
  const hud = createHud(hudRoot, lang, {
    onInteract: () => api.interact?.(),
    onPanelClose: (k) => {
      dismissed = k;
    },
    stations: [],
    trail: [],
    bare: true,
  });

  // ------------------------------------------------------------------ company stations
  for (const stop of COMPANY_STOPS) {
    const company = COMPANIES.find((c) => c.id === stop.companyId);
    if (!company) continue;
    const f = frameOf(stop.id);
    const b: Build = { g, q: new Quads(), rects: [], circles: [], fires: [] };
    g.post = frameMatrix(f);
    BUILDERS[stop.culture](b);
    signPosts(g);
    g.post = null;
    if (!b.q.empty) {
      const qg = b.q.build();
      qg.applyMatrix4(frameMatrix(f));
      quads.push(qg);
    }
    addColliders(f, b);
    for (const [x, y, z] of b.fires) {
      const p = toWorld(f, x, z);
      fires.push(new THREE.Vector3(p.x, f.y + y, p.z));
    }
    // The company's khipu on its frame, facing the road.
    const kp = toWorld(f, KHIPU_AT.x, KHIPU_AT.z);
    const k = buildKhipu(env, khipuFor(company.id), stop.t * 1000);
    k.group.position.set(kp.x, L.groundAt(kp.x, kp.z), kp.z);
    k.group.rotation.y = f.yaw;
    root.add(k.group);
    khipus.push({ k, x: kp.x, z: kp.z });
    env.addCollider({ kind: "circle", x: kp.x, z: kp.z, r: 0.5 });
    // Its reading spot: in front of the khipu.
    const fp = toWorld(f, KHIPU_AT.x, KHIPU_AT.z + 1.4);
    const cords = khipuFor(company.id);
    spots.push({
      id: stop.id,
      kind: "company",
      x: fp.x,
      z: fp.z,
      r: 3.6,
      priority: 1,
      panel: () => hud.company(company, cords),
    });
    // Sign.
    signQuads.push({ frame: f, cell: signCells.length });
    signCells.push({
      title: company.name,
      sub: T(CULTURES[stop.culture].name),
      foot: yearsLabel(company.stages, lang),
      dye: DYE[company.dye],
    });
    const sp = toWorld(f, SIGN_AT.x, SIGN_AT.z);
    env.addCollider({ kind: "circle", x: sp.x, z: sp.z, r: 0.35 });
    zones.push({ id: stop.id, label: company.name, x: f.x, z: f.z, r: 11 });
    // Keep animals and walkers off the monument.
    const mc = toWorld(f, 0, -18);
    keeps.push(creatures.keepOut(mc.x, mc.z, 15));
  }

  // ------------------------------------------------------------------ the Nazca hummingbird
  // Its own mesh, without ink: the lines are shallow furrows in the desert, not built walls.
  const lines = new Geo();
  {
    const stop = COMPANY_STOPS.find((s) => s.culture === "nasca");
    if (stop) {
      const f = frameOf(stop.id);
      const size = 23;
      const cx = 0;
      const cz = -56;
      const line = "#a3825f";
      for (const poly of HUMMINGBIRD) {
        for (let i = 0; i < poly.length - 1; i++) {
          const [u0, v0] = poly[i] as [number, number];
          const [u1, v1] = poly[i + 1] as [number, number];
          const steps = Math.max(1, Math.ceil(Math.hypot(u1 - u0, v1 - v0) * size));
          for (let k = 0; k < steps; k++) {
            const a = toWorld(
              f,
              cx + (u0 + ((u1 - u0) * k) / steps) * size,
              cz - (v0 + ((v1 - v0) * k) / steps) * size,
            );
            const c = toWorld(
              f,
              cx + (u0 + ((u1 - u0) * (k + 1)) / steps) * size,
              cz - (v0 + ((v1 - v0) * (k + 1)) / steps) * size,
            );
            const len = Math.hypot(c.x - a.x, c.z - a.z);
            const mx = (a.x + c.x) / 2;
            const mz = (a.z + c.z) / 2;
            const yaw = Math.atan2(c.x - a.x, c.z - a.z);
            const y = Math.max(L.heightAt(a.x, a.z), L.heightAt(c.x, c.z), L.heightAt(mx, mz));
            lines.box(0.6, 0.14, len + 0.55, mx, y - 0.08, mz, line, yaw);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ the market (artifacts)
  {
    const f = frameOf(STATION.market);
    STALLS.forEach((st, i) => {
      const a = ARTIFACTS[i];
      if (!a) return;
      g.post = frameMatrix(f).multiply(
        new THREE.Matrix4().compose(
          new THREE.Vector3(st.x, 0, st.z),
          q4.clone().setFromAxisAngle(up, st.yaw),
          new THREE.Vector3(1, 1, 1),
        ),
      );
      buildStall(g, { i }, DYE[a.dye]);
      // Stall-local → world (its frame is the station frame turned by the stall's yaw).
      const sf: Frame = { x: toWorld(f, st.x, st.z).x, z: toWorld(f, st.x, st.z).z, y: f.y, yaw: f.yaw + st.yaw };
      for (const [dx, dz] of [
        [-1.7, 1.2],
        [1.7, 1.2],
        [-1.7, -1.2],
        [1.7, -1.2],
      ] as const) {
        const p = toWorld(sf, dx, dz);
        env.addCollider({ kind: "circle", x: p.x, z: p.z, r: 0.2 });
      }
      const counter = toWorld(sf, 0, 0.6);
      env.addCollider({ kind: "circle", x: counter.x, z: counter.z, r: 1.0 });
      const sp = toWorld(sf, 0, 2.6);
      spots.push({
        id: `art:${a.id}`,
        kind: "artifact",
        x: sp.x,
        z: sp.z,
        r: 2.1,
        priority: 2,
        panel: () => hud.artifact(a),
      });
    });
    g.post = frameMatrix(f);
    signPosts(g);
    g.post = null;
    const center = toWorld(f, 0, 1.5);
    spots.push({
      id: STATION.market,
      kind: "info",
      x: center.x,
      z: center.z,
      r: 2.4,
      priority: 1,
      panel: () => hud.info(T(COPY.marketTitle), T(COPY.marketLede)),
    });
    signQuads.push({ frame: f, cell: signCells.length });
    signCells.push({ title: T(COPY.marketSign), sub: T(COPY.marketSub), foot: "Huanchaco", dye: DYE.turq });
    const sp = toWorld(f, SIGN_AT.x, SIGN_AT.z);
    env.addCollider({ kind: "circle", x: sp.x, z: sp.z, r: 0.35 });
    zones.push({ id: STATION.market, label: T(COPY.marketTitle), x: f.x, z: f.z, r: 12 });
  }

  // ------------------------------------------------------------------ meshes
  const mat = vertexToon();
  const geo = g.build();
  // The market's awnings carry a cloth `flex` (the rest of the merged mesh 0): they wave, the adobe stays.
  const clothMat = windSway(vertexToon(), { mode: "cloth", flex: true, amp: 1.6 });
  const mesh = new THREE.Mesh(geo, geo.getAttribute("flex") ? clothMat : mat);
  mesh.name = "costa-huacas:vc";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);

  const glyphGeo = lines.build();
  const glyph = new THREE.Mesh(glyphGeo, mat);
  glyph.name = "costa-huacas:geoglyph";
  glyph.receiveShadow = true;
  env.noOutline(glyph);
  root.add(glyph);

  const atlas = buildAtlas();
  const quadGeo = quads.length ? mergeAll(quads) : new THREE.BufferGeometry();
  const quadMat = new THREE.MeshToonMaterial({
    map: atlas,
    gradientMap: env.toon("#fff").gradientMap,
    side: THREE.DoubleSide,
  });
  // The Paracas mantles hang as cloth (Quads.hanging writes their flex; every frieze and wall quad is 0).
  windSway(quadMat, { mode: "cloth", flex: true, amp: 1.4 });
  const friezes = new THREE.Mesh(quadGeo, quadMat);
  friezes.name = "costa-huacas:friezes";
  friezes.receiveShadow = true;
  root.add(friezes);

  // Signs: one canvas atlas (two columns of 512 × 128 cells), one mesh.
  const ROWS = Math.ceil(signCells.length / 2);
  const drawSigns = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    signCells.forEach((c, i) => {
      const x = (i % 2) * 512;
      const y = Math.floor(i / 2) * 128;
      ctx.save();
      ctx.translate(x, y);
      // Carved board: warm wood, a dyed band on the left, ink border.
      ctx.fillStyle = "#7a5233";
      ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = "#8a6040";
      for (let k = 0; k < 128; k += 9) ctx.fillRect(0, k, 512, 3);
      ctx.fillStyle = c.dye;
      ctx.fillRect(10, 10, 22, 108);
      ctx.strokeStyle = "#2a1b12";
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, 506, 122);
      ctx.fillStyle = "#fbecd0";
      ctx.textBaseline = "middle";
      let px = 46;
      ctx.font = `800 ${px}px ${FONT.display}`;
      while (ctx.measureText(c.title).width > 450 && px > 20) {
        px -= 2;
        ctx.font = `800 ${px}px ${FONT.display}`;
      }
      ctx.fillText(c.title, 46, 44);
      ctx.fillStyle = "#e9c98f";
      ctx.font = `600 24px ${FONT.body}`;
      ctx.fillText(`${c.sub}`, 46, 88);
      ctx.textAlign = "right";
      ctx.font = `600 22px ${FONT.mono}`;
      ctx.fillText(c.foot, 496, 108);
      ctx.restore();
    });
  };
  const signTex = canvasTex(1024, ROWS * 128, drawSigns);
  const redrawSigns = () => redraw(signTex, drawSigns);
  onFontsReady(redrawSigns);
  const signPos: number[] = [];
  const signUv: number[] = [];
  const signNrm: number[] = [];
  for (const s of signQuads) {
    const cx = (s.cell % 2) * 0.5;
    const cy = Math.floor(s.cell / 2);
    const u0 = cx;
    const u1 = cx + 0.5;
    const v1 = 1 - cy / ROWS;
    const v0 = 1 - (cy + 1) / ROWS;
    const corners: Array<[number, number, number, number, number]> = [
      [-SIGN_AT.w / 2, SIGN_AT.y, u0, v0, 0],
      [SIGN_AT.w / 2, SIGN_AT.y, u1, v0, 0],
      [SIGN_AT.w / 2, SIGN_AT.y + SIGN_AT.h, u1, v1, 0],
      [-SIGN_AT.w / 2, SIGN_AT.y + SIGN_AT.h, u0, v1, 0],
    ];
    const wc = corners.map(([lx, ly, u, v]) => {
      const p = toWorld(s.frame, SIGN_AT.x + lx, SIGN_AT.z);
      return [p.x, s.frame.y + ly, p.z, u, v] as const;
    });
    const nx = Math.sin(s.frame.yaw);
    const nz = Math.cos(s.frame.yaw);
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const c = wc[k] as readonly [number, number, number, number, number];
      signPos.push(c[0], c[1], c[2]);
      signUv.push(c[3], c[4]);
      signNrm.push(nx, 0, nz);
    }
  }
  const signGeo = new THREE.BufferGeometry();
  signGeo.setAttribute("position", new THREE.Float32BufferAttribute(signPos, 3));
  signGeo.setAttribute("uv", new THREE.Float32BufferAttribute(signUv, 2));
  signGeo.setAttribute("normal", new THREE.Float32BufferAttribute(signNrm, 3));
  signGeo.computeBoundingSphere();
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, color: "#ece4d6" });
  const signs = new THREE.Mesh(signGeo, signMat);
  signs.name = "costa-huacas:signs";
  root.add(signs);
  inkMask(signs);

  // Night braziers: flames (instanced cones) + glows near the camera.
  const flameGeo = new THREE.ConeGeometry(0.22, 0.6, 6);
  const flameMat = new THREE.MeshBasicMaterial({ color: "#ffb35c" });
  const flames = new THREE.InstancedMesh(flameGeo, flameMat, Math.max(1, fires.length));
  flames.name = "costa-huacas:flames";
  flames.count = fires.length;
  flames.visible = false;
  flames.frustumCulled = false;
  env.noOutline(flames);
  root.add(flames);
  const glows = fires.map((p) => {
    const s = glowSprite(env, "#ffb35c", 2.4);
    s.position.copy(p);
    s.visible = false;
    root.add(s);
    return s;
  });

  // ------------------------------------------------------------------ interaction
  let active: Spot | null = null;
  let forced: string | null = null;
  let zoneId: string | null = null;
  let night: boolean | null = null;
  const dummy = new THREE.Object3D();
  const api: Ambient = {
    update(dt, avatar, t) {
      // Zone toast on entering a station.
      let z: (typeof zones)[number] | null = null;
      let zd = Infinity;
      for (const zz of zones) {
        const d = Math.hypot(zz.x - avatar.x, zz.z - avatar.z);
        if (d < zz.r && d < zd) {
          zd = d;
          z = zz;
        }
      }
      if ((z?.id ?? null) !== zoneId) {
        zoneId = z?.id ?? null;
        if (z) hud.toast(z.label);
      }
      // Reading spots: auto-open, like the tambos.
      const s = pickSpot(spots, avatar.x, avatar.z);
      if (s?.id !== active?.id) {
        active = s;
        if (forced && s?.id !== forced) forced = null;
        if (!s) dismissed = null;
        else if (dismissed && dismissed !== s.id) dismissed = null;
      }
      if (active && dismissed !== active.id) hud.panel(active.id, active.panel);
      else if (!forced) hud.panel(null);
      for (const k of khipus) k.k.update(dt, t, Math.hypot(k.x - avatar.x, k.z - avatar.z) < 4);

      // Night: flames and glows near the camera.
      const n = env.sky.isNight();
      if (n !== night) {
        night = n;
        flames.visible = n;
        if (!n) for (const gl of glows) gl.visible = false;
      }
      if (night) {
        const cam = env.camera.position;
        fires.forEach((p, i) => {
          const near = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2 < 90 * 90;
          const gl = glows[i] as THREE.Sprite;
          gl.visible = near;
          const fl = env.reducedMotion ? 1 : 1 + Math.sin(t * 9 + i * 1.7) * 0.12 + Math.sin(t * 15.3 + i) * 0.06;
          if (near) gl.scale.setScalar(2.4 * fl);
          dummy.position.set(p.x, p.y - 0.05, p.z);
          dummy.scale.set(1, fl, 1);
          dummy.rotation.set(0, t * 0.5 + i, 0);
          dummy.updateMatrix();
          flames.setMatrixAt(i, dummy.matrix);
        });
        flames.instanceMatrix.needsUpdate = true;
      }
    },
    prompt() {
      if (!active) return null;
      return hud.panelKey() === active.id ? T(COPY.close) : T(COPY.read);
    },
    interact() {
      if (!active) return false;
      if (hud.panelKey() === active.id) {
        dismissed = active.id;
        hud.panel(null);
      } else {
        dismissed = null;
        forced = active.id;
        hud.panel(active.id, active.panel);
      }
      return true;
    },
    escape() {
      const k = hud.panelKey();
      if (!k) return false;
      dismissed = k;
      forced = null;
      hud.panel(null);
      return true;
    },
    dispose() {
      offFontsReady(redrawSigns);
      for (const k of keeps) creatures.removeKeepOut(k);
      for (const k of khipus) k.k.dispose();
      hud.dispose();
      geo.dispose();
      glyphGeo.dispose();
      mat.dispose();
      clothMat.dispose();
      quadGeo.dispose();
      quadMat.dispose();
      atlas.dispose();
      signGeo.dispose();
      signMat.dispose();
      signTex.dispose();
      flameGeo.dispose();
      flameMat.dispose();
      for (const gl of glows) (gl.material as THREE.SpriteMaterial).dispose();
      root.removeFromParent();
    },
  };
  return api;
};

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const g of list) n += g.getAttribute("position").count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const flex = new Float32Array(n);
  let o = 0;
  for (const g of list) {
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    const nn = g.getAttribute("normal") as THREE.BufferAttribute;
    const u = g.getAttribute("uv") as THREE.BufferAttribute;
    pos.set(p.array as Float32Array, o * 3);
    nrm.set(nn.array as Float32Array, o * 3);
    uv.set(u.array as Float32Array, o * 2);
    const fx = g.getAttribute("flex") as THREE.BufferAttribute | undefined;
    if (fx) flex.set(fx.array as Float32Array, o);
    o += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setAttribute("flex", new THREE.BufferAttribute(flex, 1));
  out.computeBoundingSphere();
  return out;
}
