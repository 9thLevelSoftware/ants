// Review of task opening-fix (the unplug floor in targets.ts and the unplug draft in unplugDraft.ts), through the
// whole allocation pass (allocateColony) as well as computeTargets: a closed founding nest of four first workers.
import { describe, expect, it } from 'vitest';
import { AntFlag } from '@/sim/types';
import { UNPLUG_FLOOR_DIGGERS } from '@/sim/balance';
import { addChamber, addEntrance, addWorkers, colonyOf, makeColonySim } from '../testkit';
import { ti } from '../taskIdx';
import { allocateColony, refreshActual } from './index';
import { unplugFloor } from './demand';
import { computeTargets } from './targets';

const T = (t: string) => ti(t as never);

/** A colony whose only nest has a `reopening` throat with plug soil (the hand-over), four workers at home. */
function closedFounding() {
  const sim = makeColonySim({ noAllocation: true });
  const col = colonyOf(sim);
  const ch = addChamber(sim, 'founding', { ...sim.world.queenStart.pos, y: sim.world.queenStart.pos.y - 30 });
  const nest = sim.stores.nests.get(col.nestIds[0])!;
  nest.entrances.length = 0;
  addEntrance(sim, { ...sim.world.queenStart.pos });
  nest.entrances[0].status = 'reopening';
  nest.entrances[0].plugVoxelCount = 120;
  const ws = [
    ...addWorkers(sim, 1, { task: 'forage', chamber: ch }),
    ...addWorkers(sim, 1, { task: 'store', chamber: ch }),
    ...addWorkers(sim, 1, { task: 'idle', chamber: ch }),
    ...addWorkers(sim, 1, { task: 'queen-care', chamber: ch }),
  ];
  refreshActual(sim, col);
  return { sim, col, nest, ws, def: sim.getSpecies(col.species)! };
}

const digging = (ws: { task: string }[]) => ws.filter((a) => a.task === 'dig').length;

describe('unplug floor and draft, whole allocation pass (opening-fix review)', () => {
  it('a closed nest: the pass targets and staffs diggers for the plug', () => {
    const { sim, col, ws, def } = closedFounding();
    expect(unplugFloor(sim, col)).toBe(UNPLUG_FLOOR_DIGGERS);
    allocateColony(sim, col, def, false);
    expect(col.alloc.target[T('dig')]).toBeGreaterThanOrEqual(1);
    expect(digging(ws)).toBeGreaterThanOrEqual(1);
    expect(digging(ws)).toBeLessThanOrEqual(UNPLUG_FLOOR_DIGGERS);
    expect(col.alloc.actual[T('dig')]).toBe(digging(ws)); // headcount caches stay exact
  });

  it('the possessed worker is never drafted', () => {
    const { sim, col, ws, def } = closedFounding();
    for (const a of ws) if (a.task !== 'queen-care') { a.flags |= AntFlag.POSSESSED; }
    allocateColony(sim, col, def, false);
    for (const a of ws) if ((a.flags & AntFlag.POSSESSED) !== 0) expect(a.task).not.toBe('dig');
  });

  it('an open entrance: no floor, the draft moves nobody', () => {
    const { sim, col, nest, ws, def } = closedFounding();
    nest.entrances[0].status = 'open';
    nest.entrances[0].plugVoxelCount = 0;
    expect(unplugFloor(sim, col)).toBe(0);
    const before = ws.map((a) => a.task);
    allocateColony(sim, col, def, false);
    // the ordinary pass changes targets only; tasks change at the end of task cycles (GDD 02 §6.5)
    expect(ws.map((a) => a.task)).toEqual(before);
  });

  it('only callow workers: the floor takes nobody from the dig pool and the nurses keep theirs', () => {
    const { col } = closedFounding();
    const d = col.alloc.demand;
    d.fill(0);
    d[T('nurse')] = 1; d[T('queen-care')] = 1; d[T('forage')] = 3; d[T('dig')] = 3;
    computeTargets(col, 4, false, { all: 4, adult: 0, outside: 0 }, false, 0, 0, UNPLUG_FLOOR_DIGGERS);
    expect(col.alloc.target[T('dig')]).toBe(0);
    expect(col.alloc.target[T('nurse')]).toBe(1);
  });

  it('targets never exceed the workforce, and the floor never lowers nurse or guard (threat, hygiene, any demand)', () => {
    const { col } = closedFounding();
    const d = col.alloc.demand, tg = col.alloc.target;
    let s = 12345;
    const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
    const tasks = ['nurse', 'queen-care', 'forage', 'store', 'tend', 'scout', 'haul', 'dig', 'guard'];
    for (let n = 0; n < 400; n++) {
      d.fill(0);
      for (const t of tasks) d[T(t)] = Math.floor(rnd() * 8) * 0.5;
      const free = 1 + Math.floor(rnd() * 8), threat = rnd() < 0.3, hygiene = rnd() < 0.3, scout = rnd() < 0.5 ? 1 : 0;
      const off = computeTargets(col, free, threat, undefined, hygiene, 0, scout, 0);
      const offNurse = tg[T('nurse')], offGuard = tg[T('guard')], offDig = tg[T('dig')];
      const on = computeTargets(col, free, threat, undefined, hygiene, 0, scout, UNPLUG_FLOOR_DIGGERS);
      const ctx = `n ${n} free ${free} threat ${threat} hygiene ${hygiene}`;
      expect(off, ctx).toBeLessThanOrEqual(free);
      expect(on, ctx).toBeLessThanOrEqual(free);
      expect(tg[T('nurse')], ctx).toBeGreaterThanOrEqual(offNurse);
      expect(tg[T('dig')], ctx).toBeGreaterThanOrEqual(offDig);
      if (threat) expect(tg[T('guard')], ctx).toBeGreaterThanOrEqual(Math.min(offGuard, Math.ceil(0.5 * d[T('guard')])));
      expect(tg[T('dig')], ctx).toBeLessThanOrEqual(Math.max(offDig, Math.round(d[T('dig')])));
    }
  });
});
