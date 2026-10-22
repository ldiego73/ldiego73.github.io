/**
 * A villager of the Antisuyu community on the shared characters: an `Npc` (../../../ambient/people/npc.ts: a
 * member of the community's one HumanCrowd, the human animation controller, a creatures Body, the old Person
 * locomotion API) dressed from ./dress.ts. Behaviours move it (`seek`, `place`, `face`), pick an action
 * (`p.anim.act("swim")`, "weave", "carry-shoulder"…, with `actArms` for a seated person's hands) and call
 * `p.commit(ctx)` once per frame; tools and loads are held props (`p.hold(props, "paddle")`).
 */
import { Npc } from "../../../ambient/people/npc";
import type { HumanCrowd } from "../../../characters/crowd";
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
