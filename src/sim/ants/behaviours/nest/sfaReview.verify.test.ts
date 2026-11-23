// Reviewer tests for sim-fix-ants (board cadence + save/load, care primitives). Kept as regression tests where they
// pass; a failing one documents a defect for the fixer (see the review report).
import { describe, expect, it } from 'vitest';
import type { Ant } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { placeMarker, removeMarker } from '@/sim/entities';
import { placeOnSurface } from '@/sim/locomotion';
import { SYSTEMS } from '@/sim/systems';
import { NURSERY_BOARD_PERIOD_S } from '@/sim/balance/nestwork';
import { secondsToTicks } from '@/sim/time';
import { canDo } from '@/sim/ants/actions';
import { sortOf } from './board';
import { makeNestColony, type NestColony } from './testkit';

const PERIOD = secondsToTicks(NURSERY_BOARD_PERIOD_S);

function tickUntil(k: NestColony, cond: () => boolean, max: number): void {
  for (let i = 0; i < max && !cond(); i++) k.sim.tick();
}

describe('reviewer: nursery board view after save / load (sim-fix-ants item 2)', () => {
  // Note: the derived sort context of the running game keeps the removed marker object until the next build, the
  // loaded one has none (board.ts viewOf looks the marker up by id). Today nothing reads SortContext.marker outside
  // the build, so the state stays equal; this test guards the state equality.
  it('a move-brood marker removed in mid-window: save -> load -> run equals the uninterrupted run', () => {
    const k = makeNestColony({
      workers: 12, stores: { c: 80, p: 40 }, seed: 6,
      brood: [{ stage: 'egg', n: 10, chamber: 'nursery' }, { stage: 'pupa', n: 6, chamber: 'nursery' }],
    });
    const { sim, nest, nursery, royal } = k;
    const col = sim.state.colonies[0];
    const m = placeMarker(sim, {
      kind: 'move-brood', colony: col.id, pos: royal.center, radius: sim.world.bu,
      sourceChamberId: nursery.id, targetChamberId: royal.id,
    });
    // into a fresh window, a few ticks in: the board of this window is built (nurses read it every tick)
    for (let i = 0; i < 40; i++) sim.tick();
    // some nurses read the board on every think (the allocator may need a while to make them)
    sim.stores.ants.list.filter((a) => a.caste === 'worker').slice(0, 6).forEach((a) => { a.task = 'nurse'; });
    for (let i = 0; i < 200; i++) sim.tick();
    // the board is built on its first read in a window, and nurses think on their own cadence (no longer every
    // tick): wait for a window whose board is built while most of the window is still to come (gate-sim-2)
    const builtNow = () => {
      const b = sim.state.nurseryBoards?.find((x) => x.colonyId === col.id);
      return !!b && Math.floor(b.builtTick / PERIOD) === Math.floor(sim.state.tick / PERIOD);
    };
    tickUntil(k, () => builtNow() && sim.state.tick % PERIOD >= 2 && sim.state.tick % PERIOD < PERIOD / 2, 4 * PERIOD);
    const board = sim.state.nurseryBoards?.find((b) => b.colonyId === col.id);
    expect(board).toBeDefined();
    expect(Math.floor(board!.builtTick / PERIOD)).toBe(Math.floor(sim.state.tick / PERIOD));
    expect(board!.sort[0].markerId).toBe(m.id);
    // the player removes the marker; the window goes on
    removeMarker(sim, m.id, 'player');
    sim.tick();
    expect(sim.state.tick % PERIOD).toBeGreaterThan(0);
    const loaded = createSim(restore(snapshot(sim)).state, sim.world);
    expect(stateHash(loaded.state)).toBe(stateHash(sim.state));
    // the job lists and sort scores of the stored board are the same in both games
    expect(sortOf(loaded, col.id, nest.id)?.best).toEqual(sortOf(sim, col.id, nest.id)?.best);
    for (let t = 0; t < 3 * PERIOD; t++) { sim.tick(); loaded.tick(); }
    expect(stateHash(loaded.state)).toBe(stateHash(sim.state));
  }, 120_000);

  it('the board survives a save at the very first tick of a window (built on the first read after load)', () => {
    const k = makeNestColony({
      workers: 20, stores: { c: 120, p: 60 }, seed: 8,
      brood: [{ stage: 'egg', n: 6, chamber: 'nursery' }, { stage: 'larva', n: 8, chamber: 'nursery' }],
    });
    const a = k.sim;
    for (let i = 0; i < 300; i++) a.tick();
    tickUntil(k, () => a.state.tick % PERIOD === 0, PERIOD + 1);
    const b = createSim(restore(snapshot(a)).state, a.world);
    for (let t = 0; t < 3 * PERIOD + 7; t++) { a.tick(); b.tick(); }
    expect(stateHash(b.state)).toBe(stateHash(a.state));
  }, 120_000);
});

