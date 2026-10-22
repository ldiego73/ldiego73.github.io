/**
 * The animals the worlds draw TODAY, standing still next to the new ones in the harness lineup. Static bind
 * poses only (this is a looks comparison): the legacy fauna parts (./legacy/fauna-models.ts, a snapshot taken
 * before fauna-models.ts moved onto the new builders), the legacy mounts, and the worlds' own vertex-coloured
 * models (read-only imports; nothing in those modules is changed).
 */
import * as THREE from "three";
import { colibriModel, condorModel } from "../../../ambient/birds/models";
import { foxParts, pumaParts } from "../../../ambient/nightfauna/models";
import type { WorldEnv } from "../../../contract";
import * as Costa from "../../../costa/ambient/fauna/models";
import * as NewParts from "../../../fauna-models";
import * as Birds from "../../../selva/ambient/wild/birds";
import * as Critters from "../../../selva/ambient/wild/critters";
import * as Mammals from "../../../selva/ambient/wild/mammals";
import { hoatzinModel } from "../../../selva/ambient/wild/riverbirds";
import * as Titi from "../../../titicaca/ambient/fauna/models";
import { noOutline, type ToonCache } from "../../../toon";
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
  puma: (toon) => quadParts(pumaParts(), toon, "#b4834f"),
  fox: (toon) => quadParts(foxParts(), toon, "#9a6a44"),
  capybara: vc(() => Mammals.capybaraModel().geo),
  jaguar: vc(() => Mammals.jaguarModel().geo),
  "squirrel-monkey": vc(() => Mammals.squirrelMonkeyModel().geo),
  sloth: vc(() => Mammals.slothModel().geo),
  caiman: vc(() => Mammals.caimanModel().geo),
  bufeo: vc(() => Mammals.dolphinModel().geo),
  sajino: vc(() => Critters.peccaryModel().geo),
  agouti: vc(() => Critters.agoutiModel().geo),
  tapir: vc(() => Critters.tapirModel().geo),
  taricaya: vc(() => Critters.turtleModel().geo),
  macaw: vc(() => Birds.macawModel("scarlet").geo),
  toucan: vc(() => Birds.toucanModel().geo),
  heron: vc(() => Birds.egretModel().geo),
  hoatzin: vc(() => hoatzinModel().geo),
  hummingbird: vc(() => colibriModel().geo),
  "sea-lion": vc(() => Costa.seaLionUp()),
  penguin: vc(() => Costa.penguin()),
  pelican: vc(() => Costa.pelicanStand()),
  gull: vc(() => Costa.gullStand()),
  guanay: vc(() => Costa.cormorantStand()),
  grebe: vc(() => Titi.grebeGeometry()),
  frog: vc(() => Titi.frogGeometry()),
  "condor-old-bird": vc(() => condorModel().geo),
};

function quadParts(P: ReturnType<typeof pumaParts>, toon: ToonCache, coat: string) {
  // Bind pose of the night-fauna rig (../../../ambient/nightfauna/rig.ts): body at bodyY, head on the neck,
  // straight legs (upper then lower) under the shoulders and hips, a straight tail.
  const r = P.rig;
  const root = new THREE.Group();
  const m = toon.vertexToon();
  const mat = (g: THREE.BufferGeometry) => (g.getAttribute("color") ? m : toon.toon(coat));
  const body = new THREE.Group();
  body.position.y = r.bodyY;
  root.add(body);
  body.add(mesh(P.body, mat(P.body)));
  const head = mesh(P.head, mat(P.head));
  head.position.copy(r.neck);
  body.add(head);
  for (const hind of [false, true])
    for (const sx of [1, -1]) {
      const j = hind ? r.hip : r.shoulder;
      const up = mesh(P.upper, mat(P.upper));
      up.position.set(j.x * sx, j.y, j.z);
      up.scale.y = (hind ? r.upperH : r.upperF) / r.upperGeo;
      body.add(up);
      const lo = mesh(P.lower, mat(P.lower));
      lo.position.set(j.x * sx, j.y - (hind ? r.upperH : r.upperF), j.z);
      lo.scale.y = (hind ? r.lowerH : r.lowerF) / r.lowerGeo;
      body.add(lo);
    }
  let z = r.tailBase.z;
  for (const t of r.tailTaper) {
    const seg = mesh(P.tail, mat(P.tail));
    seg.position.set(0, r.tailBase.y, z);
    seg.scale.set(t, t, 1);
    body.add(seg);
    z -= r.tailSeg;
  }
  return root;
}

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
