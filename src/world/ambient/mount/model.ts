/**
 * Saddled llama for the trailhead ride: the fauna llama (camelidParts(LLAMA)) dressed with a woven
 * Andean blanket (canvas-striped), a saddle pad with cinch, yarn tassels along the blanket hem and
 * pompoms tied to the banana ears. Faces +Z, origin at the feet. Pivots are exposed for the trot.
 */
import * as THREE from "three";
import type { WorldEnv } from "../../contract";
import { camelidParts, LLAMA } from "../../fauna-models";
import { DYE } from "../../palette";
import { canvasTex, toonMapped } from "../../props";

const COAT = "#f1ebe0";
const COAT_2 = "#e4d6bf";
const PATCH = "#7a4e33";
const LEG = "#e9dcc4";
const EYE = "#1f1a17";

/** Saddle top above the feet; the rider's feet sit this high (hip pivot 0.56 → hips on the pad). */
export const SEAT_HEIGHT = 0.85;

export interface LlamaModel {
  group: THREE.Group;
  /** Bob/sway node (everything but the root). */
  body: THREE.Group;
  /** Front-left, front-right, back-left, back-right hip pivots. */
  legs: THREE.Group[];
  neck: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group;
  /** Hanging tassels (swing with the trot). */
  tassels: THREE.Group[];
  dispose(): void;
}

function blanketTexture() {
  return canvasTex(256, 128, (ctx, w, h) => {
    // Warp-faced aguayo: broad dye bands with thin pallay rows of diamonds between them.
    const bands: Array<[string, number]> = [
      [DYE.red, 0.18],
      [DYE.ochre, 0.06],
      [DYE.indigo, 0.14],
      [DYE.cotton, 0.06],
      [DYE.turq, 0.12],
      [DYE.cotton, 0.06],
      [DYE.indigo, 0.14],
      [DYE.ochre, 0.06],
      [DYE.red, 0.18],
    ];
    let y = 0;
    for (const [c, f] of bands) {
      ctx.fillStyle = c;
      ctx.fillRect(0, y * h, w, f * h + 1);
      y += f;
    }
    ctx.fillStyle = "#2b2140";
    for (const row of [0.27, 0.73]) {
      for (let x = 8; x < w; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, row * h - 5);
        ctx.lineTo(x + 5, row * h);
        ctx.lineTo(x, row * h + 5);
        ctx.lineTo(x - 5, row * h);
        ctx.fill();
      }
    }
    ctx.fillStyle = DYE.ochre;
    for (let x = 0; x < w; x += 10) ctx.fillRect(x, 0.5 * h - 2, 5, 4);
  });
}

