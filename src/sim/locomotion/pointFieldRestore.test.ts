// Colony-life round 14 (direction 29 Part B): save -> load -> continue must walk the same fields as the unsaved game.
// A point field is chosen plain or wide (round 13, pointFieldSeed.test) from its goal. Round 13's form also took the
// wide field of a cell whenever it happened to be registered, and the registry is a derived cache: a load rebuilds only
// the fields walkers follow, so after a load a walker to the same goal planned on the plain field where the unsaved
// game used the wide one (outdoor/determinism.perf diverged 85 ticks after the save: ant 33's goal field). The rule
// pinned here: the field a goal gets does not depend on which point fields are registered.

import { describe, expect, it } from 'vitest';
import { restore, snapshot } from '@/sim/save';
import { createSim } from '@/sim/sim';
import type { Sim } from '@/sim/types';
import { pointField } from './nests';
import { rt } from './runtime';
import { deepestChamber, locoSim, playerNest, v3 } from './testkit';

/** Goals just inside a chamber floor around its rim (some cut off from their cell centre: wide fields), and for each
 *  the points of a 3 x 3 x 3 lattice across its quantisation cell (mostly plain). */
function goals(sim: Sim): { x: number; y: number; z: number }[] {
  const c = deepestChamber(playerNest(sim)), q = rt(sim).P.pointFieldCell, out = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * 2 * Math.PI, s = 0.6 + 0.35 * ((k * 7) % 8) / 7;
    const x = c.center.x + s * c.radii.x * Math.cos(a), z = c.center.z + s * c.radii.z * Math.sin(a);
    let y = c.center.y;
    while (y > c.center.y - 2 * c.radii.y && sim.field.sample(v3(x, y, z)) > 0) y -= 0.1;
    out.push(v3(x, y - 0.3, z));
    const cx = Math.round(x / q) * q, cy = Math.round((y - 0.3) / q) * q, cz = Math.round(z / q) * q;
    for (const dx of [-0.4, 0, 0.4]) for (const dy of [-0.4, 0, 0.4]) for (const dz of [-0.4, 0, 0.4]) out.push(v3(cx + dx * q, cy + dy * q, cz + dz * q));
  }
  return out;
}

describe('the point field a goal gets does not depend on the registry (save -> load -> continue)', () => {
  it('a restored sim gives every goal the field the unsaved sim gives it, after the unsaved one registered others', () => {
    const a = locoSim({ nest: 'small', workers: 2, sizeBu: 300 });
    const gs = goals(a);
    const saved = snapshot(a);
    // the unsaved game asks for the fields in one order (its registry fills as it goes) ...
    const inA = gs.map((g) => pointField(a, rt(a), g));
    // ... the loaded one in the reverse order, starting from a registry the load rebuilt
    const b = createSim(restore(saved).state, a.world, { systems: a.systems });
    const inB = gs.slice().reverse().map((g) => pointField(b, rt(b), g)).reverse();
    expect(inA.filter((id) => id.endsWith(';w')).length).toBeGreaterThan(0); // the case exists in this nest
    expect(inB).toEqual(inA);
  });
});
