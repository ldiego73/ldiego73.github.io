/**
 * Every species, by key. World code asks for animals by these keys (`createAnimal("vicuna")`,
 * `createHerd("llama", …)`); the harness lines them all up.
 */
import type { AnimalSpec } from "../spec";
import { BIRDS } from "./birds";
import { ALPACA, GUANACO, LLAMA, VICUNA } from "./camelids";
import { MAMMALS } from "./mammals";
import { MARINE } from "./marine";
import { REPTILES } from "./reptiles";

export const SPECIES = {
  llama: LLAMA,
  alpaca: ALPACA,
  vicuna: VICUNA,
  guanaco: GUANACO,
  ...MAMMALS,
  ...REPTILES,
  ...BIRDS,
  ...MARINE,
} satisfies Record<string, AnimalSpec>;

export type SpeciesKey = keyof typeof SPECIES;

export const speciesOf = (key: SpeciesKey | string): AnimalSpec => {
  const s = (SPECIES as Record<string, AnimalSpec>)[key];
  if (!s) throw new Error(`animals: unknown species ${key}`);
  return s;
};
