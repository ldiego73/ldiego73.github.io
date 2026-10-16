/**
 * Generic suyu runtime: mounts a road world described by a `SuyuDef` (./contract.ts) on its own page, so the
 * Cusco hub and the coming suyu worlds (coast, lake, canyon) share one runtime instead of cloning the jungle's.
 * It is the Antisuyu runtime (../selva/index.ts) with every jungle specific moved into the definition: no
 * title, it builds the world behind the khipu loader and starts in play at the spawn the arrival asks for
 * (`?from=<world>`, ./arrival.ts) or the world's default.
 *
 * Shared with the mountain and the jungle (imported, unchanged): engine (toon + ink outline + FXAA), sky
 * (same 6-minute day), follow camera, input (keyboard, mouse orbit, touch joystick, gamepad), chrome, khipu
 * loader, photo mode, name editor and traveler name, creatures registry, decks, seats, detail cull, quality
 * governor, the avatar (outfit from the def), the journey postcard and the passport + rewards ambients.
 * Same walking physics as both other runtimes (constants below), the body push-out, E/Esc routing and the
 * `world:modal` counter. Never imported here: the mountain's layout, terrain, trail, flora, fauna, npcs,
 * content or landmarks, nor anything from ../selva/.
 *
 * World pieces (from the def):
 *   layout     def.buildLayout (pure; gravity onto layout.groundAt and registered decks)
 *   scenery    def.createScenery(layout, toon, quality), else ./fallback-ground.ts (also if it throws)
 *   ambients   every module of def.ambients exporting `create: CreateAmbient` (the world's literal glob of
 *              ./ambient/*.ts); each receives the SuyuEnv (./env.ts). Passport and rewards go first.
 *   sky        ../sky.ts as-is plus def.atmosphere: weather hook, daytime fog tint, fog near/far scale, ink fade.
 *   hooks      def.hooks (camera occluder proxies, per-frame extras).
 *
 * Input priority: E → ambients (in load order; one with prompt() only while its prompt shows), Esc → ambients.
 * Keys: K text mode, T day/night, N music, F photo, V (also gamepad LT and the chrome's Travel button) the
 * «Viajar» panel to any other world (../travel-panel.ts), M / H emit `world:map` / `world:help` (also the ./hud.ts
 * corner buttons). `world:map` (also gamepad Y) toggles the paper map (./map.ts; fast travel after
 * def.map.unlockStamp). Events handled: `world:modal {open}` (counter; freezes walking while > 0),
 * `world:mount` (speed multiplier, seat height), `world:teleport {to}` (a station id: fade + move in front of
 * it), `world:game`, `world:interior`, `world:textmode`, `world:sit` (../seat.ts), `world:postcard`.
 * Emitted: `world:stamp` `<world>:station:<id>` (kind from the station, default "station"; none for
 * `stamp: false`) once the traveler comes within def.visit.radius of a station plaza; `world:quality`.
 * Vehicles: ./ride.ts. `document.documentElement.dataset.world = def.world` while mounted (setPassportWorld).
 */
import * as THREE from "three";
import { CATALOG } from "../../lib/passport";
import { create as createPassport, setPassportWorld } from "../ambient/passport";
import { create as createRewards } from "../ambient/rewards";
import { createAvatar } from "../avatar";
import { createFollowCam } from "../camera";
import { createChrome } from "../chrome";
import type { Ambient, Avatar, CreateAmbient, Lang } from "../contract";
import { creatures } from "../creatures";
import { worldData } from "../data";
import { decks, standOn, topOf } from "../decks";
import { createDetailCull } from "../detail-cull";
import { createNameEditor, createPhotoMode, type Place } from "../dialogs";
import { createEngine, disposeTree, type Quality } from "../engine";
import { emit, on } from "../events";
import { createInput, type PadAction } from "../input";
import { summarize } from "../journey";
import { createJourneyDialog } from "../journey-card";
import { guardLeaving } from "../leave";
import { createLoader, type LoadStep } from "../loader";
import { createGovernor, detectDevice, LEVELS } from "../quality";
import { createStandLatch, type Seat, SIT_SQUEEZE, seatedFeetY, seatFrom } from "../seat";
import { createSky, hasWeather } from "../sky";
import { disposeTextures, redrawAll } from "../tex";
import { focusStep, type TextMode } from "../textmode";
import "../textmode.css";
import { createToonCache } from "../toon";
import { createTravelPanel } from "../travel-panel";
import type { TripWorld } from "../travel-panel-logic";
import { announceTraveler, loadTraveler } from "../traveler";
import { resolveSpawn } from "./arrival";
import type { SuyuDef, SuyuHooks, SuyuLayout, SuyuScenery } from "./contract";
import { createSuyuEnv } from "./env";
import { createFallbackGround } from "./fallback-ground";
import { createSuyuHud } from "./hud";
import { createSuyuMap } from "./map";
import { createSuyuMusic } from "./music";
import { resetRide, ride } from "./ride";

