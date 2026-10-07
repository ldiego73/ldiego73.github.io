/**
 * Wasi: the owner's Andean house at the trailhead (trailhead.ts WASI), a world of its own inside the mountain
 * page. The exterior is always there and cheap (wasi/exterior.ts: a handful of merged meshes); the INTERIOR
 * is a separately loaded chunk: `import("./wasi/interior")` runs only when the traveler comes within
 * LOAD_R of the house, and the interior is disposed again beyond UNLOAD_R.
 *
 * Inside (four rooms, wasi/plan.ts) the roof fades and the walls facing the camera drop to a low cutaway
 * (dollhouse view, like the chasqui post in house.ts), and `world:interior {inside, id: "wasi"}` is emitted
 * on every transition so core closes the camera in, the llama auto-dismounts, weather/sound go indoor and
 * the passport opens on its Wasi page. Near a room's piece, "E · …" opens that room's panel (career, study,
 * contact) or the passport booklet (traveler's table); the first time each room is opened it stamps
 * `wasi:<room>` (passport CATALOG ids and labels).
 *
 * The house stands on a levelled stone plinth (plan.ts `platform()`, from the bare terrain): the plinth top
 * (rooms + front terrace) and the stone steps down to the walk are registered as raised decks (../decks.ts),
 * so core stands the traveler on a level floor and the steps are climbed one riser at a time.
 *
 * Collisions are registered once at create time from the static plan (the contract cannot remove them, so
 * the lazy chunk must not add any): wall boxes with the door gap, partitions, posts, furniture and garden
 * pieces as colliders; the flagstone walk to the trail as a walkable area. Around the plinth the slope is
 * grass (not walkable), so its open edges are walls: the house is reached only up the steps and entered only
 * through the door. A creatures keep-out disc keeps animals out of the house and garden.
 *
 * Seats (plan.ts SEATS, ../seat.ts): the sala's poyo (turned toward the wall khipu) and the estudio chair at the
 * laptop. Near one, "E · Sentarse" emits `world:sit`; seated, the prompt is that room's own ("E · Ver
 * trayectoria", "E · Ver formación y CV"), so the panel opens from the seat, and moving, jumping or Esc (with no
 * panel open) stands up. At the desk the traveler types and the laptop screen lights up and fills with code.
 */
import * as THREE from "three";
import type { Ambient, CreateAmbient } from "../contract";
import { creatures } from "../creatures";
import { decks } from "../decks";
import type { WorldEnvExtra } from "../env";
import { emit, on } from "../events";
import { cutaway, Ease01, fadeable } from "../props";
import { nearSeat, SIT_COPY, sitDetail } from "../seat";
import { WASI } from "../trailhead";
import { clearGround } from "./wasi/clear-ground";
import { COPY, roomStamp } from "./wasi/content";
import { buildExterior } from "./wasi/exterior";
import type { WasiInterior } from "./wasi/interior";
import {
  clearsGround,
  colliders,
  isInsideLocal,
  KEEP_OUT_R,
  platform,
  type RoomId,
  roomAt,
  SEATS,
  seatWorld,
  toLocal,
  walkables,
} from "./wasi/plan";

/** Load the interior chunk within this distance of the house; dispose it beyond UNLOAD_R (hysteresis). */
const LOAD_R = 45;
const UNLOAD_R = 120;
/** The interior only renders while inside or close enough to look through the door. */
const SHOW_R = 16;

