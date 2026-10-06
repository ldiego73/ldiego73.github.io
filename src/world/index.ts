/**
 * Andean world orchestration: floating-island title → camera swoop → third-person climb of the Qhapaq Ñan.
 * Core owns engine, terrain, trail, sky/day-night, toon + ink, camera, input and controls;
 * content (avatar, stations, HUD panels) and ambients (fauna, NPCs) load lazily through ./contract.ts.
 *
 * env.extra (core helpers outside the contract; type `WorldEnvExtra` in ./env.ts):
 *   groundAt(x, z)                      ground incl. bridge decks
 *   isGrass(x, z)                       open grass (not path/plaza/water/gorge/cliff, gentle slope)
 *   randomGrassPoint(rand?, near?)      random grass point as Vector3 (y on ground) or null
 *   isWater(x, z)                       river or mountain stream
 *   trailDistance(x, z)                 { d, t } to the trail centerline
 *   stream                              { t, cross, fallBase } of the waterfall stream crossing
 *
 * Input priority: E → npcs.interact?() → fauna.interact?() → content.interact();
 *                 Esc → npcs.escape?() → fauna.escape?() → content.escape() → stop tour.
 * Prompts: an ambient's prompt?() text shows in core's own pill (bottom center, above content's prompt
 * row). Since E goes to ambients first, whatever the pill says is what E will do.
 *
 * Keys: M map + fast travel (map.ts), H help, K text mode (textmode.ts), T day/night, N music, F photo
 * (P is reserved for the passport). Gamepads: see input.ts (B = Esc, Y = map, Start = help, Select = text).
 * Events handled here: `world:modal {open}` (counter; freezes walking while > 0), `world:mount` (speed
 * multiplier + seat height), `world:teleport {to}` (fade + move to a station's plaza), `world:textmode`,
 * `world:map`. The auto quality governor (quality.ts) emits `world:quality {auto: true}`.
 *
 * Bodies (creatures.ts): the registry is cleared before ambients are built (they register at create time)
 * and after they are disposed. Core registers the traveler (kind "traveler") and, after each move, pushes
 * the traveler out of solid bodies (animals, people) like any collider: only onto standable ground, with the
 * velocity into the body removed so walking into a llama slides around it instead of shaking.
 */
import * as THREE from "three";
import { COMPANIES } from "../data/career";
import { createFollowCam } from "./camera";
import { createChrome } from "./chrome";
import {
  type Ambient,
  type Avatar,
  type Content,
  type CreateAmbient,
  type CreateAvatar,
  type CreateContent,
  type Lang,
  STATIONS,
  type WorldEnv,
} from "./contract";
import { creatures } from "./creatures";
import { worldData } from "./data";
import { createNameEditor, createPhotoMode, placeAt } from "./dialogs";
import { createEngine, disposeTree, type Quality } from "./engine";
import { createEnv } from "./env";
import { emit, on } from "./events";
import { createInput, type PadAction } from "./input";
import { createTitle } from "./intro";
import { buildLayout, type Layout } from "./layout";
import { createLoader, type LoadStep } from "./loader";
import { createBigMap, type MapStop } from "./map";
import { createWorldMusic } from "./music";
import { DYE } from "./palette";
import { createGovernor, detectDevice, LEVELS } from "./quality";
import { createSky } from "./sky";
import { createScenery } from "./terrain";
import { disposeTextures, redrawAll } from "./tex";
import { createToonCache } from "./toon";
import "./textmode.css";
import { setWorldDate } from "./calendar";
import { createDetailCull } from "./detail-cull";
import { createClimbTracker, summarize } from "./journey";
import { createJourneyDialog } from "./journey-card";
import { createTextMode, focusStep, type TextMode } from "./textmode";
import { createTrailMeshes } from "./trail";
import { announceTraveler, loadTraveler, saveTraveler } from "./traveler";

export interface WorldOptions {
  lang: Lang;
  /** Skip the title (dev / deep link). */
  skipIntro?: boolean;
}

const Q_KEY = "ldiego73-world-quality";
const WALK = 3.6;
const RUN = 7.4;
const TOUR_SPEED = 4.6;
const GRAVITY = 22;
const JUMP_V = 7.2;
const BODY_R = 0.42;
/** Traveler + llama footprint while riding (the ridden llama itself is not an obstacle). */
const RIDE_R = 0.62;
/** Most the traveler is pushed out of bodies per frame (summed overlaps can overshoot). */
const PUSH_MAX = 0.5;
const MAX_STEP = 0.9;
const SWOOP = 3.4;
/** Within this distance of a station's plaza it counts as visited (fast-travel target). */
const VISIT_R = 7;
const FADE_MS = 300;
const CANCELLED = Symbol("cancelled");
/** Let the browser paint (loader progress) between heavy synchronous build steps. */
const paint = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

/** Map marker colors per station kind (company stations use their khipu dye). */
const KIND_DYE: Record<string, string> = {
  gate: DYE.cotton,
  bridge: DYE.indigo,
  arcade: DYE.red,
  ai: DYE.turq,
  contact: DYE.red,
  summit: "#e8b631",
};
const SUMMIT_LABEL = { es: "Cumbre del Qhapaq Ñan", en: "Qhapaq Ñan summit" } as const;

const readQuality = (): Quality => {
  try {
    const q = localStorage.getItem(Q_KEY);
    if (q === "low" || q === "high") return q;
  } catch {
    /* storage unavailable */
  }
  return matchMedia("(pointer: coarse)").matches ? "low" : "high";
};

const angleLerp = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

// Content modules are optional at build time (the content agent ships them); load them lazily and duck-type.
const contentModules = import.meta.glob(["./avatar.ts", "./content.ts", "./fauna.ts", "./npcs.ts"]);
/**
 * Drop-in ambient systems: every src/world/ambient/<name>.ts that exports `create: CreateAmbient`
 * is loaded and wired automatically (update every frame, E/Esc routing, prompt pill), after npcs/fauna.
 * Tests (*.test.ts) are excluded.
 */