export interface SuyuOptions {
  lang: Lang;
  /** Kept for parity with mountWorld (dev harness `skip=1`): suyu worlds have no title. */
  skipIntro?: boolean;
  /** Override of `location.search` for the arrival (tests, harness). */
  search?: string;
}

const Q_KEY = "ldiego73-world-quality";
// Same physics as the mountain (src/world/index.ts) and the jungle (src/world/selva/index.ts).
const WALK = 3.6;
const RUN = 7.4;
const GRAVITY = 22;
const JUMP_V = 7.2;
const BODY_R = 0.42;
const RIDE_R = 0.62;
const PUSH_MAX = 0.5;
const MAX_STEP = 0.9;
const FADE_MS = 300;
const CANCELLED = Symbol("cancelled");
const paint = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

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

async function loadAmbients(
  tag: string,
  modules: Record<string, () => Promise<unknown>>,
  onModule: (done: number, total: number) => void,
): Promise<Array<[string, CreateAmbient]>> {
  const out: Array<[string, CreateAmbient]> = [];
  const all = Object.entries(modules);
  let done = 0;
  for (const [path, load] of all) {
    try {
      const m = (await load()) as Record<string, unknown>;
      if (typeof m.create === "function") out.push([path, m.create as CreateAmbient]);
    } catch (err) {
      console.warn(`[${tag}] ${path} not usable`, err);
    }
    onModule(++done, all.length);
  }
  return out;
}

/** Stand-in traveler if the shared avatar fails to build. */
function fallbackAvatar(toon: (c: THREE.ColorRepresentation) => THREE.Material): Avatar {
  const group = new THREE.Group();
  group.name = "traveler";
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.7, 4, 10), toon("#c4383f"));
  body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), toon("#c98b5a"));
  head.position.y = 1.5;
  group.add(body, head);
  return {
    group,
    update() {},
    dispose() {
      body.geometry.dispose();
      head.geometry.dispose();
    },
  };
}

