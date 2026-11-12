// Brood entity: egg, larva, pupa (GDD 02 §2, GDD 07 A.2). Physically carried and fed.

import type { Vec3 } from '@/core/math/vec3';
import type { BroodStage, Caste } from './ids';

/** Bit flags in `Brood.flags`. */
export const BroodFlag = {
  FIRST_BROOD: 1 << 0,
  DIAPAUSE: 1 << 1,
  /** Pupa ready to eclose, waiting for assistance. */
  READY: 1 << 2,
  NANITIC: 1 << 3,
  MINIM: 1 << 4,
  /** Laid by workers in an orphaned colony (haploid male). */
  WORKER_LAID: 1 << 5,
} as const;

export interface Brood {
  id: number;
  alive: boolean;
  colony: number;
  stage: BroodStage;
  /** Caste this brood will become. */
  destined: Caste;
  /** BroodFlag bits. */
  flags: number;
  /** Progress through the current stage, 0..1. */
  progress: number;
  /** Larval gut contents, loads. */
  gutC: number;
  gutP: number;
  /** Food received over the whole larval stage, loads. */
  fedC: number;
  fedP: number;
  /** Hunger 0..1 (feed request when high). */
  hunger: number;
  /** Ticks without food (starvation clock). */
  hungerTicks: number;
  /** Ticks with C but no P (protein starvation clock). */
  pStarveTicks: number;
  /** Tick last tended by a nurse. */
  lastTendedTick: number;
  /** mm; meaningful when not carried. */
  pos: Vec3;
  nestId: number;
  chamberId: number;
  /** Ant carrying it, -1 none. */
  carriedBy: number;
  laidTick: number;
  /** Tick the current stage began. */
  stageTick: number;
  /** Destined adult body length, BU (GDD 07). */
  destinedLengthBu: number;
  /** Share of animal protein in the diet 0..1 (Messor rule, GDD 07). */
  animalPShare: number;
}