const ambientModules = import.meta.glob(["./ambient/*.ts", "!./ambient/*.test.ts"]);
async function loadContent(onModule?: (done: number, total: number) => void) {
  const out: {
    createAvatar?: CreateAvatar;
    createContent?: CreateContent;
    footprint?: Record<string, number>;
    deckHeightAt?: (x: number, z: number) => number | null;
    createFauna?: CreateAmbient;
    createNpcs?: CreateAmbient;
    extra: Array<[string, CreateAmbient]>;
  } = { extra: [] };
  const total = Object.keys(ambientModules).length + Object.keys(contentModules).length;
  let done = 0;
  const tick = () => onModule?.(++done, total);
  for (const [path, load] of Object.entries(ambientModules)) {
    try {
      const m = (await load()) as Record<string, unknown>;
      if (typeof m.create === "function") out.extra.push([path, m.create as CreateAmbient]);
    } catch (err) {
      console.warn(`[world] ambient ${path} not usable yet`, err);
    }
    tick();
  }
  for (const [path, load] of Object.entries(contentModules)) {
    try {
      const m = (await load()) as Record<string, unknown>;
      if (path.endsWith("avatar.ts") && typeof m.createAvatar === "function")
        out.createAvatar = m.createAvatar as CreateAvatar;
      if (path.endsWith("fauna.ts") && typeof m.createFauna === "function")
        out.createFauna = m.createFauna as CreateAmbient;
      if (path.endsWith("npcs.ts") && typeof m.createNpcs === "function")
        out.createNpcs = m.createNpcs as CreateAmbient;
      if (path.endsWith("content.ts")) {
        if (typeof m.createContent === "function") out.createContent = m.createContent as CreateContent;
        if (typeof m.deckHeightAt === "function")
          out.deckHeightAt = m.deckHeightAt as (x: number, z: number) => number | null;
        if (m.STATION_FOOTPRINT && typeof m.STATION_FOOTPRINT === "object")
          out.footprint = m.STATION_FOOTPRINT as Record<string, number>;
      }
    } catch (err) {
      console.warn(`[world] ${path} not usable yet`, err);
    }
    tick();
  }
  return out;
}

/** Stand-in traveler until avatar.ts implements the contract. */
function fallbackAvatar(env: WorldEnv): Avatar {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.7, 4, 10), env.toon("#c4383f"));
  body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), env.toon("#c98b5a"));
  head.position.y = 1.5;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.45, 10), env.toon("#3446a6"));
  hat.position.y = 1.78;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.2), env.toon("#a8743f"));
  nose.position.set(0, 1.48, 0.28);
  group.add(body, head, hat, nose);
  let ph = 0;
  return {
    group,
    update(dt, s) {
      ph += dt * (s.running ? 14 : 9) * Math.min(1, s.speed / 3);
      body.position.y = 0.75 + (s.grounded ? Math.abs(Math.sin(ph)) * 0.08 * Math.min(1, s.speed) : 0);
      head.position.y = body.position.y + 0.75;
      hat.position.y = head.position.y + 0.28;
      nose.position.y = head.position.y - 0.02;
    },
    dispose() {
      for (const m of [body, head, hat, nose]) m.geometry.dispose();
    },
  };
}

/** Stand-in content: tour stops in front of each station, and a deck over the gorge gap. */
function fallbackContent(env: WorldEnv, gap: { t0: number; t1: number }): Content {
  for (let t = gap.t0 - 0.004; t <= gap.t1 + 0.004; t += 0.5 / env.trail.length) {
    const p = env.trail.pointAt(t);
    env.addWalkable({ kind: "circle", x: p.x, z: p.z, r: 1.6 });
  }
  return {
    update() {},
    interact() {},
    escape: () => false,
    tourStops() {
      return STATIONS.filter((s) => s.kind !== "build" || s.id === "build-3").map((s) => {
        const p = env.stationPose(s.id);
        const k = Math.min(s.offset, 3.5);
        return {
          id: s.id,
          position: new THREE.Vector3(
            p.position.x + Math.sin(p.yaw) * k,
            p.position.y,
            p.position.z + Math.cos(p.yaw) * k,
          ),
        };
      });
    },
    dispose() {},
  };
}

/** Mounts the whole experience (title → world) into host. Returns a dispose function. */
export function mountWorld(host: HTMLElement, opts: WorldOptions): () => void {
  const { lang } = opts;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  host.classList.add("kw-root");
  let disposed = false;
  let teardown: (() => void) | null = null;

  const loader = createLoader(host, lang, reducedMotion);
  // Text mode works from the first moment (skip link, loading failures), before the 3D world exists.
  const textMode = createTextMode(host, lang, worldData());
  const offText = on("world:textmode", () => textMode.open());
  const fail = (err: unknown) => {
    if (err === CANCELLED) return;
    console.error(err);
    loader.fail(() => textMode.open());
  };
  loader.progress(5, "modules");
  loadContent((done, total) => loader.progress(5 + (45 * done) / Math.max(1, total)))
    .then((mods) => {
      if (disposed) return;
      // Let the loader paint before the heavy synchronous build.
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (disposed) return;
          start(host, lang, reducedMotion, mods, opts.skipIntro ?? false, {
            progress: (p, step) => loader.progress(p, step),
            done: () => loader.done(),
            alive: () => !disposed,
            textMode,
          })
            .then((td) => {
              if (disposed) td();
              else teardown = td;
            })
            .catch(fail);
        }, 30),
      );
    })
    .catch(fail);

  return () => {
    disposed = true;
    teardown?.();
    loader.remove();
    offText();
    textMode.dispose();
    host.classList.remove("kw-root");
  };
}

