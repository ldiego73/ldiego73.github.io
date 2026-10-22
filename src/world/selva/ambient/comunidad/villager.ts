/**
 * A villager of the Antisuyu community on the shared characters: an `Npc` (../../../ambient/people/npc.ts: a
 * member of the community's one HumanCrowd, the human animation controller, a creatures Body, the old Person
 * locomotion API) dressed from ./dress.ts. Behaviours move it (`seek`, `place`, `face`), pick an action
 * (`p.anim.act("swim")`, "weave", "carry-shoulder"…) and call `p.commit(ctx)` once per frame.
 *
 * `reveal` puts an active villager back on screen after `hide()` (a group leaving and re-entering the view
 * distance): `Npc.setActive` returns early while the person is already active, so it would stay hidden.
 */
import type * as THREE from "three";
import { Npc } from "../../../ambient/people/npc";
import type { HumanCrowd } from "../../../characters/crowd";
import type { HeldProps, PropHandle, PropKind } from "../../../characters/props";
import { type DressOpts, dressOf, heightJitter, SPEC, type Who } from "./dress";

export interface VillagerOpts extends DressOpts {
  /** creatures kind ("villager", "child", "walker", "boatman", "player"). */
  kind: string;
  who: Who;
  r: () => number;
  radius: number;
  seed: number;
  scale?: number;
}

/** Props each villager holds (shown with it on `reveal`). */
const held = new WeakMap<Npc, PropHandle[]>();

export function villager(crowd: HumanCrowd, o: VillagerOpts): Npc {
  return new Npc({
    kind: o.kind,
    crowd,
    spec: SPEC[o.who],
    palette: dressOf(o.who, o.r, o),
    scale: o.scale ?? heightJitter(o.who, o.r),
    radius: o.radius,
    seed: o.seed,
  });
}

/** Give a villager a held prop (a paddle, a banana bunch, a back basket…), remembered for `reveal`. */
export function give(p: Npc, props: HeldProps, kind: PropKind, tint?: THREE.ColorRepresentation): PropHandle {
  const h = p.hold(props, kind, tint);
  const list = held.get(p) ?? [];
  list.push(h);
  held.set(p, list);
  return h;
}

/** Show an active villager again after `hide()` (and its props). */
export function reveal(p: Npc) {
  if (!p.active) return;
  p.member.show(true);
  for (const h of held.get(p) ?? []) h.show(true);
}
