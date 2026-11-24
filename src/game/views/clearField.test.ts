// The clearance rule the camera checks use (clearField.testkit.ts): free air under the margin counts as clear only while the cell camera blends in.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { clearFieldAt } from './clearField.testkit';
import type { ViewDirector } from './viewDirector';

const MARGIN = 1;
const sim = (f: number) => ({ field: { sampleXYZ: () => f } }) as unknown as Sim;
const director = (weight: number, inCut = false) =>
  ({ third: { clearanceMm: MARGIN }, cameraInCutAway: () => inCut, cellState: () => ({ weight }) }) as unknown as ViewDirector;
const P = { x: 0, y: 0, z: 0 };

describe('clearFieldAt', () => {
  it('counts free air under the margin as the margin while the cell camera blends in', () => {
    expect(clearFieldAt(director(0.5), sim(0.75), P)).toBe(MARGIN);
  });
  it('does not when the cell camera is off or fully on', () => {
    expect(clearFieldAt(director(0), sim(0.75), P)).toBe(0.75);
    expect(clearFieldAt(director(1), sim(0.75), P)).toBe(0.75);
  });
  it('never counts soil outside the cut-away, in any state', () => {
    for (const w of [0, 0.5, 1]) expect(clearFieldAt(director(w), sim(-0.3), P)).toBe(-0.3);
  });
  it('counts a camera inside the cut-away as the margin', () => {
    expect(clearFieldAt(director(1, true), sim(-2), P)).toBe(MARGIN);
  });
});
