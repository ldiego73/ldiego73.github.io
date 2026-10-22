/**
 * Dev stage for the characters prototype: a small trailhead meadow in the mountain's look (STYLES.qhapaq via
 * the shared style runtime, the shared sky), a dirt path where the characters stand, ichu tufts and lupines on
 * the shared wind, a few rocks and the ridges behind. Not shipped; built from the real flora models so the wind
 * and the cel style are the ones the world uses.
 */
import * as THREE from "three";
import { swayMaterial } from "../../flora/material";
import { ichuModel, lupineModel, TINTS } from "../../flora/models";
import { gradientMap, type ToonCache } from "../../toon";

const rand = (() => {
  let s = 1234567;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
})();

export function heightAt(x: number, z: number) {
  // Flat where the lineup stands, rising gently into hills behind.
  const back = Math.max(0, -z - 6);
  return (
    Math.sin(x * 0.13) * 0.25 + Math.cos(z * 0.11 + x * 0.05) * 0.2 + back * back * 0.04 - 0.2 * Math.exp(-(z * z) / 30)
  );
}

export function createStage(scene: THREE.Scene, toon: ToonCache) {
  const group = new THREE.Group();
  group.name = "stage";
  // ---- ground
  const size = 120;
  const g = new THREE.PlaneGeometry(size, size, 160, 160);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  const grass = new THREE.Color("#7fae6a");
  const grass2 = new THREE.Color("#93b56a");
  const soil = new THREE.Color("#b08a5e");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    // A dirt path along x where the characters stand.
    const path = Math.exp(-((z - 0.2) ** 2) / 1.6);
    c.copy(grass).lerp(grass2, 0.5 + 0.5 * Math.sin(x * 0.7 + z * 0.4));
    c.lerp(soil, Math.min(1, path * 1.25));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, toon.vertexToon());
  ground.receiveShadow = true;
  ground.name = "stage:ground";
  group.add(ground);

  // ---- ridges behind (big soft cones with snowy tops, far enough to take the aerial haze)
  const ridgeMat = toon.vertexToon();
  for (const [x, z, r, h] of [
    [-60, -90, 45, 38],
    [10, -120, 60, 62],
    [80, -95, 50, 44],
    [-110, -60, 40, 26],
  ] as const) {
    const cg = new THREE.ConeGeometry(r, h, 24, 6);
    const p = cg.getAttribute("position");
    const cc = new Float32Array(p.count * 3);
    const rock = new THREE.Color("#8f8a7c");
    const snow = new THREE.Color("#f3efe6");
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / h + 0.5;
      const k = y > 0.72 ? 1 : 0;
      const col2 = rock.clone().lerp(snow, k);
      cc.set([col2.r, col2.g, col2.b], i * 3);
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const rr = 1 + 0.08 * Math.sin(a * 5 + x) * (1 - y);
      p.setX(i, p.getX(i) * rr);
      p.setZ(i, p.getZ(i) * rr);
    }
    cg.setAttribute("color", new THREE.BufferAttribute(cc, 3));
    cg.computeVertexNormals();
    const m = new THREE.Mesh(cg, ridgeMat);
    m.position.set(x, h / 2 - 4, z);
    group.add(m);
  }

  // ---- rocks
  for (const [x, z, s] of [
    [-8.5, -2.5, 0.9],
    [8.8, -3.4, 1.2],
    [-3, -6, 0.6],
    [5.5, 3.6, 0.5],
  ] as const) {
    const rg = new THREE.DodecahedronGeometry(s, 0);
    rg.scale(1.3, 0.75, 1);
    const m = new THREE.Mesh(rg, toon.toon("#a39b8c"));
    m.position.set(x, heightAt(x, z) + s * 0.4, z);
    m.rotation.y = x;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  // ---- ichu and lupines on the shared wind (instanced, the world's own models and material)
  const mat = swayMaterial(gradientMap());
  const scatter = (geo: THREE.BufferGeometry, n: number, tints: readonly string[], scale: [number, number]) => {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i < n * 4 && k < n; i++) {
      const x = (rand() - 0.5) * 44;
      const z = -1.3 - rand() * 22;
      // Keep the path, the lineup and the camera's side clear (tufts frame the characters from behind).
      if (z > -1.3 && Math.abs(x) < 12) continue;
      const sc = scale[0] + rand() * (scale[1] - scale[0]);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
      s.set(sc, sc, sc);
      m4.compose(new THREE.Vector3(x, heightAt(x, z) - 0.02, z), q, s);
      mesh.setMatrixAt(k, m4);
      mesh.setColorAt(k, new THREE.Color(tints[k % tints.length] as string));
      k++;
    }
    mesh.count = k;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  scatter(ichuModel("tall", false), 260, TINTS.ichuTall, [0.7, 1.15]);
  scatter(ichuModel("short", false), 420, TINTS.ichuShort, [0.8, 1.3]);
  scatter(lupineModel(false).geo, 60, ["#ffffff", "#f0ecff"], [0.8, 1.1]);
  scene.add(group);
  return group;
}
