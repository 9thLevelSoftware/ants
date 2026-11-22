// Colony-life round 9 (direction 20 item 1, the founding at the start pose): playground-park #1's template dig was
// plugged ten times down the shaft, past the throat sphere the throat test reads. The cell no longer reached the air,
// the throat still read open, the guide found nothing left to plug and the seal never ended. A cell cut off from the
// air with the queen inside is sealed, wherever in the shaft the plug lies (dig.ts sealTick, cutOffBelowThroat).
import { describe, expect, it } from 'vitest';
import { throatCase } from './sealKit';
import { cavityEntrances } from './dig';
import { throatClosed } from './leak';
import { cellReachesAir } from './sealPlan';
import { nestOf, phase, pinTemperature, stepUntil } from './testkit';

describe('a plug down the shaft, past the throat sphere', () => {
  it('cuts the cell off from the air with the queen inside: the cell is sealed', () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
    const sim = c.sim, bu = sim.world.bu, nest = nestOf(sim);
    pinTemperature(sim, 22);
    expect(phase(sim)).toBe('seal');
    // loose fill across the shaft 10 BU down its length (8.2 BU deep), far below the throat sphere
    sim.enqueue({ type: 'cheat.fillSphere', pos: c.shaftAt(10), r: 1.6 * bu, loose: true });
    sim.tick();
    // the opening as the nest module left pp #1's: `sealing` (plugs counted, the throat not judged closed)
    for (const e of cavityEntrances(sim, nest)) { e.status = 'sealing'; e.plugVoxelCount = Math.max(1, e.plugVoxelCount); }
    expect(cellReachesAir(sim, nest)).toBe(false);
    expect(cavityEntrances(sim, nest).some((e) => !throatClosed(sim, e))).toBe(true); // the throat test: still open
    stepUntil(sim, () => nest.founding?.state === 'sealed', 20);
    expect({ state: nest.founding?.state, phase: phase(sim) }).toEqual({ state: 'sealed', phase: 'lay' });
  }, 90_000);

  it('the throat open and the cell reaching the air: not sealed', () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
    const sim = c.sim, nest = nestOf(sim);
    pinTemperature(sim, 22);
    stepUntil(sim, () => false, 20);
    expect(cellReachesAir(sim, nest)).toBe(true);
    expect(nest.founding?.state).toBe('ready');
  }, 90_000);
});
