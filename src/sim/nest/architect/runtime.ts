// Derived, never-persisted helpers of the architect, one set per Sim: counters for diagnostics and tests, and an
// optional probe that sees every plan request right before the architect creates it (tests re-validate it).
// Nothing here may change simulation results.

import type { PlanSpec, Sim } from '@/sim/types';
import type { NeedRequest } from './needs';

export interface ArchitectRuntime {
  /** Evaluations run, plans created, candidates the nest validator refused after the architect's own checks. */
  evaluations: number;
  created: number;
  createRefused: number;
  /** Placements that found no valid candidate. */
  noSite: number;
  withdrawn: number;
  failures: number;
  /** Called with each request the architect is about to create (tests). */
  probe: ((spec: PlanSpec, req: NeedRequest) => void) | null;
}

const RUNTIMES = new WeakMap<Sim, ArchitectRuntime>();

export function architectRuntime(sim: Sim): ArchitectRuntime {
  let rt = RUNTIMES.get(sim);
  if (!rt) {
    rt = { evaluations: 0, created: 0, createRefused: 0, noSite: 0, withdrawn: 0, failures: 0, probe: null };
    RUNTIMES.set(sim, rt);
  }
  return rt;
}
