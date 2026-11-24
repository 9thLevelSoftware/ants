import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { foundingShotSubject } from './shotSubject';

const BU = 4;
type P = { x: number; y: number; z: number };

/** Just enough of a Sim for the subject: one colony with its queen (ants[0]), workers, brood, and a nest with one chamber. */
function fakeSim(o: { queen?: P; workers?: P[]; brood?: P[]; chamber?: boolean }): Sim {
  const chamber = { id: 1, volume: 100, center: { x: 100, y: -12, z: 200 }, radii: { x: 8, y: 5, z: 9 } };
  const nest = { id: 7, alive: true, colony: 1, chambers: o.chamber === false ? [] : [chamber] };
  const ants = [...(o.queen ? [{ id: 1, alive: true, colony: 1, pos: o.queen }] : []), ...(o.workers ?? []).map((p, i) => ({ id: i + 2, alive: true, colony: 1, pos: p }))];
  const colony = { id: 1, alive: true, queenId: o.queen ? 1 : -1, nestIds: [7], species: 'x' };
  return {
    state: { player: { colonyId: 1 }, ants, brood: (o.brood ?? []).map((p) => ({ alive: true, colony: 1, carriedBy: -1, pos: p })) },
    world: { bu: BU },
    stores: { colonies: new Map([[1, colony]]), nests: new Map([[7, nest]]), ants: new Map(ants.map((a) => [a.id, a])) },
  } as unknown as Sim;
}
/** The queen of fakeSim with a frame (ants[0]): what the cards' shot hands to the view director for the cell camera's choice. */
function withQueenFrame(sim: Sim, up: P, lengthBu: number): Sim {
  const q = (sim.state.ants as unknown as { up?: P; fwd?: P; lengthBu?: number }[])[0];
  q.up = up; q.fwd = { x: 0, y: 0, z: 1 }; q.lengthBu = lengthBu;
  return sim;
}
const blank = () => ({ x: 0, y: 0, z: 0, radius: 0, cutY: 0 });