/** Mounts a suyu world into host. Returns a dispose function. */
export function mountSuyu<Lay extends SuyuLayout>(host: HTMLElement, opts: SuyuOptions, def: SuyuDef<Lay>): () => void {
  const { lang } = opts;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  host.classList.add("kw-root");
  const root = document.documentElement;
  const prevWorld = root.dataset.world;
  setPassportWorld(def.world);
  resetRide();
  let disposed = false;
  let teardown: (() => void) | null = null;

  const loader = createLoader(host, lang, reducedMotion);
  const copy = def.loader[lang];
  const titleEl = host.querySelector<HTMLElement>(".kw-loader-title");
  if (titleEl) titleEl.textContent = copy.title;
  const stepEl = host.querySelector<HTMLElement>("[data-loading-step]");
  const progress = (p: number, step?: LoadStep) => {
    loader.progress(p, step);
    if (step && stepEl) stepEl.textContent = copy[step];
  };
  const textMode = def.textMode(host, lang, worldData());
  const offText = on("world:textmode", () => textMode.open());
  // Every same-tab link out of the world page asks «¿Salir del mundo?» first (leave.ts).
  const offLeave = guardLeaving(lang);
  const fail = (err: unknown) => {
    if (err === CANCELLED) return;
    console.error(err);
    loader.fail(() => textMode.open());
  };
  progress(5, "modules");
  loadAmbients(def.world, def.ambients, (done, total) => progress(5 + (45 * done) / Math.max(1, total)))
    .then((ambients) => {
      if (disposed) return;
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (disposed) return;
          start(host, lang, reducedMotion, def, ambients, opts.search ?? location.search, {
            progress,
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
    offLeave();
    textMode.dispose();
    resetRide();
    host.classList.remove("kw-root");
    if (prevWorld === undefined) delete root.dataset.world;
    else root.dataset.world = prevWorld;
  };
}

async function start<Lay extends SuyuLayout>(
  host: HTMLElement,
  lang: Lang,
  reducedMotion: boolean,
  def: SuyuDef<Lay>,
  worldAmbients: Array<[string, CreateAmbient]>,
  search: string,
  ui: {
    progress(p: number, step?: LoadStep): void;
    done(): void;
    alive(): boolean;
    textMode: TextMode;
  },
): Promise<() => void> {
  const tag = def.world;
  const quality = readQuality();
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
    const tiers = def.cells ?? { high: 280, low: 190, phone: 160 };
    const cells = quality === "high" ? tiers.high : detectDevice().phone ? tiers.phone : tiers.low;
    const layout = def.buildLayout({ cells });
    const toon = createToonCache();
    early.push(() => {
      toon.dispose();
      disposeTextures();
    });
    early.push(() => disposeTree(scene));
    const sky = createSky(scene, { reducedMotion, quality });
    early.push(() => sky.dispose());
    const atmo = def.atmosphere;
    if (hasWeather(sky.sky)) sky.sky.setWeather(atmo.fog, atmo.cover);
    if (atmo.inkFade) engine.outline.uniforms.uFade.value.set(atmo.inkFade[0], atmo.inkFade[1]);
    const tint = atmo.tint ? new THREE.Color(atmo.tint.color) : null;
    let scenery: SuyuScenery;
    try {
      scenery = def.createScenery ? def.createScenery(layout, toon, quality) : createFallbackGround(layout, toon);
    } catch (err) {
      console.warn(`[${tag}] scenery fallback`, err);
      scenery = createFallbackGround(layout, toon);
    }
    scene.add(scenery.group);
    early.push(() => scenery.dispose());
    const env = createSuyuEnv({
      world: def.world,
      stations: def.stations,
      lang,
      reducedMotion,
      quality,
      scene,
      camera,
      layout,
      sky,
      toon,
    });
    await step(70, "terrain");

    const hudRoot = document.createElement("div");
    hudRoot.className = "kw-hud";
    host.append(hudRoot);
    early.push(() => hudRoot.remove());

    let avatar: Avatar;
    try {
      avatar = createAvatar(env, def.outfit);
    } catch (err) {
      console.warn(`[${tag}] avatar fallback`, err);
      avatar = fallbackAvatar(env.toon);
    }
    scene.add(avatar.group);
    early.push(() => avatar.dispose());
    await step(82, "content");

    // ---------------------------------------------------------------- spawn
    const arrival = resolveSpawn(def.spawn, search, def.world);
    const spawn = (() => {
      const sp = arrival.point;
      if ("t" in sp) {
        const p = layout.trail.pointAt(sp.t);
        const tg = layout.trail.tangentAt(sp.t);
        return { x: p.x, z: p.z, yaw: Math.atan2(tg.x, tg.z), t: sp.t };
      }
      return { ...sp, t: layout.trail.nearestT(sp.x, sp.z) };
    })();

    // ---------------------------------------------------------------- ambients
    creatures.clear();
    decks.clear();
    early.push(() => {
      creatures.clear();
      decks.clear();
    });
    const me = creatures.add("traveler", BODY_R, { x: spawn.x, z: spawn.z, give: 1 });
    const ambients: Ambient[] = [];
    for (const [name, make] of [
      ["passport", createPassport] as const,
      ["rewards", createRewards] as const,
      ...worldAmbients,
    ]) {
      try {
        const a = make(env, hudRoot);
        if (a && typeof a.update === "function") ambients.push(a);
      } catch (err) {
        console.warn(`[${tag}] ${name} skipped`, err);
      }
    }
    early.push(() => {
      for (const a of ambients) a.dispose();
    });
    const cull = createDetailCull(scene, { skip: (o) => o.name === "traveler" });
    cull.scan();
    let cullClock = 0;
    early.push(() => cull.dispose());
    await step(92, "ambients");
    const interact = () => {
      for (const a of ambients) {
        if (a.prompt && !safe(() => a.prompt?.() ?? null, null)) continue;
        if (safe(() => a.interact?.() ?? false, false)) return;
      }
      // Seated and nothing else wants E: stand up (../seat.ts).
      standUp();
    };

    // ---------------------------------------------------------------- input + controls
    const input = createInput(engine.canvas, { onPad: (a) => onPad(a) });
    input.enabled = false;
    // Above the terrain and above any registered deck.
    const cam = createFollowCam(camera, (x, z) => topOf(decks, layout.heightAt(x, z), x, z));
    const hooks: SuyuHooks = safe(() => def.hooks?.({ layout, env, cam, scene }) ?? {}, {});
    cleanups.push(() => hooks.dispose?.());
    let runHold = false;
    const music = createSuyuMusic(env, def.stations, def.music);
    cleanups.push(() => music.dispose());
    const chrome = createChrome(host, lang, {
      musicControl: music.createControl(lang === "es" ? "Música (N)" : "Music (N)"),
      onTour: () => {},
      onPhoto: () => void photo.shoot(),
      onEditName: () => nameEditor.open(),
      onDayNight: () => sky.toggle(),
      onText: () => ui.textMode.open(),
      onTravel: () => openTrip(),
      onQuality: () => {
        const q: Quality = engine.quality() === "high" ? "low" : "high";
        engine.setQuality(q);
        chrome.setQuality(q);
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
    // No guided tour on suyu roads: hide its button.
    const tourBtn = chrome.root.querySelector<HTMLElement>('[data-k="tour"]');
    if (tourBtn) tourBtn.hidden = true;
    chrome.setQuality(quality);
    let traveler = loadTraveler();
    chrome.setTraveler(traveler);
    let dialogOpen = false;
    let gameOpen = false;
    let modals = ui.textMode.isOpen() ? 1 : 0;
    const syncInput = () => {
      input.enabled = !gameOpen && !dialogOpen && modals === 0;
    };
    cleanups.push(
      on("world:modal", (d) => {
        modals = Math.max(0, modals + (d?.open ? 1 : -1));
        host.classList.toggle("kw-modal", modals > 0);
        syncInput();
      }),
    );
    // «Viajar»: fast travel to any other world (chrome button, V, gamepad LT); never over another dialog.
    const trip = createTravelPanel(host, lang, def.world as TripWorld);
    cleanups.push(() => trip.dispose());
    const openTrip = () => {
      if (!gameOpen && !dialogOpen && modals === 0) trip.open();
    };

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
      syncInput();
      if (!open) engine.canvas.focus?.({ preventScroll: true });
    };
    const place = (): Place => {
      let best: Place | null = null;
      let bd = def.visit.radius;
      for (const s of def.stations) {
        const p = layout.stationPose(s.id).position;
        const d = Math.hypot(p.x - pos.x, p.z - pos.z);
        if (d < bd) {
          bd = d;
          best = { id: s.id, label: s.label[lang] };
        }
      }
      return best ?? { id: def.place.id, label: def.place.label[lang] };
    };
    const photo = createPhotoMode(host, lang, {
      reducedMotion,
      capture: () => engine.capture(),
      place,
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
    // The passport's "My postcard" button: the shareable postcard of the world the def names.
    const postcardWorld = def.postcard ?? "qhapaq";
    const journey = createJourneyDialog(host, lang, {
      capture: () => engine.capture(),
      summary: () => summarize(undefined, undefined, postcardWorld),
      traveler: () => traveler,
      onOpenChange: onDialog,
      world: postcardWorld,
    });
    cleanups.push(
      on("world:postcard", () => {
        if (!gameOpen) void journey.open();
      }),
    );
    cleanups.push(() => {
      photo.dispose();
      nameEditor.dispose();
      journey.dispose();
    });
    const hud = createSuyuHud(hudRoot, lang, def.help);
    cleanups.push(() => hud.dispose());
    const syncNight = () => {
      const n = sky.sky.isNight();
      chrome.setNight(n);
      hud.setNight(n);
      host.classList.toggle("kw-night", n);
    };
    syncNight();
    cleanups.push(sky.sky.onChange(syncNight));
    cleanups.push(() => host.classList.remove("kw-night"));

    // ---------------------------------------------------------------- player
    const pos = new THREE.Vector3(spawn.x, layout.groundAt(spawn.x, spawn.z), spawn.z);
    pos.y = topOf(decks, pos.y, pos.x, pos.z);
    const vel = new THREE.Vector2();
    let vy = 0;
    let grounded = true;
    let yaw = spawn.yaw;
    cam.behind(yaw);
    cam.pitch = 0.32;
    cam.dist = 9.5;
    /** Snap height (teleport, landing fallback): the highest registered deck there, else the layout ground. */
    const groundAt = (x: number, z: number) => topOf(decks, layout.groundAt(x, z), x, z);
    /** How far above the feet a deck still counts: a step while grounded, only what is underfoot in the air. */
    const deckReach = () => (grounded ? MAX_STEP + Math.max(0, vy * 0.1) : 0.05);
    const feetGround = (x: number, z: number) => standOn(decks, layout.groundAt(x, z), x, z, pos.y, deckReach());

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
    const canStand = (x: number, z: number) => {
      const d = decks.heightAt(x, z, pos.y + deckReach());
      const base = layout.groundAt(x, z);
      const g = d !== null && d > base ? d : base;
      return (d !== null || layout.walkable(x, z)) && g - pos.y < MAX_STEP + Math.max(0, vy * 0.1);
    };
    /** Animals and people are solid: slide around them like colliders. */
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
      const nx = push.x / m;
      const nz = push.z / m;
      const into = vel.x * nx + vel.y * nz;
      if (into < 0) {
        vel.x -= into * nx;
        vel.y -= into * nz;
      }
    };
    /** Nearest walkable ground or deck around (x, z); with `fromY`, only decks within a step of that height. */
    const snapWalkable = (x: number, z: number, fromY = Number.POSITIVE_INFINITY): [number, number] => {
      const ok = (px: number, pz: number) =>
        layout.walkable(px, pz) || decks.heightAt(px, pz, fromY + MAX_STEP) !== null;
      if (ok(x, z)) return [x, z];
      for (let r = 0.6; r <= 8; r += 0.6)
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const nx = x + Math.cos(a) * r;
          const nz = z + Math.sin(a) * r;
          if (ok(nx, nz)) return [nx, nz];
        }
      const p = layout.trail.pointAt(layout.trail.nearestT(x, z));
      return [p.x, p.z];
    };

    // ---------------------------------------------------------------- keys + pads
    const helpOpen = () => !!hudRoot.querySelector(".qn-help:not([hidden])");
    const onKey = (e: KeyboardEvent) => {
      const tagName = (e.target as HTMLElement)?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return;
      if (gameOpen || dialogOpen) return;
      if (e.key === "Escape") {
        if (ambients.some((a) => safe(() => a.escape?.() ?? false, false))) e.preventDefault();
        else if (seat) {
          standUp();
          e.preventDefault();
        }
        return;
      }
      if (modals > 0 && !(e.code === "KeyH" && helpOpen())) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.code === "KeyM") emit("world:map", undefined);
      else if (e.code === "KeyH" || e.key === "?") emit("world:help", undefined);
      else if (e.code === "KeyT") sky.toggle();
      else if (e.code === "KeyK") ui.textMode.open();
      else if (e.code === "KeyN") music.toggleMute();
      else if (e.code === "KeyF") void photo.shoot();
      else if (e.code === "KeyV") openTrip();
      else return;
      e.preventDefault();
    };
    const activeDialog = (): HTMLElement | null => {
      const a = document.activeElement as HTMLElement | null;
      const d = a?.closest<HTMLElement>('[role="dialog"]');
      if (d) return d;
      const all = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((n) => n.offsetParent !== null);
      return all[all.length - 1] ?? null;
    };
    const onPad = (a: PadAction) => {
      const busy = modals > 0 || dialogOpen;
      if (a === "back") {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      } else if (a === "map") {
        if (!busy || map.isOpen()) emit("world:map", undefined);
      } else if (a === "help") {
        if (!busy || helpOpen()) emit("world:help", undefined);
      } else if (a === "text") {
        if (ui.textMode.isOpen()) ui.textMode.close();
        else if (!busy) ui.textMode.open();
      } else if (a === "photo") {
        if (!busy) void photo.shoot();
      } else if (a === "travel") {
        if (trip.isOpen()) trip.close();
        else if (!busy && !gameOpen) openTrip();
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
      engine.hold(gameOpen);
      if (!gameOpen) engine.canvas.focus?.();
    };
    window.addEventListener("world:game", onGame);
    cleanups.push(() => window.removeEventListener("world:game", onGame));
    let inside = false;
    const onInterior = (e: Event) => {
      inside = !!(e as CustomEvent<{ inside?: boolean }>).detail?.inside;
      if (reducedMotion) cam.squeeze = inside ? 1 : 0;
    };
    window.addEventListener("world:interior", onInterior);
    cleanups.push(() => window.removeEventListener("world:interior", onInterior));
    document.fonts?.ready.then(() => redrawAll()).catch(() => {});

    // ---------------------------------------------------------------- mount (vehicles)
    let riding = false;
    let boarded = false;
    let speedMul = 1;
    let seatHeight = 0;
    cleanups.push(
      on("world:mount", (d) => {
        riding = !!d?.riding;
        boarded = riding && d.vehicle !== undefined && d.vehicle !== "llama";
        speedMul = riding && Number.isFinite(d.speedMul) && d.speedMul > 0 ? d.speedMul : 1;
        seatHeight = riding && Number.isFinite(d.seatHeight) ? Math.max(0, d.seatHeight) : 0;
      }),
    );

    // ---------------------------------------------------------------- sitting (world:sit, ../seat.ts)
    let seat: Seat | null = null;
    const sitFrom = { x: 0, z: 0 };
    const standLatch = createStandLatch();
    const standUp = () => {
      if (seat) emit("world:sit", { seated: false });
    };
    cleanups.push(
      on("world:mount", (d) => {
        if (d?.riding) standUp();
      }),
      on("world:sit", (d) => {
        if (d?.seated) {
          const s = seatFrom(d);
          if (!s || riding || ride.active || gameOpen) {
            emit("world:sit", { seated: false });
            return;
          }
          if (!seat) {
            sitFrom.x = pos.x;
            sitFrom.z = pos.z;
          }
          seat = s;
          standLatch.reset();
          pos.set(s.x, seatedFeetY(s), s.z);
          vel.set(0, 0);
          vy = 0;
          grounded = true;
          yaw = s.yaw;
          cam.behind(s.view);
          return;
        }
        if (!seat) return;
        const st = seat.stand ?? sitFrom;
        const fromY = seat.y;
        seat = null;
        let [x, z] = snapWalkable(st.x, st.z, fromY);
        const [rx, rz] = resolve(x, z);
        if (layout.walkable(rx, rz) || decks.heightAt(rx, rz, fromY + MAX_STEP) !== null) [x, z] = [rx, rz];
        pos.set(x, standOn(decks, layout.groundAt(x, z), x, z, fromY, MAX_STEP), z);
        vel.set(0, 0);
        vy = 0;
        grounded = true;
        me.x = x;
        me.z = z;
      }),
    );

    // ---------------------------------------------------------------- fast travel (world:teleport {to: station id})
    const fade = document.createElement("div");
    fade.className = "kw-fade";
    fade.setAttribute("aria-hidden", "true");
    host.append(fade);
    cleanups.push(() => fade.remove());
    let fadeTimer = 0;
    cleanups.push(() => clearTimeout(fadeTimer));
    /** In front of the station: 3 u from its pose along the way it faces (toward the road), on walkable ground. */
    const stationFront = (id: string) => {
      if (!def.stations.some((x) => x.id === id)) return null;
      const pose = layout.stationPose(id);
      const p = pose.position;
      const [x, z] = snapWalkable(p.x + Math.sin(pose.yaw) * 3, p.z + Math.cos(pose.yaw) * 3);
      return { x, z, face: p };
    };
    cleanups.push(
      on("world:teleport", (d) => {
        if (gameOpen || ride.active || !d?.to) return;
        const target = stationFront(d.to);
        if (!target) return;
        standUp();
        const move = () => {
          pos.set(target.x, groundAt(target.x, target.z), target.z);
          vel.set(0, 0);
          vy = 0;
          grounded = true;
          yaw = Math.atan2(target.face.x - pos.x, target.face.z - pos.z);
          cam.behind(yaw);
          cam.snap();
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

    // ---------------------------------------------------------------- paper map (M / world:map / gamepad Y)
    const nearStation = (): string | null => {
      let best: string | null = null;
      let bd = def.visit.radius;
      for (const pl of layout.plazas) {
        const d = Math.hypot(pl.x - pos.x, pl.z - pos.z);
        if (d < bd) {
          bd = d;
          best = pl.id;
        }
      }
      return best;
    };
    const map = createSuyuMap(host, lang, def, {
      layout,
      player: () => ({ x: pos.x, z: pos.z, yaw }),
      near: nearStation,
    });
    cleanups.push(() => map.dispose());
    cleanups.push(
      on("world:map", () => {
        if (gameOpen) return;
        if (map.isOpen()) map.close();
        else if (modals === 0 && !dialogOpen && !ride.active) map.open();
      }),
    );

    // ---------------------------------------------------------------- start in play
    const gesture = () => {
      music.begin();
      window.removeEventListener("pointerdown", gesture, true);
      window.removeEventListener("keydown", gesture, true);
    };
    window.addEventListener("pointerdown", gesture, true);
    window.addEventListener("keydown", gesture, true);
    cleanups.push(() => {
      window.removeEventListener("pointerdown", gesture, true);
      window.removeEventListener("keydown", gesture, true);
    });
    announceTraveler(traveler);
    chrome.show(true);
    hudRoot.classList.add("on");
    syncInput();
    cam.snap();
    engine.canvas.focus?.();

    // ---------------------------------------------------------------- frame
    const stamped = new Set<string>();
    const stampKind = new Map(def.stations.map((s) => [s.id, s.stamp === undefined ? "station" : s.stamp] as const));
    let visitClock = 0;
    let musicClock = 0;
    let musicT = spawn.t;
    let framesSeen = 0;
    let wasRiding = false;
    const lastPose = new THREE.Vector3();
    let rideSpeed = 0;
    const camTarget = new THREE.Vector3();
    const devWalk = { x: 0, z: 0, secs: 0, speed: WALK };
    const sunNight = () => {
      const e = Math.sin((sky.sky.time() - 0.25) * Math.PI * 2);
      return THREE.MathUtils.smoothstep(-e, 0.02, 0.2);
    };
    const off = engine.onFrame((dt, time) => {
      const now = performance.now();
      if (lastFrameAt) governor.sample(now - lastFrameAt);
      lastFrameAt = now;
      if (framesSeen < 2 && ++framesSeen === 2) ui.done();
      input.poll(dt);
      sky.update(dt, camera, pos, true);
      // The world's air (the sky set the fog this frame; nothing else writes it after).
      const night = sunNight();
      if (tint && atmo.tint) sky.fog.color.lerp(tint, atmo.tint.amount * (1 - night));
      if (atmo.near) sky.fog.near *= atmo.near;
      if (atmo.far) sky.fog.far *= atmo.far;
      engine.outline.uniforms.uInk.value.copy(sky.ink);
      scenery.setNight?.(night);
      scenery.update(dt, time, env);

      // ----- movement intent (camera space → world)
      let mx = 0;
      let my = 0;
      let speed = (input.running() || runHold ? RUN : WALK) * speedMul;
      const orbit = input.takeOrbit();
      input.takeManual();
      const fx = -Math.sin(cam.yaw);
      const fz = -Math.cos(cam.yaw);
      if (devWalk.secs > 0) {
        devWalk.secs -= dt;
        mx = devWalk.x * -fz + devWalk.z * fx;
        my = devWalk.x * fx + devWalk.z * fz;
        speed = devWalk.speed * speedMul;
      } else {
        const m = input.move();
        mx = m.x;
        my = m.y;
      }
      if (seat) {
        if (ride.active || standLatch.wantsUp({ x: mx, y: my }, input.takeJump())) standUp();
        else mx = my = 0;
      }
      const wx = -fz * mx + fx * my;
      const wz = fx * mx + fz * my;

      let spd: number;
      if (ride.active) {
        ride.intent.x = wx;
        ride.intent.z = wz;
        ride.intent.running = input.running() || runHold;
        const P = ride.pose;
        if (Number.isFinite(P.x) && Number.isFinite(P.z)) {
          const y = Number.isFinite(P.y) ? P.y : groundAt(P.x, P.z);
          rideSpeed = wasRiding && dt > 0 ? Math.hypot(P.x - lastPose.x, P.z - lastPose.z) / dt : 0;
          pos.set(P.x, y, P.z);
          lastPose.set(P.x, y, P.z);
          if (Number.isFinite(P.yaw)) yaw = P.yaw;
        }
        vel.set(0, 0);
        vy = 0;
        grounded = true;
        me.r = RIDE_R;
        me.x = pos.x;
        me.z = pos.z;
        wasRiding = true;
        input.takeJump();
        spd = 0;
      } else {
        if (wasRiding) {
          wasRiding = false;
          rideSpeed = 0;
          const [x, z] = snapWalkable(pos.x, pos.z, pos.y);
          pos.set(x, standOn(decks, layout.groundAt(x, z), x, z, pos.y, MAX_STEP), z);
          vel.set(0, 0);
          vy = 0;
          grounded = true;
        }
        // A boarded vehicle that has not taken the pose yet: no walking away from it.
        const walkMul = boarded ? 0 : 1;
        const tx = wx * speed * walkMul;
        const tz = wz * speed * walkMul;
        const moving = Math.hypot(mx, my) * walkMul > 0.05;
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

        const ground = feetGround(pos.x, pos.z);
        if (input.takeJump() && grounded && !riding) {
          vy = JUMP_V;
          grounded = false;
        }
        if (grounded) {
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
        spd = vel.length();
        if (spd > 0.3) yaw = angleLerp(yaw, Math.atan2(vel.x, vel.y), Math.min(1, dt * 11));
        if (seat) {
          pos.set(seat.x, seatedFeetY(seat), seat.z);
          vel.set(0, 0);
          vy = 0;
          grounded = true;
          yaw = seat.yaw;
          me.x = pos.x;
          me.z = pos.z;
        }
      }

      avatar.group.position.copy(pos);
      avatar.group.position.y += seatHeight;
      avatar.group.rotation.y = yaw;
      avatar.update(dt, { speed: spd, running: spd > (WALK + 0.4) * speedMul, grounded, t: time });

      const squeeze = inside ? 1 : seat ? SIT_SQUEEZE : 0;
      if (!reducedMotion) cam.squeeze += (squeeze - cam.squeeze) * (1 - Math.exp(-dt * 3));
      else cam.squeeze = squeeze;
      cam.update(dt, time, camTarget.set(pos.x, pos.y + seatHeight, pos.z), {
        facing: yaw,
        moving: Math.max(spd, rideSpeed) > 0.4,
        orbit,
        follow: 1.15,
      });
      if (input.takeInteract()) interact();
      safe(() => hooks.update?.(dt, time, pos), undefined);

      musicClock += dt;
      if (musicClock > 0.2) {
        musicClock = 0;
        musicT = layout.trail.nearestT(pos.x, pos.z);
      }
      music.update(dt, { x: pos.x, z: pos.z, t: musicT });
      // Station visits → passport stamps (once per id per session; the passport dedupes across sessions).
      visitClock += dt;
      if (visitClock > 0.25) {
        visitClock = 0;
        for (const pl of layout.plazas) {
          if (stamped.has(pl.id)) continue;
          const s = def.stations.find((x) => x.id === pl.id);
          if (Math.hypot(pl.x - pos.x, pl.z - pos.z) > (s?.visit ?? def.visit.radius)) continue;
          const kind = stampKind.get(pl.id);
          stamped.add(pl.id);
          if (!s || !kind) continue;
          const id = `${def.world}:station:${s.id}`;
          const label = CATALOG.find((c) => c.id === id)?.label ?? s.label;
          emit("world:stamp", { id, kind, label });
        }
      }
      let prompt: string | null = null;
      for (const a of ambients) {
        safe(() => a.update(dt, pos, time), undefined);
        prompt ??= safe(() => a.prompt?.() ?? null, null);
      }
      chrome.setPrompt(modals > 0 ? null : prompt);
      cull.update(engine.camera.position);
      cullClock += dt;
      if (cullClock > 5) {
        cullClock = 0;
        cull.scan();
      }
    });
    cleanups.push(off);

    // Dev / screenshot hook (same shape as the mountain's and the jungle's, so shared shot scripts work).
    if (import.meta.env?.DEV) {
      (host as HTMLElement & { __kw?: unknown }).__kw = {
        begin() {},
        engine,
        layout,
        scene,
        env,
        ride,
        arrival: arrival.from,
        teleport(t: number, side = 0, faceBack = false) {
          standUp();
          const p = layout.trail.pointAt(t);
          const tg = layout.trail.tangentAt(t);
          pos.set(p.x - tg.z * side, 0, p.z + tg.x * side);
          pos.y = groundAt(pos.x, pos.z);
          vel.set(0, 0);
          vy = 0;
          grounded = true;
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
        face(x: number, z: number, tx: number, tz: number) {
          standUp();
          pos.set(x, groundAt(x, z), z);
          vel.set(0, 0);
          yaw = Math.atan2(tx - x, tz - z);
          cam.behind(yaw);
          cam.snap();
        },
        setTime: (t: number) => sky.sky.setTime(t),
        creatures,
        decks,
        walk(dx: number, dz: number, secs: number, speed = WALK) {
          const d = Math.hypot(dx, dz) || 1;
          Object.assign(devWalk, { x: dx / d, z: dz / d, secs, speed });
        },
        tour() {},
        /** Draw calls and triangles of one whole composed frame (all passes). */
        drawCalls: () =>
          new Promise((res) => {
            const info = engine.renderer.info;
            let frames = 0;
            const count = engine.onFrame(() => {
              if (frames++ === 0) {
                info.autoReset = false;
                info.reset();
              }
            });
            const finish = () => {
              count();
              const n = Math.max(1, frames);
              const r = { calls: Math.round(info.render.calls / n), triangles: Math.round(info.render.triangles / n) };
              info.autoReset = true;
              res(r);
            };
            setTimeout(finish, 600);
          }),
        state: () => ({
          phase: "play",
          pos: pos.toArray(),
          yaw,
          t: layout.trail.nearestT(pos.x, pos.z),
          time: sky.sky.time(),
          touring: false,
          riding: ride.active,
          seated: seat?.id ?? null,
          stamped: [...stamped],
        }),
      };
    }

    return () => {
      for (const c of cleanups.splice(0)) c();
      input.dispose();
      chrome.dispose();
      bail();
    };
  } catch (err) {
    bail();
    throw err;
  }
}
