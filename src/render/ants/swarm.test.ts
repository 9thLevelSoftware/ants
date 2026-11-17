// The males' swarm at the lek (render-only): shown while the flight climbs to and stays at the lek, deterministic,
// winged males around the lek centre with negative ids; and the sim reader appends them to the ants it reads.
import { describe, expect, it } from 'vitest';
import { AntFlag } from '@/sim/types';
import { Swarm, SWARM_ID0 } from './swarm';
import { SimReader } from './simAdapter';
import { SWARM } from './tuning';

const lek = { x: 1000, y: 300, z: 1000 };

describe('Swarm', () => {
  it('shows only in ascend / lek / mate, winged males near the lek, the same for the same tick', () => {
    const s = new Swarm();
    expect(s.update(null, 10, 0.1, 1, 4)).toEqual([]);
    expect(s.update({ phase: 'descend', lek, startTick: 0 }, 10, 0.1, 1, 4)).toEqual([]);
    const a = s.update({ phase: 'lek', lek, startTick: 0 }, 50, 0.1, 1, 4).map((m) => ({ ...m.pos }));
    const males = s.update({ phase: 'lek', lek, startTick: 0 }, 50, 0.1, 1, 4);
    expect(males.length).toBe(SWARM.count);
    expect(males.map((m) => m.pos)).toEqual(a);
    for (const m of males) {
      expect(m.caste).toBe('male');
      expect(m.flags & AntFlag.WINGED).toBeTruthy();
      expect(m.id).toBeLessThanOrEqual(SWARM_ID0);
      expect(Math.hypot(m.pos.x - lek.x, m.pos.z - lek.z)).toBeLessThanOrEqual(SWARM.radiusBu[1] * 4 + 1e-6);
      expect(Math.hypot(m.fwd.x, m.fwd.y, m.fwd.z)).toBeCloseTo(1, 6);
    }
  });

  it('the sim reader appends the swarm during the flight and not otherwise', () => {
    const flight = { phase: 'lek', lek, startTick: 0 };
    const col = { id: 1, species: 'lasius-niger' as const, lifecycle: { flight: null as typeof flight | null } };
    const sim = { state: { tick: 20, ants: [], brood: [], items: [], colonies: [col], player: { possessedAntId: -1 } } };
    const r = new SimReader(sim);
    r.beginFrame();
    expect(r.ants.length).toBe(0);
    col.lifecycle.flight = flight;
    r.beginFrame();
    expect(r.ants.length).toBe(SWARM.count);
  });
});
