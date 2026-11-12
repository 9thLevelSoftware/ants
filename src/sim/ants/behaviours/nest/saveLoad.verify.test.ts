// Reviewer test (beh-nest, acceptance 8 determinism and the report's claim "a save/load replays exactly"): the
// in-nest behaviours keep their state in ant.state / stateTick / bb and rebuild their caches (nursery board, job
// lists, midden) from state, so a snapshot -> restore in the middle of a busy colony (brood, queen, dig plan) must
// continue exactly like the uninterrupted run.
import { describe, expect, it } from 'vitest';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { createPlan, validatePlan, wallSpots } from '@/sim/nest';
import { makeNestColony } from './testkit';

function busyColony() {
  const k = makeNestColony({
    workers: 30, stores: { c: 150, p: 100 },
    brood: [{ stage: 'egg', n: 8, chamber: 'nursery' }, { stage: 'larva', n: 8, chamber: 'nursery' }, { stage: 'pupa', n: 6, chamber: 'nursery', progress: 0.9 }],
  });
  for (const w of wallSpots(k.sim, k.nest.id, 400, 7)) {
    if (w.depthBu < 8) continue;
    const spec = {
      nestId: k.nest.id, kind: 'chamber' as const, chamberType: 'general' as const, size: 's' as const, priority: 'high' as const,
      confirmWarnings: true, anchor: { pos: w.pos, normal: w.normal },
    };
    if (validatePlan(k.sim, spec).ok && createPlan(k.sim, spec, 'player') > 0) break;
  }
  return k;
}

describe('reviewer: save -> restore -> continue (beh-nest)', () => {
  it('a restored colony continues exactly like the uninterrupted run', () => {
    const a = busyColony().sim;
    for (let t = 0; t < 1500; t++) a.tick();
    const b = createSim(restore(snapshot(a)).state, a.world);
    expect(stateHash(b.state)).toBe(stateHash(a.state));
    for (let t = 0; t < 1500; t++) { a.tick(); b.tick(); }
    const busy = a.stores.ants.list.filter((x) => x.alive && x.state.includes('.')).length;
    console.log('[verify save/load]', JSON.stringify({ busy, hashA: stateHash(a.state), hashB: stateHash(b.state) }));
    expect(busy).toBeGreaterThan(5);
    expect(stateHash(b.state)).toBe(stateHash(a.state));
  }, 600_000);
});
