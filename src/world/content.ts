import * as THREE from "three";
import { COMPANIES } from "../data/career";
import { mountCabinet } from "../games/core/shell";
import type { GameMeta } from "../games/core/types";
import { t as tr, type UIKey } from "../i18n/ui";
import { khipuFor, stationsInOrder } from "./artifacts";
import { type Bridge, buildBridge } from "./bridge";
import { type Collider, type Content, type CreateContent, STATIONS, type Station, type WorldEnv } from "./contract";
import { buildHouse, type HousePlace } from "./house";
import { createHud, type MapStation } from "./hud";
import {
  type ArcadePlace,
  buildArcade,
  buildGate,
  buildIntihuatana,
  buildPlot,
  type Place,
  type PlaceCtx,
} from "./landmarks";
import { C, DYE, localGround, type Torch } from "./props";
import { buildSummit, type SummitPlace } from "./summit";
import { buildTambo, type Tambo } from "./tambo";

/**
 * Content side of the Qhapaq Ñan world: stations along the trail, proximity reactions, panels,
 * the arcade overlay and the guided tour. Consumes WorldEnv only (see contract.ts).
 *
 * Integration hooks for the core (beyond the Content interface):
 *  - `content.gameOpen` (boolean) and window event `world:game` {detail:{open}}: a real game is
 *    running in a fullscreen overlay; core should pause movement input (and may stop rendering).
 *  - window events `world:map` / `world:help` toggle the minimap / help overlay (route M / H to them).
 *  - `deckHeightAt(x, z)`: bridge deck height when (x, z) is on the deck, else null.
 *  - `STATION_FOOTPRINT`: radius of flat ground each station needs around its pose.
 *  - window event `world:interior` {detail:{inside, id}}: the traveler entered/left an interior
 *    (the chasqui house or the arcade). Roofs fade and camera-facing house walls drop on their own;
 *    core may also lower the camera pitch/distance while inside.
 *  - The summit finale (past the chasqui post) is content-only: it sits at trail end (t = 1) and
 *    registers its own walkable plaza.
 */

export const STATION_FOOTPRINT: Record<string, number> = Object.fromEntries(
  STATIONS.map((s) => [
    s.id,
    s.kind === "arcade"
      ? 10.5
      : s.kind === "contact"
        ? 7.5
        : s.kind === "company"
          ? 6
          : s.kind === "bridge"
            ? 0
            : s.kind === "build"
              ? 5
              : 4.5,
  ]),
);

let activeBridge: Bridge | null = null;
export function deckHeightAt(x: number, z: number): number | null {
  return activeBridge?.deckHeightAt(x, z) ?? null;
}

type SpotKind = "company" | "artifact" | "cabinet" | "info";
interface Spot {
  id: string;
  kind: SpotKind;
  x: number;
  z: number;
  r: number;
  /** Panel key + builder (null = no panel). */
  panel?: () => HTMLElement;
  prompt: UIKey;
  /** Higher wins when overlapping (cabinets over the arcade room). */
  priority: number;
  game?: GameMeta;
  cabinetIndex?: number;
}

const KIND_COLOR: Record<Station["kind"], string> = {
  gate: C.cotton,
  company: DYE.ochre,
  bridge: DYE.indigo,
  arcade: DYE.red,
  ai: DYE.turq,
  contact: DYE.red,
  build: C.cone,
};

