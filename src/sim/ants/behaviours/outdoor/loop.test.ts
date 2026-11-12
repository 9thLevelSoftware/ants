// The foraging loop with a source the colony already knows: departures, harvest by primitives, trail on the way
// home, unloading by trophallaxis / put-down, recruitment, route learning; and no world change outside a
// primitive (acceptance 6).

import { describe, expect, it } from 'vitest';
import { announce, countEvents, forageScenario, run, StateTracker, watchDirectMutations } from './testkit';

describe('foraging loop (known source)', () => {
  it('liquid: foragers fill crops at a spill, lay trail home and unload into the pool; all through primitives', () => {
    const { sim, col, entrance, sources } = forageScenario({
      sources: [{ kind: 'sugar', variant: 'sugary-spill', distBu: 80, bearingDeg: 0, units: 300 }],
    });
    announce(sim, col, sources[0]);
    const ev = countEvents(sim);
    const watch = watchDirectMutations(sim);
    const track = new StateTracker(sim);
    try {
      run(sim, 6000, 20, () => track.sample());
    } finally {
      watch.restore();
    }
    const mid = { x: entrance.pos.x + 40 * sim.world.bu, y: 0, z: entrance.pos.z };
    console.log('loop liquid', JSON.stringify(ev.n), 'trail@mid', sim.phero.sample(col.id, 'trail', mid).toFixed(2),
      'maxState', JSON.stringify(track.maxStateS), 'inside primitive calls', watch.insideCalls);
    expect(ev.n['delivery'] ?? 0).toBeGreaterThanOrEqual(5);
    expect(ev.n['recruit'] ?? 0).toBeGreaterThan(0);
    expect(watch.direct).toEqual([]);
    expect(watch.insideCalls).toBeGreaterThan(0);
  }, 120000);
});

describe('tend (Tier 1 honeydew sites) and the decision log', () => {
  it('tenders drink at a static honeydew-film site and unload; the inspect card explains with reason codes', async () => {
    const { requestTask } = await import('@/sim/colony');
    const { inspect } = await import('@/sim/ants');
    const { SYSTEMS } = await import('@/sim/systems');
    void SYSTEMS;
    const { sim, col, sources } = forageScenario({
      seed: 2, pinned: true,
      sources: [{ kind: 'honeydew', variant: 'honeydew-film', distBu: 60, bearingDeg: 45, units: 0.5 }],
    });
    announce(sim, col, sources[0]);
    const tenders = sim.state.ants.filter((a) => a.caste === 'worker').slice(0, 4);
    for (const a of tenders) requestTask(sim, a, 'tend', 'job:test');
    const ev = countEvents(sim, ['delivery']);
    const states = new Set<string>();
    run(sim, 4000, 10, () => {
      for (const a of tenders) {
        if (a.task !== 'tend') requestTask(sim, a, 'tend', 'job:test');
        if (a.state === 'tend.wait') a.activation = 1;
        states.add(a.state);
      }
    });
    const fromSite = ev.kept.filter((e) => e.type === 'delivery' && e.sourceId === sources[0].id).length;
    const card = inspect(sim, tenders[0].id)!;
    console.log('tend states', [...states].join(','), 'deliveries from the site', fromSite, 'decisions', JSON.stringify(card.decisions));
    expect(states.has('tend.solicit')).toBe(true);
    expect(fromSite).toBeGreaterThan(0);
    expect(card.decisions.length).toBeGreaterThan(0);
    expect(card.decisions.every((d) => d.reason !== 'unknown')).toBe(true);
  }, 120000);
});
