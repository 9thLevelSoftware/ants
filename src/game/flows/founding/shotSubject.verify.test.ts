// Review of look pass 5 (adversarial): the founding shot's subject sphere as the first workers move about the cell.
// Two tests here FAIL on the reviewed code on purpose (they show the defects for the fixer; see look-pass-5-review.md):
//  - a worker crossing the 10 BU reach makes the radius (hence the camera distance) jump: the camera zoom-pops;
//  - a worker up the shaft, above the cut plane (cut away with the soil, never visible), still widens the frame.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { foundingShotSubject } from './shotSubject';

const BU = 4;
type P = { x: number; y: number; z: number };

function fakeSim(o: { queen?: P; workers?: P[]; brood?: (P & { carriedBy?: number })[] }): Sim {
  const chamber = { id: 1, volume: 100, center: { x: 100, y: -12, z: 200 }, radii: { x: 8, y: 5, z: 9 } };
  const nest = { id: 7, alive: true, colony: 1, chambers: [chamber] };
  const ants = [...(o.queen ? [{ id: 1, alive: true, colony: 1, pos: o.queen }] : []), ...(o.workers ?? []).map((p, i) => ({ id: i + 2, alive: true, colony: 1, pos: p }))];
  const colony = { id: 1, alive: true, queenId: o.queen ? 1 : -1, nestIds: [7], species: 'x' };
  return {
    state: { player: { colonyId: 1 }, ants, brood: (o.brood ?? []).map((p) => ({ alive: true, colony: 1, carriedBy: p.carriedBy ?? -1, pos: p })) },
    world: { bu: BU },
    stores: { colonies: new Map([[1, colony]]), nests: new Map([[7, nest]]), ants: new Map(ants.map((a) => [a.id, a])) },
  } as unknown as Sim;
}
const blank = () => ({ x: 0, y: 0, z: 0, radius: 0, cutY: 0 });
const queen = { x: 0, y: -16, z: 0 };

describe('founding shot subject (review)', () => {
  it('moves continuously: a worker stepping 0.2 mm across the reach changes the radius by well under a body length', () => {
    const inside = foundingShotSubject(fakeSim({ queen, workers: [{ x: 10 * BU - 0.1, y: -16, z: 0 }] }), blank())!;
    const outside = foundingShotSubject(fakeSim({ queen, workers: [{ x: 10 * BU + 0.1, y: -16, z: 0 }] }), blank())!;
    // reviewed code: 41 mm against 4 mm, a 10x jump in the camera distance between two frames
    expect(Math.abs(inside.radius - outside.radius)).toBeLessThan(1 * BU);
  });

  it('does not widen the frame for a worker above the cut plane (she is cut away with the soil cap)', () => {
    const alone = foundingShotSubject(fakeSim({ queen, workers: [] }), blank())!;
    // look-pass-5 seed1-until12b at the outcome card: a worker in the shaft 22 mm above the queen, 0.6 BU cut above her
    const upShaft = foundingShotSubject(fakeSim({ queen, workers: [{ x: -16, y: queen.y + 22, z: 2 }] }), blank())!;
    expect(upShaft.cutY).toBeLessThan(queen.y + 22);
    expect(upShaft.radius).toBe(alone.radius);
  });

  it('leaves carried brood out and keeps a lone queen as the centre', () => {
    const r = foundingShotSubject(fakeSim({ queen, brood: [{ x: 30, y: 0, z: 0, carriedBy: 5 }] }), blank())!;
    expect(r.x).toBe(0); expect(r.z).toBe(0);
    expect(r.cutY).toBeCloseTo(queen.y + 0.6 * BU, 9);
  });

  it('is finite for a queen with brood stacked on her (zero spread)', () => {
    const r = foundingShotSubject(fakeSim({ queen, brood: [{ ...queen }, { ...queen }] }), blank())!;
    for (const v of [r.x, r.y, r.z, r.radius, r.cutY]) expect(Number.isFinite(v)).toBe(true);
    expect(r.radius).toBeGreaterThan(0);
  });
});
