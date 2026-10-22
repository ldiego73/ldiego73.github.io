/**
 * The people of the Antisuyu road: a riverside community (Shipibo-Konibo / Asháninka-inspired dress, drawn
 * plainly, ./comunidad/models.ts) so the jungle road is not empty of people:
 *  - children playing ball and tag on the palafitos plaza, scampering off when the traveler comes very close
 *    (comunidad/plaza.ts);
 *  - children jumping into the river off a fallen trunk upstream of the embarcadero and swimming back
 *    (comunidad/swim.ts);
 *  - women weaving on a backstrap loom and painting kené on pottery by the maloca, with an elder on a stool,
 *    who stays on by a small fire at night (comunidad/crafts.ts);
 *  - travellers walking the road both ways over long stretches (couples with bananas and baskets, a mother and
 *    her child, two young men), stepping aside for the traveler; parties that drift far out of sight come back
 *    just past the view distance, so the road never empties (comunidad/road.ts);
 *  - young people playing at the floating arcade's outer cabinets, a child watching over a shoulder and a
 *    teenager leaning on the rail; they step aside when the traveler wants their cabinet (comunidad/raft.ts);
 *  - at the end of the road, in the kené totem's clearing, women painting kené on a cloth, travellers resting
 *    on a log by a hearth (they stay on at night), and children at a clapping game watched by an elder
 *    (comunidad/finale.ts);
 *  - a fisherman casting his net from a dugout and a peque-peque running the river, both on the far half
 *    (comunidad/river.ts), clear of the canoe ride's route and landings.
 * By day; at night most go home. "E · Saludar" near a villager (only within ~2 u, away from the stations'
 * own "E" spots) shows a short bilingual greeting in a speech bubble (the mountain feria's bubble style,
 * ../../ambient/people/people.css): generic lines about the place, never claims about the site's owner.
 *
 * Rendering: the shared characters (../../characters): every villager is a member of ONE HumanCrowd (continuous
 * skinned bodies, GPU skinning, LOD by distance: two draw calls for all bodies and cloth, plus their shadow
 * and ink passes) animated by the human animation controller (walk cycle from the speed, actions such as
 * "weave", "swim", "carry-shoulder", "fish-cast", "paddle", "wave"; comunidad/villager.ts, dress.ts). Banana
 * bunches, back baskets, the paddle, the potter's pot and brush are held props (one instanced draw per kind).
 * People out of the view distance are not drawn (per group or per person). Props: one merged mesh per site,
 * the two boats, the net, the ball, the wake/splash rings. Phones and the low tier get fewer people and a
 * shorter view distance (comunidad/logic.ts headcount); the archetypes are prefetched at load (worker builds).
 * Every villager is a creatures body (kinds "child", "villager", "walker", "boatman"); the work and swim
 * places are keep-out zones for the fauna while people are there.
 */
import "../../ambient/people/people.css";
import * as THREE from "three";
import { GAMES } from "../../../games/registry";
import { jumped } from "../../ambient/people/logic";
import { HumanCrowd } from "../../characters/crowd";
import { prefetchHumans } from "../../characters/pipeline";
import { HeldProps } from "../../characters/props";
import type { Ambient, CreateAmbient } from "../../contract";
import { on } from "../../events";
import { detectDevice } from "../../quality";
import { paintStrength } from "../../style-gl";
import type { SelvaEnv } from "../contract";
import { ride } from "../ride";
import { raftGames } from "./arcade/logic";
import { type CraftSpot, createCrafts } from "./comunidad/crafts";
import { ALL_SPECS } from "./comunidad/dress";
import { createFinale } from "./comunidad/finale";
import { headcount } from "./comunidad/logic";
import { createPlazaKids } from "./comunidad/plaza";
import { createRaftPlayers } from "./comunidad/raft";
import { boatLane, createRiver } from "./comunidad/river";
import { createWalkers } from "./comunidad/road";
import { createSwimmers, findSwimSpot } from "./comunidad/swim";
import type { Ctx, Greeter, Group } from "./comunidad/types";
import { stationFrame, wx, wz } from "./embarcadero/station";
import { barNear, Ripples } from "./wild/kit";

/**
 * Road t of the swimming place: the sandbar just upstream of the embarcadero (no capybaras or caimans use it;
 * ronsoco.ts and caiman.ts pick the bars at 0.15/0.42/0.6 and 0.353/0.529/0.741).
 */
const SWIM_T = 0.397;
/** Road t range of the peque-peque's run. */
const BOAT_T: readonly [number, number] = [0.45, 0.93];
const T_GREET = { es: "E · Saludar", en: "E · Greet" } as const;

