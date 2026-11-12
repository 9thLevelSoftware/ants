// Simulation invariants for soak runs and tests (architecture §5: no NaN, no ants inside solids, stores and
// counts never negative, state stays encodable). Pluggable: a module exports `invariants` from its index.ts and
// collectInvariants() picks it up through SIM_MODULES, so nobody edits this file to add one.

import type { Sim, SimInvariant, Walker } from '@/sim/types';
import { SIM_MODULES } from '@/sim/systems';
import { snapshot } from '@/sim/save';

const finite = (v: { x: number; y: number; z: number }): boolean =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

function walkers(sim: Sim): { kind: string; id: number; w: Walker }[] {
  const out: { kind: string; id: number; w: Walker }[] = [];
  for (const a of sim.state.ants) if (a.alive) out.push({ kind: 'ant', id: a.id, w: a });
  for (const c of sim.state.creatures) if (c.alive) out.push({ kind: 'creature', id: c.id, w: c });
  return out;
}

/** No NaN or infinity in any walker's kinematic state. */
export const walkerFinite: SimInvariant = {
  name: 'walker-finite',
  check(sim, fail) {
    for (const { kind, id, w } of walkers(sim)) {
      if (!finite(w.pos) || !finite(w.up) || !finite(w.fwd) || !finite(w.vel) || !Number.isFinite(w.speed)) {
        fail(`${kind} ${id}: non-finite kinematics pos=${JSON.stringify(w.pos)}`);
      }
    }
  },
};

/**
 * The kernel's free-space invariant (docs/design/tdd/02-kernel.md §7): a walker never ends a step with
 * f < minClearanceFoot x footOffset; a falling walker is in free space.
 */
export const walkerFreeSpace: SimInvariant = {
  name: 'walker-free-space',
  check(sim, fail) {
    const minFrac = sim.kernel.walker.minClearanceFoot;
    for (const { kind, id, w } of walkers(sim)) {
      if (!finite(w.pos)) continue; // reported by walker-finite
      const f = sim.field.sample(w.pos);
      const min = w.medium === 'air' ? 0 : minFrac * w.footOffset;
      if (!(f >= min - 1e-9)) fail(`${kind} ${id}: f=${f.toFixed(4)} mm < ${min.toFixed(4)} (${w.medium}) at ${JSON.stringify(w.pos)}`);
    }
  },
};

/** Colony stores, crops, reserves and counters never negative or NaN. */
export const nonNegative: SimInvariant = {
  name: 'non-negative',
  check(sim, fail) {
    const bad = (v: number): boolean => !(v >= 0);
    for (const c of sim.state.colonies) {
      const s = c.stores;
      for (const [k, v] of [['c', s.c], ['p', s.p], ['toxin', s.toxin], ['inCrops.c', s.inCrops.c], ['inCrops.p', s.inCrops.p], ['livingAnts', c.livingAnts]] as const) {
        if (bad(v)) fail(`colony ${c.id}: ${k}=${v}`);
      }
    }
    for (const a of sim.state.ants) {
      if (!a.alive) continue;
      if (bad(a.cropC) || bad(a.cropP) || bad(a.energy) || bad(a.hp)) fail(`ant ${a.id}: crop ${a.cropC}/${a.cropP} energy ${a.energy} hp ${a.hp}`);
    }
    for (const b of sim.state.brood) if (b.alive && (bad(b.progress) || bad(b.fedC) || bad(b.fedP))) fail(`brood ${b.id}: progress ${b.progress} fed ${b.fedC}/${b.fedP}`);
    for (const s of sim.state.sources) if (s.alive && bad(s.units)) fail(`source ${s.id}: units ${s.units}`);
    for (const i of sim.state.items) if (i.alive && bad(i.count)) fail(`item ${i.id}: count ${i.count}`);
  },
};

/** The whole state encodes (the encoder rejects NaN / infinity and non-plain values). */
export const stateEncodes: SimInvariant = {
  name: 'state-encodes',
  check(sim, fail) {
    try {
      snapshot(sim);
    } catch (e) {
      fail((e as Error).message);
    }
  },
};

export const CORE_INVARIANTS: readonly SimInvariant[] = [walkerFinite, walkerFreeSpace, nonNegative, stateEncodes];

/** Core invariants plus every module's exported `invariants` (in module order). */
export function collectInvariants(): SimInvariant[] {
  const out = [...CORE_INVARIANTS];
  for (const m of SIM_MODULES) {
    const extra = (m.mod as { invariants?: readonly SimInvariant[] }).invariants;
    if (extra) out.push(...extra);
  }
  return out;
}

export interface InvariantViolation {
  tick: number;
  invariant: string;
  detail: string;
}

/** Runs the invariants once; violations are appended to `out` (returns how many were added). */
export function checkInvariants(sim: Sim, list: readonly SimInvariant[], out: InvariantViolation[]): number {
  const n0 = out.length;
  for (const inv of list) inv.check(sim, (detail) => out.push({ tick: sim.state.tick, invariant: inv.name, detail }));
  return out.length - n0;
}
