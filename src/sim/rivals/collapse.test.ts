// Killing a rival queen collapses that colony (acceptance 4, App. E 19): queen killed -> orphaned (events), births
// stop, the orphan decline, `rival-destroyed` when N < 5, relations dropped, agents wander and die, the nest stays
// as an abandoned cavity, and its territory fades. The rivals systems alone (no walking needed).
import { describe, expect, it } from 'vitest';
import { commandsSystem } from '@/sim/systems';
import { behaviourSystem, lifecycleSystem } from '@/sim/ants';
import { TERR_CLAIM_MIN } from '@/sim/balance/combat';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { rivalsSystem, rivalsTickSystem } from './index';
import { rmod, slotOf } from './state';
import { record, rivalSim, rivalsOf } from './testkit';

const LONG = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FOUNDRESS_LONG;
const systems = [commandsSystem, behaviourSystem, rivalsTickSystem, rivalsSystem, lifecycleSystem];

describe('queen death and collapse', () => {
  it('a killed queen orphans the colony; births stop; N declines 0.18 per gd; destroyed below 5', () => {
    const sim = rivalSim({ rivals: [{ species: 'lasius-niger', dx: 90, dz: 0 }], systems });
    sim.tick();
    const r = rivalsOf(sim)[0];
    const ev = record(sim, ['rival-queen-killed', 'rival-orphaned', 'rival-destroyed']);
    sim.enqueue({ type: 'cheat.setRival', colonyId: r.id, values: { N: 100, B: 0, C_s: 200, P_s: 40 } });
    sim.enqueue({ type: 'cheat.killQueen', colonyId: r.id, cause: 'combat' });
    // align to an hourly update, then one game day
    while (sim.state.tick % TICKS_PER_HOUR !== 0) sim.tick();
    for (let i = 0; i < 30; i++) sim.tick();
    sim.events.flush();
    expect(ev.map((e) => e.type)).toEqual(['rival-queen-killed', 'rival-orphaned']);
    expect(r.rival.orphaned).toBe(true);
    const n0 = r.rival.n;
    for (let i = 0; i < TICKS_PER_DAY; i++) sim.tick();
    expect(r.rival.b).toBe(0); // no births
    expect(r.rival.n / n0).toBeCloseTo(Math.pow(1 - 0.18 / 24, 24), 2);
    // drop to the threshold: destroyed at the next hourly update below 5
    sim.enqueue({ type: 'cheat.setRival', colonyId: r.id, values: { N: 5.05 } });
    for (let i = 0; i < 3 * TICKS_PER_HOUR; i++) sim.tick();
    sim.events.flush();
    expect(ev.map((e) => e.type)).toContain('rival-destroyed');
    expect(sim.stores.colonies.get(r.id)).toBeUndefined();
    expect(sim.state.rivals.relations.some((x) => x.a === r.id || x.b === r.id)).toBe(false);
    expect(rmod(sim.state).abandonedNests).toContain(r.nestIds[0] ?? -2);
    // agents left outside wander and die within 0.5 gd
    const agents = () => sim.state.ants.filter((a) => a.alive && a.colony === r.id).length;
    for (let i = 0; i < 0.55 * TICKS_PER_DAY; i++) sim.tick();
    expect(agents()).toBe(0);
  }, 60_000);

  it.skipIf(!LONG)('App. E 19 in full: N 100 -> destroyed, territory below CLAIM_MIN by then', () => {
    const sim = rivalSim({ rivals: [{ species: 'lasius-niger', dx: 90, dz: 0 }], systems });
    sim.tick();
    const r = rivalsOf(sim)[0];
    const slot = slotOf(sim.state, r.id);
    sim.enqueue({ type: 'cheat.setRival', colonyId: r.id, values: { N: 100, B: 0, C_s: 200, P_s: 40 } });
    sim.enqueue({ type: 'cheat.killQueen', colonyId: r.id, cause: 'combat' });
    const ev = record(sim, ['rival-destroyed']);
    let days = 0;
    while (ev.length === 0 && days < 30) { for (let i = 0; i < TICKS_PER_DAY; i++) sim.tick(); sim.events.flush(); days++; }
    expect(ev.length).toBe(1);
    const t = sim.state.rivals.territory;
    let maxMark = 0;
    for (let c = 0; c < t.w * t.h; c++) maxMark = Math.max(maxMark, t.marks[c * t.slots + slot]);
    // eslint-disable-next-line no-console
    console.log(`E19: destroyed after ${days} gd; highest mark of its slot ${maxMark.toFixed(1)}`);
    expect(maxMark).toBeLessThan(TERR_CLAIM_MIN);
  }, 600_000);
});
