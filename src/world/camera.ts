/** Third-person follow camera (Messenger-like): sits behind the traveler, drag to orbit, wheel to zoom, never inside the slope. */
import * as THREE from "three";

const angleLerp = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

export interface FollowCam {
  /** Angle of the camera around the target (0 = camera on +Z of the target). */
  yaw: number;
  pitch: number;
  dist: number;
  /** 0..1: pulls the camera closer and lower (inside a house / the arcade). The player's own zoom/pitch are kept. */
  squeeze: number;
  /**
   * Solid scenery the camera must not end up behind (e.g. the waterfall cliff and the cave walls): the arm
   * is shortened to the first opaque hit along the sight line. Kept small: raycast every frame.
   */
  occluders: THREE.Object3D[];
  /** Heavier occluders (terrain, boulders) tested only while the target is inside their area. */
  areaOccluders: Array<{ objects: THREE.Object3D[]; x: number; z: number; r: number }>;
  /** Desired pose for this frame (before smoothing) — used by the title swoop. */
  desired(target: THREE.Vector3): { pos: THREE.Vector3; look: THREE.Vector3 };
  update(
    dt: number,
    time: number,
    target: THREE.Vector3,
    o: { facing: number; moving: boolean; orbit: { dx: number; dy: number; zoom: number }; follow: number },
  ): void;
  /** Jump straight to the desired pose next frame. */
  snap(): void;
  /** Point the camera behind a facing yaw. */
  behind(facing: number): void;
}

export function createFollowCam(
  camera: THREE.PerspectiveCamera,
  heightAt: (x: number, z: number) => number,
): FollowCam {
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const dPos = new THREE.Vector3();
  const dLook = new THREE.Vector3();
  const p = new THREE.Vector3();
  let snapNext = true;
  const ray = new THREE.Raycaster();
  const hits: THREE.Intersection[] = [];
  const dir = new THREE.Vector3();
  const back = new THREE.Vector3();
  const active: THREE.Object3D[] = [];
  // Occlusion is re-cast every 3rd frame (terrain raycasts aren't free); in between the last arm
  // fraction is reused, which is invisible behind the camera's own smoothing.
  let occFrame = 0;
  let occFrac = 1;
  /** Visible and mostly opaque (water sheets, veils and glows don't block the view). */
  const blocks = (o: THREE.Object3D) => {
    for (let n: THREE.Object3D | null = o; n; n = n.parent) if (!n.visible) return false;
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    const mat = Array.isArray(m) ? m[0] : m;
    // Fading rock (cave walls/roof cross-fade) still blocks; thin water and veils don't.
    return !!mat && (!mat.transparent || mat.opacity > 0.6);
  };
  let lastOrbit = -10;

  const rig: FollowCam = {
    yaw: 0,
    pitch: 0.3,
    dist: 9,
    squeeze: 0,
    occluders: [],
    areaOccluders: [],
    desired(target) {
      dLook.set(target.x, target.y + 1.55 - rig.squeeze * 0.2, target.z);
      const dist = THREE.MathUtils.lerp(rig.dist, Math.min(rig.dist, 6), rig.squeeze);
      const pitch = THREE.MathUtils.lerp(rig.pitch, Math.max(0.1, rig.pitch - 0.13), rig.squeeze);
      const cp = Math.cos(pitch);
      dPos.set(
        dLook.x + Math.sin(rig.yaw) * cp * dist,
        dLook.y + Math.sin(pitch) * dist,
        dLook.z + Math.cos(rig.yaw) * cp * dist,
      );
      // Terrain-aware: lift the camera until the sight line clears the slope.
      let lift = 0;
      const S = 10;
      for (let i = 1; i <= S; i++) {
        const f = i / S;
        p.lerpVectors(dLook, dPos, f);
        const need = heightAt(p.x, p.z) + 0.9 - p.y;
        if (need > 0) lift = Math.max(lift, need / f);
      }
      if (lift > 0) {
        // Too much lift turns into a top-down view; shorten the arm instead.
        const maxLift = dist * 0.7;
        if (lift > maxLift) {
          const k = maxLift / lift;
          dPos.lerpVectors(dLook, dPos, Math.max(0.35, k));
          lift = maxLift * k;
        }
        dPos.y += lift;
      }
      dPos.y = Math.max(dPos.y, heightAt(dPos.x, dPos.z) + 1.1);
      // Rock between the traveler and the camera (cliffs, cave walls): pull the camera in front of it.
      active.length = 0;
      for (const o of rig.occluders) active.push(o);
      for (const a of rig.areaOccluders)
        if ((target.x - a.x) ** 2 + (target.z - a.z) ** 2 < a.r * a.r) for (const o of a.objects) active.push(o);
      if (!active.length) occFrac = 1;
      if (active.length) {
        dir.subVectors(dPos, dLook);
        const len = dir.length();
        if (len > 0.01 && occFrame++ % 3 !== 0) {
          if (occFrac < 1) dPos.copy(dLook).addScaledVector(dir, Math.max(1.2 / len, occFrac));
        } else if (len > 0.01) {
          dir.multiplyScalar(1 / len);
          // Single-sided rock is only hit from its outside, so cast both ways and keep the hit nearest
          // the traveler (from inside a grotto the outward ray sees back faces only).
          let near = len;
          ray.far = len;
          ray.set(dLook, dir);
          hits.length = 0;
          ray.intersectObjects(active, true, hits);
          for (const h of hits) if (blocks(h.object)) near = Math.min(near, h.distance);
          back.copy(dPos);
          ray.set(back, dir.negate());
          hits.length = 0;
          ray.intersectObjects(active, true, hits);
          dir.negate();
          for (const h of hits) if (blocks(h.object)) near = Math.min(near, len - h.distance);
          occFrac = near < len ? Math.max(1.2, near - 0.35) / len : 1;
          if (near < len) dPos.copy(dLook).addScaledVector(dir, Math.max(1.2, near - 0.35));
        }
      }
      return { pos: dPos, look: dLook };
    },
    update(dt, time, target, o) {
      const { orbit } = o;
      if (orbit.dx || orbit.dy) {
        rig.yaw -= orbit.dx * 0.0055;
        rig.pitch = THREE.MathUtils.clamp(rig.pitch + orbit.dy * 0.004, 0.06, 1.15);
        lastOrbit = time;
      }
      if (orbit.zoom) rig.dist = THREE.MathUtils.clamp(rig.dist + orbit.zoom * 0.9, 4.5, 22);
      // Swing back behind the traveler once they move and the player isn't orbiting.
      if (o.moving && time - lastOrbit > 1.6)
        rig.yaw = angleLerp(rig.yaw, o.facing + Math.PI, Math.min(1, dt * o.follow));
      const d = rig.desired(target);
      if (snapNext) {
        pos.copy(d.pos);
        look.copy(d.look);
        snapNext = false;
      }
      pos.lerp(d.pos, 1 - Math.exp(-dt * 6));
      look.lerp(d.look, 1 - Math.exp(-dt * 11));
      // Never let the smoothed position dip into the ground.
      pos.y = Math.max(pos.y, heightAt(pos.x, pos.z) + 0.9);
      camera.position.copy(pos);
      camera.lookAt(look);
    },
    snap() {
      snapNext = true;
    },
    behind(facing) {
      rig.yaw = facing + Math.PI;
    },
  };
  return rig;
}
