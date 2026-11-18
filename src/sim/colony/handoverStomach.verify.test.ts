// Independent review of colony-life round 5, fix P1 (handover.ts provisionAtHandover: the queen's hand-over protein
// goes into the workers' social stomachs only, as far as they hold it; the rest stays in her and is paid in on later
// cycles, for HANDOVER_PROVISION_WINDOW_GD after the hand-over; after that it is hers).
//
// Ruling R2 is a provisioned hand-over: the protein the founding queen carries is for the first larvae. With the
// stomach rule the pay-in rate is set by how fast the stomachs empty, i.e. by the larvae. A seed-3-like hand-over (7
// workers: 1.05 P of stomach room) with fresh eggs that hatch late in the window pays in little before the window
// closes. These tests state what R2 asks: the queen's provision reaches the larvae, and the larvae do not go short of
// protein while the queen still holds her provision.
//
// Result (sweep after round 5, 01:10 UTC Nov 18): the first case is green (the eggs hatch inside the window). The
// second was RED (fixed in round 6 by P1d, the case restated to the rule, see there): with 9 workers (1.35 P of stomach room) and 3 eggs that hatch on day 3, the stomachs stay
// full for 2 gd (nobody eats), the window closes, and the queen keeps 7.37 of her 8.6 P above her keep while the pool
// reads P 0 from day 4. The sweep's suburban-garden #1 shows the same course: pool P 1.36-1.38 on days 1-3 (= 9 x 0.15),
// 0 on day 4 when its 7 larvae hatched, `rationing` days 4-7, 6 larvae starved, 0 eclosions.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { HANDOVER_PROVISION_WINDOW_GD, HANDOVER_QUEEN_KEEP_P } from '@/sim/balance/colony';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { poolCapacity } from './stores';
import { stageRank } from './starvation';

function handover(workers: number, eggProgress: number, tempC = 20, eggs = 13) {
  const sim = makeColonySim({
    climate: { chamberTemp: () => tempC, pointTemp: () => tempC },
    extra: [careSystem({ tend: true, assist: true, feedLarvae: true, feedQueen: true })],
  });
  const royal = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 }, 0);
  const q = establishQueen(sim, royal);
  q.queen!.reserve = 6;
  q.queen!.reserveP = 11.45; // car-park-verge #1 at its hand-over (sweep-4 review probe)
  addWorkers(sim, workers, { chamber: royal, ageGd: 1 });
  addBrood(sim, 'egg', eggs, royal, eggProgress);
  const op = sim.state.player.opening!;
  op.phase = 'done';
  op.done = true;
  op.lapse = { startTick: 0, endTick: sim.state.tick, skipped: false, outcome: '' };
  sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 4, p: 0 });
  sim.applyPendingCommands();
  return { sim, q, col: colonyOf(sim) };
}

