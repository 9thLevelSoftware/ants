// viab-loco item 2: possessed movement is never dead. Random poses on open ground, on the faces of objects (stems,
// stones, logs, walls, a table), on the walls of carved shafts and around the start site x 8 held input
// directions, 100 ticks each: zero runs without displacement while a probe around the ant is free.
// Default: a reduced case on the test world with every feature and a log (60 poses). FOUNDRESS_LONG=1: generated
// seed 7 (the founding site beside a log, int-1B Addendum 5 item 5) with 200 poses, and three more generated worlds
// (each world takes 10-40 s to generate on the shared machine).
import { describe, expect, it, vi } from 'vitest';
import type { Sim, WorldData } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { makePrim } from '@/sim/kernel.testWorld';
import { makeTestSim } from '@/sim/testing/testWorld';
import { generateWorld } from '@/worldgen';
import { locomotionSystem } from './system';
import { carveShafts, pileAgainst, possessAnt, runSweep, samplePoses, sweepRng, type SweepResult } from './possessedSweepKit';

vi.setConfig({ testTimeout: 600_000 });
declare const process: { env: Record<string, string | undefined> };
const LONG = process.env.FOUNDRESS_LONG === '1';

function prepare(sim: Sim, world: WorldData, seed: number, counts: Parameters<typeof samplePoses>[2], shafts: number,
  piles: Parameters<typeof samplePoses>[5] = []): SweepResult {
  for (const c of sim.state.creatures) c.alive = false;
  const queen = sim.state.ants.find((a) => a.caste === 'queen')!;
  for (const a of sim.state.ants) if (a !== queen) a.alive = false;
  possessAnt(sim, queen);
  const rng = sweepRng(seed), start = world.queenStart.pos;
  const axes = [...carveShafts(sim, rng, 2, 6, start), ...carveShafts(sim, rng, shafts, 8)];
  return runSweep(sim, queen, samplePoses(sim, rng, counts, axes, start, piles), 100);
}

function generated(seed: number, archetype?: string): SweepResult {
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const cfg = { ...base, world: { ...base.world, ...(archetype ? { archetype: archetype as typeof base.world.archetype } : {}) } };
  const world = generateWorld(cfg.world);
  const sim = createSim(createNewGame(cfg, world).state, world, { systems: [locomotionSystem] });
  return prepare(sim, world, seed, { surface: 70, object: 70, shaft: 40, start: 20 }, 6);
}

function report(r: SweepResult): string {
  return r.dead.slice(0, 12).map((d) => `${d.kind} at (${d.posBU.x.toFixed(1)}, ${d.posBU.y.toFixed(1)}, ${d.posBU.z.toFixed(1)}) up `
    + `(${d.up.x.toFixed(2)}, ${d.up.y.toFixed(2)}, ${d.up.z.toFixed(2)}) input (${d.input.x.toFixed(2)}, ${d.input.z.toFixed(2)}) `
    + `path ${d.pathBU.toFixed(2)} BU, ${d.freeProbes} free probes`).join('\n');
}

describe('possessed movement sweep (viab-loco item 2)', () => {
  it('test world (wall, table, stone, stem, log, a board with a steep spoil pile, shafts): 72 poses x 8 directions, never dead', () => {
    const bu = 4, size = 128 * bu;
    const log = makePrim(900, 'capsule', { x: 0.62 * size, y: 2 * bu, z: 0.62 * size }, { x: 2.5 * bu, y: 14 * bu, z: 0 },
      { material: 'wood-decayed', rot: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } });
    const board = makePrim(901, 'box', { x: 0.8 * size + 1.5 * bu, y: 12 * bu, z: 0.5 * size }, { x: 1.5 * bu, y: 14 * bu, z: 12 * bu },
      { material: 'wood-sound', round: 0.25 * bu });
    const sim = makeTestSim({ sizeBu: 128, terrain: 'noise', features: 'all', prims: [log, board], systems: [locomotionSystem] });
    const pile = pileAgainst(sim, 77, 0.8 * size, 0.5 * size, 16 * bu, 4.3 * bu, 0.8);
    const r = prepare(sim, sim.world, 3, { surface: 15, object: 25, shaft: 14, start: 6, mound: 12 }, 3, [pile]);
    expect(r.runs).toBeGreaterThan(400);
    expect(r.byKind.shaft).toBeGreaterThan(0);
    expect(r.byKind.object).toBeGreaterThan(0);
    expect(r.byKind.mound).toBeGreaterThan(0);
    expect(r.dead, report(r)).toEqual([]);
  });

  it('negative control: a stunned possessed ant is reported dead on every pose with a free probe', () => {
    const sim = makeTestSim({ sizeBu: 128, terrain: 'noise', features: 'all', systems: [locomotionSystem] });
    const queen = sim.state.ants.find((a) => a.caste === 'queen')!;
    queen.bb['cr.stunUntil'] = 1e9;
    const r0 = prepare(sim, sim.world, 5, { surface: 4, object: 4 }, 0);
    expect(r0.runs).toBeGreaterThan(30);
    expect(r0.dead.length).toBeGreaterThan(0.8 * r0.runs);
  });

  describe.skipIf(!LONG)('generated worlds (FOUNDRESS_LONG=1)', () => {
    it('seed 7 (start site beside a log): 200 poses x 8 directions, never dead', () => {
      const r = generated(7);
      expect(r.runs).toBeGreaterThan(1200);
      expect(r.dead, report(r)).toEqual([]);
    });
    for (const [a, s] of [['suburban-garden', 1], ['playground-park', 2], ['kitchen-door', 3]] as const) {
      it(`${a} #${s}`, () => {
        const r = generated(s, a);
        expect(r.dead, report(r)).toEqual([]);
      });
    }
  });
});
