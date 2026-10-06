import * as THREE from "three";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { inkMaskScene, NO_OUTLINE_LAYER } from "./toon";

/**
 * Hand-inked outlines: a normal + depth prepass (outlined layer only), then a full-screen
 * edge detect that mixes ink into the color buffer. Ink color and distance fade are uniforms
 * so day/night and the title view can retune them. Ink also dissolves into the scene fog (linear
 * `THREE.Fog` near/far or `FogExp2` density, read every frame) so misty distances stay soft.
 * Labels tagged with `inkMask()` draw a depth-tested mask into the prepass alpha (1 = ink allowed,
 * 0 = a label is in front), so lines of the geometry behind a label never cross its text.
 */
const OutlineShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.3 },
    uFar: { value: 1500 },
    uInk: { value: new THREE.Color("#1f1a17") },
    uThick: { value: 1 },
    uFade: { value: new THREE.Vector2(160, 520) },
    uStrength: { value: 1 },
    /** 0 no fog, 1 linear (uFogNear/uFogFar), 2 exp² (uFogDensity). Synced from scene.fog in render(). */
    uFogMode: { value: 0 },
    uFogNear: { value: 1 },
    uFogFar: { value: 1000 },
    uFogDensity: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse, tNormal, tDepth;
    uniform vec2 uTexel, uFade;
    uniform float uNear, uFar, uThick, uStrength, uFogMode, uFogNear, uFogFar, uFogDensity;
    uniform vec3 uInk;
    varying vec2 vUv;
    float viewZ(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      return -perspectiveDepthToViewZ(d, uNear, uFar);
    }
    // Same curves as three's fog chunk, on linear view depth.
    float fogAt(float z) {
      if (uFogMode < 0.5) return 0.0;
      if (uFogMode < 1.5) return smoothstep(uFogNear, uFogFar, z);
      return 1.0 - exp(-uFogDensity * uFogDensity * z * z);
    }
    vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      // Prepass alpha: 1 = ink allowed, 0 = a tagged label is in front (soft at its filtered edge).
      float inkOk = texture2D(tNormal, vUv).a;
      if (inkOk < 0.004) { gl_FragColor = col; return; }
      vec2 o = uTexel * uThick;
      float zc = viewZ(vUv);
      vec3 nc = nrm(vUv);
      float zs[4]; vec3 ns[4];
      vec2 offs[4];
      offs[0] = vec2(o.x, 0.0); offs[1] = vec2(-o.x, 0.0); offs[2] = vec2(0.0, o.y); offs[3] = vec2(0.0, -o.y);
      float dEdge = 0.0;
      float nEdge = 0.0;
      float zmin = zc;
      for (int i = 0; i < 4; i++) {
        float z = viewZ(vUv + offs[i]);
        vec3 n = nrm(vUv + offs[i]);
        zmin = min(zmin, z);
        // Relative depth jump: only the side that is nearer draws the line (crisp, one-sided).
        dEdge = max(dEdge, (z - zc) / max(zc, 0.001));
        nEdge = max(nEdge, 1.0 - dot(nc, n));
      }
      float edge = max(smoothstep(0.05, 0.11, dEdge), smoothstep(0.32, 0.55, nEdge) * step(zc, uFar * 0.98));
      edge *= 1.0 - smoothstep(uFade.x, uFade.y, zmin);
      // Gone by the time the fog has eaten ~60% of the color.
      edge *= 1.0 - smoothstep(0.05, 0.6, fogAt(zmin));
      col.rgb = mix(col.rgb, uInk, edge * uStrength * inkOk);
      gl_FragColor = col;
    }`,
};

export class InkOutlinePass extends Pass {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  private rt: THREE.WebGLRenderTarget;
  private normalMat = new THREE.MeshNormalMaterial();
  private quad: FullScreenQuad;
  readonly uniforms: typeof OutlineShader.uniforms;
  private clearColor = new THREE.Color();

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.rt.depthTexture = new THREE.DepthTexture(1, 1);
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(OutlineShader.uniforms),
      vertexShader: OutlineShader.vertexShader,
      fragmentShader: OutlineShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.uniforms = mat.uniforms as typeof OutlineShader.uniforms;
    this.uniforms.tNormal.value = this.rt.texture;
    this.uniforms.tDepth.value = this.rt.depthTexture;
    this.quad = new FullScreenQuad(mat);
  }

  override setSize(w: number, h: number) {
    this.rt.setSize(w, h);
    this.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ) {
    // Prepass: view-space normals + depth of outlined objects only.
    const cam = this.camera;
    const scene = this.scene;
    const layers = cam.layers.mask;
    const bg = scene.background;
    const fog = scene.fog;
    const ov = scene.overrideMaterial;
    renderer.getClearColor(this.clearColor);
    const alpha = renderer.getClearAlpha();
    cam.layers.disable(NO_OUTLINE_LAYER);
    cam.layers.enable(0);
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = this.normalMat;
    renderer.setClearColor(0x8080ff, 1);
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, cam);
    scene.overrideMaterial = ov;
    // Ink mask: visible tagged labels multiply the prepass alpha by (1 − coverage) where they pass
    // the depth test against the outlined geometry (one tiny draw per visible label, no world traversal).
    const masks = inkMaskScene(scene);
    if (masks) {
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(masks, cam);
      renderer.autoClear = autoClear;
    }
    scene.background = bg;
    scene.fog = fog;
    cam.layers.mask = layers;
    renderer.setClearColor(this.clearColor, alpha);

    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.uNear.value = cam.near;
    this.uniforms.uFar.value = cam.far;
    const u = this.uniforms;
    if (fog && (fog as THREE.Fog).isFog) {
      u.uFogMode.value = 1;
      u.uFogNear.value = (fog as THREE.Fog).near;
      u.uFogFar.value = Math.max((fog as THREE.Fog).far, (fog as THREE.Fog).near + 0.001);
    } else if (fog && (fog as THREE.FogExp2).isFogExp2) {
      u.uFogMode.value = 2;
      u.uFogDensity.value = (fog as THREE.FogExp2).density;
    } else u.uFogMode.value = 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  override dispose() {
    this.rt.depthTexture?.dispose();
    this.rt.dispose();
    this.normalMat.dispose();
    (this.quad.material as THREE.Material).dispose();
    this.quad.dispose();
  }
}