describe('P1 review: the hand-over protein reaches the larvae', () => {
  it('7 workers, 13 fresh eggs: no stage worse than lean while the queen holds it; paid in by the end of the window', () => {
    const { sim, q, col } = handover(7, 0);
    const larvaP = (): number => sim.state.brood.filter((b) => b.alive && b.colony === col.id).reduce((s, b) => s + b.gutP + b.fedP, 0);
    // every 100 ticks: the colony in a starvation stage worse than lean (the viable verdict's stage check) while the
    // queen still holds her provision is R2 broken
    let shortWhileHeld = 0;
    const seen: string[] = [];
    const end = sim.state.tick + Math.round((HANDOVER_PROVISION_WINDOW_GD + 0.5) * TICKS_PER_DAY);
    while (sim.state.tick < end) {
      step(sim, 100);
      const held = q.queen!.reserveP > HANDOVER_QUEEN_KEEP_P + 0.5;
      const short = stageRank(col.starvationStage) >= 2;
      if (held && short) {
        shortWhileHeld++;
        if (seen.length < 4) {
          seen.push(JSON.stringify({
            gd: +(sim.state.tick / TICKS_PER_DAY).toFixed(2), stage: col.starvationStage, larvae: sim.state.brood.filter((b) => b.alive && b.stage === 'larva').length,
            queenP: +q.queen!.reserveP.toFixed(2), poolP: +col.stores.p.toFixed(3), stomachP: +poolCapacity(col).stomachP.toFixed(2),
          }));
        }
      }
    }
    expect(shortWhileHeld, seen.join(' ')).toBe(0);
    const larvae = sim.state.brood.filter((b) => b.alive && b.stage === 'larva').length;
    const msg = JSON.stringify({
      queenP: +q.queen!.reserveP.toFixed(3), poolP: +col.stores.p.toFixed(3), stomachP: +poolCapacity(col).stomachP.toFixed(3),
      larvae, eggs: sim.state.brood.filter((b) => b.alive && b.stage === 'egg').length, larvaP: +larvaP().toFixed(3),
    });
    // R2: what the queen carries above her keep is the larvae's (not hers after the window)
    expect(q.queen!.reserveP, msg).toBeLessThan(HANDOVER_QUEEN_KEEP_P + 1);
  }, 120_000);

  it('9 workers, 3 fresh eggs in a 16 C chamber (suburban-garden #1 of sweep 5): larvae that hatch after the window still get the provision', () => {
    // chamber at 16 C: suburban-garden #1 read 16-22 C in its brood chamber on days 1-6, its eggs hatched on day 4.
    // Restated in round 6 (fix P1d: the protein is paid in for as long as the queen holds it, no window). The review's
    // assertion was "the queen is at her keep 3 gd after the window"; with 3 larvae that is more than they can eat, and
    // the rule is that the provision is the larvae's, so this checks what R2 asks: while the queen holds protein above
    // her keep, no larva meets an empty pool, and what the larvae eat after the window still comes out of her.
    const { sim, q, col } = handover(9, 0, 16, 3);
    const rows: string[] = [];
    const broodDeaths: string[] = [];
    sim.events.on('brood-died', (e) => broodDeaths.push(`${e.stage}:${e.cause}@${(sim.state.tick / TICKS_PER_DAY).toFixed(2)}`));
    let emptyWithLarvae = 0;
    let queenPAtWindow = -1;
    const windowEnd = sim.state.tick + Math.round(HANDOVER_PROVISION_WINDOW_GD * TICKS_PER_DAY);
    const end = sim.state.tick + Math.round((HANDOVER_PROVISION_WINDOW_GD + 3) * TICKS_PER_DAY);
    while (sim.state.tick < end) {
      step(sim, 100);
      if (queenPAtWindow < 0 && sim.state.tick >= windowEnd) queenPAtWindow = q.queen!.reserveP;
      const larvae = sim.state.brood.filter((b) => b.alive && b.colony === col.id && b.stage === 'larva').length;
      if (larvae > 0 && q.queen!.reserveP > HANDOVER_QUEEN_KEEP_P + 0.5 && col.stores.p < 0.05) emptyWithLarvae++;
      if (sim.state.tick % TICKS_PER_DAY < 100) {
        rows.push(JSON.stringify({
          gd: +(sim.state.tick / TICKS_PER_DAY).toFixed(1), queenP: +q.queen!.reserveP.toFixed(2), poolP: +col.stores.p.toFixed(2),
          stage: col.starvationStage, eggs: sim.state.brood.filter((b) => b.alive && b.stage === 'egg').length, larvae,
        }));
      }
    }
    const msg = rows.join(' ') + ' brood deaths: ' + broodDeaths.join(' ');
    expect(emptyWithLarvae, msg).toBe(0);
    expect(broodDeaths.filter((d) => d.startsWith('larva:starv')), msg).toEqual([]);
    // the larvae hatched at the window's end: what they ate after it came out of the queen
    expect(q.queen!.reserveP, msg).toBeLessThan(queenPAtWindow - 0.5);
  }, 120_000);
});