export const create: CreateAmbient = (envIn, hudRoot): Ambient => {
  const env = envIn as WorldEnvExtra;
  const lang = env.lang;
  // The bare terrain (never a deck-aware ground: the plinth itself is a deck).
  const terrain = (x: number, z: number) => env.heightAt(x, z);
  const plat = platform(terrain);

  const ext = buildExterior(env, terrain, plat);
  env.scene.add(ext.group);
  for (const c of colliders()) env.addCollider(c);
  for (const w of walkables()) env.addWalkable(w);
  const unDeck = plat.decks.map((d) => decks.add(d));
  const keep = creatures.keepOut(WASI.x, WASI.z, KEEP_OUT_R);
  // No ichu through the floorboards or the flagstones (see clear-ground.ts).
  clearGround(env.scene, clearsGround);

  const roofFade = fadeable(ext.roof, env);
  const roofEase = new Ease01(0.35, env.reducedMotion);
  const cut = cutaway(
    [
      { g: ext.walls.back, n: new THREE.Vector3(0, 0, -1) },
      { g: ext.walls.front, n: new THREE.Vector3(0, 0, 1) },
      { g: ext.walls.left, n: new THREE.Vector3(-1, 0, 0) },
      { g: ext.walls.right, n: new THREE.Vector3(1, 0, 0) },
    ],
    env.reducedMotion,
  );

  let interior: WasiInterior | null = null;
  let loading = false;
  let disposed = false;
  let inside = false;
  let room: RoomId | null = null;
  let night = env.sky.isNight();
  ext.setNight(night);
  const stamped = new Set<RoomId>();
  const camDir = new THREE.Vector3();
  let lastDist = Number.POSITIVE_INFINITY;
  const seats = SEATS.map((s) => seatWorld(s, plat.floor));
  /** The room whose seat the traveler sits on (the runtime decides, see ../seat.ts), and a seat in reach. */
  let seatedRoom: RoomId | null = null;
  let nearby: (typeof seats)[number] | null = null;
  const offSit = on("world:sit", (d) => {
    seatedRoom = (d?.seated && seats.find((s) => s.id === d.id)?.room) || null;
  });

  const load = () => {
    loading = true;
    import("./wasi/interior")
      .then((m) => {
        loading = false;
        if (disposed || lastDist > UNLOAD_R) return;
        interior = m.buildInterior(env, ext, hudRoot);
        interior.setNight(night);
      })
      .catch((err) => {
        // Keep the exterior; try again on the next approach.
        loading = false;
        console.warn("[world] wasi interior not loaded", err);
      });
  };

  return {
    update(dt, avatar, t) {
      const d = Math.hypot(avatar.x - WASI.x, avatar.z - WASI.z);
      lastDist = d;
      if (d < LOAD_R && !interior && !loading) load();
      if (d > UNLOAD_R && interior && !interior.panels.isOpen()) {
        interior.dispose();
        interior = null;
      }

      const n = env.sky.isNight();
      if (n !== night) {
        night = n;
        ext.setNight(n);
        interior?.setNight(n);
      }

      const l = toLocal(avatar.x, avatar.z);
      const now = isInsideLocal(l.x, l.z);
      if (now !== inside) {
        inside = now;
        emit("world:interior", { inside, id: "wasi" });
      }
      if (d < LOAD_R || roofFade.value < 1) {
        roofFade.set(roofEase.step(inside ? 0 : 1, dt));
        const c = toLocal(env.camera.position.x, env.camera.position.z);
        camDir.set(c.x, 0, c.z).normalize();
        cut.update(dt, inside, camDir);
        ext.syncCut();
      }
      // Seated, the room is the seat's (the poyo sits at the edge of the sala's spot range).
      room = inside && interior ? (seatedRoom ?? roomAt(l.x, l.z)) : null;
      nearby =
        inside && interior && !seatedRoom && !interior.panels.isOpen() ? nearSeat(seats, avatar.x, avatar.z) : null;
      if (interior) {
        interior.setVisible(inside || d < SHOW_R);
        interior.setTyping(seatedRoom === "estudio");
        interior.update(t);
      }
      if (night && d < LOAD_R) ext.update(t);
    },
    prompt: () => (nearby ? SIT_COPY.sit[lang] : room ? COPY.prompt[room][lang] : null),
    interact() {
      if (nearby) {
        emit("world:sit", sitDetail(nearby));
        return true;
      }
      if (!room || !interior) return false;
      if (interior.panels.isOpen()) {
        interior.panels.close();
        return true;
      }
      if (interior.panels.open(room) && !stamped.has(room)) {
        stamped.add(room);
        emit("world:stamp", roomStamp(room));
      }
      return true;
    },
    escape: () => interior?.panels.close() ?? false,
    dispose() {
      disposed = true;
      offSit();
      if (inside) emit("world:interior", { inside: false, id: "wasi" });
      interior?.dispose();
      interior = null;
      roofFade.dispose();
      ext.dispose();
      creatures.removeKeepOut(keep);
      for (const off of unDeck) off();
    },
  };
};
