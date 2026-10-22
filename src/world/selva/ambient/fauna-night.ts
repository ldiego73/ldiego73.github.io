/**
 * The moonlit rim of the jungle's animals (and its people, once the characters carry it): one shared uniform
 * of the animal core (../../characters/animals/night.ts) set once per frame from the sky's night amount, so
 * the jaguar, the tapir and the caimans still read after dusk, as the old jungle rigs' own rim did. Draws
 * nothing.
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
