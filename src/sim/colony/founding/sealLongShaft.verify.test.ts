// Independent review of colony-life round 9 (SG3, dig.ts cutOffBelowThroat). SG3 calls the cell sealed when a throat
// still reads open but the flood from the cell finds no path to the air. The flood stops at SEAL_FLOOD_RADIUS_BU
// (40 BU) from the cell without recording a leak, so a cell whose open way to the surface is longer than that reads
// "cut off" although nothing was plugged. Before SG3 an open throat always kept the cell unsealed.
import { describe, expect, it } from 'vitest';
import { throatCase } from './sealKit';
import { cavityEntrances } from './dig';
import { throatClosed } from './leak';
import { nestOf, phase, pinTemperature, stepUntil } from './testkit';

describe('SG3 review: an open shaft longer than the flood radius', () => {
  it('is not a sealed cell (no plug anywhere, the throat open)', () => {
    // a shallow shaft: 15 degrees, foot 12 BU down, ~46 BU long; the cell's centre lies ~48 BU from the mouth
    const c = throatCase({ pitchDeg: 15, widthBu: 2.1, soil: 'loam', depthBu: 12 });
    const sim = c.sim, nest = nestOf(sim);
    pinTemperature(sim, 22);
    expect(phase(sim)).toBe('seal');
    expect(cavityEntrances(sim, nest).some((e) => !throatClosed(sim, e))).toBe(true); // the throat test: open
    stepUntil(sim, () => nest.founding?.state === 'sealed', 20);
    expect({ state: nest.founding?.state, phase: phase(sim) }).toEqual({ state: 'ready', phase: 'seal' });
  }, 90_000);

  it('control: the same shaft at 55 degrees (short way to the air) is not sealed either', () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam', depthBu: 12 });
    const sim = c.sim, nest = nestOf(sim);
    pinTemperature(sim, 22);
    expect(phase(sim)).toBe('seal');
    stepUntil(sim, () => nest.founding?.state === 'sealed', 20);
    expect(nest.founding?.state).toBe('ready');
  }, 90_000);
});