export const createContent: CreateContent = (env: WorldEnv, hudRoot: HTMLElement) => {
  const lang = env.lang;
  const L = (k: UIKey) => tr(lang, k);
  const root = new THREE.Group();
  root.name = "content";
  env.scene.add(root);

  // Traveler name (from core's title screen): localStorage on load + live `world:traveler` events.
  // Already sanitized by core; it only ever reaches the DOM through textContent.
  let traveler = "";
  try {
    traveler = (localStorage.getItem("qn.traveler") ?? "").trim().slice(0, 100);
  } catch {
    /* storage unavailable */
  }
  const onTraveler = (e: Event) => {
    const n = (e as CustomEvent<{ name?: unknown }>).detail?.name;
    traveler = typeof n === "string" ? n.trim().slice(0, 100) : "";
  };
  window.addEventListener("world:traveler", onTraveler);
  const named = (key: UIKey, fallback: UIKey) => (traveler ? L(key).replace("{name}", traveler) : L(fallback));

  const spots: Spot[] = [];
  const torches: Torch[] = [];
  const tambos: Array<{ id: string; tambo: Tambo; focus: THREE.Vector3 }> = [];
  const places: Array<{ id: string; place: Place; focus: THREE.Vector3 }> = [];
  const fronts = new Map<string, THREE.Vector3>();
  const hitRoots: THREE.Object3D[] = [];
  const zones: Array<{ id: string; label: string; x: number; z: number; r: number }> = [];
  let arcade: ArcadePlace | null = null;
  let house: HousePlace | null = null;
  let summit: SummitPlace | null = null;
  let bridge: Bridge | null = null;

  const register = (cs: Collider[], walk: Collider[]) => {
    for (const c of cs) env.addCollider(c);
    for (const w of walk) env.addWalkable(w);
  };
  /** Walkable path of circles from a plaza point to the trail. */
  const pathToTrail = (from: THREE.Vector3) => {
    const tt = env.trail.nearestT(from.x, from.z);
    const to = env.trail.pointAt(tt);
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    const out: Collider[] = [];
    const n = Math.max(1, Math.ceil(d / 0.9));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      out.push({ kind: "circle", x: from.x + (to.x - from.x) * u, z: from.z + (to.z - from.z) * u, r: 1.25 });
    }
    return out;
  };
  const tagHits = (objs: THREE.Object3D[], spotId: string) => {
    for (const o of objs) {
      o.userData.spotId = spotId;
      hitRoots.push(o);
    }
  };
  const world = (obj: THREE.Object3D, local: THREE.Vector3) => {
    obj.updateMatrixWorld(true);
    const v = obj.localToWorld(local.clone());
    v.y = env.heightAt(v.x, v.z);
    return v;
  };
  /** A station's frame: its pose and the yaw that turns local +Z toward the trail. */
  const frameOf = (st: Station, jitter = 0) => {
    const pose = env.stationPose(st.id);
    const tp = env.trail.pointAt(st.t);
    const dx = tp.x - pose.position.x;
    const dz = tp.z - pose.position.z;
    const yaw = (Math.hypot(dx, dz) > 0.5 ? Math.atan2(dx, dz) : pose.yaw) + jitter;
    return { pose, yaw, ground: localGround(env, pose.position, yaw) };
  };
  /** Place a local-frame station group at its pose facing the trail. */
  const placeAt = (group: THREE.Object3D, st: Station, jitter = 0) => {
    const { pose, yaw } = frameOf(st, jitter);
    group.position.copy(pose.position);
    group.rotation.y = yaw;
    root.add(group);
    return pose;
  };

  // ------------------------------------------------------------------ stations
  for (const st of STATIONS) {
    const label = st.label[lang];
    if (st.kind === "company") {
      const company = COMPANIES.find((c) => c.id === st.companyId);
      if (!company) continue;
      const tambo = buildTambo(env, company, lang, st.id);
      const jitter = (((st.t * 1000) % 7) - 3) * 0.06;
      const pose = placeAt(tambo.group, st, jitter);
      (tambo.group.userData.computeColliders as () => void)();
      const focus = world(tambo.group, tambo.focus);
      const plaza = world(tambo.group, new THREE.Vector3(0, 0, 1.8));
      register(tambo.colliders, [{ kind: "circle", x: plaza.x, z: plaza.z, r: 3.0 }, ...pathToTrail(plaza)]);
      fronts.set(st.id, world(tambo.group, tambo.front));
      torches.push(tambo.torch);
      tambos.push({ id: st.id, tambo, focus });
      const cords = khipuFor(company.id);
      spots.push({
        id: st.id,
        kind: "company",
        x: focus.x,
        z: focus.z,
        r: 3.6,
        prompt: "qn.read",
        priority: 1,
        panel: () => hud.company(company, cords),
      });
      tagHits(tambo.hits, st.id);
      zones.push({ id: st.id, label, x: pose.position.x, z: pose.position.z, r: 9 });
      continue;
    }
    if (st.kind === "bridge") {
      bridge = buildBridge(env, st);
      activeBridge = bridge;
      root.add(bridge.group);
      register(bridge.colliders, bridge.walkables);
      fronts.set(st.id, bridge.center.clone());
      for (const s of bridge.spots) {
        spots.push({
          id: `art:${s.artifact.id}`,
          kind: "artifact",
          x: s.position.x,
          z: s.position.z,
          r: s.r,
          prompt: "qn.read",
          priority: 2,
          panel: () => hud.artifact(s.artifact),
        });
      }
      bridge.hits.forEach((h, i) => {
        tagHits([h], `art:${bridge!.spots[i]!.artifact.id}`);
      });
      spots.push({
        id: st.id,
        kind: "info",
        x: bridge.start.x,
        z: bridge.start.z,
        r: 2.4,
        prompt: "qn.read",
        priority: 1,
        panel: () => hud.info(label, L("qn.bridge.lede")),
      });
      zones.push({ id: st.id, label, x: bridge.center.x, z: bridge.center.z, r: 10 });
      continue;
    }
    if (st.id === "build-1" || st.id === "build-2") {
      // Data stations (ambient/huerto.ts, ambient/khipu-board.ts) own these plots; keep the zone toast only.
      const p = env.stationPose(st.id).position;
      zones.push({ id: st.id, label, x: p.x, z: p.z, r: 8 });
      continue;
    }
    let place: Place;
    let panel: (() => HTMLElement) | undefined;
    switch (st.kind) {
      case "gate":
        place = buildGate(env, lang);
        panel = () =>
          hud.info(
            L("qn.gate.title"),
            L("qn.gate.lede"),
            Object.assign(document.createElement("p"), {
              className: "qn-sub",
              textContent: traveler
                ? `${named("qn.gate.named", "qn.gate.next")} ${L("qn.gate.next")}`
                : L("qn.gate.next"),
            }),
          );
        break;
      case "arcade":
        arcade = buildArcade(env, lang, frameOf(st).ground);
        place = arcade;
        panel = () => hud.info(label, L("qn.arcade.lede"));
        break;
      case "ai":
        place = buildIntihuatana(env, lang);
        panel = () => hud.ai();
        break;
      case "contact":
        house = buildHouse(env, lang, frameOf(st).ground);
        place = house;
        panel = () => hud.contact();
        break;
      default:
        place = buildPlot(env, st.id, lang);
        panel = () => hud.info(L("qn.soon.title"), L("qn.soon.lede"));
    }
    const pose = placeAt(place.group, st, st.kind === "build" ? 0.15 * st.side : 0);
    for (const e of place.extras) root.add(e);
    const focus = world(place.group, place.focus);
    const plaza = world(place.group, place.front);
    register(place.colliders(), [...place.walkables(), ...pathToTrail(plaza)]);
    fronts.set(st.id, plaza);
    torches.push(...place.torches);
    places.push({ id: st.id, place, focus });
    spots.push({
      id: st.id,
      kind: "info",
      x: focus.x,
      z: focus.z,
      r: place.radius,
      prompt: "qn.read",
      priority: 1,
      panel,
    });
    tagHits(place.hits, st.id);
    zones.push({ id: st.id, label, x: pose.position.x, z: pose.position.z, r: st.kind === "arcade" ? 12 : 8 });
    if (place === house) {
      const h = house;
      for (const hs of h.spots) {
        const w = world(h.group, hs.local);
        spots.push({
          id: `house:${hs.id}`,
          kind: "info",
          x: w.x,
          z: w.z,
          r: hs.r,
          prompt: "qn.read",
          priority: 2,
          panel:
            hs.id === "desk"
              ? () => hud.contact()
              : hs.id === "shelf"
                ? () =>
                    hud.info(
                      L("qn.house.shelf"),
                      L("qn.house.shelf.lede"),
                      hud.actions([{ label: L("qn.house.shelf.cta"), href: `/${lang}/blog/` }]),
                    )
                : () =>
                    hud.info(
                      L("qn.house.monitor"),
                      L("qn.house.monitor.lede"),
                      hud.actions([{ label: L("qn.house.monitor.cta"), href: `/${lang}/projects/` }]),
                    ),
        });
      }
    }
  }

  // ------------------------------------------------------------------ summit finale (trail end)
  {
    const p1 = env.trail.pointAt(1);
    const tg = env.trail.tangentAt(1);
    const dir = new THREE.Vector3(tg.x, 0, tg.z).normalize();
    const center = p1.clone().addScaledVector(dir, 3.5);
    center.y = env.heightAt(center.x, center.z);
    const yaw = Math.atan2(p1.x - center.x, p1.z - center.z);
    summit = buildSummit(env, localGround(env, center, yaw));
    summit.group.position.copy(center);
    summit.group.rotation.y = yaw;
    root.add(summit.group);
    const focus = world(summit.group, summit.focus);
    register(summit.colliders(), [...summit.walkables(), ...pathToTrail(focus)]);
    fronts.set("summit", world(summit.group, summit.front));
    places.push({ id: "summit", place: summit, focus });
    spots.push({
      id: "summit",
      kind: "info",
      x: focus.x,
      z: focus.z,
      r: summit.radius,
      prompt: "qn.read",
      priority: 1,
      panel: () => hud.summit(traveler || undefined),
    });
    tagHits(summit.hits, "summit");
    zones.push({ id: "summit", label: L("qn.summit.label"), x: center.x, z: center.z, r: 9 });
  }
  if (arcade) {
    arcade.cabinets.forEach((c, i) => {
      spots.push({
        id: `cab:${c.meta.slug}`,
        kind: "cabinet",
        x: c.world.x,
        z: c.world.z,
        r: 1.15,
        prompt: "qn.play",
        priority: 3,
        game: c.meta,
        cabinetIndex: i,
        panel: () => {
          const ul = document.createElement("ul");
          ul.className = "qn-help-list";
          for (const line of c.meta.controls[lang])
            ul.appendChild(Object.assign(document.createElement("li"), { textContent: line }));
          return hud.info(c.meta.title[lang], c.meta.tagline[lang], ul);
        },
      });
      tagHits([c.cab.group], `cab:${c.meta.slug}`);
    });
  }

  // ------------------------------------------------------------------ HUD
  const mapStations: MapStation[] = stationsInOrder().map((s) => {
    const p = fronts.get(s.id) ?? env.stationPose(s.id).position;
    const company = s.companyId ? COMPANIES.find((c) => c.id === s.companyId) : undefined;
    return { id: s.id, label: s.label[lang], color: company ? DYE[company.dye] : KIND_COLOR[s.kind], x: p.x, z: p.z };
  });
  {
    const sp = fronts.get("summit");
    if (sp) mapStations.push({ id: "summit", label: L("qn.summit.label"), color: "#e8b631", x: sp.x, z: sp.z });
  }
  const trailPts: Array<{ x: number; z: number }> = [];
  for (let i = 0; i <= 160; i++) {
    const p = env.trail.pointAt(i / 160);
    trailPts.push({ x: p.x, z: p.z });
  }
  let dismissed: string | null = null;
  const hud = createHud(hudRoot, lang, {
    onInteract: () => content.interact(),
    onPanelClose: (k) => {
      dismissed = k;
    },
    stations: mapStations,
    trail: trailPts,
  });

  // ------------------------------------------------------------------ night lighting
  // One warm light that always exists (no shader recompiles); it follows the nearest lit torch at night.
  const warm = new THREE.PointLight(C.torch, 0, 9, 1.6);
  warm.position.set(0, -100, 0);
  root.add(warm);
  let night: boolean | null = null;
  const setNight = (n: boolean) => {
    if (n === night) return;
    night = n;
    for (const t of torches) t.set(n);
    house?.setNight(n);
    hud.setNight(n);
  };
  let interiorId: string | null = null;
  let summitReached = false;
  const ctx: PlaceCtx = { avatar: new THREE.Vector3(), camera: env.camera };

  // ------------------------------------------------------------------ game overlay
  let gameDispose: (() => void) | null = null;
  let gameToken = 0;
  const emitGame = (open: boolean) => window.dispatchEvent(new CustomEvent("world:game", { detail: { open } }));
  const openGame = (meta: GameMeta) => {
    if (content.gameOpen) return;
    content.gameOpen = true;
    const token = ++gameToken;
    const host = hud.openGame(meta.title[lang]);
    emitGame(true);
    mountCabinet(host, meta, lang)
      .then((d) => {
        if (token !== gameToken || !content.gameOpen) {
          d();
          return;
        }
        gameDispose = d;
        host.querySelector<HTMLElement>(".cab-screen")?.focus({ preventScroll: true });
      })
      .catch(() => closeGame());
  };
  const closeGame = () => {
    if (!content.gameOpen) return;
    gameToken++;
    gameDispose?.();
    gameDispose = null;
    hud.closeGame();
    content.gameOpen = false;
    emitGame(false);
  };
  hud.onGameClose(closeGame);
  // Core stops routing keys while a game is open, so content closes the overlay on Esc itself
  // (capture phase, before the game shell turns Esc into "pause").
  const onGameKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !content.gameOpen) return;
    e.preventDefault();
    e.stopPropagation();
    closeGame();
  };
  window.addEventListener("keydown", onGameKey, true);

  // ------------------------------------------------------------------ tap to read (raycast)
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down: { x: number; y: number; t: number } | null = null;
  const avatarPos = new THREE.Vector3();
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onUp = (e: PointerEvent) => {
    const d0 = down;
    down = null;
    if (!d0 || content.gameOpen) return;
    if (!(e.target instanceof HTMLCanvasElement)) return;
    if (Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 8 || performance.now() - d0.t > 450) return;
    const rect = e.target.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, env.camera);
    raycaster.far = 40;
    const hit = raycaster.intersectObjects(hitRoots, true)[0];
    if (!hit) return;
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.spotId) o = o.parent;
    const spot = o ? spots.find((s) => s.id === o!.userData.spotId) : undefined;
    if (!spot) return;
    const dist = Math.hypot(spot.x - avatarPos.x, spot.z - avatarPos.z);
    if (dist > spot.r + 4) {
      const zone = zones.find((z) => spot.id === z.id || spot.id.startsWith("art:") || spot.id.startsWith("cab:"));
      hud.toast(zone?.label ?? "");
      return;
    }
    if (spot.game) openGame(spot.game);
    else if (spot.panel) {
      dismissed = null;
      forced = spot.id;
      hud.panel(spot.id, spot.panel);
    }
  };
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });

  // ------------------------------------------------------------------ frame update
  let active: Spot | null = null;
  let forced: string | null = null;
  let zoneId: string | null = null;
  const pickSpot = (x: number, z: number) => {
    let best: Spot | null = null;
    let bestScore = Infinity;
    for (const s of spots) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d > s.r) continue;
      const score = d - s.priority * 10;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  };

  const content: Content & { gameOpen: boolean; debugSpots(): Array<{ id: string; x: number; z: number }> } = {
    gameOpen: false,
    /** Dev/test aid: interactive spot positions (world). */
    debugSpots: () => spots.map((s) => ({ id: s.id, x: s.x, z: s.z })),
    update(dt, avatar, t) {
      avatarPos.copy(avatar);
      setNight(env.sky.isNight());

      // Zone toast (station name) on entering.
      let z: (typeof zones)[number] | null = null;
      let zd = Infinity;
      for (const zz of zones) {
        const d = Math.hypot(zz.x - avatar.x, zz.z - avatar.z);
        if (d < zz.r && d < zd) {
          zd = d;
          z = zz;
        }
      }
      if ((z?.id ?? null) !== zoneId) {
        zoneId = z?.id ?? null;
        if (z) hud.toast(z.label);
      }

      // Nearest interactive spot.
      const s = pickSpot(avatar.x, avatar.z);
      if (s?.id !== active?.id) {
        active = s;
        if (forced && s?.id !== forced) forced = null;
        if (!s) dismissed = null;
        else if (dismissed && dismissed !== s.id) dismissed = null;
      }
      if (!content.gameOpen) {
        if (active?.panel && dismissed !== active.id) hud.panel(active.id, active.panel);
        else if (!forced) hud.panel(null);
        const panelOpen = hud.panelKey() === active?.id;
        hud.prompt(active && (active.kind === "cabinet" || !panelOpen) ? `${L(active.prompt)}` : null);
      }
      arcade?.focusCabinet(active?.kind === "cabinet" ? (active.cabinetIndex ?? null) : null);

      // Station animations.
      for (const tb of tambos) {
        const d = Math.hypot(tb.focus.x - avatar.x, tb.focus.z - avatar.z);
        tb.tambo.khipu.update(dt, t, d < 3.8);
        tb.tambo.torch.update(t);
      }
      ctx.avatar.copy(avatar);
      for (const p of places) p.place.update(dt, t, Math.hypot(p.focus.x - avatar.x, p.focus.z - avatar.z), ctx);
      // Interiors: tell the core (camera hint) when the traveler enters or leaves one.
      const inId = house?.inside ? "house" : arcade?.group.userData.inside ? "arcade" : null;
      if (inId !== interiorId) {
        const was = interiorId;
        interiorId = inId;
        window.dispatchEvent(new CustomEvent("world:interior", { detail: { inside: !!inId, id: inId ?? was } }));
        if (inId === "house") hud.toast(named("qn.house.welcome.named", "qn.house.welcome"));
      }
      // Summit finale: confetti + toast the first time.
      if (!summitReached && active?.id === "summit") {
        summitReached = true;
        summit?.celebrate();
        hud.toast(L("qn.summit.toast"));
      }
      bridge?.update(dt, t, active?.kind === "artifact" ? active.id.slice(4) : null);

      // Warm light follows the nearest torch at night.
      if (night) {
        let best: Torch | null = null;
        let bd = 14;
        const wp = new THREE.Vector3();
        for (const tc of torches) {
          tc.group.getWorldPosition(wp);
          const d = Math.hypot(wp.x - avatar.x, wp.z - avatar.z);
          if (d < bd) {
            bd = d;
            best = tc;
          }
        }
        if (best) {
          best.group.getWorldPosition(warm.position);
          warm.position.y += 2.0;
          warm.intensity = 6 + Math.sin(t * 11) * 0.6;
        } else warm.intensity = 0;
      } else warm.intensity = 0;

      hud.map(avatar.x, avatar.z, zoneId);
    },
    interact() {
      if (content.gameOpen) return;
      if (!active) return;
      if (active.kind === "cabinet" && active.game) {
        openGame(active.game);
        return;
      }
      if (!active.panel) return;
      if (hud.panelKey() === active.id) {
        dismissed = active.id;
        hud.panel(null);
      } else {
        dismissed = null;
        hud.panel(active.id, active.panel);
      }
    },
    escape() {
      if (content.gameOpen) {
        closeGame();
        return true;
      }
      if (hud.closeTop()) return true;
      const k = hud.panelKey();
      if (k) {
        dismissed = k;
        forced = null;
        hud.panel(null);
        return true;
      }
      return false;
    },
    tourStops() {
      const stops = stationsInOrder().map((s) => ({
        id: s.id,
        position: (fronts.get(s.id) ?? env.stationPose(s.id).position).clone(),
      }));
      const sp = fronts.get("summit");
      if (sp) stops.push({ id: "summit", position: sp.clone() });
      return stops;
    },
    dispose() {
      closeGame();
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("world:traveler", onTraveler);
      window.removeEventListener("keydown", onGameKey, true);
      for (const tb of tambos) tb.tambo.dispose();
      for (const p of places) {
        for (const e of p.place.extras) e.removeFromParent();
        p.place.dispose();
      }
      bridge?.dispose();
      activeBridge = null;
      warm.removeFromParent();
      hud.dispose();
      root.removeFromParent();
    },
  };
  if (import.meta.env?.DEV) (window as unknown as { __qnContent?: unknown }).__qnContent = content;
  return content;
};
