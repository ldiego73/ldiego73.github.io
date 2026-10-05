import * as THREE from "three";
import { NEON } from "../core/neon";
import { addLights, createStage } from "../core/stage";
import type { Component } from "./scenarios";

/** Diorama layout: 4 columns x 3 rows on the block floor (x, z). */
const POS: Record<Component, [number, number]> = {
  cost: [-4.5, -3.3],
  cloud: [-1.5, -3.3],
  cache: [1.5, -3.3],
  obs: [4.5, -3.3],
  edge: [-4.5, 0],
  gw: [-1.5, 0],
  k8s: [1.5, 0],
  db: [4.5, 0],
  sec: [-4.5, 3.3],
  ci: [-1.5, 3.3],
  ops: [1.5, 3.3],
  stream: [4.5, 3.3],
};
const NAMES: Record<Component, string> = {
  cost: "FINOPS",
  cloud: "CLOUD",
  cache: "REDIS",
  obs: "GRAFANA",
  edge: "DNS · CDN",
  gw: "GATEWAY",
  k8s: "K8S",
  db: "DATA",
  sec: "SECURITY",
  ci: "GITOPS",
  ops: "BRIDGE",
  stream: "KAFKA · SQS",
};
const LINKS: Array<[Component, Component]> = [
  ["edge", "gw"],
  ["gw", "k8s"],
  ["k8s", "db"],
  ["k8s", "cache"],
  ["k8s", "stream"],
  ["cloud", "gw"],
  ["cost", "cloud"],
  ["sec", "gw"],
  ["ci", "k8s"],
  ["obs", "db"],
  ["ops", "k8s"],
  ["edge", "sec"],
];
const BOX = new THREE.Box3(new THREE.Vector3(-6.5, -0.35, -5.5), new THREE.Vector3(6.5, 3, 5.5));

type Mood = "idle" | "alert" | "good" | "bad";
type Block = [number, number, number, number, number, number];
interface Part {
  group: THREE.Group;
  body: THREE.MeshLambertMaterial;
  top: number;
}

