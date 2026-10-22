/**
 * The moonlit rim of the jungle's animals and people: one uniform shared by the characters' materials
 * (../../characters/animals/night.ts, `setNightRim` in ../../characters/index.ts) set once per frame from the
 * sky's night amount, so the jaguar, the tapir, the caimans and the villagers still read after dusk, as the old
 * jungle rigs' own rim did. Draws nothing.
 */
import { setAnimalNight } from "../../characters/animals/night";
import type { Ambient, CreateAmbient } from "../../contract";
import { nightAmount } from "./wild/logic";

export const create: CreateAmbient = (env): Ambient => {
  setAnimalNight(nightAmount(env.sky.time()));
  return {
    update() {
      setAnimalNight(nightAmount(env.sky.time()));
    },
    dispose() {
      setAnimalNight(0);
    },
  };
};