/** No behaviours, no allocation: only the primitive acts. */
const QUIET = SYSTEMS.filter((s) => s.name !== 'behaviours' && s.name !== 'allocation' && s.name !== 'task-reeval');

function carerBesideQueen(): NestColony & { w: Ant } {
  const k = makeNestColony({ workers: 1, systems: QUIET });
  const { sim, queen, royal } = k;
  const w = sim.stores.ants.list.find((a) => a.caste === 'worker')!;
  const bu = sim.world.bu;
  const dx = royal.center.x - queen.pos.x, dz = royal.center.z - queen.pos.z, l = Math.hypot(dx, dz) || 1;
  const p = { x: queen.pos.x + (dx / l) * 1.2 * bu, y: royal.center.y, z: queen.pos.z + (dz / l) * 1.2 * bu };
  expect(placeOnSurface(sim, w, p, { x: 0, y: -1, z: 0 })).toBe(true);
  w.nestId = k.nest.id;
  w.chamberId = royal.id;
  const fx = queen.pos.x - w.pos.x, fz = queen.pos.z - w.pos.z, u = w.up, dn = fx * u.x + fz * u.z;
  const tx = fx - u.x * dn, ty = -u.y * dn, tz = fz - u.z * dn, tl = Math.hypot(tx, ty, tz);
  w.fwd = { x: tx / tl, y: ty / tl, z: tz / tl };
  queen.queen!.gut.c = 0;
  queen.queen!.gut.p = 0;
  return { ...k, w };
}

describe('reviewer: care primitives (sim-fix-ants item 3)', () => {
  it('feed-queen from the own reserve is the S2 rationing transfer: refused while the colony is fed', () => {
    const { sim, w, queen } = carerBesideQueen();
    const t = { kind: 'ant' as const, id: queen.id, pos: queen.pos };
    w.energy = 0.9;
    const col = sim.state.colonies[0];
    col.starvationStage = 'rationing';
    expect(canDo(sim, w, 'feed-queen', t, { secondary: true }).ok).toBe(true);
    col.starvationStage = 'fed';
    // GDD 02 §5.7: "S2 rationing ... queen-carers feed the queen from their own reserve"; the primitive's own header
    // says the colony allows it in S2. In S0 a (possessed) worker must not be able to drain its fat body into her.
    expect(canDo(sim, w, 'feed-queen', t, { secondary: true }).ok).toBe(false);
  });

  it('feed-queen refuses a target that is not the own colony queen, and a full queen gut', () => {
    const { sim, w, queen } = carerBesideQueen();
    w.cropC = 0.4;
    expect(canDo(sim, w, 'feed-queen', { kind: 'ant', id: w.id, pos: w.pos }).reason).toBe('no-target');
    queen.queen!.gut.c = 50;
    expect(canDo(sim, w, 'feed-queen', { kind: 'ant', id: queen.id, pos: queen.pos }).reason).toBe('crop-full');
  });

  it('load-crop, unload-crop and feed-queen are refused to the queen herself (workers only)', () => {
    const { sim, queen } = carerBesideQueen();
    for (const id of ['load-crop', 'unload-crop'] as const) expect(canDo(sim, queen, id, null).ok).toBe(false);
  });
});
