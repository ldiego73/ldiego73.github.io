/**
 * The ride mounts in the harness: the legacy mounts (./legacy/) next to the new ones (../../../ambient/mount/),
 * each walking in place with its own `animate` hook at the mode's speed, and a stand-in rider block (hips at
 * seat height + 0.56, the avatar's hip pivot) to check that the saddle meets the rider.
 */
import * as THREE from "three";
import { buildPasoHorse } from "../../../ambient/mount/horse";
import { saddledLlamaMount } from "../../../ambient/mount/llama";
import { buildSaddledMule } from "../../../ambient/mount/mule";
import type { MountModel } from "../../../ambient/mount/ride";
import type { WorldEnv } from "../../../contract";
import { noOutline, type ToonCache } from "../../../toon";
import { buildPasoHorse as oldHorse } from "./legacy/horse";
import { SEAT_HEIGHT as OLD_LLAMA_SEAT, buildSaddledLlama as oldLlama } from "./legacy/model";
import { buildSaddledMule as oldMule } from "./legacy/mule";

interface Item {
  key: string;
  label: string;
  isNew: boolean;
  obj: THREE.Object3D;
  lift: number;
  update(dt: number, t: number): void;
}

const SPEED: Record<string, number> = { idle: 0, walk: 1.4, run: 3.6, fly: 6 };

export function rideLineup(scene: THREE.Scene, toon: ToonCache, items: Item[], state: { mode: string; rm: boolean }) {
  const env = { scene, toon: toon.toon, noOutline, reducedMotion: false, lang: "es" } as unknown as WorldEnv;
  const yaw = Number(new URLSearchParams(location.search).get("yaw") ?? 1.57);
  const rider = (seat: number) => {
    // Hips (the avatar's hip pivot sits 0.56 above its feet), legs hanging both sides.
    const g = new THREE.Group();
    const m = toon.toon("#3a6ab8");
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.2), m);
    hips.position.y = seat + 0.56;
    g.add(hips);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.1), m);
      leg.position.set(s * 0.24, seat + 0.32, 0.04);
      leg.rotation.z = s * 0.25;
      g.add(leg);
    }
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.18), m);
    torso.position.y = seat + 0.85;
    g.add(torso);
    return g;
  };
  const list: Array<[string, () => MountModel, boolean, number?]> = [
    ["horse", () => buildPasoHorse(env), true],
    ["mule", () => buildSaddledMule(env), true],
    ["llama", () => saddledLlamaMount(env), true],
    ["old-horse", () => oldHorse(env), false],
    ["old-mule", () => oldMule(env), false],
    [
      "old-llama",
      () => {
        const m = oldLlama(env);
        return { group: m.group, seatHeight: OLD_LLAMA_SEAT, bodyR: 0.6, animate() {}, dispose: m.dispose };
      },
      false,
    ],
  ];
  list.forEach(([key, make, isNew], i) => {
    const m = make();
    const x = (i % 3) * 2.6 - 2.6;
    const z = isNew ? 1.2 : -2.2;
    m.group.position.set(x, 0, z);
    m.group.rotation.y = yaw;
    scene.add(m.group);
    const r = rider(m.seatHeight);
    r.visible = new URLSearchParams(location.search).has("rider");
    m.group.add(r);
    items.push({
      key,
      label: `${key} · seat ${m.seatHeight.toFixed(2)}`,
      isNew,
      obj: m.group,
      lift: 0,
      update(dt, t) {
        m.animate({ speed: SPEED[state.mode] ?? 0, look: 0, t, dt, rm: state.rm });
      },
    });
  });
  return 8;
}
