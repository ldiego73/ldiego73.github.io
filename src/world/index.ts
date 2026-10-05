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
 */
import * as THREE from "three";
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
import { createNameEditor, createPhotoMode, placeAt } from "./dialogs";
import { createEngine, disposeTree, type Quality } from "./engine";
import { createEnv } from "./env";
import { createInput } from "./input";
import { createTitle } from "./intro";
import { buildLayout, type Layout } from "./layout";
import { createSky } from "./sky";
import { createScenery } from "./terrain";
import { disposeTextures, redrawAll } from "./tex";
import { createToonCache } from "./toon";
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
const MAX_STEP = 0.9;
const SWOOP = 3.4;

const LOADING = { es: "Tejiendo la montaña…", en: "Weaving the mountain…" } as const;

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
async function loadContent() {
  const out: {
    createAvatar?: CreateAvatar;
    createContent?: CreateContent;
    footprint?: Record<string, number>;
    deckHeightAt?: (x: number, z: number) => number | null;
    createFauna?: CreateAmbient;
    createNpcs?: CreateAmbient;
  } = {};
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

  const loading = document.createElement("p");
  loading.className = "kw-loading";
  loading.setAttribute("role", "status");
  loading.textContent = LOADING[lang];
  host.append(loading);

  loadContent()
    .then((mods) => {
      if (disposed) return;
      // Let the loading line paint before the heavy synchronous build.
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (disposed) return;
          try {
            teardown = start(host, lang, reducedMotion, mods, opts.skipIntro ?? false);
          } catch (err) {
            console.error(err);
            loading.textContent = lang === "es" ? "No se pudo cargar el mundo." : "The world could not load.";
            return;
          }
          loading.remove();
        }, 30),
      );
    })
    .catch((err) => console.error(err));

  return () => {
    disposed = true;
    teardown?.();
    loading.remove();
    host.classList.remove("kw-root");
  };
}