export const create: CreateAmbient = (baseEnv, hudRoot): Ambient => {
  const env = baseEnv as SelvaEnv;
  const phone = detectDevice().phone;
  const n = headcount(env.quality, phone);
  let low = env.quality === "low" || phone;
  const offQ = on("world:quality", (d) => {
    low = d.quality === "low" || phone;
  });
  const level = env.selva.layout.river.level;

  const ramp = env.toon("#ffffff").gradientMap;
  const staticMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
  // Props that move (the kids' ball, the fishing canoe, the peque-peque): no world-space painted blotches,
  // they would slide over a moving body (style-gl.ts; the characters' materials already opt out).
  const movingMat = paintStrength(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp }), 0);

  // ------------------------------------------------------------ greeting bubble
  const layer = document.createElement("div");
  layer.className = "qn-hud qn-people-layer";
  layer.lang = env.lang;
  hudRoot.appendChild(layer);
  const bubbleEl = document.createElement("p");
  bubbleEl.className = "qn-people-bubble";
  bubbleEl.setAttribute("role", "status");
  bubbleEl.setAttribute("aria-live", "polite");
  layer.appendChild(bubbleEl);
  const bubbleAt = new THREE.Vector3();
  let bubbleT = 0;
  const proj = new THREE.Vector3();
  const showBubble = (text: string, at: THREE.Vector3) => {
    bubbleEl.textContent = text;
    bubbleAt.copy(at);
    bubbleT = 5.2;
    bubbleEl.classList.add("is-on");
  };
  const placeBubble = () => {
    proj.copy(bubbleAt).project(env.camera);
    const w = hudRoot.clientWidth || innerWidth;
    const h = hudRoot.clientHeight || innerHeight;
    const vis = proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05;
    bubbleEl.style.visibility = vis ? "" : "hidden";
    const half = Math.min(160, w / 2 - 12);
    const x = THREE.MathUtils.clamp(((proj.x + 1) / 2) * w, half, w - half);
    const y = THREE.MathUtils.clamp(((1 - proj.y) / 2) * h, 120, h - 40);
    bubbleEl.style.left = `${Math.round(x)}px`;
    bubbleEl.style.top = `${Math.round(y)}px`;
  };

  // ------------------------------------------------------------ crowd + groups
  const raft = { players: n.raftPlayers, kids: n.raftKids, watcher: n.raftWatcher };
  const total =
    n.plazaKids +
    n.swimmers +
    n.walkers +
    n.crafts +
    (n.fisher ? 2 : 0) +
    (n.boat ? 2 : 0) +
    raft.players +
    raft.kids +
    (raft.watcher ? 1 : 0) +
    n.finale;
  const crowd = new HumanCrowd({ capacity: total, name: "comunidad:crowd", lodDist: low ? [7, 20] : [9, 26] });
  env.scene.add(crowd.group);
  const props = new HeldProps(Math.max(8, total));
  props.group.name = "comunidad:props";
  env.scene.add(props.group);
  // Start the archetype builds now (worker, far LODs first) so the villagers are ready when the traveler
  // reaches them.
  prefetchHumans(ALL_SPECS);
  const ripples = new Ripples(env, "comunidad:ripples", 24, level, 1.8);
  env.scene.add(ripples.mesh);
  const groups: Group[] = [];
  const tryAdd = (name: string, make: () => Group | null) => {
    try {
      const g = make();
      if (g) groups.push(g);
    } catch (err) {
      console.warn(`[comunidad] ${name} skipped`, err);
    }
  };

  // Kids on the palafitos plaza: the open apron beside the station board (local z 3.6), short of the boardwalk.
  tryAdd("plaza", () => {
    const f = stationFrame(env, "palafitos");
    const x = wx(f, 2.4, 1.2);
    const z = wz(f, 2.4, 1.2);
    return createPlazaKids(env, crowd, movingMat, new THREE.Vector3(x, env.selva.groundAt(x, z), z), 2.6, n.plazaKids);
  });
  // Women at work beside the maloca, left of its door seen from the road (the board stands on the right).
  tryAdd("crafts", () => {
    const f = stationFrame(env, "maloca");
    const at = (lx: number, lz: number, faceX: number, faceZ: number) => {
      const x = wx(f, lx, lz);
      const z = wz(f, lx, lz);
      return { x, z, yaw: Math.atan2(wx(f, faceX, faceZ) - x, wz(f, faceX, faceZ) - z) };
    };
    const spot: CraftSpot = {
      weaver: at(-4.3, -0.4, -4.3, 2.0),
      // Outside the maloca's wall (radius 5 round local (0, −7.6)) and its eave, left of the door.
      potter: at(-3.7, -2.0, -1.0, 0.8),
      elder: at(-2.5, -1.4, -0.2, 1.4),
    };
    return createCrafts(env, crowd, props, staticMat, spot, n.crafts);
  });
  // The boats keep well clear of the swimming place.
  const swimZone: Array<{ x: number; z: number; r: number }> = [];
  tryAdd("swim", () => {
    // The sandbar nearest SWIM_T (across from the embarcadero), unless the fauna already use it.
    const bar = barNear(env, SWIM_T, 0.02);
    const pier = env.stationPose("embarcadero").position;
    const s = bar ? findSwimSpot(env, bar, pier) : null;
    if (!s) return null;
    swimZone.push({ x: s.land.x, z: s.land.z, r: 12 }, { x: s.tip.x, z: s.tip.z, r: 12 });
    return createSwimmers(env, crowd, staticMat, s, n.swimmers, ripples);
  });
  tryAdd("road", () => createWalkers(env, crowd, props, n.walkers));
  tryAdd("raft", () => createRaftPlayers(env, crowd, stationFrame(env, "arcade"), raftGames(GAMES).length, raft));
  tryAdd("finale", () => createFinale(env, crowd, props, staticMat, n.finale));
  tryAdd("river", () => {
    // The peque-peque runs from just below the embarcadero to short of the collpa: upstream of 0.45 the river
    // narrows past the embarcadero's moored canoe and the swimmers' sandbar (no room on the far half).
    const lane = boatLane(env, swimZone, BOAT_T[0], BOAT_T[1]);
    return lane
      ? createRiver(env, crowd, props, movingMat, lane, ripples, { fisher: n.fisher, boat: n.boat, slow: swimZone })
      : null;
  });

  // ------------------------------------------------------------ frame
  const camPos = new THREE.Vector3();
  const seenV = new THREE.Vector3();
  const ctx: Ctx = {
    env,
    dt: 0,
    clock: 0,
    time: env.sky.time(),
    jump: false,
    avatar: new THREE.Vector3(),
    rm: env.reducedMotion,
    riding: false,
    camera: camPos,
    view: low ? 70 : 105,
    seen(x, y, z, max = 70) {
      if (Math.hypot(x - camPos.x, z - camPos.z) > max) return false;
      seenV.set(x, y, z).project(env.camera);
      return seenV.z < 1 && Math.abs(seenV.x) < 1.15 && Math.abs(seenV.y) < 1.15;
    },
  };
  let lastTime = env.sky.time();
  let greeter: Greeter | null = null;
  let modal = 0;
  const offModal = on("world:modal", (d) => {
    modal = Math.max(0, modal + (d.open ? 1 : -1));
  });

  const ambient: Ambient = {
    update(dt, avatar) {
      dt = Math.min(dt, 0.05);
      ctx.dt = dt;
      ctx.clock += dt;
      ctx.avatar.copy(avatar);
      ctx.riding = ride.active;
      ctx.view = low ? 70 : 105;
      const time = env.sky.time();
      ctx.jump = jumped(lastTime, time, dt);
      lastTime = time;
      ctx.time = time;
      env.camera.getWorldPosition(camPos);
      greeter = null;
      // On a station's plaza only the maloca women greet (their spot is clear of every station "E" spot);
      // walkers passing a plaza never take E from the station.
      let onPlaza = false;
      for (const pl of env.selva.layout.plazas)
        if (Math.hypot(pl.x - avatar.x, pl.z - avatar.z) < pl.r + 1) onPlaza = true;
      for (const g of groups) {
        const d = Math.hypot(g.center.x - camPos.x, g.center.z - camPos.z) - g.radius;
        const da = Math.hypot(g.center.x - avatar.x, g.center.z - avatar.z) - g.radius;
        g.update(ctx, Math.min(d, da) < ctx.view);
        if (!greeter && !ride.active && (!onPlaza || g.name === "crafts")) greeter = g.greeter?.(ctx) ?? null;
      }
      crowd.update(env.camera);
      props.update();
      ripples.update(dt);
      if (bubbleT > 0) {
        bubbleT -= dt;
        placeBubble();
        const far = Math.hypot(bubbleAt.x - avatar.x, bubbleAt.z - avatar.z) > 7;
        if (bubbleT <= 0 || far) {
          bubbleT = 0;
          bubbleEl.classList.remove("is-on");
        }
      }
      layer.classList.toggle("is-night", env.sky.isNight());
    },
    prompt() {
      return greeter && modal === 0 ? T_GREET[env.lang] : null;
    },
    interact() {
      if (!greeter) return false;
      greeter.greet();
      showBubble(greeter.text[env.lang], greeter.head);
      return true;
    },
    dispose() {
      offQ();
      offModal();
      for (const g of groups) g.dispose();
      groups.length = 0;
      crowd.dispose();
      props.dispose();
      ripples.dispose();
      staticMat.dispose();
      movingMat.dispose();
      layer.remove();
    },
  };

  if (import.meta.env?.DEV) {
    (window as unknown as { __comunidad?: unknown }).__comunidad = {
      groups: () => groups.map((g) => ({ name: g.name, people: g.people(), points: g.points?.() ?? [] })),
      drawCalls: () => crowd.drawCalls() + props.drawCalls(),
      crowd: () => crowd.stats(),
      dev: (group: string, cmd: string, ...args: number[]) =>
        groups.find((g) => g.name === group)?.dev?.[cmd]?.(...args),
    };
  }
  return ambient;
};
