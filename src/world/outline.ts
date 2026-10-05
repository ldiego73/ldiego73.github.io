import * as THREE from "three";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { NO_OUTLINE_LAYER } from "./toon";

/**
 * Hand-inked outlines: a normal + depth prepass (outlined layer only), then a full-screen
 * edge detect that mixes ink into the color buffer. Ink color and distance fade are uniforms
 * so day/night and the title view can retune them.
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
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse, tNormal, tDepth;
    uniform vec2 uTexel, uFade;
    uniform float uNear, uFar, uThick, uStrength;
    uniform vec3 uInk;
    varying vec2 vUv;
    float viewZ(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      return -perspectiveDepthToViewZ(d, uNear, uFar);
    }
    vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
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
      col.rgb = mix(col.rgb, uInk, edge * uStrength);
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
    scene.background = bg;
    scene.fog = fog;
    cam.layers.mask = layers;
    renderer.setClearColor(this.clearColor, alpha);

    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.uNear.value = cam.near;
    this.uniforms.uFar.value = cam.far;
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
