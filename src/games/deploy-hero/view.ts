import * as THREE from "three";
import { ARCADE_FONT, HUD_FONT, NEON, type NeonRole } from "../core/neon";
import { addLights, type Stage } from "../core/stage";
import type { GameContext } from "../core/types";
import {
  type Cls,
  costRate,
  type Ev,
  type Fit,
  fit,
  hasNoisy,
  type Node,
  type NodeKind,
  type Pod,
  QTICK,
  type State,
  selected,
  usedCpu,
  usedGpu,
  usedMem,
  utilization,
} from "./state";

export interface ViewCopy {
  kind: Record<NodeKind, string>;
  fit: Record<Fit, string>;
  status: Record<"Ready" | "NotReady" | "Cordoned" | "boot" | "notice", string>;
  pods: string;
  rate: string;
  spend: string;
  util: string;
  karpenter: string;
  drain: string;
  rollback: string;
  tags: { gpu: string; od: string; noisy: string; resched: string; rollout: string };
  pending: string;
}

const CLS: Record<Cls, NeonRole> = { svc: "dim", data: "dim", job: "dim", gpu: "lime" };
const KIND: Record<NodeKind, NeonRole> = { od: "violet", spot: "amber", gpu: "lime" };
const SP = 2.45;
const RACK_H = 2.5;
const HEAD_X = 0.6;
const Q_Z = 3.3;
const GATE_X = -10.5;

const css = (r: NeonRole) => NEON[r];
const col = (r: NeonRole) => new THREE.Color(NEON[r]);
const matte = (r: NeonRole) =>
  new THREE.MeshStandardMaterial({ color: NEON[r], roughness: 1, metalness: 0, flatShading: true });
const stepTime = (t: number) => Math.floor(t * 8) / 8;
const fontVar = (el: Element, v: string, fb: string) => getComputedStyle(el).getPropertyValue(v).trim() || fb;
const fitRole = (f: Fit): NeonRole =>
  f === "ok" ? "lime" : f === "noisy" ? "amber" : f === "cpu" || f === "mem" || f === "gpu" ? "red" : "dim";
const g1 = (n: number) => (Math.round(n * 10) / 10).toString();

const STYLE = `
.dh-ui{position:absolute;inset:0;pointer-events:none;font:500 12px/1.2 ${ARCADE_FONT};color:${NEON.ink};z-index:0;overflow:hidden}
.dh-ui button{pointer-events:auto;font:inherit;color:inherit;cursor:pointer}
.dh-node,.dh-fin,.dh-acts button,.dh-card,.dh-banner{border:3px solid ${NEON.void};border-radius:0;background:${NEON.floor};box-shadow:inset 0 -4px 0 ${NEON.grid}}
.dh-node{position:absolute;left:0;top:0;transform-origin:50% 100%;padding:5px 5px 8px;text-align:left;display:grid;gap:3px}
.dh-node[data-cur]{outline:3px solid ${NEON.cyan};outline-offset:0}
.dh-ui button:focus-visible{outline:3px solid ${NEON.ink};outline-offset:2px}
.dh-h{display:flex;justify-content:space-between;gap:4px;align-items:center;white-space:nowrap}
.dh-h b{font-weight:700;letter-spacing:.04em}
.dh-key{color:${NEON.dim};font-family:${HUD_FONT}}
.dh-chip{font-size:.82em;padding:1px 3px;border:2px solid currentColor;text-transform:uppercase;letter-spacing:.05em}
.dh-bar{position:relative;height:8px;border:1px solid ${NEON.void};background:${NEON.grid};overflow:hidden}
.dh-bar i{position:absolute;inset:0 auto 0 0;background:var(--c);box-shadow:inset 0 -2px 0 ${NEON.void}}
.dh-bar s{position:absolute;inset:0 auto 0 0;background:var(--c);opacity:.35}
.dh-bar::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0,transparent calc(10% - 2px),${NEON.void} calc(10% - 2px),${NEON.void} 10%)}
.dh-row{display:grid;grid-template-columns:2.6em 1fr;gap:4px;align-items:center;color:${NEON.dim};font-size:.86em}
.dh-fit{font-size:.82em;min-height:1.2em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dh-meta{color:${NEON.dim};font:500 .75em/1.2 ${HUD_FONT};display:flex;justify-content:space-between;gap:3px;flex-wrap:wrap}
.dh-fin{position:absolute;left:10px;top:10px;display:grid;grid-template-columns:auto auto;gap:3px 8px;padding:6px 8px 9px}
.dh-fin span{color:${NEON.dim}}.dh-fin b{color:${NEON.ink};font:600 .85em/1.2 ${HUD_FONT}}
.dh-fin .dh-bar{grid-column:1/-1;height:10px}
.dh-acts{position:absolute;left:10px;bottom:10px;display:flex;gap:6px}
.dh-acts button{padding:6px 8px 9px;color:var(--c);min-height:36px}
.dh-acts button:disabled{color:${NEON.dim};cursor:default}
.dh-acts button[aria-pressed=true]{background:var(--c);color:${NEON.void}}
.dh-card{position:absolute;right:10px;bottom:10px;width:min(40%,230px);padding:7px 9px 11px;display:grid;gap:4px}
.dh-card b{font:700 1.25em/1 ${ARCADE_FONT};letter-spacing:.04em}
.dh-num{font:500 .8em/1.3 ${HUD_FONT};font-variant-numeric:tabular-nums}
.dh-tags{display:flex;flex-wrap:wrap;gap:3px}
.dh-tags span{font-size:.8em;padding:1px 4px;border:2px solid currentColor}
.dh-banner{position:absolute;left:50%;top:10px;transform:translateX(-50%);font:700 15px/1.1 ${ARCADE_FONT};letter-spacing:.06em;text-transform:uppercase;text-align:center;padding:5px 12px 9px;opacity:0;white-space:normal;max-width:65%}
.dh-pop{position:absolute;font:800 16px/1 ${ARCADE_FONT};letter-spacing:.04em;transform:translate(-50%,-50%);white-space:nowrap;background:${NEON.void};padding:3px 5px}
.dh-sm .dh-node{padding:2px 3px 6px;gap:2px;font-size:9px}
.dh-sm .dh-meta,.dh-sm .dh-key{display:none}
.dh-sm .dh-row{grid-template-columns:1fr}.dh-sm .dh-row span{display:none}
.dh-sm .dh-fin{font-size:10px;gap:2px 5px;left:6px;top:6px}
.dh-sm .dh-acts{left:6px;bottom:6px;gap:4px;font-size:10px;flex-direction:column;align-items:flex-start}.dh-sm .dh-acts button{padding:3px 5px 7px;min-height:32px}
.dh-sm .dh-card{right:6px;bottom:6px;font-size:10px;padding:4px 6px 8px;width:44%}
.dh-sm .dh-banner{font-size:11px;top:90px;max-width:90%}
`;

