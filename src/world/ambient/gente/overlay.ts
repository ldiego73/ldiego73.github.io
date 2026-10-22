/**
 * Small helpers for the mountain's people on the shared characters (people/npc.ts): start an action, or an
 * arms-layer gesture over it, only when it changes (re-playing restarts its crossfade), so behaviours can
 * call them every frame with what the person should be doing now.
 *
 *   play(p, "sit-stool", { seat: 0.09 });   // the body
 *   playArms(p, "raise-hand");              // a hand up over the seated pose; playArms(p, "none") lowers it
 */
import type { Npc } from "../people/npc";

type Act = Parameters<Npc["anim"]["act"]>[0];
type Opts = Parameters<Npc["anim"]["act"]>[1];

export function play(p: Npc, a: Act, o?: Opts) {
  if (p.anim.action !== a) p.anim.act(a, o);
}

export function playArms(p: Npc, a: Act, o?: Opts) {
  if (p.anim.armsAction !== a) p.anim.actArms(a, o);
}