export function buildSaddledLlama(env: WorldEnv): LlamaModel {
  const P = camelidParts(LLAMA);
  const rig = P.rig;
  const geos: THREE.BufferGeometry[] = [P.body, P.belly, P.neck, P.head, P.eyes, P.leg, P.tail];
  // Unused pack parts from the shared builder.
  P.tassel.dispose();
  P.packCloth.dispose();
  P.packBags.dispose();
  const own = <T extends THREE.BufferGeometry>(g: T) => {
    geos.push(g);
    return g;
  };
  const toon = (c: string) => env.toon(c);

  const group = new THREE.Group();
  group.name = "ride-llama";
  const body = new THREE.Group();
  group.add(body);
  body.add(new THREE.Mesh(P.body, toon(COAT)));
  body.add(new THREE.Mesh(P.belly, toon(COAT_2)));

  // Neck → head (with eyes and ear pompoms).
  const neck = new THREE.Group();
  neck.position.copy(rig.neck);
  neck.add(new THREE.Mesh(P.neck, toon(COAT)));
  body.add(neck);
  const head = new THREE.Group();
  head.position.copy(rig.headOnNeck);
  head.add(new THREE.Mesh(P.head, toon(COAT)));
  const eyes = new THREE.Mesh(P.eyes, toon(EYE));
  env.noOutline(eyes);
  head.add(eyes);
  // A brown face patch so the head reads from afar.
  const hr = LLAMA.neckR * 1.15;
  const patch = new THREE.Mesh(own(new THREE.SphereGeometry(hr * 0.75, 8, 6)), toon(PATCH));
  patch.scale.set(0.9, 0.7, 1.2);
  patch.position.set(0, hr * 0.15, hr * 1.55);
  head.add(patch);
  // Ear pompoms: yarn balls tied mid-ear on the banana ears, with a short hanging cord.
  const pomGeo = own(new THREE.IcosahedronGeometry(hr * 0.42, 0));
  const cordGeo = own(new THREE.CylinderGeometry(hr * 0.08, hr * 0.08, hr * 0.9, 4));
  cordGeo.translate(0, -hr * 0.45, 0);
  for (const side of [-1, 1]) {
    const pom = new THREE.Mesh(pomGeo, toon(side < 0 ? DYE.red : DYE.turq));
    pom.position.set(side * hr * 0.5, hr * 2.5, -hr * 0.35);
    head.add(pom);
    const cord = new THREE.Mesh(cordGeo, toon(side < 0 ? DYE.ochre : DYE.red));
    cord.position.set(side * hr * 0.62, hr * 2.4, -hr * 0.35);
    head.add(cord);
    const pom2 = new THREE.Mesh(pomGeo, toon(side < 0 ? DYE.indigo : DYE.ochre));
    pom2.scale.setScalar(0.7);
    pom2.position.set(side * hr * 0.62, hr * 1.45, -hr * 0.35);
    head.add(pom2);
  }
  neck.add(head);
  // Collar with a dyed band at the neck base.
  const collar = new THREE.Mesh(own(new THREE.TorusGeometry(LLAMA.neckR * 1.1, 0.03, 5, 12)), toon(DYE.red));
  collar.rotation.x = Math.PI / 2 - 0.22;
  collar.position.set(0, LLAMA.neckLen * 0.25, LLAMA.neckLen * 0.06);
  neck.add(collar);

  // Legs.
  const legs: THREE.Group[] = [];
  for (const hip of rig.hips) {
    const p = new THREE.Group();
    p.position.copy(hip);
    p.add(new THREE.Mesh(P.leg, toon(LEG)));
    body.add(p);
    legs.push(p);
  }
  const tail = new THREE.Group();
  tail.position.copy(rig.tail);
  tail.add(new THREE.Mesh(P.tail, toon(COAT)));
  body.add(tail);

  // Blanket: a woven cloth over the back with side drapes, then a saddle pad and cinch.
  const tex = blanketTexture();
  const cloth = toonMapped(env, tex);
  const top = rig.bodyY + LLAMA.bodyR * 1.0;
  const bw = LLAMA.bodyR * 2.2;
  const bl = LLAMA.bodyLen * 1.35;
  const blanket = new THREE.Mesh(own(new THREE.BoxGeometry(bw, 0.05, bl)), cloth);
  blanket.position.set(0, top, 0);
  body.add(blanket);
  const drapeH = 0.32;
  const drapeGeo = own(new THREE.BoxGeometry(0.04, drapeH, bl));
  for (const side of [-1, 1]) {
    const d = new THREE.Mesh(drapeGeo, cloth);
    d.position.set(side * (bw / 2 - 0.005), top - drapeH / 2 + 0.02, 0);
    d.rotation.z = side * 0.12;
    body.add(d);
  }
  const pad = new THREE.Mesh(own(new THREE.BoxGeometry(bw * 0.62, 0.07, bl * 0.48)), toon("#6b3a2a"));
  pad.position.set(0, top + 0.055, -0.02);
  body.add(pad);
  const horn = new THREE.Mesh(own(new THREE.CylinderGeometry(0.03, 0.04, 0.1, 6)), toon("#4a2e1c"));
  horn.position.set(0, top + 0.12, bl * 0.2);
  body.add(horn);
  const cinch = new THREE.Mesh(
    own(new THREE.TorusGeometry(LLAMA.bodyR * 1.08, 0.025, 4, 16, Math.PI)),
    toon(DYE.indigo),
  );
  cinch.rotation.y = Math.PI / 2;
  cinch.scale.set(1, 1.05, 1);
  cinch.position.set(0, rig.bodyY + 0.02, 0.06);
  cinch.rotation.z = Math.PI;
  body.add(cinch);

  // Tassels along both drape hems (cord + yarn ball), alternating dyes.
  const tCord = own(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 4));
  tCord.translate(0, -0.05, 0);
  const tBall = own(new THREE.IcosahedronGeometry(0.03, 0));
  tBall.translate(0, -0.11, 0);
  const dyes = [DYE.red, DYE.ochre, DYE.turq, DYE.indigo];
  const tassels: THREE.Group[] = [];
  let k = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const tg = new THREE.Group();
      const z = -bl / 2 + 0.04 + (i / 4) * (bl - 0.08);
      tg.position.set(side * (bw / 2 + 0.03), top - drapeH + 0.02, z);
      tg.add(new THREE.Mesh(tCord, toon(DYE.cotton)));
      tg.add(new THREE.Mesh(tBall, toon(dyes[k++ % dyes.length] as string)));
      body.add(tg);
      tassels.push(tg);
    }
  }

  return {
    group,
    body,
    legs,
    neck,
    head,
    tail,
    tassels,
    dispose() {
      group.removeFromParent();
      for (const g of geos) g.dispose();
      tex.dispose();
      cloth.dispose();
    },
  };
}
