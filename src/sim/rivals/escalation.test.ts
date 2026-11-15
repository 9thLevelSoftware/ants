// Escalation and relation states (GDD 05 §3.7): the state table, App. E 18 (war within one hourly update from
// E 31, truce when E < 15 about 1.05 gd later, tension or skirmish 1 gd after that), gains and the
// difficulty divisor, truce cap, winter and the N >= 50 condition for war.
import { describe, expect, it } from 'vitest';
import type { RivalRelation } from '@/sim/types';
import { commandsSystem } from '@/sim/systems';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { rivalsSystem, rivalsTickSystem } from './index';
import { addEscalation, ensureRelation, nextState, relationOf } from './relations';
import { record, rivalSim, rivalsOf } from './testkit';

function rel(state: RivalRelation['state'], e: number, since = 0): RivalRelation {
  return { a: 1, b: 2, state, e, stateSinceTick: since, warFront: [] };
}
const F = { nA: 300, nB: 300, winter: false };

describe('relation state table', () => {
  it('climbs through the states in table order within one update', () => {
    expect(nextState(rel('peace', 2), F, 0, -1)).toBe('peace');
    expect(nextState(rel('peace', 3), F, 0, -1)).toBe('tension');
    expect(nextState(rel('peace', 10), F, 0, -1)).toBe('skirmish');
    expect(nextState(rel('peace', 31), F, 0, -1)).toBe('war');
  });
  it('falls back below the lower thresholds', () => {
    expect(nextState(rel('tension', 1.4), F, 0, -1)).toBe('peace');
    expect(nextState(rel('skirmish', 5.9), F, 0, -1)).toBe('tension');
    expect(nextState(rel('war', 14.9, 0), F, 100, 0)).toBe('truce');
  });
  it('war needs both N >= 50 and no winter', () => {
    expect(nextState(rel('skirmish', 40), { ...F, nB: 49 }, 0, -1)).toBe('skirmish');
    expect(nextState(rel('skirmish', 40), { ...F, winter: true }, 0, -1)).toBe('skirmish');
  });
  it('a war of 1.5 gd without a claim change ends in truce; truce lasts 1 gd', () => {
    const d = TICKS_PER_DAY;
    expect(nextState(rel('war', 40, 0), F, 1.4 * d, 0)).toBe('war');
    expect(nextState(rel('war', 40, 0), F, 1.5 * d, 0)).toBe('truce');
    expect(nextState(rel('war', 40, 0), F, 1.5 * d, 0.5 * d)).toBe('war'); // the claim changed half a day in
    expect(nextState(rel('truce', 20, 0), F, 0.9 * d, -1)).toBe('truce');
    expect(nextState(rel('truce', 12, 0), F, 1.0 * d, -1)).toBe('skirmish');
    expect(nextState(rel('truce', 8, 0), F, 1.0 * d, -1)).toBe('tension');
  });
});

describe('escalation gains', () => {
  it('gains are divided by warThresholdMult (gentle 1.5, harsh 0.75); truce caps E at 25', () => {
    for (const [preset, expected] of [['gentle', 2], ['naturalist', 3], ['harsh', 4]] as const) {
      const sim = rivalSim({ preset, rivals: [{ species: 'lasius-niger', dx: 100, dz: 0 }], systems: [commandsSystem] });
      const r = rivalsOf(sim)[0];
      addEscalation(sim, sim.state.colonies[0].id, r.id, 3);
      expect(ensureRelation(sim.state, sim.state.colonies[0].id, r.id).e).toBeCloseTo(expected);
    }
    const sim = rivalSim({ rivals: [{ species: 'lasius-niger', dx: 100, dz: 0 }], systems: [commandsSystem] });
    const r = rivalsOf(sim)[0];
    const x = ensureRelation(sim.state, sim.state.colonies[0].id, r.id);
    x.state = 'truce';
    addEscalation(sim, sim.state.colonies[0].id, r.id, 100);
    expect(x.e).toBe(25);
  });
});

describe('App. E 18: escalation to war and truce', () => {
  it('E 31 -> war within one hourly update; truce about 1.05 gd later; tension or skirmish 1 gd after that', () => {
    // two established rivals far apart (no contested cells), summer, only the rivals systems
    const sim = rivalSim({
      sizeBu: 640, rivals: [{ species: 'lasius-niger', dx: -230, dz: -230 }, { species: 'tetramorium-immigrans', dx: 230, dz: 230 }],
      systems: [commandsSystem, rivalsTickSystem, rivalsSystem],
    });
    const [a, b] = rivalsOf(sim);
    expect(a.rival.n).toBeGreaterThanOrEqual(50);
    expect(b.rival.n).toBeGreaterThanOrEqual(50);
    const ev = record(sim, ['rival-relation-changed']);
    sim.enqueue({ type: 'cheat.setRelation', a: a.id, b: b.id, e: 31, state: null });
    for (let i = 0; i < TICKS_PER_HOUR + 1; i++) sim.tick();
    expect(relationOf(sim, a.id, b.id)).toBe('war');
    const warTick = sim.state.tick;
    let truceTick = -1, after = '';
    for (let i = 0; i < 2.5 * TICKS_PER_DAY; i++) {
      sim.tick();
      const s = relationOf(sim, a.id, b.id);
      if (truceTick < 0 && s === 'truce') truceTick = sim.state.tick;
      if (truceTick >= 0 && sim.state.tick - truceTick === TICKS_PER_DAY + TICKS_PER_HOUR) { after = s; break; }
    }
    const gd = (truceTick - warTick) / TICKS_PER_DAY;
    expect(gd).toBeGreaterThan(0.95);
    expect(gd).toBeLessThan(1.15);
    expect(['tension', 'skirmish']).toContain(after);
    const changes = ev.filter((e) => e.type === 'rival-relation-changed').map((e) => (e as { to: string }).to);
    expect(changes.slice(0, 2)).toEqual(['war', 'truce']);
  }, 60_000);
});
