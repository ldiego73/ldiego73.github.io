/**
 * The real moon for sky.ts: where it stands in the sky for the calendar phase, and a flat toon disc that
 * shows the lit fraction with the terminator facing the sun (so the Southern Hemisphere orientation falls out
 * of the geometry: a waxing crescent in the evening west is lit on its lower-left, toward the set sun).
 * Pure math (`arcDir`, `moonlight`) is unit-tested in moon.test.ts.
 */
import * as THREE from "three";

/** Tilt of the sun/moon arc toward the north (Cusco sits ~13.5° S). */
export const ARC_TILT = -0.42;

/** Unit direction of a body on the daily arc. `lag` (0..1 of a turn) delays it behind the sun. */
export function arcDir(time: number, lag: number, out: { x: number; y: number; z: number }) {
  const a = (time - lag - 0.25) * Math.PI * 2;
  const x = Math.cos(a);
  const y = Math.sin(a);
  const l = Math.hypot(x, y, ARC_TILT);
  out.x = x / l;
  out.y = y / l;
  out.z = ARC_TILT / l;
  return out;
}

/**
 * 0..1 strength of the moonlight on the ground: lit fraction × how high the moon stands
 * (fades in over its first ~12° above the horizon).
 */
export function moonlight(illumination: number, moonY: number): number {
  const up = Math.min(1, Math.max(0, moonY / 0.2));
  return illumination * up * up * (3 - 2 * up);
}

/**
 * Light direction for the phase shading in the disc's local frame (+z toward the viewer): the bright limb
 * points where the sun is (its projection on the disc), and the lit fraction is exactly the calendar's
 * (the arcs lean north, so the raw sun–moon angle drifts from the synodic one).
 */
export function phaseLight(
  localSun: { x: number; y: number },
  phase: number,
  out: { x: number; y: number; z: number },
) {
  const a = phase * Math.PI * 2;
  const l = Math.hypot(localSun.x, localSun.y);
  const lx = l > 1e-6 ? localSun.x / l : 1;
  const ly = l > 1e-6 ? localSun.y / l : 0;
  const s = Math.abs(Math.sin(a));
  out.x = lx * s;
  out.y = ly * s;
  out.z = -Math.cos(a);
  return out;
}

const VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uSun;      // sun direction in the disc's local frame (+z toward the viewer)
uniform vec3 uLit, uMid, uRim, uEarth;
uniform float uR, uDark, uAlpha;
varying vec2 vP;
float crater(vec2 p, vec2 c, float r) { return 1.0 - smoothstep(r * 0.82, r, length(p - c)); }
void main() {
  vec2 p = vP / uR;
  float r = length(p);
  float aa = fwidth(r) * 1.5;
  if (r > 1.12 + aa) discard;
  vec3 L = normalize(uSun);
  if (r > 1.0) {
    // Ink rim on the lit limb only, fading out round the dark side.
    vec3 n = vec3(p / r, 0.0);
    float limb = smoothstep(-0.25, 0.15, dot(n, L));
    float a = (1.0 - smoothstep(1.12 - aa, 1.12 + aa, r)) * limb * uAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uRim, a);
    #include <colorspace_fragment>
    return;
  }
  vec3 n = vec3(p, sqrt(max(0.0, 1.0 - r * r)));
  float d = dot(n, L);
  // Toon: a hard terminator plus one soft mid band.
  float lit = smoothstep(-0.02, 0.02, d);
  vec3 col = mix(uMid, uLit, smoothstep(0.22, 0.28, d));
  float cr = max(max(crater(p, vec2(-0.3, 0.25), 0.21), crater(p, vec2(0.33, -0.17), 0.17)), crater(p, vec2(0.08, 0.42), 0.1));
  cr = max(cr, crater(p, vec2(-0.12, -0.45), 0.13));
  col = mix(col, uMid * 0.92, cr * 0.75);
  // Dark side: faint earthshine at night, invisible against the day sky.
  vec3 c = mix(uEarth, col, lit);
  float a = mix(uDark, 1.0, lit) * uAlpha;
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;

export interface MoonDisc {
  mesh: THREE.Mesh;
  /** Per frame, after the disc faces the camera: sun direction in world space, the calendar phase,
   *  night 0..1 and the overall alpha (day-sky / cloud fade). */
  update(sunWorld: THREE.Vector3, phase: number, night: number, alpha: number): void;
  dispose(): void;
}

export function createMoonDisc(radius: number): MoonDisc {
  const geo = new THREE.CircleGeometry(radius * 1.14, 48);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: new THREE.Vector3(0, 0, 1) },
      uLit: { value: new THREE.Color("#eef0ff") },
      uMid: { value: new THREE.Color("#c3c9ee") },
      uRim: { value: new THREE.Color("#5c66a8") },
      uEarth: { value: new THREE.Color("#2a3462") },
      uR: { value: radius },
      uDark: { value: 0 },
      uAlpha: { value: 1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    // Writes depth so the stars behind its face are hidden (the transparent bits are discarded or dark).
    depthWrite: true,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "moon";
  mesh.renderOrder = -8;
  mesh.frustumCulled = false;
  const U = mat.uniforms;
  const q = new THREE.Quaternion();
  const local = new THREE.Vector3();
  return {
    mesh,
    update(sunWorld, phase, night, alpha) {
      q.copy(mesh.quaternion).invert();
      local.copy(sunWorld).applyQuaternion(q);
      phaseLight(local, phase, U.uSun!.value as THREE.Vector3);
      U.uDark!.value = 0.45 * night;
      U.uAlpha!.value = alpha;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