describe('founding shot subject', () => {
  it('is the queen and her brood, not the chamber record (a real queen lays in the throat of the shaft, away from it)', () => {
    const r = foundingShotSubject(fakeSim({ queen: { x: 80, y: 4.5, z: 190 }, brood: [{ x: 82, y: 4.4, z: 189 }], workers: [] }), blank())!;
    expect(r.x).toBeCloseTo(81, 6); expect(r.z).toBeCloseTo(189.5, 6);
    expect(Math.abs(r.x - 100)).toBeGreaterThan(10); // not at the chamber
    expect(r.radius).toBeGreaterThan(0);
  });

  it('carries the queen\'s own frame (position, up, heading, length in mm) so the view director can choose the side view on a steep wall; none without a queen', () => {
    const sim = withQueenFrame(fakeSim({ queen: { x: 80, y: 4.5, z: 190 }, brood: [{ x: 82, y: 4.4, z: 189 }] }), { x: 0.9, y: 0.1, z: 0 }, 2.1);
    const r = foundingShotSubject(sim, blank())!;
    expect(r.ant).toBeDefined();
    expect(r.ant!.up.x).toBeCloseTo(0.9, 6);
    expect(r.ant!.lengthMm).toBeCloseTo(2.1 * BU, 6);
    expect(foundingShotSubject(fakeSim({ brood: [{ x: 82, y: 4.4, z: 189 }] }), blank())!.ant).toBeUndefined();
  });

  it('puts the cut plane just above the queen and the brood, whatever workers do: a worker higher up is cut away, one in the chamber below does not move it', () => {
    const base = { queen: { x: 80, y: 4.5, z: 190 }, brood: [{ x: 82, y: 4.4, z: 189 }] };
    const plain = foundingShotSubject(fakeSim({ ...base, workers: [] }), blank())!;
    expect(plain.cutY).toBeGreaterThan(4.5);
    expect(plain.cutY).toBeLessThan(4.5 + 3 * BU);
    const withWorkers = foundingShotSubject(fakeSim({ ...base, workers: [{ x: 84, y: 12, z: 190 }, { x: 100, y: -14, z: 200 }] }), blank())!;
    expect(withWorkers.cutY).toBe(plain.cutY);
  });

  it('counts the first workers in the cell into the frame and leaves out the ones that went out', () => {
    const base = { queen: { x: 80, y: 4.5, z: 190 }, brood: [] as P[] };
    const alone = foundingShotSubject(fakeSim({ ...base, workers: [] }), blank())!;
    const near = foundingShotSubject(fakeSim({ ...base, workers: [{ x: 95, y: 2, z: 190 }] }), blank())!;
    const far = foundingShotSubject(fakeSim({ ...base, workers: [{ x: 500, y: 30, z: 600 }] }), blank())!;
    expect(near.radius).toBeGreaterThan(alone.radius);
    expect(far.radius).toBe(alone.radius);
  });

  it('with no queen and no brood the chamber is the subject; with nothing at all there is none', () => {
    const r = foundingShotSubject(fakeSim({ chamber: true }), blank())!;
    expect(r.x).toBe(100); expect(r.z).toBe(200);
    expect(r.cutY).toBeGreaterThan(-12);
    expect(foundingShotSubject(fakeSim({ chamber: false }), blank())).toBeNull();
  });

  it('keeps the plane under the roof of the cell over the queen (a plane above the ceiling shows soil only)', () => {
    const queen = { x: 0, y: -16, z: 0 };
    const sim = fakeSim({ queen });
    // free up to y = -15 mm (0.25 BU above the queen), solid above
    (sim as unknown as { field: unknown }).field = { sampleXYZ: (_x: number, y: number) => (y < -15 ? 1 : -1) };
    const r = foundingShotSubject(sim, blank())!;
    expect(r.cutY).toBeLessThan(-15);
    expect(r.cutY).toBeGreaterThan(queen.y); // still above the queen's reference point
    // open all the way: the usual 0.6 BU
    (sim as unknown as { field: unknown }).field = { sampleXYZ: () => 1 };
    expect(foundingShotSubject(sim, blank())!.cutY).toBeCloseTo(queen.y + 0.6 * BU, 9);
  });

  it('never lowers the plane below the queen even when the field is solid at once above her', () => {
    const queen = { x: 0, y: -16, z: 0 };
    const sim = fakeSim({ queen });
    (sim as unknown as { field: unknown }).field = { sampleXYZ: () => -1 };
    const r = foundingShotSubject(sim, blank())!;
    expect(r.cutY).toBeGreaterThan(queen.y);
    expect(r.cutY).toBeLessThanOrEqual(queen.y + 0.6 * BU);
  });

  it('behind a card the whole cell is the subject (app-seams-4 item 5): the sphere of the open voxels under the slice plane, the queen in its middle third, workers left out', () => {
    const queen = { x: 9, y: -5, z: 0 }; // at the rim of a round cavity of 12 mm radius centred (6, -5, 0)
    const sim = fakeSim({ queen, workers: [{ x: 18, y: -5, z: 2 }], brood: [{ x: 4, y: -5, z: 1 }] });
    (sim as unknown as { field: unknown }).field = { sampleXYZ: (x: number, y: number, z: number) => 12 - Math.hypot(x - 6, y + 5, z) };
    (sim.state as unknown as { tick: number }).tick = 0;
    const plain = foundingShotSubject(sim, blank())!;
    const card = foundingShotSubject(sim, blank(), true)!;
    // the cavity cut at the plane (0.6 BU over the queen): 24 mm across, 14 mm deep; the sphere holds all of it, framed at its own size
    expect(card.radius).toBeGreaterThan(12); expect(card.radius).toBeLessThan(22);
    expect(Math.hypot(queen.x - card.x, queen.y - card.y, queen.z - card.z)).toBeLessThanOrEqual(card.radius / 3 + 1e-6);
    expect(card.minRadiusBu).toBeLessThan(4.5);
    expect(plain.minRadiusBu).toBeUndefined();
    // a worker standing far outside the cell does not widen it
    const far = fakeSim({ queen, workers: [{ x: 60, y: -5, z: 2 }], brood: [{ x: 4, y: -5, z: 1 }] });
    (far as unknown as { field: unknown }).field = (sim as unknown as { field: unknown }).field;
    (far.state as unknown as { tick: number }).tick = 0;
    expect(foundingShotSubject(far, blank(), true)!.radius).toBeCloseTo(card.radius, 6);
  });
});
