// beh-nest acceptance 7 and 8 (determinism): a 5-game-day soak of the small-nest colony with brood, a dig plan and
// all real modules: no ant of an in-nest behaviour stays in a state beyond its timeout, the core invariants hold;
// a mutation guard (test double) proves that during the behaviour pass the world changes only inside action
// primitives (plus the reported care adapter, counted separately); same seed -> same state hash.
import { describe, expect, it } from 'vitest';
import type { Sim, System } from '@/sim/types';
import { ACTION_DEFS } from '@/sim/ants/actions';
import type { ActionDef } from '@/sim/ants/actions';
import { stateHash } from '@/sim/save/hash';
import { checkInvariants, collectInvariants, type InvariantViolation } from '@/sim/testing';
import { TICKS_PER_DAY } from '@/sim/time';
import { careEffects } from './careActs';
import { behaviours as nestBehaviours } from './index';
import { ownState, stateTimeoutTicks } from './fsm';
import { makeNestColony, type NestColony } from './testkit';
import { createPlan, validatePlan, wallSpots } from '@/sim/nest';

/** Timeouts act at the end of a running action or care act, so they may land this late, ticks. */
const OVERSTAY_SLACK = 120;

function colony(systems?: readonly System[]): NestColony {
  const k = makeNestColony({
    workers: 40, stores: { c: 150, p: 100 }, systems,
    brood: [
      { stage: 'egg', n: 10, chamber: 'nursery' }, { stage: 'larva', n: 10, chamber: 'nursery' },
      { stage: 'pupa', n: 10, chamber: 'nursery' },
    ],
  });
  for (const w of wallSpots(k.sim, k.nest.id, 400, 11)) {
    if (w.depthBu < 8) continue;
    const spec = {
      nestId: k.nest.id, kind: 'chamber' as const, chamberType: 'general' as const, size: 's' as const,
      priority: 'normal' as const, confirmWarnings: true, anchor: { pos: w.pos, normal: w.normal },
    };
    if (validatePlan(k.sim, spec).ok && createPlan(k.sim, spec, 'player') > 0) break;
  }
  return k;
}

/** A cheap order-sensitive hash of everything an ant may only change through a primitive. */
function worldDigest(sim: Sim): number {
  let h = 2166136261;
  const mix = (v: number) => { h = Math.imul(h ^ Math.round(v * 1e6), 16777619) >>> 0; };
  mix(sim.carve.version);
  for (const it of sim.state.items) {
    mix(it.id); mix(it.alive ? 1 : 0); mix(it.pos.x); mix(it.pos.y); mix(it.pos.z); mix(it.c); mix(it.p);
    mix(it.carrierIds.length); for (const c of it.carrierIds) mix(c);
  }
  for (const b of sim.state.brood) {
    mix(b.id); mix(b.alive ? 1 : 0); mix(b.pos.x); mix(b.pos.y); mix(b.pos.z); mix(b.carriedBy); mix(b.gutC); mix(b.gutP);
    mix(b.lastTendedTick); mix(b.chamberId);
  }
  for (const a of sim.state.ants) {
    mix(a.id); mix(a.alive ? 1 : 0); mix(a.cropC); mix(a.cropP); mix(a.energy); mix(a.carry.id);
    if (a.queen) { mix(a.queen.gut.c); mix(a.queen.gut.p); mix(a.queen.eggBudget); }
  }
  for (const c of sim.state.colonies) { mix(c.stores.c); mix(c.stores.p); }
  return h;
}

interface Guard { direct: number; primitive: number; adapter: number; restore: () => void; inPass: boolean; cur: number }

/**
 * The mutation-counting double: every action primitive hook and the care adapter's effect are wrapped, and so are
 * the in-nest behaviours' enter / update / exit. While a behaviour function runs, a digest change that did not
 * happen inside a primitive or the adapter is a direct mutation by behaviour code.
 */
