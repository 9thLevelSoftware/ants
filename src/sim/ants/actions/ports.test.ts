// sim-fix-ants item 7: colony/founding/clutch.ts imports the action library, whose port table imports the colony
// module: a cycle. Entered from the colony side, the port table used to be built while the colony module was still
// half-evaluated (`ports.canLay is not a function`). The ports now look their functions up at call time.
// This file imports the colony module FIRST on purpose (that is the order that failed).
import * as colony from '@/sim/colony';
import { describe, expect, it } from 'vitest';
import { ports } from './ports';

describe('action ports and the colony <-> actions import cycle', () => {
  it('every port is a function that reaches the owning module, whatever the import order', () => {
    expect(typeof colony.canLay).toBe('function');
    for (const [name, fn] of Object.entries(ports)) expect(typeof fn, name).toBe('function');
    // a port delegates to the module's function at call time (a test double on the module side is seen)
    const sim = { stores: { colonies: { get: () => undefined } } } as unknown as Parameters<typeof ports.nurseLoadMix>[0];
    expect(ports.nurseLoadMix(sim, 1, 0.6)).toEqual({ c: 0, p: 0 });
  });
});
