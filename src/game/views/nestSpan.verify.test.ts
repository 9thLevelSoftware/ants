// Reviewer test (gate-close-app review): the colony view's closer minimum zoom for a small nest (seam "the closest
// view leaves the founding chamber about 110 px wide; allow a closer minimum for small nests"). The report says a
// founding nest (span about 6 BU) can be framed from 15 BU. The nest below is the real one measured in the browser
// right after the hand-over (seed 1, quality=high, test-output/gate-close/app-review/run1.log): one royal chamber,
// radii 9 x 5 x 9 mm, centre 25.1 mm below ground, the entrance 16.7 mm up on its mound; Lasius BU = 4 mm.
// nestSpanBu counts the vertical extent from the entrance on the mound to the chamber floor (11.7 BU), so the
// closest zoom is 29 BU, almost the old 30 BU: the founding chamber stays as small as before.
// This test fails until the span (or the rule) frames the chamber itself; left in place for the fixer.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { ColonyRig } from '@/render/camera/colonyRig';
import { CV_DIST_BU } from '@/render/camera/constants';
import { nestSpanBu } from './viewsLayer';

const BU = 4;

function foundingSim(): Sim {
  const nest = {
    colony: 1,
    chambers: [{ type: 'royal', center: { x: 11449, y: -25.1, z: 11928 }, radii: { x: 9, y: 5, z: 9 } }],
    entrances: [{ pos: { x: 11452, y: 16.7, z: 11931 } }],
  };
  return { state: { colonies: [{ id: 1 }], nests: [nest] }, world: { bu: BU } } as unknown as Sim;
}

describe('colony view closest zoom on the real founding nest', () => {
  it('is well below the large-nest minimum (the stated aim: about 15 BU, the chamber about twice as wide)', () => {
    const span = nestSpanBu(foundingSim());
    const rig = new ColonyRig({ bu: BU, worldSize: 16000 });
    rig.setNestSpan(span);
    expect(rig.minDistanceBu).toBeLessThanOrEqual(0.7 * CV_DIST_BU[0]);
  });
});
