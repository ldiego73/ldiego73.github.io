/**
 * The CURRENT characters, instantiated standalone for the side-by-side comparison: the traveler
 * (../../avatar.ts), a campesina from the shared people rig (../../ambient/people: instanced palette parts on
 * plain bones, posed by the Person gait) and the caravan llama from ../../fauna-models.ts (parts on pivots,
 * animated here with a simple leg swing like fauna.ts). Read-only use of those modules: nothing is changed.
 */
import * as THREE from "three";
import { DARKS, POLLERAS, partSpecs, SHADOW_PARTS, SKINS, WEAVES, WOMAN } from "../../ambient/people/models";
import { Person } from "../../ambient/people/person";
import { Crowd, paletteMaterial } from "../../ambient/people/rig";
import { createAvatar } from "../../avatar";
import type { WorldEnv } from "../../contract";
import { camelidParts, LLAMA } from "../../fauna-models";
import { gradientMap, noOutline, type ToonCache } from "../../toon";
import type { Mode } from "../anim-human";

const SPEED: Record<Mode, number> = { idle: 0, walk: 1.25, run: 3.4 };

export function oldTraveler(scene: THREE.Scene, toon: ToonCache, rm: () => boolean) {
  const env = { scene, toon: toon.toon, noOutline, reducedMotion: rm() } as unknown as WorldEnv;
  const av = createAvatar(env);
  scene.add(av.group);
  return {
    group: av.group,
    update(dt: number, t: number, mode: Mode) {
      av.update(dt, { speed: SPEED[mode], running: mode === "run", grounded: true, t });
    },
  };
}

export function oldCampesina(scene: THREE.Scene) {
  const wear = [...WOMAN, "montera"] as const;
  const crowd = new Crowd(partSpecs(wear), 1, paletteMaterial(gradientMap()), SHADOW_PARTS);
  scene.add(crowd.group);
  const person = new Person({
    kind: "dev-person",
    crowd,
    idx: crowd.alloc(),
    wear,
    palette: [SKINS[1] as string, POLLERAS[0] as string, WEAVES[0] as string, DARKS[1] as string],
    scale: 1,
    radius: 0.3,
    seed: 3,
  });
  person.setActive(true);
  return {
    place(x: number, z: number, yaw: number) {
      person.place(x, z, yaw);
    },
    update(dt: number, t: number, mode: Mode, rm: boolean) {
      person.rest(t, rm);
      person.speed = SPEED[mode];
      if (mode !== "idle") person.gait(dt, rm);
      else {
        person.walkW = 0;
        person.runW = 0;
      }
      person.commit();
      crowd.flush();
    },
  };
}

export function oldLlama(scene: THREE.Scene, toon: ToonCache) {
  const P = camelidParts(LLAMA);
  const coat = toon.toon("#f1ebe0");
  const root = new THREE.Group();
  const mk = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    return mesh;
  };
  root.add(mk(P.body, coat), mk(P.belly, toon.toon("#e9dcc4")));
  const neck = new THREE.Group();
  neck.position.copy(P.rig.neck);
  neck.add(mk(P.neck, coat));
  const head = new THREE.Group();
  head.position.copy(P.rig.headOnNeck);
  head.add(mk(P.head, coat), mk(P.eyes, toon.toon("#1d1a17")));
  neck.add(head);
  root.add(neck);
  const legs = P.rig.hips.map((h) => {
    const g = new THREE.Group();
    g.position.copy(h);
    g.add(mk(P.leg, coat));
    root.add(g);
    return g;
  });
  const tail = new THREE.Group();
  tail.position.copy(P.rig.tail);
  tail.rotation.x = 0.2;
  tail.add(mk(P.tail, coat));
  root.add(tail);
  scene.add(root);
  let phase = 0;
  return {
    group: root,
    update(dt: number, t: number, mode: Mode, rm: boolean) {
      const sp = mode === "idle" ? 0 : mode === "walk" ? 1.1 : 2.6;
      phase += dt * sp * 2.2;
      const amp = mode === "idle" ? 0 : (rm ? 0.5 : 1) * (mode === "run" ? 0.55 : 0.35);
      const offs = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5];
      legs.forEach((l, k) => {
        l.rotation.x = Math.sin(phase + (offs[k] as number)) * amp;
      });
      neck.rotation.x = Math.sin(phase * 2) * 0.04 * (amp > 0 ? 1 : 0) + (rm ? 0 : Math.sin(t * 0.7) * 0.03);
      root.position.y = amp > 0 ? Math.abs(Math.sin(phase)) * 0.03 : 0;
    },
  };
}