interface RackV {
  g: THREE.Group;
  trim: THREE.MeshStandardMaterial;
  led: THREE.MeshStandardMaterial;
  blades: THREE.Group;
  sig: string;
  el: HTMLElement;
  html: string;
  x: number;
  rise: number;
}
interface PodV {
  m: THREE.Mesh;
  pos: THREE.Vector3;
  bar: THREE.Mesh;
  barMat: THREE.MeshStandardMaterial;
}
interface Flight {
  m: THREE.Object3D;
  a: THREE.Vector3;
  b: THREE.Vector3;
  t: number;
  crash: boolean;
  role: NeonRole;
}

export function createView(stage: Stage, ctx: GameContext, el: HTMLElement, c: ViewCopy) {
  const { scene } = stage;
  const cam = stage.camera as THREE.PerspectiveCamera;
  const rm = ctx.reducedMotion;
  scene.fog = new THREE.Fog(NEON.void, 16, 36);
  addLights(scene);

  const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map<NeonRole, THREE.MeshStandardMaterial>();
  const material = (role: NeonRole) => {
    let m = materials.get(role);
    if (!m) {
      m = matte(role);
      materials.set(role, m);
    }
    return m;
  };
  const block = (
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    m: THREE.Material,
  ) => {
    const mesh = new THREE.Mesh(cubeGeo, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    parent.add(mesh);
    return mesh;
  };
  // Tile seams and belt slats are blocks, batched into a single draw each.
  block(scene, 0, -0.18, 0, 200, 0.3, 200, material("void"));
  const tile = new THREE.Object3D();
  const tiles = new THREE.InstancedMesh(cubeGeo, material("floor"), 32 * 24);
  for (let z = 0; z < 24; z++)
    for (let x = 0; x < 32; x++) {
      tile.position.set((x - 15.5) * 1.25, -0.07, (z - 11.5) * 1.25);
      tile.scale.set(1.21, 0.1, 1.21);
      tile.updateMatrix();
      tiles.setMatrixAt(z * 32 + x, tile.matrix);
    }
  scene.add(tiles);

  const tower = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    block(tower, 0, 0.5 + i, 0, 1.3, 0.94, 1.3, material("grid"));
    block(tower, 0, 0.5 + i, 0.67, 0.65, 0.22, 0.12, material("dim"));
  }
  block(tower, 0, 5.12, 0, 1.65, 0.3, 1.65, material("floor"));
  block(tower, 0, 5.6, 0, 0.65, 0.65, 0.65, material("cyan"));
  tower.position.set(0, 0, -5.5);
  scene.add(tower);
  // A solid, right-angled block beam links the scheduler to the selected rack.
  const beam = new THREE.Group();
  const beamX = block(beam, 0, 5.6, -5.5, 0.14, 0.14, 0.14, material("cyan"));
  const beamZ = block(beam, 0, 5.6, -2.75, 0.14, 0.14, 5.5, material("cyan"));
  const beamY = block(beam, 0, 4.1, 0, 0.14, 3, 0.14, material("cyan"));
  scene.add(beam);

  const L = HEAD_X - GATE_X + 1.4;
  block(scene, (HEAD_X + GATE_X) / 2, 0.12, Q_Z, L, 0.24, 1.15, material("void"));
  for (const z of [-0.62, 0.62]) block(scene, (HEAD_X + GATE_X) / 2, 0.24, Q_Z + z, L, 0.18, 0.12, material("grid"));
  const slats = new THREE.InstancedMesh(cubeGeo, material("dim"), 24);
  slats.frustumCulled = false;
  scene.add(slats);
  const gate = new THREE.Group();
  for (const z of [-0.82, 0.82]) block(gate, 0, 1, z, 0.4, 2, 0.4, material("grid"));
  block(gate, 0, 2, 0, 0.5, 0.4, 2.04, material("grid"));
  block(gate, 0.26, 2, 0, 0.12, 0.22, 1.2, material("cyan"));
  gate.position.set(GATE_X, 0, Q_Z);
  scene.add(gate);
  const marker = (w: number, d: number) => {
    const g = new THREE.Group();
    for (const z of [-d / 2, d / 2]) block(g, 0, 0, z, w, 0.08, 0.12, material("cyan"));
    for (const x of [-w / 2, w / 2]) block(g, x, 0, 0, 0.12, 0.08, d, material("cyan"));
    scene.add(g);
    return g;
  };
  const headMarker = marker(1.14, 0.86);
  const cursorMarker = marker(1.95, 1.5);
  cursorMarker.position.y = 0.06;

  // --- particles (instanced) ---
  const PN = 160;
  const parts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), matte("ink"), PN);
  parts.frustumCulled = false;
  const pp = new Float32Array(PN * 3);
  const pv = new Float32Array(PN * 3);
  const pl = new Float32Array(PN);
  let pi = 0;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < PN; i++) parts.setColorAt(i, col("cyan"));
  scene.add(parts);
  const burst = (at: THREE.Vector3, role: NeonRole, n = 18) => {
    if (rm) return;
    const cc = col(role);
    for (let k = 0; k < n; k++) {
      const i = pi++ % PN;
      pp.set([at.x, at.y, at.z], i * 3);
      pv.set([(Math.random() - 0.5) * 5, Math.random() * 5, (Math.random() - 0.5) * 5], i * 3);
      pl[i] = 0.6 + Math.random() * 0.5;
      parts.setColorAt(i, cc);
    }
    if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
  };

  // --- shared pod assets ---
  const podGeo = new THREE.BoxGeometry(1.0, 0.62, 0.66);
  const bodyMat = material("floor");
  // Ordinary crates stay neutral; node trim carries the three infrastructure hues.
  const topMat = Object.fromEntries(
    (Object.keys(CLS) as Cls[]).map((k) => [k, material(k === "gpu" ? "lime" : "dim")]),
  ) as Record<Cls, THREE.MeshStandardMaterial>;
  const bladeMat = { ...topMat, noisy: material("red") };
  const barGeo = new THREE.BoxGeometry(0.9, 0.07, 0.04);
  const texCache = new Map<string, THREE.MeshBasicMaterial>();
  const arcade = fontVar(el, "--font-arcade", "Silkscreen");
  const mono = fontVar(el, "--font-mono", "JetBrains Mono");
  const label = (p: Pod) => {
    const k = `${p.app}|${p.cpu}|${p.mem}|${p.gpu}|${p.od}|${p.noisy}|${p.ver}`;
    let m = texCache.get(k);
    if (m) return m;
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 160;
    const g = cv.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = NEON.floor;
    g.fillRect(0, 0, 256, 160);
    g.strokeStyle = css(p.noisy ? "red" : "dim");
    g.lineWidth = 8;
    g.strokeRect(4, 4, 248, 152);
    g.fillStyle = NEON.ink;
    g.textBaseline = "top";
    // Name: compact mono, auto-sized to fit the label width so it never clips.
    const name = p.app;
    let size = 46;
    g.font = `800 ${size}px ${mono}, monospace`;
    // Keep clear of the crate's corner straps (~40px each side of the 256px label).
    while (g.measureText(name).width > 156 && size > 14) {
      size -= 2;
      g.font = `800 ${size}px ${mono}, monospace`;
    }
    g.textAlign = "center";
    g.fillText(name, 128, 18);
    g.textAlign = "left";
    const pip = (n: number, y: number, r: NeonRole) => {
      g.fillStyle = css(r);
      for (let i = 0; i < n; i++) g.fillRect(48 + i * 24, y, 16, 16);
    };
    pip(p.cpu, 72, "cyan");
    pip(p.mem, 100, "dim");
    g.font = `700 26px ${arcade}, monospace`;
    const tags: [string, NeonRole][] = [];
    if (p.gpu) tags.push(["GPU", "lime"]);
    if (p.od) tags.push(["OD", "amber"]);
    if (p.noisy) tags.push(["!", "red"]);
    if (p.ver > 1) tags.push([`v${p.ver}`, "cyan"]);
    let x = 212;
    for (const [t, r] of tags.reverse()) {
      x -= g.measureText(t).width + 10;
      g.fillStyle = css(r);
      g.fillText(t, x, 126);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Linear + mipmaps when the crate is small on screen; text stays legible instead of aliasing.
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    m = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff });
    texCache.set(k, m);
    return m;
  };

  // --- DOM layer ---
  const style = document.createElement("style");
  style.textContent = STYLE;
  const ui = document.createElement("div");
  ui.className = "dh-ui";
  ui.innerHTML = `<div class="dh-fin"></div><div class="dh-banner"></div>
<div class="dh-acts"><button type="button" data-a="k" style="--c:${NEON.lime}"></button><button type="button" data-a="c" style="--c:${NEON.amber}"></button><button type="button" data-a="r" style="--c:${NEON.red}"></button></div>
<div class="dh-card"></div>`;
  el.append(style, ui);
  const q = <T extends HTMLElement>(s: string) => ui.querySelector(s) as T;
  const fin = q(".dh-fin");
  const banner = q(".dh-banner");
  const card = q(".dh-card");
  const btn = {
    k: q<HTMLButtonElement>('[data-a="k"]'),
    c: q<HTMLButtonElement>('[data-a="c"]'),
    r: q<HTMLButtonElement>('[data-a="r"]'),
  };

  const racks = new Map<number, RackV>();
  const pods = new Map<number, PodV>();
  const flights: Flight[] = [];
  let shake = 0;
  let bannerT = 0;
  let small = false;
  let onNode: (i: number) => void = () => {};

  stage.onResize((w) => {
    small = w < 560;
    ui.classList.toggle("dh-sm", small);
  });

  const rackPos = (s: State, id: number) => {
    const r = racks.get(id);
    const i = s.nodes.findIndex((n) => n.id === id);
    return new THREE.Vector3(r ? r.x : (i - (s.nodes.length - 1) / 2) * SP, RACK_H + 0.2, 0);
  };

  const makeRack = (n: Node): RackV => {
    const g = new THREE.Group();
    const trim = matte(KIND[n.kind]);
    const led = matte("lime");
    block(g, 0, 0.1, 0, 1.8, 0.2, 1.3, material("grid"));
    block(g, 0, RACK_H - 0.1, 0, 1.8, 0.2, 1.3, trim);
    // Open front: the memory stack sits between chunky corner posts.
    for (const x of [-0.78, 0.78])
      for (const z of [-0.52, 0.52]) block(g, x, RACK_H / 2, z, 0.2, RACK_H - 0.4, 0.2, trim);
    block(g, 0, RACK_H / 2, -0.58, 1.4, RACK_H - 0.4, 0.12, material("floor"));
    block(g, 0, RACK_H - 0.1, 0.68, 0.24, 0.12, 0.12, led);
    const blades = new THREE.Group();
    g.add(blades);
    if (n.kind === "gpu") for (const x of [-0.4, 0.4]) block(g, x, RACK_H + 0.13, 0, 0.45, 0.26, 0.6, material("grid"));
    scene.add(g);
    const div = document.createElement("button");
    div.type = "button";
    div.className = "dh-node";
    ui.appendChild(div);
    const r: RackV = { g, trim, led, blades, sig: "", el: div, html: "", x: 0, rise: rm ? 1 : 0 };
    div.addEventListener("click", () => {
      const s = lastS;
      if (!s) return;
      const i = s.nodes.findIndex((x) => racks.get(x.id) === r);
      if (i >= 0) onNode(i);
    });
    return r;
  };
  let lastS: State | null = null;

  const dropRack = (id: number) => {
    const r = racks.get(id);
    if (!r) return;
    scene.remove(r.g);
    r.trim.dispose();
    r.led.dispose();
    r.el.remove();
    racks.delete(id);
  };

  const panel = (s: State, n: Node, i: number, sel: Pod | undefined) => {
    const st = n.drainIn > 0 || n.status === "Cordoned" ? "Cordoned" : n.status;
    const boot = st === "NotReady" && n.downIn > 0 && !n.pods.length;
    const chipRole: NeonRole = st === "Ready" ? (n.noticeIn ? "amber" : "lime") : st === "NotReady" ? "red" : "amber";
    const chip = n.noticeIn ? c.status.notice : boot && n.downIn < 2 ? c.status.boot : c.status[st];
    const uc = usedCpu(n);
    const um = usedMem(n);
    const burstRisk = hasNoisy(n) && um + 2 > n.mem && s.burstIn < 4;
    let fitTxt = "";
    let fitR: NeonRole = "dim";
    if (sel) {
      const f = fit(n, sel);
      fitTxt = c.fit[f];
      fitR = fitRole(f);
    } else if (burstRisk) {
      fitTxt = c.fit.noisy;
      fitR = "amber";
    }
    const pc = sel && fitR !== "dim" ? Math.min(1, (uc + sel.cpu) / n.cpu) : 0;
    const pm = sel && fitR !== "dim" ? Math.min(1, (um + sel.mem) / n.mem) : 0;
    const bar = (u: number, cap: number, proj: number, r: NeonRole) =>
      `<div class="dh-bar" style="--c:${css(r)}"><s style="width:${proj * 100}%"></s><i style="width:${(u / cap) * 100}%"></i></div>`;
    const memR: NeonRole = burstRisk ? "red" : "dim";
    return `<div class="dh-h"><b style="color:${css(KIND[n.kind])}">${small ? c.kind[n.kind].slice(0, 4) : c.kind[n.kind]}</b><span class="dh-key">[${i + 1}]</span></div>
<div class="dh-h"><span class="dh-chip" style="color:${css(chipRole)}">${chip}</span></div>
<div class="dh-row"><span>CPU</span>${bar(uc, n.cpu, pc, "cyan")}</div>
<div class="dh-row"><span>MEM</span>${bar(um, n.mem, pm, memR)}</div>
<div class="dh-meta"><span>${n.pods.length} ${c.pods}</span><span>${g1(n.cpu / 2 - uc / 2)}c ${(n.mem - um) * 2}Gi${n.gpus ? ` · ${n.gpus - usedGpu(n)}gpu` : ""}</span></div>
<div class="dh-fit" style="color:${css(fitR)}">${fitTxt || "&nbsp;"}</div>`;
  };

  const syncRack = (s: State, n: Node, i: number, sel: Pod | undefined, dt: number, t: number) => {
    let r = racks.get(n.id);
    if (!r) {
      r = makeRack(n);
      r.x = (i - (s.nodes.length - 1) / 2) * SP;
      if (dt === 0) r.rise = 1;
      racks.set(n.id, r);
    }
    const tx = (i - (s.nodes.length - 1) / 2) * SP;
    r.x = tx;
    r.rise = Math.min(1, r.rise + dt * 1.6);
    r.g.position.set(r.x, 0, 0);
    r.g.scale.y = 0.05 + 0.95 * (Math.floor(r.rise * 8) / 8);
    // Crate height is proportional to memory; bands make the stack readable.
    const sig = n.pods.map((p) => `${p.id}:${p.mem}:${p.noisy}:${p.cls}`).join(",") + n.mem;
    if (sig !== r.sig) {
      r.sig = sig;
      r.blades.clear();
      let y = 0.2;
      for (const p of n.pods) {
        const share = (p.mem / n.mem) * (RACK_H - 0.4);
        const h = Math.max(0.04, share - 0.04);
        block(r.blades, 0, y + h / 2, 0, 1.28, h, 0.9, p.noisy ? bladeMat.noisy : bladeMat[p.cls]);
        for (const x of [-0.4, 0.4]) block(r.blades, x, y + h / 2, 0.46, 0.1, h, 0.06, material("grid"));
        y += share;
      }
    }
    const st = n.drainIn > 0 || n.status === "Cordoned" ? "c" : n.status === "NotReady" ? "n" : n.noticeIn ? "w" : "r";
    const cur = i === s.cursor;
    // The type trim stays fixed even during warnings; status has its own block.
    r.led.color.copy(col(st === "r" ? "lime" : st === "n" ? "red" : "amber"));
    r.led.visible = rm || st === "r" || Math.floor(t * 4) % 2 === 0;
    // DOM panel
    const html = panel(s, n, i, sel);
    if (html !== r.html) {
      r.html = html;
      r.el.innerHTML = html;
    }
    if (cur) r.el.setAttribute("data-cur", "");
    else r.el.removeAttribute("data-cur");
    const top = new THREE.Vector3(r.x, RACK_H * r.g.scale.y + 0.25, 0).project(cam);
    const edgeL = new THREE.Vector3(r.x - SP / 2, RACK_H, 0).project(cam);
    const w = Math.max(54, (top.x - edgeL.x) * stage.size.w * 0.94);
    const px = ((top.x + 1) / 2) * stage.size.w;
    const py = ((1 - top.y) / 2) * stage.size.h;
    r.el.style.width = `${w}px`;
    r.el.style.transform = `translate(${px - w / 2}px, calc(${py}px - 100%))`;
  };

  const slotPos = (i: number) => new THREE.Vector3(HEAD_X - i * 1.3, 0.59, Q_Z);

  const syncPods = (s: State, dt: number, t: number) => {
    const live = new Set<number>();
    s.queue.forEach((p, i) => {
      live.add(p.id);
      let v = pods.get(p.id);
      if (!v) {
        const m = new THREE.Mesh(podGeo, [bodyMat, bodyMat, topMat[p.cls], bodyMat, label(p), bodyMat]);
        m.position.set(GATE_X, 0.59, Q_Z);
        for (const x of [-0.36, 0.36]) block(m, x, 0, 0, 0.1, 0.66, 0.7, material("grid"));
        const barMat = matte("amber");
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.set(0, -0.42, 0.34);
        m.add(bar);
        scene.add(m);
        v = { m, pos: m.position.clone(), bar, barMat };
        pods.set(p.id, v);
      }
      const target = slotPos(i);
      const isSel = i === s.sel;
      if (isSel) target.y += 0.25;
      v.pos.lerp(target, rm ? 1 : Math.min(1, dt * 7 || 1));
      v.m.position.set(
        Math.round(v.pos.x * 20) / 20,
        Math.round(v.pos.y * 20) / 20 + (isSel && !rm ? (Math.floor(t * 4) % 2) * 0.08 : 0),
        v.pos.z,
      );
      v.m.rotation.y = 0;
      const k = Math.max(0, p.wait / p.max);
      v.bar.scale.x = Math.max(0.001, k);
      v.bar.position.x = -0.45 * (1 - k);
      v.barMat.color.copy(col(i >= QTICK ? "dim" : k < 0.3 ? "red" : "amber"));
      if (k < 0.3 && i < QTICK && !rm) v.m.position.x += Math.floor(t * 8) % 2 ? 0.02 : -0.02;
    });
    for (const [id, v] of pods)
      if (!live.has(id)) {
        scene.remove(v.m);
        v.barMat.dispose();
        pods.delete(id);
      }
    const sp = s.queue[s.sel];
    headMarker.visible = !!sp;
    if (sp) headMarker.position.set(slotPos(s.sel).x, 0.32, Q_Z);
  };

  const say = (text: string, role: NeonRole, secs = 2.4) => {
    banner.textContent = text;
    banner.style.color = css(role === "magenta" ? "red" : role);
    banner.style.opacity = "1";
    bannerT = secs;
  };
  const pop = (at: THREE.Vector3, text: string, role: NeonRole) => {
    const v = at.clone().project(cam);
    const d = document.createElement("div");
    d.className = "dh-pop";
    d.textContent = text;
    d.style.color = css(role);
    d.style.left = `${((v.x + 1) / 2) * stage.size.w}px`;
    d.style.top = `${((1 - v.y) / 2) * stage.size.h}px`;
    ui.appendChild(d);
    d.animate(
      rm
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { opacity: 1, translate: "0 0" },
            { opacity: 0, translate: "0 -36px" },
          ],
      { duration: 1100, easing: rm ? "linear" : "steps(6, end)" },
    ).onfinish = () => d.remove();
  };

  const fly = (s: State, p: Pod, node: number, crash: boolean) => {
    const v = pods.get(p.id);
    const b = rackPos(s, node);
    if (!v) return;
    pods.delete(p.id);
    v.m.remove(v.bar);
    v.barMat.dispose();
    flights.push({ m: v.m, a: v.m.position.clone(), b, t: 0, crash, role: crash ? "red" : CLS[p.cls] });
  };

  const fx = (s: State, evs: Ev[]) => {
    for (const e of evs) {
      if (e.t === "place") {
        fly(s, e.pod, e.node, false);
        pop(rackPos(s, e.node).setY(RACK_H + 1.4), `+${e.gain}${e.snug ? " ▣" : ""}`, e.snug ? "lime" : "cyan");
      } else if (e.t === "crash") fly(s, e.pod, e.node, true);
      else if (e.t === "block") {
        const r = racks.get(e.node);
        if (r && !rm) r.g.position.x += 0.15;
        pop(rackPos(s, e.node), c.fit[e.why], "dim");
      } else if (e.t === "pending") {
        const v = pods.get(e.pod.id);
        if (v) burst(v.m.position, "red", 24);
        shake = 0.35;
      } else if (e.t === "oom" || e.t === "nodeDown" || e.t === "reclaim") {
        const at = rackPos(s, e.node);
        burst(at, e.t === "reclaim" ? "amber" : "red", 26);
        shake = Math.max(shake, 0.3);
      } else if (e.t === "requeue") {
        const at = rackPos(s, e.node);
        for (const p of e.pods) {
          const v = pods.get(p.id);
          if (v) {
            v.pos.copy(at);
            v.m.position.copy(at);
          }
        }
      } else if (e.t === "terminate" || e.t === "complete") {
        const r = racks.get(e.node);
        if (r) burst(new THREE.Vector3(r.x, 1, 0.7), e.t === "terminate" ? "red" : "dim", 6);
      } else if (e.t === "removed") {
        const r = racks.get(e.node);
        if (r) burst(new THREE.Vector3(r.x, 1.2, 0), "violet", 20);
        dropRack(e.node);
      }
    }
  };

  return {
    say,
    pop,
    onNode(cb: (i: number) => void) {
      onNode = cb;
    },
    buttons: btn,
    sync(s: State, dt: number, t: number, evs: Ev[]) {
      lastS = s;
      // Fit the rack row before projecting DOM panels; keep the scene steady.
      const half = ((s.nodes.length - 1) / 2) * SP + 1.6;
      const fitZ = half / (Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect);
      const z = Math.max(14.5, fitZ + (cam.aspect < 1 ? 1 : 4));
      shake = Math.max(0, shake - dt);
      const sh = rm ? 0 : shake * 0.35;
      const jitter = Math.floor(t * 12) % 2 ? sh : -sh;
      cam.position.set(jitter, z * 0.62, z);
      cam.lookAt(0, cam.aspect < 1 ? 2.6 : 1.9, 0);
      cam.updateMatrixWorld();

      // remove racks that left the cluster (reclaimed)
      fx(s, evs);
      const ids = new Set(s.nodes.map((n) => n.id));
      for (const id of [...racks.keys()]) if (!ids.has(id)) dropRack(id);
      // queue pods first so flights find their meshes
      syncPods(s, dt, t);
      const sel = selected(s);
      s.nodes.forEach((n, i) => {
        syncRack(s, n, i, sel, dt, t);
      });

      // Crates hop in short steps into the memory stack.
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i];
        f.t += dt / 0.42;
        const k = rm ? 1 : Math.min(1, Math.floor(f.t * 6) / 6);
        const p = f.a.clone().lerp(f.b, k);
        p.y += rm ? 0 : k > 0 && k < 1 ? 1.5 : 0;
        f.m.position.copy(p);
        f.m.scale.setScalar(1 - k * 0.5);
        if (k >= 1) {
          scene.remove(f.m);
          flights.splice(i, 1);
          burst(f.b, f.role, f.crash ? 30 : 14);
          if (f.crash) {
            shake = 0.4;
          }
        }
      }

      // Square selection markers, solid scheduler beam and stepped belt slats.
      const cn = s.nodes[s.cursor];
      const cr = cn ? racks.get(cn.id) : undefined;
      cursorMarker.visible = beam.visible = !!cr;
      if (cr) {
        cursorMarker.position.x = cr.x;
        beamX.position.x = cr.x / 2;
        beamX.scale.x = Math.max(0.14, Math.abs(cr.x));
        beamZ.position.x = beamY.position.x = cr.x;
      }
      for (let i = 0; i < slats.count; i++) {
        const off = rm ? 0 : (stepTime(t) * 1.2) % (L / slats.count);
        tile.position.set(GATE_X - 0.5 + (i * L) / slats.count + off, 0.27, Q_Z);
        tile.scale.set(L / slats.count - 0.08, 0.08, 1.05);
        tile.updateMatrix();
        slats.setMatrixAt(i, tile.matrix);
      }
      slats.instanceMatrix.needsUpdate = true;

      // particles
      for (let i = 0; i < PN; i++) {
        if (pl[i] > 0) {
          pl[i] -= dt;
          pv[i * 3 + 1] -= 9 * dt;
          for (let a = 0; a < 3; a++) pp[i * 3 + a] += pv[i * 3 + a] * dt;
        }
        dummy.position.set(
          Math.round(pp[i * 3] * 8) / 8,
          Math.round(pp[i * 3 + 1] * 8) / 8,
          Math.round(pp[i * 3 + 2] * 8) / 8,
        );
        dummy.scale.setScalar(pl[i] > 0 ? Math.min(1, pl[i] * 2) : 0);
        dummy.updateMatrix();
        parts.setMatrixAt(i, dummy.matrix);
      }
      parts.instanceMatrix.needsUpdate = true;

      // HUD
      const util = utilization(s);
      const fh = `<span>${c.rate}</span><b>$${costRate(s).toFixed(2)}/h</b><span>${c.spend}</span><b>$${s.spend.toFixed(2)}</b><span>${c.util}</span><b style="color:${css(util > 0.6 ? "lime" : util > 0.35 ? "amber" : "red")}">${Math.round(util * 100)}%</b><div class="dh-bar" role="meter" aria-label="${c.util}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(util * 100)}" style="--c:${css(util > 0.6 ? "lime" : util > 0.35 ? "amber" : "red")}"><i style="width:${Math.round(util * 100)}%"></i></div>`;
      if (fin.innerHTML !== fh) fin.innerHTML = fh;
      const kt = `[K] ${c.karpenter} ×${s.karpenter}`;
      if (btn.k.textContent !== kt) btn.k.textContent = kt;
      btn.k.disabled = s.karpenter <= 0 || s.nodes.length >= 6;
      if (btn.c.textContent !== `[C] ${c.drain}`) btn.c.textContent = `[C] ${c.drain}`;
      const rt = `[R] ${c.rollback} ×${s.rollback}`;
      if (btn.r.textContent !== rt) btn.r.textContent = rt;
      btn.r.disabled = s.rollback <= 0;
      const p = selected(s);
      card.style.visibility = p ? "visible" : "hidden";
      if (p) {
        const tags = [
          p.gpu && [c.tags.gpu, "lime"],
          p.od && [c.tags.od, "amber"],
          p.noisy && [c.tags.noisy, "red"],
          p.rollout && [c.tags.rollout, "cyan"],
          p.resched && [c.tags.resched, "violet"],
        ].filter(Boolean) as [string, NeonRole][];
        const ch = `<b style="color:${css(CLS[p.cls])}">${p.app}${p.ver > 1 ? ` v${p.ver}` : ""}</b>
<span class="dh-num">cpu ${g1(p.cpu / 2)} · mem ${p.mem * 2}Gi</span>
<div class="dh-tags">${tags.map(([x, r]) => `<span style="color:${css(r)}">${x}</span>`).join("")}</div>
<span class="dh-num" style="color:${css(p.wait / p.max < 0.3 ? "red" : "amber")}">${c.pending} ${Math.max(0, p.wait).toFixed(1)}s</span>`;
        if (card.innerHTML !== ch) card.innerHTML = ch;
      }
      if (bannerT > 0) {
        bannerT -= dt;
        if (bannerT <= 0) banner.style.opacity = "0";
      }
    },
    /** Ray-pick a queued pod on the canvas (index in queue) or -1. */
    pick(s: State, cx: number, cy: number) {
      const rect = stage.canvas.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1),
        cam,
      );
      const ms = s.queue.map((p) => pods.get(p.id)?.m).filter(Boolean) as THREE.Mesh[];
      const hit = ray.intersectObjects(ms, false)[0];
      if (hit) return { pod: ms.indexOf(hit.object as THREE.Mesh), node: -1 };
      const rs = s.nodes.map((n) => racks.get(n.id)?.g).filter(Boolean) as THREE.Group[];
      const h2 = ray.intersectObjects(rs, true)[0];
      if (h2) return { pod: -1, node: rs.findIndex((g) => g === h2.object.parent || g === h2.object.parent?.parent) };
      return { pod: -1, node: -1 };
    },
    reset() {
      for (const id of [...racks.keys()]) dropRack(id);
      for (const [, v] of pods) {
        scene.remove(v.m);
        v.barMat.dispose();
      }
      pods.clear();
      for (const f of flights) scene.remove(f.m);
      flights.length = 0;
      pl.fill(0);
      bannerT = 0;
      banner.style.opacity = "0";
      shake = 0;
    },
    dispose() {
      this.reset();
      tiles.dispose();
      slats.dispose();
      parts.dispose();
      for (const m of texCache.values()) {
        m.map?.dispose();
        m.dispose();
      }
      podGeo.dispose();
      barGeo.dispose();
      cubeGeo.dispose();
      for (const m of materials.values()) m.dispose();
      style.remove();
      ui.remove();
    },
  };
}

export type View = ReturnType<typeof createView>;
