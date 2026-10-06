import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { inkMask, inkMaskCount, inkMaskScene } from "./toon";

describe("inkMask", () => {
  test("twins follow their label's attachment, visibility, matrix and opacity; dispose removes them", () => {
    const base = inkMaskCount();
    const root = new THREE.Scene();
    const group = new THREE.Group();
    const mat = new THREE.SpriteMaterial({ transparent: true, opacity: 0.4 });
    const label = new THREE.Sprite(mat);
    label.position.set(1, 2, 3);
    group.add(label);
    inkMask(group);
    inkMask(group); // idempotent
    expect(inkMaskCount()).toBe(base + 1);
    expect(label.children.length).toBe(0); // twins live outside the world graph

    expect(inkMaskScene(root)).toBeNull(); // not attached yet
    root.add(group);
    root.updateMatrixWorld(true);
    const scene = inkMaskScene(root);
    expect(scene).not.toBeNull();
    const twin = scene!.children.find((c) => c.visible) as THREE.Sprite;
    expect(twin.matrixWorld.elements[12]).toBe(1);
    expect(twin.material.opacity).toBeCloseTo(0.4);
    expect(twin.material.blending).toBe(THREE.CustomBlending);

    group.visible = false;
    expect(inkMaskScene(root)).toBeNull();
    group.visible = true;

    mat.dispose();
    expect(inkMaskCount()).toBe(base);
    expect(inkMaskScene(root)).toBeNull();
  });

  test("meshes share one mask material per source material; instanced meshes are skipped", () => {
    const base = inkMaskCount();
    const mat = new THREE.MeshBasicMaterial();
    const geo = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, mat), new THREE.Mesh(geo, mat), new THREE.InstancedMesh(geo, mat, 4));
    inkMask(g);
    expect(inkMaskCount()).toBe(base + 2);
    const root = new THREE.Scene();
    root.add(g);
    root.updateMatrixWorld(true);
    const twins = inkMaskScene(root)!.children.filter((c) => c.visible) as THREE.Mesh[];
    expect(twins.length).toBe(2);
    expect(twins[0]!.material).toBe(twins[1]!.material);
    expect((twins[0]!.material as THREE.MeshBasicMaterial).map).toBeNull(); // opaque plate masks its whole quad
    mat.dispose();
    expect(inkMaskCount()).toBe(base);
  });
});