function installGuard(sim: Sim): Guard {
  const g: Guard = { direct: 0, primitive: 0, adapter: 0, restore: () => {}, inPass: false, cur: 0 };
  const undo: (() => void)[] = [];
  const patch = <T extends object>(obj: T, key: keyof T, make: (fn: (...a: unknown[]) => unknown) => (...a: unknown[]) => unknown) => {
    const fn = obj[key] as unknown as ((...a: unknown[]) => unknown) | undefined;
    if (typeof fn !== 'function') return;
    (obj as Record<string, unknown>)[key as string] = make((...a) => fn.apply(obj, a));
    undo.push(() => { (obj as Record<string, unknown>)[key as string] = fn; });
  };
  // a sanctioned changer: counts its own changes; inside a behaviour call, changes before it are direct ones
  const sanctioned = (kind: 'primitive' | 'adapter') => (fn: (...a: unknown[]) => unknown) => (...args: unknown[]) => {
    const before = worldDigest(sim);
    if (g.inPass && before !== g.cur) g.direct++;
    const r = fn(...args);
    const after = worldDigest(sim);
    if (after !== before) g[kind]++;
    g.cur = after;
    return r;
  };
  for (const def of Object.values(ACTION_DEFS) as ActionDef[]) {
    for (const k of ['onBegin', 'effect', 'tick', 'onEnd'] as const) patch(def, k, sanctioned('primitive'));
  }
  patch(careEffects, 'apply', sanctioned('adapter'));
  const bracket = (fn: (...a: unknown[]) => unknown) => (...args: unknown[]) => {
    const outer = g.inPass;
    if (!outer) { g.inPass = true; g.cur = worldDigest(sim); }
    const r = fn(...args);
    if (!outer) { if (worldDigest(sim) !== g.cur) g.direct++; g.inPass = false; }
    return r;
  };
  for (const b of nestBehaviours) for (const k of ['enter', 'update', 'exit'] as const) patch(b, k, bracket);
  g.restore = () => { for (const u of undo.reverse()) u(); };
  return g;
}

describe('beh-nest soak (acceptance 7, 8)', () => {
  it('5 game days: no state overstays its timeout, invariants hold', () => {
    const k = colony();
    const { sim } = k;
    const inv = collectInvariants();
    const violations: InvariantViolation[] = [];
    const over: Record<string, number> = {};
    let maxAge = 0, maxAgeState = '';
    for (let t = 0; t < 5 * TICKS_PER_DAY; t++) {
      sim.tick();
      if (t % 50 !== 0) continue;
      for (const a of sim.stores.ants.list) {
        if (!a.alive || !ownState(a)) continue;
        const age = sim.state.tick - a.stateTick, limit = stateTimeoutTicks(a.state);
        if (age / limit > maxAge) { maxAge = age / limit; maxAgeState = a.state; }
        if (age > limit + OVERSTAY_SLACK) over[a.state] = (over[a.state] ?? 0) + 1;
      }
      if (t % 1000 === 0) checkInvariants(sim, inv, violations);
    }
    const states: Record<string, number> = {};
    for (const a of sim.stores.ants.list) states[a.task] = (states[a.task] ?? 0) + 1;
    console.log('[beh-nest AC7 soak]', JSON.stringify({
      ants: sim.stores.ants.list.length, brood: sim.stores.brood.list.length, over, maxAgeOverTimeout: +maxAge.toFixed(2), maxAgeState,
      violations: violations.slice(0, 5), tasks: states, plans: k.nest.digPlans.map((p) => p.status),
    }));
    expect(over).toEqual({});
    expect(violations).toEqual([]);
  }, 1_800_000);

  it('the world changes only through action primitives (mutation double) during 1 game day', () => {
    const k = colony();
    const g = installGuard(k.sim);
    try {
      for (let t = 0; t < TICKS_PER_DAY; t++) k.sim.tick();
    } finally {
      g.restore();
    }
    console.log('[beh-nest AC7 mutations]', JSON.stringify({ direct: g.direct, primitiveChanges: g.primitive, adapterChanges: g.adapter }));
    expect(g.primitive).toBeGreaterThan(100);
    expect(g.direct).toBe(0);
  }, 900_000);

  it('negative control: the double catches a behaviour that moves an item itself', () => {
    const k = colony();
    const idle = nestBehaviours.find((b) => b.task === 'idle')!;
    const update = idle.update;
    idle.update = (sim, ant) => {
      update(sim, ant);
      const it = sim.stores.items.list[0] ?? sim.stores.brood.list[0];
      if (it) it.pos = { x: it.pos.x + 1e-3, y: it.pos.y, z: it.pos.z };
    };
    const g = installGuard(k.sim);
    try {
      for (let t = 0; t < 100; t++) k.sim.tick();
    } finally {
      g.restore();
      idle.update = update;
    }
    expect(g.direct).toBeGreaterThan(0);
  }, 300_000);

  it('determinism: two runs from the same seed give the same state hash', () => {
    const a = colony(), b = colony();
    for (let t = 0; t < 3000; t++) { a.sim.tick(); b.sim.tick(); }
    expect(stateHash(a.sim.state)).toBe(stateHash(b.sim.state));
  }, 600_000);
});
