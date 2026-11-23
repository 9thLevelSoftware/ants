import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { foundingShotSubject } from './shotSubject';

const BU = 4;

/** Just enough of a Sim for the subject: one colony, its nest with one chamber, ants and brood. */
function fakeSim(ants: { x: number; y: number; z: number }[], withChamber = true): Sim {
  const chamber = { id: 1, volume: 100, center: { x: 100, y: -12, z: 200 }, radii: { x: 8, y: 5, z: 9 } };
  const nest = { id: 7, alive: true, colony: 1, chambers: withChamber ? [chamber] : [] };
  const list = ants.map((p, i) => ({ id: i + 1, alive: true, colony: 1, pos: p }));
  const colony = { id: 1, alive: true, queenId: 1, nestIds: [7], species: 'x' };
  return {
    state: { player: { colonyId: 1 }, ants: list, brood: [{ alive: true, colony: 1, carriedBy: -1, pos: { x: 104, y: -16, z: 198 } }] },
    world: { bu: BU },
    stores: {
      colonies: new Map([[1, colony]]), nests: new Map([[7, nest]]), ants: new Map(list.map((a) => [a.id, a])),
    },
  } as unknown as Sim;
}

describe('founding shot subject', () => {
  it('is the cell: centred on the chamber (a little below its middle), holding the animals in it and not the foragers outside', () => {
    const inside = [{ x: 100, y: -16, z: 200 }, { x: 105, y: -16, z: 195 }];
    const out = { x: 0, y: 0, z: 0, radius: 0, cutY: 0 };
    const r = foundingShotSubject(fakeSim([...inside, { x: 400, y: 30, z: 500 }]), out)!;
    expect(r.x).toBe(100); expect(r.z).toBe(200);
    expect(r.y).toBeLessThan(-12);
    expect(r.radius).toBeGreaterThanOrEqual(9);
    expect(r.radius).toBeLessThan(40); // the forager 500 mm away did not widen it
  });

  it('puts the cut plane through the cell: above the animals backs, below the roof', () => {
    const out = { x: 0, y: 0, z: 0, radius: 0, cutY: 0 };
    const r = foundingShotSubject(fakeSim([{ x: 100, y: -16, z: 200 }]), out)!;
    expect(r.cutY).toBeGreaterThan(-16);
    expect(r.cutY).toBeLessThanOrEqual(-12 + 0.8 * 5 + 1e-9);
  });

  it('a lone queen with no chamber on record still gets a subject at her', () => {
    const out = { x: 0, y: 0, z: 0, radius: 0, cutY: 0 };
    const r = foundingShotSubject(fakeSim([{ x: 50, y: -3, z: 60 }], false), out)!;
    expect(r.x).toBe(50); expect(r.z).toBe(60);
    expect(r.radius).toBeGreaterThan(0);
  });
});
