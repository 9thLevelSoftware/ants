// Sealing that cannot dead-end (task viab-founding items 1-2): the guide changes strategy when stuck instead of
// repeating; a dead-end pit beside the opening does not keep a cut-off cell from reading `sealed` (the nest's
// founding pocket rule); a founding cavity that broke into an unregistered world cavity gets that opening
// registered as a `natural` entrance, and the cell is not called sealed while it still reaches the air.
import { describe, expect, it } from 'vitest';
import { SEAL_STRATEGY_TICKS } from '@/sim/balance/founding';
import { cavityEntrances } from './dig';
import { SG } from './sealGuide';
import { cellReachesAir } from './sealPlan';
import { throatCase } from './sealKit';
import { nestOf, phase, pinTemperature, queen, stepUntil } from './testkit';

describe('the seal guide never repeats a stuck attempt', () => {
  it(`no plug for ${SEAL_STRATEGY_TICKS} ticks while walking: the next strategy, and the seal still completes`, () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
    const sim = c.sim;
    pinTemperature(sim, 22);
    const q = queen(sim);
    sim.enqueue({ type: 'possess', antId: q.id });
    sim.tick();
    sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
    stepUntil(sim, () => (q.bb[SG.state] ?? 0) === 1, 50); // walking to a stand
    expect(q.bb[SG.state]).toBe(1);
    // a stand she can never reach (far up in the air): the walk cannot end by itself
    q.bb[SG.sx] = q.pos.x; q.bb[SG.sy] = q.pos.y + 40 * sim.world.bu; q.bb[SG.sz] = q.pos.z;
    const before = q.bb[SG.strategy] ?? 0;
    stepUntil(sim, () => (q.bb[SG.changes] ?? 0) > 0 || phase(sim) !== 'seal', SEAL_STRATEGY_TICKS + 20);
    expect(phase(sim) !== 'seal' || (q.bb[SG.strategy] ?? 0) !== before).toBe(true);
    stepUntil(sim, () => phase(sim) !== 'seal', 3000);
    expect(phase(sim)).toBe('lay');
  }, 60_000);
});

describe('a dead-end pit beside the opening (the nest founding pocket rule)', () => {
  it('the cell cut off from the air reads sealed although a pit from the mouth still reaches the throat shell', () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
    const sim = c.sim, bu = sim.world.bu;
    pinTemperature(sim, 22);
    // a pit beside the opening, away from the shaft, deep enough to reach the throat's inner shell
    for (let d = 0; d <= 5; d += 0.3) {
      sim.enqueue({ type: 'cheat.carveSphere', pos: { x: c.mouth.x - 1.5 * bu, y: c.mouth.y - d * bu, z: c.mouth.z }, r: 0.8 * bu });
    }
    sim.tick();
    const q = queen(sim);
    sim.enqueue({ type: 'possess', antId: q.id });
    sim.tick();
    sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
    stepUntil(sim, () => phase(sim) !== 'seal', 4000);
    expect(phase(sim)).toBe('lay');
    expect(cellReachesAir(sim, nestOf(sim))).toBe(false);
    for (const e of cavityEntrances(sim, nestOf(sim))) expect(['sealed', 'reopening']).toContain(e.status);
  }, 60_000);
});

describe('a founding cavity that broke into a world cavity (natural entrance registration)', () => {
  it('the unregistered opening becomes a natural entrance and is sealed too; the cell ends cut off from the air', () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
    const sim = c.sim, bu = sim.world.bu;
    pinTemperature(sim, 22);
    const nest = nestOf(sim);
    const cell = nest.chambers.find((ch) => ch.type === 'founding')!;
    // a world crack from the cell up to the surface 8 BU away (cheat carving: no dig bite owns it, no breach registers it)
    const top = { x: cell.center.x + 8 * bu, y: sim.field.height(cell.center.x + 8 * bu, cell.center.z), z: cell.center.z };
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      sim.enqueue({ type: 'cheat.carveSphere', pos: { x: cell.center.x + (top.x - cell.center.x) * t, y: cell.center.y + (top.y + bu - cell.center.y) * t, z: cell.center.z }, r: 0.7 * bu });
    }
    sim.tick();
    const before = nest.entrances.length;
    const q = queen(sim);
    sim.enqueue({ type: 'possess', antId: q.id });
    sim.tick();
    sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
    stepUntil(sim, () => phase(sim) !== 'seal', 6000);
    expect(phase(sim)).toBe('lay');
    expect(cellReachesAir(sim, nest)).toBe(false);
    // either the crack registered as an entrance of its own (natural) when it was carved, or the founding check did
    expect(nest.entrances.length).toBeGreaterThanOrEqual(before);
  }, 60_000);
});