function start(
  host: HTMLElement,
  lang: Lang,
  reducedMotion: boolean,
  mods: Awaited<ReturnType<typeof loadContent>>,
  skipIntro: boolean,
): () => void {
  const quality = readQuality();
  const engine = createEngine(host, { quality });
  const { scene, camera } = engine;
  const cleanups: Array<() => void> = [];

  // ---------------------------------------------------------------- world
  const layout: Layout = buildLayout({ cells: quality === "high" ? 280 : 190, footprint: mods.footprint });
  const toon = createToonCache();
  const sky = createSky(scene, { reducedMotion, quality });
  const scenery = createScenery(layout, toon, quality);
  scene.add(scenery.group);
  const trailMeshes = createTrailMeshes(layout, toon, quality);
  scene.add(trailMeshes.group);
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

  const hudRoot = document.createElement("div");
  hudRoot.className = "kw-hud";
  host.append(hudRoot);

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

  let content: Content;
  try {
    content = mods.createContent ? mods.createContent(env, hudRoot) : fallbackContent(env, layout.gorge);
  } catch (err) {
    console.warn("[world] content fallback", err);
    content = fallbackContent(env, layout.gorge);
  }

  // ---------------------------------------------------------------- ambients (fauna, NPC chasquis)
  const ambients: Ambient[] = [];
  for (const [name, make] of [
    ["npcs", mods.createNpcs],
    ["fauna", mods.createFauna],
  ] as const) {
    if (!make) continue;
    try {
      const a = make(env, hudRoot);
      if (a && typeof a.update === "function") ambients.push(a);
    } catch (err) {
      console.warn(`[world] ${name} skipped`, err);
    }
  }
  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (err) {
      console.warn(err);
      return fallback;
    }
  };
  /** E: ambients first (an NPC in range talks), then content. */
  const interact = () => {
    for (const a of ambients) if (safe(() => a.interact?.() ?? false, false)) return;
    content.interact();
  };

  // ---------------------------------------------------------------- input + controls
  const input = createInput(engine.canvas);
  input.enabled = false;
  const cam = createFollowCam(camera, layout.heightAt);
  let runHold = false;
  const chrome = createChrome(host, lang, {
    onTour: () => setTour(!touring),
    onPhoto: () => void photo.shoot(),
    onEditName: () => nameEditor.open(),
    onDayNight: () => sky.toggle(),
    onQuality: () => {
      const q: Quality = engine.quality() === "high" ? "low" : "high";
      engine.setQuality(q);
      chrome.setQuality(q);
      applyDensity(q);
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
  // Dialogs (photo preview, name editor) pause movement while open.
  let dialogOpen = false;
  const syncInput = () => {
    input.enabled = phase === "play" && !gameOpen && !dialogOpen;
  };
  const onDialog = (open: boolean) => {
    dialogOpen = open;
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
  cleanups.push(() => {
    photo.dispose();
    nameEditor.dispose();
  });
  const syncNight = () => {
    const n = sky.sky.isNight();
    chrome.setNight(n);
    host.classList.toggle("kw-night", n);
  };
  syncNight();
  cleanups.push(sky.sky.onChange(syncNight));
  cleanups.push(() => host.classList.remove("kw-night"));
  const ichu = scene.getObjectByName("ichu") as THREE.InstancedMesh | undefined;
  const ichuFull = ichu?.count ?? 0;
  const applyDensity = (q: Quality) => {
    if (ichu) ichu.count = q === "high" ? ichuFull : Math.floor(ichuFull * 0.45);
  };

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
    if (e.key === "Escape") {
      if (ambients.some((a) => safe(() => a.escape?.() ?? false, false)) || content.escape()) e.preventDefault();
      else if (touring) setTour(false);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (e.code === "KeyM") window.dispatchEvent(new CustomEvent("world:map"));
    else if (e.code === "KeyH" || e.key === "?") window.dispatchEvent(new CustomEvent("world:help"));
    else if (e.code === "KeyT") sky.toggle();
    else if (e.code === "KeyF") void photo.shoot();
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
    toPlay();
    announceTraveler(traveler);
  }

  const swoopMid = new THREE.Vector3();
  const swoopPos = new THREE.Vector3();
  const swoopLook = new THREE.Vector3();

  const off = engine.onFrame((dt, time) => {
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
    let speed = input.running() || runHold ? RUN : WALK;
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
        speed = TOUR_SPEED;
      } else if (stop) {
        // Face the station (or the stop itself if the id isn't a contract station).
        faceTo = STATIONS.some((s) => s.id === stop.id) ? layout.stationPose(stop.id).position : stop.position;
      }
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

    const ground = groundAt(pos.x, pos.z);
    if (phase === "play" && input.takeJump() && grounded) {
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
    avatar.group.rotation.y = yaw;
    avatar.update(dt, { speed: spd, running: spd > WALK + 0.4, grounded, t: time });

    if (!reducedMotion) cam.squeeze += ((inside ? 1 : 0) - cam.squeeze) * (1 - Math.exp(-dt * 3));
    if (phase === "play")
      cam.update(dt, time, pos, { facing: yaw, moving: spd > 0.4, orbit, follow: touring ? 1.6 : 1.15 });
    if (phase === "play" && input.takeInteract()) interact();
    content.update(dt, pos, time);
    let prompt: string | null = null;
    for (const a of ambients) {
      safe(() => a.update(dt, pos, time), undefined);
      prompt ??= phase === "play" ? safe(() => a.prompt?.() ?? null, null) : null;
    }
    chrome.setPrompt(prompt);
  });
  cleanups.push(off);

  // Dev / screenshot hook.
  if (import.meta.env?.DEV) {
    (host as HTMLElement & { __kw?: unknown }).__kw = {
      begin,
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
    try {
      content.dispose();
      for (const a of ambients) a.dispose();
    } catch (err) {
      console.warn(err);
    }
    avatar.dispose();
    hudRoot.remove();
    trailMeshes.dispose();
    scenery.dispose();
    sky.dispose();
    disposeTree(scene);
    toon.dispose();
    disposeTextures();
    engine.dispose();
  };
}
