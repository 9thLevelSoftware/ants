import { describe, expect, it } from 'vitest';
import { newPossessionInputResult, readPossessionInput, type InputLike, type PossessedContext } from './possessionInput';

function fakeInput(o: { move?: { x: number; y: number }; active?: string[]; pressed?: string[]; tap?: string[]; holdStart?: string[] }): InputLike {
  return {
    axis2: () => o.move ?? { x: 0, y: 0 },
    active: (id) => (o.active ?? []).includes(id),
    pressed: (id) => (o.pressed ?? []).includes(id),
    tap: (id) => (o.tap ?? []).includes(id),
    holdStart: (id) => (o.holdStart ?? []).includes(id),
  };
}

const ant: PossessedContext = { up: { x: 0, y: 1, z: 0 }, carrying: false, trailOn: false, primary: null, secondary: null };
const cam = { fwd: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } };

describe('possession input -> PlayerIntent and action commands (GDD 01 §5.2)', () => {
  it('maps held levels into the intent', () => {
    const r = readPossessionInput(fakeInput({ move: { x: 0, y: 1 }, active: ['hurry', 'dig', 'foot'] }), cam, ant, newPossessionInputResult());
    expect(r.intent.dir.z).toBeCloseTo(-1, 9);
    expect(r.intent.hurry).toBe(true);
    expect(r.intent.grip).toBe(true);
    expect(r.intent.held).toEqual(['dig-bite']);
    expect(r.commands).toEqual([]);
  });

  it('turns press edges into commands', () => {
    const ctx = { ...ant, primary: { actionId: 'pick-up' as const, target: null }, trailOn: true, carrying: true };
    const r = readPossessionInput(fakeInput({ tap: ['interact', 'foot'], pressed: ['trail-toggle', 'release'] }), cam, ctx, newPossessionInputResult());
    expect(r.commands).toEqual([
      { type: 'action', actionId: 'pick-up', secondary: false, phase: 'start' },
      { type: 'action', actionId: 'drop', secondary: false, phase: 'start' },
      { type: 'setTrail', on: false },
      { type: 'release', reason: 'player' },
    ]);
  });

  it('reuses its buffers between frames', () => {
    const buf = newPossessionInputResult();
    readPossessionInput(fakeInput({ active: ['dig'] }), cam, ant, buf);
    const dir = buf.intent.dir;
    readPossessionInput(fakeInput({}), cam, ant, buf);
    expect(buf.intent.dir).toBe(dir);
    expect(buf.intent.held).toEqual([]);
  });
});
