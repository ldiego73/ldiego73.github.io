/**
 * The pampa visitor's look (../ufo.ts): a cartoon flying saucer and its effects, all procedural.
 *
 *  - Hull: one lathe (a silver disc, flat belly, a dark rim band) merged into a vertex-coloured toon mesh, so
 *    it keeps the world's ink outline; a glassy dome (emissive toon) on top.
 *  - Rim lights: ten small bulbs in two unlit meshes (even/odd) the view blinks in turn; an unlit glow disc
 *    under the belly. No real lights: adding a THREE light would recompile every toon material in the world.
 *  - Beam: an open cone, additive, no depth write, no outline, with a canvas texture of soft vertical streaks;
 *    a radial glow spot where it touches the ground and three thin rings that climb it.
 *  - Dizzy stars: three little yellow star sprites for the alpaca's head.
 * Everything here is owned by the returned object; `dispose()` frees it (the dome's toon is the shared cache).
 */
import * as THREE from "three";
import type { WorldEnv } from "../../../contract";
import { mergeColored, vertexToon } from "../../../merge-colors";

/** Hull radius and the belly's height below the saucer's centre (where the beam starts). */
export const HULL_R = 4.6;
export const BELLY_Y = -0.7;
const LIGHTS = 10;

function canvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d") as CanvasRenderingContext2D);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Beam: bright at the saucer, fading toward the ground, with a few soft vertical streaks. */
function beamTexture() {
  return canvas(64, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    // Canvas y 0 is the texture's top (v = 1), which the cylinder maps to its top: the saucer.
    g.addColorStop(0, "rgba(190,255,236,1)");
    g.addColorStop(0.55, "rgba(120,240,215,0.55)");
    g.addColorStop(1, "rgba(90,220,200,0.28)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 128);
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.25 + (i % 3) * 0.12})`;
      ctx.fillRect(i * 7 + (i % 2) * 2, 0, 2 + (i % 3), 128);
    }
  });
}

function glowTexture() {
  return canvas(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(200,255,240,0.95)");
    g.addColorStop(0.5, "rgba(120,240,215,0.45)");
    g.addColorStop(1, "rgba(90,220,200,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

function starTexture() {
  return canvas(64, 64, (ctx) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 12 : 29;
      ctx.lineTo(32 + Math.cos(a) * r, 33 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = "#ffd84a";
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#5a3c08";
    ctx.stroke();
  });
}

export interface SaucerModel {
  /** Saucer root: position it at the saucer's centre. */
  saucer: THREE.Group;
  /** Spins about y (carries the rim lights). */
  hull: THREE.Group;
  lightsA: THREE.MeshBasicMaterial;
  lightsB: THREE.MeshBasicMaterial;
  /** World-space beam (top at the group's origin, unit height down: scale.y = length). */
  beam: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
  spot: THREE.Mesh;
  spotMat: THREE.MeshBasicMaterial;
  rings: THREE.Mesh[];
  ringMat: THREE.MeshBasicMaterial;
  stars: THREE.Sprite[];
  dispose(): void;
}

export function buildSaucer(env: WorldEnv): SaucerModel {
  const own: Array<{ dispose(): void }> = [];
  const keep = <T extends { dispose(): void }>(x: T) => {
    own.push(x);
    return x;
  };

  // ---------------------------------------------------------------- hull (lathe, outlined)
  const profile = [
    [0, BELLY_Y],
    [1.9, BELLY_Y + 0.05],
    [3.5, -0.35],
    [HULL_R, -0.02],
    [HULL_R - 0.05, 0.08],
    [3.6, 0.38],
    [2.0, 0.62],
    [0, 0.66],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const disc = new THREE.LatheGeometry(profile, 32);
  const band = new THREE.TorusGeometry(HULL_R - 0.12, 0.13, 6, 40);
  band.rotateX(Math.PI / 2);
  const ring = new THREE.CylinderGeometry(2.05, 2.15, 0.16, 28);
  ring.translate(0, 0.66, 0);
  const hullGeo = keep(
    mergeColored([
      { geometry: disc, color: new THREE.Color("#c3ccd6") },
      { geometry: band, color: new THREE.Color("#4f5866") },
      { geometry: ring, color: new THREE.Color("#7d8796") },
    ]) as THREE.BufferGeometry,
  );
  disc.dispose();
  band.dispose();
  ring.dispose();
  const hullMat = keep(vertexToon());
  const hullMesh = new THREE.Mesh(hullGeo, hullMat);
  hullMesh.name = "colca-ufo:hull";
  hullMesh.castShadow = true;

  const domeGeo = keep(new THREE.SphereGeometry(1.75, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2));
  domeGeo.scale(1, 0.85, 1);
  domeGeo.translate(0, 0.66, 0);
  const dome = new THREE.Mesh(domeGeo, env.toon("#9ff0e2", { emissive: "#2aa894", emissiveIntensity: 0.85 }));
  dome.name = "colca-ufo:dome";

  // ---------------------------------------------------------------- rim lights (two blinking sets)
  const bulb = new THREE.SphereGeometry(0.22, 8, 6);
  const sets = [0, 1].map((odd) => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = odd; i < LIGHTS; i += 2) {
      const a = (i / LIGHTS) * Math.PI * 2;
      parts.push(bulb.clone().translate(Math.cos(a) * (HULL_R - 0.1), -0.14, Math.sin(a) * (HULL_R - 0.1)));
    }
    const g = mergeColored(parts.map((geometry) => ({ geometry, color: new THREE.Color(1, 1, 1) })));
    for (const p of parts) p.dispose();
    return keep(g as THREE.BufferGeometry);
  });
  bulb.dispose();
  const lightsA = keep(new THREE.MeshBasicMaterial({ color: "#ffd65a" }));
  const lightsB = keep(new THREE.MeshBasicMaterial({ color: "#ff6fb5" }));
  const bulbsA = new THREE.Mesh(sets[0], lightsA);
  const bulbsB = new THREE.Mesh(sets[1], lightsB);
  env.noOutline(bulbsA);
  env.noOutline(bulbsB);

  const glowTex = keep(glowTexture());
  const bellyGeo = keep(new THREE.CircleGeometry(2.1, 24));
  bellyGeo.rotateX(Math.PI / 2);
  bellyGeo.translate(0, BELLY_Y - 0.02, 0);
  const bellyMat = keep(
    new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  env.noOutline(belly);

  const hull = new THREE.Group();
  hull.add(hullMesh, bulbsA, bulbsB);
  const saucer = new THREE.Group();
  saucer.name = "colca-ufo:saucer";
  saucer.add(hull, dome, belly);

  // ---------------------------------------------------------------- beam, ground spot, climbing rings
  const beamGeo = keep(new THREE.CylinderGeometry(1.5, 3.4, 1, 28, 1, true));
  beamGeo.translate(0, -0.5, 0);
  const beamTex = keep(beamTexture());
  beamTex.wrapS = THREE.RepeatWrapping;
  const beamMat = keep(
    new THREE.MeshBasicMaterial({
      map: beamTex,
      color: "#9ef7e4",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.name = "colca-ufo:beam";
  beam.frustumCulled = false;
  env.noOutline(beam);

  const spotGeo = keep(new THREE.CircleGeometry(4.2, 28));
  spotGeo.rotateX(-Math.PI / 2);
  const spotMat = keep(
    new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    }),
  );
  const spot = new THREE.Mesh(spotGeo, spotMat);
  spot.name = "colca-ufo:spot";
  env.noOutline(spot);

  const ringGeo = keep(new THREE.TorusGeometry(1, 0.06, 4, 32));
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = keep(
    new THREE.MeshBasicMaterial({
      color: "#c8fff2",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const rings = [0, 1, 2].map(() => {
    const r = new THREE.Mesh(ringGeo, ringMat);
    env.noOutline(r);
    return r;
  });

  // ---------------------------------------------------------------- dizzy stars
  const starTex = keep(starTexture());
  const starMat = keep(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false }));
  const stars = [0, 1, 2].map(() => {
    const s = new THREE.Sprite(starMat);
    s.scale.setScalar(0.6);
    env.noOutline(s);
    return s;
  });

  return {
    saucer,
    hull,
    lightsA,
    lightsB,
    beam,
    beamMat,
    spot,
    spotMat,
    rings,
    ringMat,
    stars,
    dispose() {
      for (const o of own) o.dispose();
    },
  };
}