export function createView(el: HTMLElement, reducedMotion: boolean) {
  const stage = createStage(el, { camera: "persp", fov: 34, bloom: false });
  const { scene } = stage;
  const camera = stage.camera as THREE.PerspectiveCamera;
  addLights(scene);
  let running = false;
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const matte = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const stone = matte(NEON.grid);
  const floorMat = matte(NEON.floor);
  const cyan = matte(NEON.cyan);
  const lime = matte(NEON.lime);
  const tmp = new THREE.Object3D();
  const batch = (blocks: Block[], material: THREE.MeshLambertMaterial, parent: THREE.Object3D) => {
    const mesh = new THREE.InstancedMesh(cube, material, blocks.length);
    blocks.forEach(([x, y, z, w, h, d], i) => {
      tmp.position.set(x, y, z);
      tmp.scale.set(w, h, d);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    parent.add(mesh);
    return mesh;
  };

  const tiles: Block[] = [];
  for (let x = -6; x <= 6; x++) {
    for (let z = -5; z <= 5; z++) tiles.push([x, -0.18, z, 0.97, 0.32, 0.97]);
  }
  batch(tiles, floorMat, scene);

  const parts = {} as Record<Component, Part>;
  const names: { el: HTMLElement; component: Component }[] = [];
  const add = (
    c: Component,
    build: (put: (x: number, y: number, z: number, w: number, h: number, d: number, accent?: boolean) => void) => void,
  ) => {
    const group = new THREE.Group();
    const body = matte(NEON.grid);
    const blocks: Block[] = [];
    const accents: Block[] = [];
    let top = 0;
    build((x, y, z, w, h, d, accent = false) => {
      (accent ? accents : blocks).push([x, y, z, w, h, d]);
      top = Math.max(top, y + h / 2);
    });
    batch(blocks, body, group);
    if (accents.length) batch(accents, cyan, group);
    group.position.set(POS[c][0], 0, POS[c][1]);
    scene.add(group);
    parts[c] = { group, body, top };
    const name = document.createElement("div");
    name.className = "ic-name";
    name.textContent = NAMES[c];
    el.appendChild(name);
    names.push({ el: name, component: c });
  };

  // Each landmark uses square blocks; cyan details identify the service faces.
  add("edge", (put) => {
    for (const x of [-0.5, 0.5]) {
      for (let y = 0; y < 3; y++) put(x, 0.25 + y * 0.5, 0, 0.46, 0.46, 0.6);
      put(x, 1.8, 0, 0.65, 0.2, 0.8, true);
    }
  });
  add("gw", (put) => {
    // Load balancer: a stacked tower with three routing slots.
    for (let y = 0; y < 3; y++) {
      put(0, 0.3 + y * 0.6, 0, 1.2, 0.55, 0.9);
      put(0, 0.3 + y * 0.6, 0.47, 0.8, 0.12, 0.08, true);
    }
  });
  add("k8s", (put) => {
    for (const [x, z] of [
      [-0.5, 0.3],
      [0.5, 0.3],
      [0, -0.6],
    ]) {
      put(x, 0.45, z, 0.75, 0.85, 0.75);
      put(x, 0.88, z, 0.8, 0.12, 0.8, true);
      put(x, 0.4, z + 0.39, 0.12, 0.65, 0.06, true);
    }
  });
  add("db", (put) => {
    // Three stone drums, with a pixelated circular footprint.
    for (let layer = 0; layer < 3; layer++) {
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          if (Math.abs(x) + Math.abs(z) > 1) continue;
          put(x * 0.5, 0.25 + layer * 0.5, z * 0.5, 0.48, 0.44, 0.48);
        }
      }
      put(0, 0.25 + layer * 0.5, 0.76, 0.3, 0.12, 0.06, true);
    }
  });
  add("cache", (put) => {
    for (let y = 0; y < 2; y++) {
      put(0, 0.35 + y * 0.7, 0, 1, 0.65, 0.8);
      put(0, 0.35 + y * 0.7, 0.43, 0.65, 0.14, 0.06, true);
    }
  });
  add("stream", (put) => {
    for (const x of [-0.8, 0.8]) put(x, 0.2, 0, 0.22, 0.4, 0.85);
    for (let i = 0; i < 5; i++) put(-0.8 + i * 0.4, 0.45, 0, 0.36, 0.16, 0.85);
    for (const x of [-0.6, 0.2, 0.7]) put(x, 0.75, 0, 0.28, 0.4, 0.35, true);
  });
  add("cloud", (put) => {
    for (const x of [-0.5, 0.5]) {
      put(x, 0.6, 0, 0.8, 1.2, 0.9);
      for (let y = 0; y < 3; y++) put(x, 0.3 + y * 0.3, 0.48, 0.5, 0.1, 0.06, true);
    }
  });
  add("cost", (put) => {
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y <= x; y++) put(-0.6 + x * 0.6, 0.25 + y * 0.5, 0, 0.48, 0.46, 0.6, y === x);
    }
  });
  add("obs", (put) => {
    put(0, 0.45, 0, 0.25, 0.9, 0.3);
    put(0, 1.3, 0, 1.7, 1, 0.3);
    for (let i = 0; i < 5; i++) put(-0.6 + i * 0.3, 1.05 + ((i * 3) % 4) * 0.12, 0.18, 0.18, 0.18, 0.06, true);
  });
  add("ci", (put) => {
    put(0, 0.15, 0, 2, 0.3, 0.8);
    for (const x of [-0.65, 0, 0.65]) {
      put(x, 0.55, 0, 0.48, 0.48, 0.48);
      put(x, 0.8, 0, 0.5, 0.08, 0.5, true);
    }
  });
  add("sec", (put) => {
    put(0, 0.5, 0, 1.1, 1, 0.6);
    for (const x of [-0.35, 0.35]) put(x, 1.2, 0, 0.2, 0.6, 0.3);
    put(0, 1.5, 0, 0.9, 0.2, 0.3);
    put(0, 0.55, 0.33, 0.2, 0.3, 0.06, true);
  });
  add("ops", (put) => {
    put(0, 0.35, 0, 0.9, 0.7, 0.9);
    for (const [x, z] of [
      [-0.8, 0],
      [0.8, 0],
      [0, -0.8],
      [0, 0.8],
    ]) {
      put(x, 0.25, z, 0.35, 0.5, 0.35);
      put(x, 0.6, z, 0.35, 0.2, 0.35, true);
    }
  });

  // Manhattan block paths keep every packet on the voxel grid.
  const paths = LINKS.map(([a, b]) => {
    const [ax, az] = POS[a];
    const [bx, bz] = POS[b];
    const steps = Math.round((Math.abs(bx - ax) + Math.abs(bz - az)) / 0.3);
    const points: THREE.Vector3[] = [];
    const dx = Math.abs(bx - ax);
    for (let i = 0; i <= steps; i++) {
      const distance = i * 0.3;
      points.push(
        new THREE.Vector3(
          ax + Math.sign(bx - ax) * Math.min(distance, dx),
          0.07,
          az + Math.sign(bz - az) * Math.max(0, distance - dx),
        ),
      );
    }
    return points;
  });
  batch(
    paths.flatMap((path) => path.map((p): Block => [p.x, p.y, p.z, 0.27, 0.12, 0.27])),
    stone,
    scene,
  );
  const packets = new THREE.InstancedMesh(cube, cyan, LINKS.length * 2);
  packets.frustumCulled = false;
  scene.add(packets);
  const beaconMat = matte(NEON.red);
  const beacon = new THREE.Mesh(cube, beaconMat);
  beacon.scale.set(0.38, 0.38, 0.38);
  beacon.visible = false;
  scene.add(beacon);
  const burst = new THREE.InstancedMesh(cube, lime, 12);
  burst.visible = false;
  burst.frustumCulled = false;
  scene.add(burst);

  const label = document.createElement("div");
  label.className = "ic-metric";
  label.hidden = true;
  el.appendChild(label);
  const pops: { el: HTMLElement; t: number }[] = [];
  // ── Camera: fit the diorama inside the band between the alert card and the buttons.
  const target = new THREE.Vector3(0, 0.6, 0.3);
  const EL = 1.04; // elevation (rad)
  let dist = 20;
  let inset = { top: 0, bottom: 0 };
  const place = (d: number, y: number) => {
    camera.position.set(
      target.x + Math.sin(y) * Math.cos(EL) * d,
      target.y + Math.sin(EL) * d,
      target.z + Math.cos(y) * Math.cos(EL) * d,
    );
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };
  const v3 = new THREE.Vector3();
  const extents = () => {
    const { w, h } = stage.size;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      v3.set(i & 1 ? BOX.max.x : BOX.min.x, i & 2 ? BOX.max.y : BOX.min.y, i & 4 ? BOX.max.z : BOX.min.z).project(
        camera,
      );
      const px = ((v3.x + 1) / 2) * w;
      const py = ((1 - v3.y) / 2) * h;
      x0 = Math.min(x0, px);
      x1 = Math.max(x1, px);
      y0 = Math.min(y0, py);
      y1 = Math.max(y1, py);
    }
    return { x0, x1, y0, y1 };
  };
  const fit = () => {
    const { w, h } = stage.size;
    camera.aspect = w / h;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const availH = Math.max(90, h - inset.top - inset.bottom - 12);
    for (let i = 0; i < 5; i++) {
      place(dist, 0);
      const e = extents();
      const s = Math.max((e.x1 - e.x0) / Math.max(100, w - 20), (e.y1 - e.y0) / availH);
      dist = Math.min(80, Math.max(8, dist * s));
    }
    place(dist, 0);
    const e = extents();
    const cy = inset.top + 6 + availH / 2;
    camera.setViewOffset(w, h, (e.x0 + e.x1) / 2 - w / 2, (e.y0 + e.y1) / 2 - cy, w, h);
    camera.updateProjectionMatrix();
  };

  let focus: Component | null = null;
  let mood: Mood = "idle";
  let moodT = 0;
  let flow = 0;
  let speed = 1;
  let disposed = false;
  const projectLabel = (node: HTMLElement, x: number, y: number, z: number) => {
    v3.set(x, y, z).project(camera);
    node.style.left = `${((v3.x + 1) / 2) * stage.size.w}px`;
    node.style.top = `${((1 - v3.y) / 2) * stage.size.h}px`;
  };
  const placeLabels = () => {
    for (const { el: node, component: c } of names) {
      projectLabel(node, POS[c][0], 0.05, POS[c][1] + 1.12);
    }
    if (focus && !label.hidden) {
      projectLabel(label, POS[focus][0], parts[focus].top + 0.85, POS[focus][1]);
    }
  };
  stage.onResize(() => {
    fit();
    placeLabels();
  });

  const update = (dt: number, _t: number) => {
    moodT += dt;
    flow += dt * speed * 5;
    for (const c of Object.keys(parts) as Component[]) {
      const part = parts[c];
      const on = c === focus && mood !== "idle";
      part.body.color.set(on ? (mood === "good" ? NEON.lime : NEON.red) : NEON.grid);
      // Two discrete offsets, then return to the original grid position.
      const shake = on && mood === "bad" && !reducedMotion && moodT < 0.24 ? (moodT < 0.12 ? -0.12 : 0.12) : 0;
      part.group.position.x = POS[c][0] + shake;
    }
    beacon.visible = !!focus && mood !== "idle";
    if (focus) {
      beacon.position.set(POS[focus][0], parts[focus].top + 0.35, POS[focus][1]);
      beaconMat.color.set(mood === "good" ? NEON.lime : NEON.red);
    }
    let packet = 0;
    for (const path of paths) {
      for (let i = 0; i < 2; i++) {
        const step = (Math.floor(reducedMotion ? 0 : flow) + i * Math.floor(path.length / 2)) % path.length;
        tmp.position.copy(path[step]);
        tmp.position.y = 0.24;
        tmp.scale.setScalar(0.16);
        tmp.updateMatrix();
        packets.setMatrixAt(packet++, tmp.matrix);
      }
    }
    packets.instanceMatrix.needsUpdate = true;
    burst.visible = !!focus && mood === "good" && moodT < (reducedMotion ? 0.35 : 0.7);
    if (burst.visible && focus) {
      const step = reducedMotion ? 0 : Math.floor(moodT * 10);
      for (let i = 0; i < 12; i++) {
        // Square perimeter, expanding in small block steps.
        const side = Math.floor(i / 3);
        const along = ((i % 3) - 1) * 0.5;
        const radius = 0.55 + step * 0.16;
        tmp.position.set(
          POS[focus][0] + (side % 2 ? along : side === 0 ? -radius : radius),
          parts[focus].top + 0.25 + step * 0.08,
          POS[focus][1] + (side % 2 ? (side === 1 ? -radius : radius) : along),
        );
        tmp.scale.setScalar(0.16);
        tmp.updateMatrix();
        burst.setMatrixAt(i, tmp.matrix);
      }
      burst.instanceMatrix.needsUpdate = true;
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.t += dt;
      p.el.style.transform = `translate(-50%, ${reducedMotion ? 0 : -Math.floor(p.t * 8) * 5}px)`;
      if (p.t > 1.2) {
        p.el.remove();
        pops.splice(i, 1);
      }
    }
    placeLabels();
  };
  update(0, 0);
  document.fonts?.ready.then(() => {
    if (!disposed && !running) stage.render();
  });

  return {
    stage,
    update,
    setInsets(top: number, bottom: number) {
      inset = { top, bottom };
      fit();
      update(0, 0);
      stage.render();
    },
    alert(c: Component, metric: string) {
      focus = c;
      mood = "alert";
      moodT = 0;
      speed = 2;
      label.textContent = metric;
      label.dataset.tone = "red";
      label.hidden = false;
      placeLabels();
    },
    resolve(good: boolean, points: number) {
      mood = good ? "good" : "bad";
      moodT = 0;
      speed = good ? 1 : 0.5;
      label.dataset.tone = good ? "lime" : "red";
      if (points > 0 && focus) {
        const p = document.createElement("div");
        p.className = "ic-pop";
        p.textContent = `+${points}`;
        p.style.left = label.style.left;
        p.style.top = label.style.top;
        el.appendChild(p);
        pops.push({ el: p, t: 0 });
      }
    },
    idle() {
      mood = "idle";
      focus = null;
      speed = 1;
      label.hidden = true;
      for (const p of pops) p.el.remove();
      pops.length = 0;
      update(0, 0);
    },
    setRunning(on: boolean) {
      running = on;
    },
    dispose() {
      disposed = true;
      label.remove();
      for (const { el: node } of names) node.remove();
      for (const p of pops) p.el.remove();
      stage.dispose();
      // InstancedMesh owns GPU instance buffers in addition to its geometry.
      scene.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
    },
  };
}

export type View = ReturnType<typeof createView>;
