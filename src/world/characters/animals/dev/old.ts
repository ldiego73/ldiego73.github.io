/**
 * The animals the worlds drew BEFORE the new characters, standing still next to the new ones in the harness
 * lineup. Static bind poses only (a looks comparison), all from dev-only snapshots in ./legacy/ (no world
 * file is imported, so the worlds can delete their old models): the fauna parts (fauna-models.ts before it
 * moved onto the new builders), the mounts, and the coast's vertex-coloured models. Species without a
 * snapshot show only the new model.
 */
import * as THREE from "three";
import type { WorldEnv } from "../../../contract";
import * as NewParts from "../../../fauna-models";
import { noOutline, type ToonCache } from "../../../toon";
import * as Costa from "./legacy/costa-models";
import { ALPACA, camelidParts, condorParts, LLAMA, VICUNA, vizcachaParts } from "./legacy/fauna-models";
import { buildPasoHorse } from "./legacy/horse";
import { buildSaddledLlama } from "./legacy/model";
import { buildSaddledMule } from "./legacy/mule";

export type OldBuilder = (toon: ToonCache, scene: THREE.Scene) => THREE.Object3D;

const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
  const x = new THREE.Mesh(g, m);
  x.castShadow = true;
  return x;
};

function camelid(spec: typeof LLAMA, coat: string, parts: typeof camelidParts = camelidParts) {
  return (toon: ToonCache) => {
    const P = parts(spec);
    const c = toon.toon(coat);
    const root = new THREE.Group();
    root.add(mesh(P.body, c), mesh(P.belly, toon.toon("#e9dcc4")));
    const neck = new THREE.Group();
    neck.position.copy(P.rig.neck);
    neck.add(mesh(P.neck, c));
    const head = new THREE.Group();
    head.position.copy(P.rig.headOnNeck);
    head.add(mesh(P.head, c), mesh(P.eyes, toon.toon("#1d1a17")));
    neck.add(head);
    root.add(neck);
    for (const h of P.rig.hips) {
      const g = new THREE.Group();
      g.position.copy(h);
      g.add(mesh(P.leg, c));
      root.add(g);
    }
    const tail = new THREE.Group();
    tail.position.copy(P.rig.tail);
    tail.rotation.x = 0.2;
    tail.add(mesh(P.tail, c));
    root.add(tail);
    return root;
  };
}

/** A vertex-coloured geometry on the shared vertex toon. */
const vc =
  (make: () => THREE.BufferGeometry, scale = 1) =>
  (toon: ToonCache) => {
    const g = make();
    const m = mesh(g, toon.vertexToon());
    m.scale.setScalar(scale);
    const grp = new THREE.Group();
    grp.add(m);
    return grp;
  };

const env = (toon: ToonCache, scene: THREE.Scene) =>
  ({ scene, toon: toon.toon, noOutline, reducedMotion: false, lang: "es" }) as unknown as WorldEnv;

export const OLD: Record<string, OldBuilder> = {
  llama: camelid(LLAMA, "#f1ebe0"),
  alpaca: camelid(ALPACA, "#f3ead9"),
  vicuna: camelid(VICUNA, "#c38a52"),
  horse: (toon, scene) => buildPasoHorse(env(toon, scene)).group,
  mule: (toon, scene) => buildSaddledMule(env(toon, scene)).group,
  "llama-saddled": (toon, scene) => buildSaddledLlama(env(toon, scene)).group,
  vizcacha: (toon) => vizcacha(toon, vizcachaParts),
  condor: (toon) => condor(toon, condorParts),
  "sea-lion": vc(() => Costa.seaLionUp()),
  penguin: vc(() => Costa.penguin()),
  pelican: vc(() => Costa.pelicanStand()),
  gull: vc(() => Costa.gullStand()),
  guanay: vc(() => Costa.cormorantStand()),
};

function vizcacha(toon: ToonCache, parts: typeof vizcachaParts) {
  const P = parts();
  const c = toon.toon("#a89a8a");
  const root = new THREE.Group();
  root.add(mesh(P.body, c));
  const head = new THREE.Group();
  head.position.copy(P.headPivot);
  head.add(mesh(P.head, c), mesh(P.eyes, toon.toon("#1d1a17")));
  root.add(head);
  const tail = new THREE.Group();
  tail.position.copy(P.tailPivot);
  tail.add(mesh(P.tail, toon.toon("#5a4a3a")));
  root.add(tail);
  return root;
}

function condor(toon: ToonCache, parts: typeof condorParts) {
  const P = parts();
  const root = new THREE.Group();
  const black = toon.toon("#1d1a1a");
  root.add(mesh(P.body, black), mesh(P.collar, toon.toon("#f2efe8")), mesh(P.head, toon.toon("#9a5a50")));
  for (const [w, p, sx] of [
    [P.wingR, P.patchR, 1],
    [P.wingL, P.patchL, -1],
  ] as const) {
    const g = new THREE.Group();
    g.position.set(P.shoulder.x * sx, P.shoulder.y, P.shoulder.z);
    g.add(mesh(w, black), mesh(p, toon.toon("#e8e4dc")));
    root.add(g);
  }
  root.position.y = 1.2;
  return root;
}

/** The same compositions on the CURRENT fauna-models.ts (rebuilt on the new field pieces). */
export const NEW_PARTS: Record<string, OldBuilder> = {
  llama: camelid(LLAMA, "#f1ebe0", NewParts.camelidParts),
  alpaca: camelid(ALPACA, "#f3ead9", NewParts.camelidParts),
  vicuna: camelid(VICUNA, "#c38a52", NewParts.camelidParts),
  vizcacha: (toon) => vizcacha(toon, NewParts.vizcachaParts),
  condor: (toon) => condor(toon, NewParts.condorParts),
};
