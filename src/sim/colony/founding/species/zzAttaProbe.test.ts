import { expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { setClimateOverride } from '../../envAdapter';
import { phase, queen } from '../testkit';

it('probe', () => {
  const sim = makeTestSim({ species: 'atta-texana', sizeBu: 128, seed: 3 });
  setClimateOverride(sim, { chamberTemp: () => 24, pointTemp: () => 24, rh: () => 0.85 });
  sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
  let last = '';
  const out: string[] = [];
  for (let t = 0; t < 24000; t++) {
    sim.tick();
    const p = phase(sim);
    const op = sim.state.player.opening!;
    if (p !== last || t % 1000 === 0) {
      const q = queen(sim);
      const n = sim.state.nests[0];
      out.push([t, p, JSON.stringify(op.garden), 'q', q.chamberId, q.medium, Math.round(q.pos.y), 'ents', JSON.stringify(n.entrances.map((e) => e.status)), 'ch', n.chambers.map((c) => c.type).join(','), 'res', q.queen?.founding?.reserveLoads.toFixed(2), 'sg', q.bb['fd.sg'], q.bb['fd.sgStrat'], q.bb['fd.sgPlugs'], q.bb['fd.sgTotal'], q.bb['fd.sgChanges'], 'step', q.bb['fd.autoStep'], 'poss', sim.state.player.possessedAntId === q.id, 'nav', q.nav.status, 'act', q.action?.id ?? '-'].join(' '));
      last = p;
    }
    if (p === 'timelapse' || p === 'failed') break;
  }
  expect(out.join('\n')).toBe('');
});