async function start(
  host: HTMLElement,
  lang: Lang,
  reducedMotion: boolean,
  mods: Awaited<ReturnType<typeof loadContent>>,
  skipIntro: boolean,
  ui: {
    progress(p: number, step?: LoadStep): void;
    done(): void;
    alive(): boolean;
    textMode: TextMode;
  },
): Promise<() => void> {
  const quality = readQuality();
  // Everything built before the last await registers its disposal here (run in reverse), so a
  // navigation during loading, or a failure, tears down only what exists.
  const early: Array<() => void> = [];
  const bail = () => {
    for (const d of early.splice(0).reverse()) {
      try {
        d();
      } catch (err) {
        console.warn(err);
      }
    }
  };
  const step = async (p: number, s: LoadStep) => {
    ui.progress(p, s);
    await paint();
    if (!ui.alive()) {
      bail();
      throw CANCELLED;
    }
  };
  try {
    const engine = createEngine(host, { quality });
    early.push(() => engine.dispose());
    const { scene, camera } = engine;
    const cleanups: Array<() => void> = [];
    const safe = <T>(fn: () => T, fallback: T): T => {
      try {
        return fn();
      } catch (err) {
        console.warn(err);
        return fallback;
      }
    };

    // ---------------------------------------------------------------- world
    // Terrain grid: phones get a coarser one on top of "low" (quality.ts deviceProfile; heightAt follows it).
    const cells = quality === "high" ? 280 : detectDevice().phone ? 160 : 190;
    const layout: Layout = buildLayout({ cells, footprint: mods.footprint });
    const toon = createToonCache();
    early.push(() => {
      toon.dispose();
      disposeTextures();
    });
    early.push(() => disposeTree(scene));
    const sky = createSky(scene, { reducedMotion, quality });
    early.push(() => sky.dispose());
    const scenery = createScenery(layout, toon, quality);
    scene.add(scenery.group);
    early.push(() => scenery.dispose());
    const trailMeshes = createTrailMeshes(layout, toon, quality);
    scene.add(trailMeshes.group);
    early.push(() => trailMeshes.dispose());
    const env = createEnv({
      lang,
      reducedMotion,
      quality,
      scene,
      camera,
      layout,
      sky,
      toon,
      groundAt: (x, z) => mods.deckHeightAt?.(x, z) ?? layout.groundAt(x, z),
    });

    await step(70, "terrain");

    const hudRoot = document.createElement("div");
    hudRoot.className = "kw-hud";
    host.append(hudRoot);
    early.push(() => hudRoot.remove());

    let avatar: Avatar;
    try {
      const a = mods.createAvatar?.(env) as Avatar | undefined;
      if (a && a.group instanceof THREE.Object3D && typeof a.update === "function") avatar = a;
      else {
        (a as { dispose?: () => void } | undefined)?.dispose?.();
        avatar = fallbackAvatar(env);
      }
    } catch (err) {
      console.warn("[world] avatar fallback", err);
      avatar = fallbackAvatar(env);
    }
    scene.add(avatar.group);
    early.push(() => avatar.dispose());

    let content: Content;
    try {
      content = mods.createContent ? mods.createContent(env, hudRoot) : fallbackContent(env, layout.gorge);
    } catch (err) {
      console.warn("[world] content fallback", err);
      content = fallbackContent(env, layout.gorge);
    }
    early.push(() => content.dispose());
    await step(82, "content");

    // ---------------------------------------------------------------- ambients (fauna, NPC chasquis)
    // Bodies register at create time: start from an empty registry, and empty it after they are disposed.
    creatures.clear();
    early.push(() => creatures.clear());
    const spawn0 = layout.trail.pointAt(0.006);
    const me = creatures.add("traveler", BODY_R, { x: spawn0.x, z: spawn0.z, give: 1 });
    const ambients: Ambient[] = [];
    for (const [name, make] of [
      ["npcs", mods.createNpcs] as const,
      ["fauna", mods.createFauna] as const,
      ...mods.extra,
    ]) {
      if (!make) continue;
      try {
        const a = make(env, hudRoot);
        if (a && typeof a.update === "function") ambients.push(a);
      } catch (err) {
        console.warn(`[world] ${name} skipped`, err);
      }
    }
    early.push(() => {
      for (const a of ambients) a.dispose();
    });
    // Small far-away details skip every pass (draw calls dominate the frame cost on the full mountain).
    const cull = createDetailCull(scene, { skip: (o) => o.name === "traveler" || o.name === "ride-llama" });
    cull.scan();
    let cullClock = 0;
    early.push(() => cull.dispose());
    await step(92, "ambients");
    /** E: ambients first (an NPC in range talks), then content. */
    const interact = () => {
      // An ambient that exposes prompt() only gets E while its prompt is showing (so a llama or an
      // egg in range never steals E from a tambo); ambients without prompt() keep the old behaviour.
      for (const a of ambients) {
        if (a.prompt && !safe(() => a.prompt?.() ?? null, null)) continue;
        if (safe(() => a.interact?.() ?? false, false)) return;
      }
      content.interact();
    };

    // ---------------------------------------------------------------- input + controls
    const input = createInput(engine.canvas, { onPad: (a) => onPad(a) });
    input.enabled = false;
    const cam = createFollowCam(camera, layout.heightAt);
    // The camera never ends up behind the waterfall cliff or inside the cave's rock.
    for (const name of ["waterfall-cliff", "cave-walls", "cave-liner", "cave-roof"]) {
      const o = scene.getObjectByName(name);
      if (o) cam.occluders.push(o);
    }
    // Around the waterfall grotto the slope and boulders crowd the camera: test them there only.
    const caveAt = scene.getObjectByName("cave-floor");
    if (caveAt) {
      const c = new THREE.Box3().setFromObject(caveAt).getCenter(new THREE.Vector3());
      const heavy = ["terrain", "rocks"].map((n) => scene.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o);
      cam.areaOccluders.push({ objects: heavy, x: c.x, z: c.z, r: 16 });
    }
    let runHold = false;
    const music = createWorldMusic(env);
    cleanups.push(() => music.dispose());
    const chrome = createChrome(host, lang, {
      musicControl: music.createControl(lang === "es" ? "Música (N)" : "Music (N)"),
      onTour: () => setTour(!touring),
      onPhoto: () => void photo.shoot(),
      onEditName: () => nameEditor.open(),
      onDayNight: () => sky.toggle(),
      onText: () => ui.textMode.open(),
      onQuality: () => {
        const q: Quality = engine.quality() === "high" ? "low" : "high";
        engine.setQuality(q);
        chrome.setQuality(q);
        applyDensity(q);
        // A manual choice wins over the auto governor (restore its steps, then stop it).
        governor.setEnabled(false);
        governor.setLevel(0);
        applyLevel(0);
        emit("world:quality", { quality: q, auto: false });
        try {
          localStorage.setItem(Q_KEY, q);
        } catch {
          /* storage unavailable */
        }
      },
      onInteract: () => interact(),
      onJump: () => input.pressJump(),
      onRun: (on) => {
        runHold = on;
        input.setRunHold(on);
      },
      onJoystick: (x, y) => input.setJoystick(x, y),
    });
    chrome.setQuality(quality);
    let traveler = loadTraveler();
    chrome.setTraveler(traveler);
    // Dialogs (photo preview, name editor) pause movement while open; so does any `world:modal` (counter).
    let dialogOpen = false;
    // Text mode may already be open from the loading screen (its open event fired before this listener).
    let modals = ui.textMode.isOpen() ? 1 : 0;
    const syncInput = () => {
      input.enabled = phase === "play" && !gameOpen && !dialogOpen && modals === 0;
    };
    cleanups.push(
      on("world:modal", (d) => {
        modals = Math.max(0, modals + (d?.open ? 1 : -1));
        if (modals > 0) setTour(false);
        // Panels own the screen: hide touch controls, the prompt pill and (on phones) the top bar.
        host.classList.toggle("kw-modal", modals > 0);
        syncInput();
      }),
    );

    // ---------------------------------------------------------------- auto quality governor
    const manualQuality = (() => {
      try {
        return localStorage.getItem(Q_KEY) !== null;
      } catch {
        return false;
      }
    })();
    const applyLevel = (level: number) => {
      const L = LEVELS[level] ?? LEVELS[0];
      if (!L) return;
      engine.setPixelRatioCap(L.dprCap);
      engine.outline.enabled = L.outline;
    };
    const governor = createGovernor((level) => {
      applyLevel(level);
      emit("world:quality", { quality: level > 0 ? "low" : engine.quality(), auto: true });
    });
    if (manualQuality) governor.setEnabled(false);
    let lastFrameAt = 0;
    const onVisibility = () => {
      governor.reset();
      lastFrameAt = 0;
    };
    document.addEventListener("visibilitychange", onVisibility);
    cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));
    const onDialog = (open: boolean) => {
      dialogOpen = open;
      music.setDialogOpen(open);
      if (open) setTour(false);
      syncInput();
      if (!open) engine.canvas.focus?.({ preventScroll: true });
    };
    const photo = createPhotoMode(host, lang, {
      reducedMotion,
      capture: () => engine.capture(),
      place: () =>
        placeAt(lang, pos, layout.trail.nearestT(pos.x, pos.z), (id) => {
          const p = layout.stationPose(id).position;
          return { x: p.x, z: p.z };
        }),
      traveler: () => traveler,
      onOpenChange: onDialog,
    });
    const nameEditor = createNameEditor(host, lang, {
      onSaved: (name) => {
        traveler = name;
        chrome.setTraveler(name);
      },
      onOpenChange: onDialog,
    });
    // Climb clock + the shareable journey postcard (passport "Mi postal", summit panel → world:postcard).
    const climb = createClimbTracker();
    const journey = createJourneyDialog(host, lang, {
      capture: () => engine.capture(),
      summary: () => summarize(undefined, climb.state()),
      traveler: () => traveler,
      onOpenChange: onDialog,
    });
    cleanups.push(
      on("world:postcard", () => {
        if (phase === "play" && !gameOpen) void journey.open();
      }),
      on("world:teleport", () => climb.void()),
    );
    cleanups.push(() => {
      photo.dispose();
      nameEditor.dispose();
      journey.dispose();
    });
    const syncNight = () => {
      const n = sky.sky.isNight();
      chrome.setNight(n);
      host.classList.toggle("kw-night", n);
    };
    syncNight();
    cleanups.push(sky.sky.onChange(syncNight));
    cleanups.push(() => host.classList.remove("kw-night"));
    // Ground cover thins itself on a manual quality switch (flora listens to world:quality).
    const applyDensity = (_q: Quality) => {};

    // ---------------------------------------------------------------- player
    const spawnT = 0.006;
    const sp = layout.trail.pointAt(spawnT);
    const st = layout.trail.tangentAt(spawnT);
    const pos = new THREE.Vector3(sp.x, layout.groundAt(sp.x, sp.z), sp.z);
    const vel = new THREE.Vector2();
    let vy = 0;
    let grounded = true;
    let yaw = Math.atan2(st.x, st.z);
    cam.behind(yaw);
    cam.pitch = 0.32;
    cam.dist = 9.5;

    /** Animals and people are solid: slide around them like colliders (see the header). */
    const push = { x: 0, z: 0 };
    const pushOutOfBodies = () => {
      me.r = riding ? RIDE_R : BODY_R;
      me.x = pos.x;
      me.z = pos.z;
      creatures.separate(me, push);
      const m = Math.hypot(push.x, push.z);
      if (m < 1e-4) return;
      const k = Math.min(1, PUSH_MAX / m);
      let [px, pz] = resolve(pos.x + push.x * k, pos.z + push.z * k);
      if (!canStand(px, pz)) {
        if (canStand(px, pos.z)) pz = pos.z;
        else if (canStand(pos.x, pz)) px = pos.x;
        else {
          px = pos.x;
          pz = pos.z;
        }
      }
      pos.x = px;
      pos.z = pz;
      me.x = px;
      me.z = pz;
      // Drop the part of the velocity that walks into the body (no stick-slip shaking against it).
      const nx = push.x / m;
      const nz = push.z / m;
      const into = vel.x * nx + vel.y * nz;
      if (into < 0) {
        vel.x -= into * nx;
        vel.y -= into * nz;
      }
    };
    const resolve = (x: number, z: number): [number, number] => {
      for (const c of layout.colliders) {
        if (c.kind === "circle") {
          const dx = x - c.x;
          const dz = z - c.z;
          const d = Math.hypot(dx, dz);
          const min = c.r + BODY_R;
          if (d < min && d > 1e-5) {
            x = c.x + (dx / d) * min;
            z = c.z + (dz / d) * min;
          }
        } else {
          const x0 = c.x0 - BODY_R;
          const x1 = c.x1 + BODY_R;
          const z0 = c.z0 - BODY_R;
          const z1 = c.z1 + BODY_R;
          if (x > x0 && x < x1 && z > z0 && z < z1) {
            const pen = [x - x0, x1 - x, z - z0, z1 - z];
            const m = Math.min(...pen);
            if (m === pen[0]) x = x0;
            else if (m === pen[1]) x = x1;
            else if (m === pen[2]) z = z0;
            else z = z1;
          }
        }
      }
      return [x, z];
    };
    /** Avatar ground: the content bridge deck when standing on it, else terrain (core deck fallback over the gap). */
    const groundAt = (x: number, z: number) => mods.deckHeightAt?.(x, z) ?? layout.groundAt(x, z);
    const canStand = (x: number, z: number) =>
      layout.walkable(x, z) && groundAt(x, z) - pos.y < MAX_STEP + Math.max(0, vy * 0.1);

    // ---------------------------------------------------------------- guided tour (walks the spline, then steps off to each station)
    let touring = false;
    type Stop = { id: string; position: THREE.Vector3; t: number };
    let stops: Stop[] = [];
    let tourIdx = 0;
    let tourPhase: "trail" | "approach" | "wait" | "leave" = "trail";
    let tourWait = 0;
    let tourBest = Infinity;
    let tourStall = 0;
    const tourTarget = new THREE.Vector3();
    function setTour(on: boolean) {
      touring = on;
      chrome.setTour(on);
      if (!on) return;
      stops = content
        .tourStops()
        .map((s) => ({ ...s, t: layout.trail.nearestT(s.position.x, s.position.z) }))
        .sort((a, b) => a.t - b.t);
      const here = layout.trail.nearestT(pos.x, pos.z);
      tourIdx = Math.max(
        0,
        stops.findIndex((s) => s.t > here + 0.004),
      );
      if (tourIdx < 0 || tourIdx >= stops.length) tourIdx = 0;
      tourPhase = "trail";
      tourWait = 0;
    }
    /** Returns the world-space point the tour wants to walk toward, or null when standing. */
    const tourStep = (dt: number): THREE.Vector3 | null => {
      const stop = stops[tourIdx];
      if (!stop) {
        setTour(false);
        return null;
      }
      const here = layout.trail.nearestT(pos.x, pos.z);
      if (tourPhase === "trail") {
        const ahead = 3.2 / layout.trail.length;
        const dir = Math.sign(stop.t - here);
        const carrot = Math.abs(stop.t - here) < ahead ? stop.t : here + dir * ahead;
        tourTarget.copy(layout.trail.pointAt(carrot));
        if (Math.abs(stop.t - here) * layout.trail.length < 1.2) {
          tourPhase = "approach";
          tourBest = Infinity;
          tourStall = 0;
        }
        return tourTarget;
      }
      if (tourPhase === "approach") {
        tourTarget.copy(stop.position);
        const dist = Math.hypot(stop.position.x - pos.x, stop.position.z - pos.z);
        // Give up on a stop we can't reach (collider or off the plaza) instead of stalling forever.
        if (dist < tourBest - 0.05) {
          tourBest = dist;
          tourStall = 0;
        } else tourStall += dt;
        if (dist < 0.7 || tourStall > 3.5) {
          tourPhase = "wait";
          tourWait = 0;
        }
        return tourTarget;
      }
      if (tourPhase === "wait") {
        tourWait += dt;
        if (tourWait > 5.5) tourPhase = "leave";
        return null;
      }
      tourTarget.copy(layout.trail.pointAt(stop.t));
      if (Math.hypot(tourTarget.x - pos.x, tourTarget.z - pos.z) < 0.9) {
        tourIdx++;
        tourPhase = "trail";
        if (tourIdx >= stops.length) setTour(false);
      }
      return tourTarget;
    };

    // ---------------------------------------------------------------- keys + content events
    let gameOpen = false;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (phase === "title") {
        if (e.key === "Enter" && !e.repeat && tag !== "A" && tag !== "BUTTON") {
          e.preventDefault();
          begin();
        }
        return;
      }
      if (phase !== "play" || gameOpen || dialogOpen) return;
      // Esc keeps routing while another agent's panel is open (it closes through its escape()).
      if (e.key === "Escape") {
        if (ambients.some((a) => safe(() => a.escape?.() ?? false, false)) || content.escape()) e.preventDefault();
        else if (touring) setTour(false);
        return;
      }
      // H still closes the help card (itself a world:modal) while it is open.
      if (modals > 0 && !(e.code === "KeyH" && helpOpen())) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.code === "KeyM") emit("world:map", undefined);
      else if (e.code === "KeyH" || e.key === "?") emit("world:help", undefined);
      else if (e.code === "KeyT") sky.toggle();
      else if (e.code === "KeyK") ui.textMode.open();
      else if (e.code === "KeyN") music.toggleMute();
      else if (e.code === "KeyF") void photo.shoot();
      else return;
      e.preventDefault();
    };
    /** Gamepad buttons that act like keys (they work while a modal is open; movement does not). */
    const helpOpen = () => !!hudRoot.querySelector(".qn-help:not([hidden])");
    const activeDialog = (): HTMLElement | null => {
      const a = document.activeElement as HTMLElement | null;
      const d = a?.closest<HTMLElement>('[role="dialog"]');
      if (d) return d;
      const all = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((n) => n.offsetParent !== null);
      return all[all.length - 1] ?? null;
    };
    const onPad = (a: PadAction) => {
      if (phase === "title") {
        if (a === "confirm" || a === "help") begin();
        return;
      }
      if (phase !== "play") return;
      const busy = modals > 0 || dialogOpen;
      if (a === "back") {
        // Same path as the keyboard: overlays and dialogs catch Esc in the capture phase, then ambients/content.
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      } else if (a === "map") {
        if (!busy || bigMap?.isOpen()) emit("world:map", undefined);
      } else if (a === "help") {
        if (!busy || helpOpen()) emit("world:help", undefined);
      } else if (a === "text") {
        if (ui.textMode.isOpen()) ui.textMode.close();
        else if (!busy) ui.textMode.open();
      } else if (a === "photo") {
        if (!busy) void photo.shoot();
      } else if (a === "confirm") {
        const el = document.activeElement as HTMLElement | null;
        if (el && el !== document.body && activeDialog()?.contains(el)) el.click();
      } else if (a === "nav-prev" || a === "nav-next") {
        const d = activeDialog();
        if (d) focusStep(d, a === "nav-prev" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    cleanups.push(() => window.removeEventListener("keydown", onKey));
    const onGame = (e: Event) => {
      gameOpen = !!(e as CustomEvent<{ open?: boolean }>).detail?.open;
      syncInput();
      if (gameOpen) setTour(false);
      engine.hold(gameOpen);
      if (!gameOpen) engine.canvas.focus?.();
    };
    window.addEventListener("world:game", onGame);
    // Interiors (chasqui house, arcade): content tells us; the camera closes in and lowers a little.
    let inside = false;
    const onInterior = (e: Event) => {
      inside = !!(e as CustomEvent<{ inside?: boolean }>).detail?.inside;
      if (reducedMotion) cam.squeeze = inside ? 1 : 0;
    };
    window.addEventListener("world:interior", onInterior);
    cleanups.push(() => window.removeEventListener("world:interior", onInterior));
    cleanups.push(() => window.removeEventListener("world:game", onGame));
    document.fonts?.ready.then(() => redrawAll()).catch(() => {});

    // ---------------------------------------------------------------- mount (llama ride)
    let riding = false;
    let speedMul = 1;
    let seatHeight = 0;
    cleanups.push(
      on("world:mount", (d) => {
        riding = !!d?.riding;
        speedMul = riding && Number.isFinite(d.speedMul) && d.speedMul > 0 ? d.speedMul : 1;
        seatHeight = riding && Number.isFinite(d.seatHeight) ? Math.max(0, d.seatHeight) : 0;
      }),
    );

    // ---------------------------------------------------------------- big map + fast travel
    /** Plazas in front of each station (content's real fronts, incl. the summit); build plots excluded. */
    const travelStops: Array<{ id: string; position: THREE.Vector3 }> = safe(() => content.tourStops(), [])
      .filter((s) => {
        const st = STATIONS.find((x) => x.id === s.id);
        return st ? st.kind !== "build" : s.id === "summit";
      })
      .sort(
        (a, b) => layout.trail.nearestT(a.position.x, a.position.z) - layout.trail.nearestT(b.position.x, b.position.z),
      );
    const stopLabel = (id: string) => STATIONS.find((x) => x.id === id)?.label[lang] ?? SUMMIT_LABEL[lang];
    const stopColor = (id: string) => {
      const st = STATIONS.find((x) => x.id === id);
      const company = st?.companyId ? COMPANIES.find((c) => c.id === st.companyId) : undefined;
      return company ? DYE[company.dye] : (KIND_DYE[st?.kind ?? id] ?? DYE.ochre);
    };
    const mapStops: MapStop[] = travelStops.map((s) => ({
      id: s.id,
      label: stopLabel(s.id),
      color: stopColor(s.id),
      x: s.position.x,
      z: s.position.z,
    }));
    const nearStop = (): string | null => {
      let best: string | null = null;
      let bd = VISIT_R;
      for (const s of travelStops) {
        const d = Math.hypot(s.position.x - pos.x, s.position.z - pos.z);
        if (d < bd) {
          bd = d;
          best = s.id;
        }
      }
      return best;
    };
    const trailPts: Array<{ x: number; z: number }> = [];
    for (let i = 0; i <= 200; i++) {
      const p = layout.trail.pointAt(i / 200);
      trailPts.push({ x: p.x, z: p.z });
    }
    const bigMap = createBigMap(host, lang, {
      heightAt: layout.heightAt,
      isWater: env.extra.isWater,
      trail: trailPts,
      stops: mapStops,
      player: () => ({ x: pos.x, z: pos.z, yaw }),
      near: nearStop,
    });
    cleanups.push(() => bigMap.dispose());
    cleanups.push(
      on("world:map", () => {
        if (phase !== "play" || gameOpen) return;
        if (bigMap.isOpen()) bigMap.close();
        else if (modals === 0 && !dialogOpen) bigMap.open();
      }),
    );

    const fade = document.createElement("div");
    fade.className = "kw-fade";
    fade.setAttribute("aria-hidden", "true");
    host.append(fade);
    cleanups.push(() => fade.remove());
    let fadeTimer = 0;
    cleanups.push(() => clearTimeout(fadeTimer));
    const snapWalkable = (x: number, z: number): [number, number] => {
      if (layout.walkable(x, z)) return [x, z];
      for (let r = 0.6; r <= 5; r += 0.6)
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const nx = x + Math.cos(a) * r;
          const nz = z + Math.sin(a) * r;
          if (layout.walkable(nx, nz)) return [nx, nz];
        }
      const p = layout.trail.pointAt(layout.trail.nearestT(x, z));
      return [p.x, p.z];
    };
    /** Where fast travel lands for a stop id: the plaza in front of the station, snapped to walkable ground. */
    const travelTarget = (to: string): { x: number; z: number; face: THREE.Vector3 | null } | null => {
      if (to === "trailhead") {
        const p = layout.trail.pointAt(spawnT);
        return { x: p.x, z: p.z, face: layout.trail.pointAt(spawnT + 0.01) };
      }
      const st = STATIONS.find((x) => x.id === to);
      let p = travelStops.find((s) => s.id === to)?.position;
      if (!p && st) {
        // Fallback: from the station toward the trail, just short of the path.
        const pose = layout.stationPose(to).position;
        const tp = layout.trail.pointAt(st.t);
        const k = Math.min(1, Math.max(0, 1 - 3 / Math.max(3, Math.hypot(tp.x - pose.x, tp.z - pose.z))));
        p = new THREE.Vector3(pose.x + (tp.x - pose.x) * k, 0, pose.z + (tp.z - pose.z) * k);
      }
      if (!p) return null;
      const [x, z] = snapWalkable(p.x, p.z);
      return { x, z, face: st ? layout.stationPose(to).position : null };
    };
    cleanups.push(
      on("world:teleport", (d) => {
        if (phase !== "play" || gameOpen || !d?.to) return;
        const target = travelTarget(d.to);
        if (!target) return;
        setTour(false);
        const move = () => {
          pos.set(target.x, groundAt(target.x, target.z), target.z);
          vel.set(0, 0);
          vy = 0;
          grounded = true;
          if (target.face) yaw = Math.atan2(target.face.x - pos.x, target.face.z - pos.z);
          cam.behind(yaw);
          cam.snap();
          musicT = layout.trail.nearestT(pos.x, pos.z);
          const id = nearStop();
          if (id) bigMap.visit(id);
        };
        clearTimeout(fadeTimer);
        if (reducedMotion) {
          move();
          return;
        }
        fade.classList.add("on");
        fadeTimer = window.setTimeout(() => {
          move();
          fadeTimer = window.setTimeout(() => fade.classList.remove("on"), 60);
        }, FADE_MS);
      }),
    );

    // ---------------------------------------------------------------- phases
    let phase: "title" | "swoop" | "play" = "title";
    let swoopT = 0;
    /** Wall-clock start of the swoop: slow GPUs clamp dt, so the swoop must not run in frame time. */
    let swoopStart = 0;
    const swoopFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    const setMode = (title: boolean) => {
      for (const o of scenery.titleOnly) o.visible = title;
      for (const o of scenery.playOnly) o.visible = !title;
      engine.outline.uniforms.uFade.value.set(title ? 900 : 170, title ? 1800 : 560);
    };
    const title = skipIntro ? null : createTitle(host, lang, reducedMotion, () => begin());
    const begin = () => {
      if (phase !== "title") return;
      if (title) {
        traveler = saveTraveler(title.name());
        chrome.setTraveler(traveler);
      }
      announceTraveler(traveler);
      music.begin(); // still inside the click / Enter gesture: unlocks Web Audio
      title?.hide();
      swoopFrom.pos.copy(camera.position);
      swoopFrom.look.copy(titleLook);
      phase = "swoop";
      swoopT = reducedMotion ? 1 : 0;
      swoopStart = performance.now();
    };
    const toPlay = () => {
      phase = "play";
      setMode(false);
      sky.setVoid(0);
      title?.dispose();
      chrome.show(true);
      hudRoot.classList.add("on");
      syncInput();
      cam.snap();
      engine.canvas.focus?.();
    };
    const titleLook = new THREE.Vector3();
    setMode(true);
    sky.setVoid(1);
    if (skipIntro) {
      // No gesture here: ask the engine to start on the first one.
      music.begin();
      toPlay();
      announceTraveler(traveler);
    }

    let musicClock = 0;
    let musicT = 0;
    const swoopMid = new THREE.Vector3();
    const swoopPos = new THREE.Vector3();
    const swoopLook = new THREE.Vector3();

    const camTarget = new THREE.Vector3();
    const devWalk = { x: 0, z: 0, secs: 0, speed: WALK };
    let visitClock = 0;
    let framesSeen = 0;
    const off = engine.onFrame((dt, time) => {
      const now = performance.now();
      if (lastFrameAt) governor.sample(now - lastFrameAt);
      lastFrameAt = now;
      if (framesSeen < 2 && ++framesSeen === 2) ui.done();
      input.poll(dt);
      // Day/night + scenery always run (the title island turns through the same sky).
      const focus = phase === "play" ? pos : scenery.group.position;
      sky.update(dt, camera, focus, phase === "play");
      engine.outline.uniforms.uInk.value.copy(sky.ink);
      scenery.cloudMaterial.color.copy(sky.cloudTint);
      scenery.update(dt, time);

      if (phase === "title") {
        const p = title?.pose(dt, camera.aspect);
        if (p) {
          camera.position.copy(p.pos);
          titleLook.copy(p.look);
          camera.lookAt(titleLook);
        }
      } else if (phase === "swoop") {
        swoopT = reducedMotion ? 1 : Math.min(1, (performance.now() - swoopStart) / 1000 / SWOOP);
        const k = ease(swoopT);
        const d = cam.desired(pos);
        // A high arc over the island, then down behind the traveler.
        swoopMid.set(
          (swoopFrom.pos.x + d.pos.x) * 0.5,
          Math.max(swoopFrom.pos.y, d.pos.y) + 40,
          (swoopFrom.pos.z + d.pos.z) * 0.5,
        );
        const u = 1 - k;
        swoopPos
          .copy(swoopFrom.pos)
          .multiplyScalar(u * u)
          .addScaledVector(swoopMid, 2 * u * k)
          .addScaledVector(d.pos, k * k);
        swoopLook.lerpVectors(swoopFrom.look, d.look, THREE.MathUtils.smoothstep(swoopT, 0.05, 0.75));
        camera.position.copy(swoopPos);
        camera.lookAt(swoopLook);
        sky.setVoid(1 - THREE.MathUtils.smoothstep(swoopT, 0.15, 0.7));
        if (swoopT > 0.55) setMode(false);
        if (swoopT >= 1) toPlay();
      }

      // ----- player (also idles in the title so the avatar breathes at the trailhead)
      let mx = 0;
      let my = 0;
      let speed = (input.running() || runHold ? RUN : WALK) * speedMul;
      let faceTo: THREE.Vector3 | null = null;
      const orbit = phase === "play" ? input.takeOrbit() : { dx: 0, dy: 0, zoom: 0 };
      if (phase === "play" && input.takeManual() && touring) setTour(false);
      const fx = -Math.sin(cam.yaw);
      const fz = -Math.cos(cam.yaw);
      if (phase === "play" && touring) {
        const target = tourStep(dt);
        const stop = stops[tourIdx];
        if (target) {
          const dx = target.x - pos.x;
          const dz = target.z - pos.z;
          const d = Math.hypot(dx, dz) || 1;
          const k = Math.min(1, d / 0.8);
          // World direction → camera-space intent.
          mx = ((dx / d) * -fz + (dz / d) * fx) * k;
          my = ((dx / d) * fx + (dz / d) * fz) * k;
          speed = TOUR_SPEED * speedMul;
        } else if (stop) {
          // Face the station (or the stop itself if the id isn't a contract station).
          faceTo = STATIONS.some((s) => s.id === stop.id) ? layout.stationPose(stop.id).position : stop.position;
        }
      } else if (phase === "play" && devWalk.secs > 0) {
        // Dev hook: walk in a world direction (collision tests).
        devWalk.secs -= dt;
        mx = devWalk.x * -fz + devWalk.z * fx;
        my = devWalk.x * fx + devWalk.z * fz;
        speed = devWalk.speed * speedMul;
      } else if (phase === "play") {
        const m = input.move();
        mx = m.x;
        my = m.y;
      }
      const tx = (-fz * mx + fx * my) * speed;
      const tz = (fx * mx + fz * my) * speed;
      const moving = Math.hypot(mx, my) > 0.05;
      const accel = moving ? 9 : 12;
      vel.x += (tx - vel.x) * Math.min(1, accel * dt);
      vel.y += (tz - vel.y) * Math.min(1, accel * dt);
      if (!moving && vel.lengthSq() < 0.0004) vel.set(0, 0);

      let nx = pos.x + vel.x * dt;
      let nz = pos.z + vel.y * dt;
      [nx, nz] = resolve(nx, nz);
      if (canStand(nx, nz)) {
        pos.x = nx;
        pos.z = nz;
      } else if (canStand(nx, pos.z)) {
        pos.x = nx;
        vel.y *= 0.4;
      } else if (canStand(pos.x, nz)) {
        pos.z = nz;
        vel.x *= 0.4;
      } else vel.multiplyScalar(0.2);
      pushOutOfBodies();

      const ground = groundAt(pos.x, pos.z);
      // No jumping while seated on a llama (the jump press is consumed and ignored).
      if (phase === "play" && input.takeJump() && grounded && !riding) {
        vy = JUMP_V;
        grounded = false;
      }
      if (grounded) {
        // Follow the slope down instead of floating off it.
        if (pos.y - ground < 0.6) pos.y = ground;
        else grounded = false;
      }
      if (!grounded) {
        vy -= GRAVITY * dt;
        pos.y += vy * dt;
        if (pos.y <= ground) {
          pos.y = ground;
          vy = 0;
          grounded = true;
        }
      }
      if (pos.y < ground) pos.y = ground;

      const spd = vel.length();
      if (spd > 0.3) yaw = angleLerp(yaw, Math.atan2(vel.x, vel.y), Math.min(1, dt * 11));
      else if (faceTo) yaw = angleLerp(yaw, Math.atan2(faceTo.x - pos.x, faceTo.z - pos.z), Math.min(1, dt * 4));
      avatar.group.position.copy(pos);
      avatar.group.position.y += seatHeight;
      avatar.group.rotation.y = yaw;
      avatar.update(dt, { speed: spd, running: spd > (WALK + 0.4) * speedMul, grounded, t: time });

      if (!reducedMotion) cam.squeeze += ((inside ? 1 : 0) - cam.squeeze) * (1 - Math.exp(-dt * 3));
      if (phase === "play")
        cam.update(dt, time, camTarget.set(pos.x, pos.y + seatHeight, pos.z), {
          facing: yaw,
          moving: spd > 0.4,
          orbit,
          follow: touring ? 1.6 : 1.15,
        });
      if (phase === "play" && input.takeInteract()) interact();
      content.update(dt, pos, time);
      if (phase === "play") {
        musicClock += dt;
        if (musicClock > 0.2) {
          musicClock = 0;
          musicT = layout.trail.nearestT(pos.x, pos.z);
        }
        music.update(dt, { x: pos.x, z: pos.z, t: musicT, touring });
        // The guided tour walks for you: it doesn't count as a climb.
        if (touring) climb.void();
        else climb.update(dt, musicT);
        // Walking up to a station unlocks it as a fast-travel target (even without the passport).
        visitClock += dt;
        if (visitClock > 0.3) {
          visitClock = 0;
          const id = nearStop();
          if (id) bigMap.visit(id);
        }
      }
      let prompt: string | null = null;
      for (const a of ambients) {
        safe(() => a.update(dt, pos, time), undefined);
        prompt ??= phase === "play" ? safe(() => a.prompt?.() ?? null, null) : null;
      }
      chrome.setPrompt(modals > 0 ? null : prompt);
      cull.update(engine.camera.position);
      // Pick up meshes built after load (seasonal dressing, lazily built maquettes) for far culling.
      cullClock += dt;
      if (cullClock > 5) {
        cullClock = 0;
        cull.scan();
      }
    });
    cleanups.push(off);

    // Dev / screenshot hook.
    if (import.meta.env?.DEV) {
      (host as HTMLElement & { __kw?: unknown }).__kw = {
        begin,
        engine,
        layout,
        scene,
        teleport(t: number, side = 0, faceBack = false) {
          const p = layout.trail.pointAt(t);
          const tg = layout.trail.tangentAt(t);
          pos.set(p.x - tg.z * side, 0, p.z + tg.x * side);
          pos.y = groundAt(pos.x, pos.z);
          vel.set(0, 0);
          yaw = Math.atan2(tg.x, tg.z) + (faceBack ? Math.PI : 0);
          cam.behind(yaw);
          cam.snap();
        },
        orbit(yawOff: number, pitch: number, dist: number) {
          cam.yaw = yaw + Math.PI + yawOff;
          cam.pitch = pitch;
          cam.dist = dist;
          cam.snap();
        },
        /** Stand at (x, z) facing a world point (screenshots). */
        face(x: number, z: number, tx: number, tz: number) {
          pos.set(x, groundAt(x, z), z);
          vel.set(0, 0);
          yaw = Math.atan2(tx - x, tz - z);
          cam.behind(yaw);
          cam.snap();
        },
        setTime: (t: number) => sky.sky.setTime(t),
        /** "2026-06-24" or null for the real date (snow / Inti Raymi switch without reload). */
        setDate: (d: string | null) => setWorldDate(d ? new Date(`${d}T12:00:00`) : null),
        creatures,
        /** Walk toward world direction (dx, dz) for `secs` seconds at `speed` u/s (default walking pace). */
        walk(dx: number, dz: number, secs: number, speed = WALK) {
          const d = Math.hypot(dx, dz) || 1;
          Object.assign(devWalk, { x: dx / d, z: dz / d, secs, speed });
        },
        tour: () => setTour(true),
        state: () => ({
          phase,
          pos: pos.toArray(),
          t: layout.trail.nearestT(pos.x, pos.z),
          time: sky.sky.time(),
          touring,
        }),
      };
    }

    return () => {
      for (const c of cleanups.splice(0)) c();
      input.dispose();
      chrome.dispose();
      title?.dispose();
      bail();
    };
  } catch (err) {
    bail();
    throw err;
  }
}
