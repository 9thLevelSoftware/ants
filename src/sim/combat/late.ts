// Functions of heavier modules that combat calls at run time, bound late (import-cycle hygiene).
//
// Why: the creature module's ports import this module; if combat imported the ant actions, the colony or the
// ecology index statically, loading the creature module first (its own tests do) would evaluate the ecology index
// in the middle of the creature index and break its top-level wiring. So combat only imports light modules, and
// wiring.ts (imported by the fight behaviour, which every Sim loads through the systems list) provides the rest.

import type { Ant, Colony, DeathCause, ReasonCode, Sim, Task, ActionId, TargetRef } from '@/sim/types';
import type { ActionDef } from '@/sim/ants/actions/types';
import type { GuardEngage } from '@/sim/ants/behaviours/nest/guard';

export interface LateDeps {
  /** ants/lifecycle: death with a corpse item. */
  processAntDeath(sim: Sim, antId: number, cause: DeathCause): number;
  /** The action library's table of primitive definitions (read; `dodge` is added by combat). */
  actionDefs: Partial<Record<ActionId, ActionDef>>;
  begin(sim: Sim, ant: Ant, id: ActionId, target: TargetRef | null): boolean;
  /** colony allocation: task switch with exact headcounts; requests; the waiting-forager test. */
  switchTask(sim: Sim, col: Colony, ant: Ant, to: Task, reason: ReasonCode): void;
  requestTask(sim: Sim, ant: Ant, task: Task, reason: ReasonCode): boolean;
  isWaitingForager(ant: Ant): boolean;
  /** nest guard behaviour: its combat hook. */
  registerGuardEngage(sim: Sim, fn: GuardEngage | null): void;
}

let deps: LateDeps | null = null;

export function provideDeps(d: LateDeps): void {
  deps = d;
}

export function dep(): LateDeps {
  if (!deps) throw new Error('combat: src/sim/combat/wiring.ts was not loaded (the fight behaviour imports it)');
  return deps;
}
