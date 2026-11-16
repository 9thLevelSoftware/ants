// Independent review tests for viab-economy (docs/design/tasks/viab-economy.md): edge cases of the provisioned
// hand-over (R2), the protein-starvation rule without feeding larvae (R5), honest starving alerts (R6) and the
// queen's protein credit (R4). Colony test sim only (cheap).

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import {
  HANDOVER_QUEEN_KEEP_C, LAYING_CREDIT_CAP, QUEEN_FAT_CAP, STARVE_ALERT_GRACE_GD,
} from '@/sim/balance';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { layingReleaseShare, queenProteinCredit } from './queen';
import { stageRank } from './starvation';

/** A player colony handed over at the current tick (lapse end), established queen with these reserves. */
function handedOver(reserveC: number, reserveP: number, workers = 12, sim: Sim = makeColonySim()) {
  const ch = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 });
  const q = establishQueen(sim, ch);
  q.queen!.reserve = reserveC;
  q.queen!.reserveP = reserveP;
  addWorkers(sim, workers, { chamber: ch, ageGd: 1 });
  const op = sim.state.player.opening!;
  op.phase = 'handover';
  op.lapse = { startTick: 0, endTick: sim.state.tick, skipped: false, outcome: '' };
  sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 0, p: 0 });
  sim.applyPendingCommands();
  return { sim, ch, q };
}

const graceTicks = Math.ceil(STARVE_ALERT_GRACE_GD * TICKS_PER_DAY);

describe('R2 provisioning never loops (pool -> queen fat -> pool)', () => {
  it('the queen keeps no more fat than her refill cap, so the hand-over keep is at least that cap', () => {
    // handover.ts relies on QUEEN_FAT_CAP <= HANDOVER_QUEEN_KEEP_C: otherwise every colony cycle would move the fat
    // the queen refilled from the pool back into it as "recycled" food, forever
    expect(HANDOVER_QUEEN_KEEP_C).toBeGreaterThanOrEqual(QUEEN_FAT_CAP);
  });

  it('over 1.5 gd with the queen fed to her gut target, recycled inflow does not grow after the first provision', () => {
    const sim = makeColonySim({ extra: [careSystem({ feedQueen: true })] });
    const { q } = handedOver(11, 11, 12, sim);
    const col = colonyOf(sim);
    step(sim, 50);
    const first = col.ledger.inRecycledC;
    expect(first).toBeGreaterThan(5);
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 30, p: 10 });
    sim.applyPendingCommands();
    step(sim, Math.round(1.5 * TICKS_PER_DAY));
    expect(q.queen!.reserve).toBeLessThanOrEqual(HANDOVER_QUEEN_KEEP_C + 1e-6);
    expect(col.ledger.inRecycledC - first).toBeLessThan(0.05);
  });
});

describe('R5: an empty protein pool starves only a colony that raises larvae', () => {
  function pastGrace(withLarvae: number) {
    const { sim, ch } = handedOver(HANDOVER_QUEEN_KEEP_C, 1, 12);
    step(sim, graceTicks + 20);
    // larvae added after the grace (unfed larvae would die during it: the colony sim has no nurses)
    if (withLarvae > 0) addBrood(sim, 'larva', withLarvae, ch, 0.3);
    const col = colonyOf(sim);
    // plenty of carbohydrate, no protein at all
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 40, p: 0 });
    sim.applyPendingCommands();
    step(sim, 300);
    return colonyOf(sim);
  }

  it('no larvae: P = 0 with C in store is not rationing', () => {
    expect(stageRank(pastGrace(0).starvationStage)).toBeLessThan(2);
  });

  it('feeding larvae: P = 0 is rationing or worse (GDD 02 §5.7)', () => {
    expect(stageRank(pastGrace(4).starvationStage)).toBeGreaterThanOrEqual(2);
  });
});

describe('R6: the starving alert names brood sacrifice only when there is brood', () => {
  function starve(brood: boolean) {
    // tended brood (the colony sim has no nurses: untended pupae die before the stage is reached)
    const { sim, ch } = handedOver(HANDOVER_QUEEN_KEEP_C, 1, 8, makeColonySim({ extra: [careSystem({ tend: true })] }));
    const col = colonyOf(sim);
    // the opening is over (the colony test sim has no founding system to move the phase on from 'handover', and
    // foundingInProgress holds every stores alert while it reads 'handover')
    const op = sim.state.player.opening!;
    op.phase = 'done'; op.done = true;
    step(sim, graceTicks + 20);
    // pupae added after the grace: no feeding larvae (P is not wanted), the empty C pool drives the stages
    if (brood) addBrood(sim, 'pupa', 3, ch, 0.05);
    for (let i = 0; i < 40 && stageRank(col.starvationStage) < 3; i++) {
      sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 0, p: 0 });
      sim.applyPendingCommands();
      step(sim, 100);
    }
    return { sim, col };
  }

  it('no brood: the alert is raised and does not mention brood', () => {
    const { sim, col } = starve(false);
    expect(stageRank(col.starvationStage)).toBeGreaterThanOrEqual(3);
    const a = sim.state.progression.alerts.find((x) => x.kind === 'colony-starving');
    expect(a).toBeDefined();
    expect(a!.cause).not.toMatch(/brood/);
  });

  it('with brood: the alert says the brood is sacrificed', () => {
    const { sim, col } = starve(true);
    expect(stageRank(col.starvationStage)).toBeGreaterThanOrEqual(3);
    const a = sim.state.progression.alerts.find((x) => x.kind === 'colony-starving');
    expect(a).toBeDefined();
    expect(a!.cause).toMatch(/brood/);
  });
});

describe('R4 protein credit stays bounded and the release share stays in [0, 1]', () => {
  it('credit never exceeds its cap nor goes negative over a game day; release share finite for every stock target', () => {
    const sim = makeColonySim({ extra: [careSystem({ feedQueen: true, lay: true })] });
    const { q } = handedOver(HANDOVER_QUEEN_KEEP_C, 1, 30, sim);
    const col = colonyOf(sim);
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 40, p: 20 });
    sim.applyPendingCommands();
    for (let i = 0; i < 20; i++) {
      step(sim, 300);
      const cr = queenProteinCredit(q);
      expect(cr).toBeGreaterThanOrEqual(0);
      expect(cr).toBeLessThanOrEqual(LAYING_CREDIT_CAP + 1e-9);
    }
    for (const t of ['low', 'normal', 'high'] as const) {
      col.directives.stockTarget = t;
      const s = layingReleaseShare(sim, col);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});
