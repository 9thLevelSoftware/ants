// Ruling R37b (direction 24a): a hunter that has eaten does not hunt. After the feed that follows a kill a spider is
// sated for SATED_GD (1.0 gd; centipede and rove beetle 0.5) and takes no victim; and a colony-range hunter takes a
// small player colony's worker at the colony-size ramp's share, one draw per acquisition (refused: it leaves that
// colony's workers alone for COLONY_RANGE_REFUSE_GD).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COLONY_RANGE_REFUSE_GD, FEED_S, SATED_GD } from '@/sim/balance/creatures';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { findVictim, startFeed } from './predator';
import { creatureScene, installFakeCombat, placeWorker, sendQueenAway, setClock, spawnAt } from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

function scene(colonyRange: boolean) {
  const sim = creatureScene({ seed: 9 });
  sim.state.config.difficulty.preset = 'naturalist';
  setClock(sim, 'summer', 3, 14);
  sendQueenAway(sim);
  const ant = placeWorker(sim, 125, 150);
  const terr = sim.state.ecology.director.territories;
  terr.push({ kind: 'jumping-spider', center: { x: 120, y: 0, z: 150 }, radius: 50, occupantId: -1, vacantUntilTick: 0, colonyRange: colonyRange ? 1 : 0 });
  const spider = spawnAt(sim, 'jumping-spider', 120, 150, { state: 'scan', territoryId: terr.length - 1 });
  sim.index.refresh();
  return { sim, ant, spider };
}

describe('R37b: sated hunters and the ramp at acquisition', () => {
  it('a spider that has fed takes no victim for SATED_GD after its feed, then hunts again', () => {
    const { sim, ant, spider } = scene(false);
    const rule = { rangeMm: 200 };
    expect(findVictim(sim, spider, rule)?.id).toBe(ant.id);
    startFeed(sim, spider);
    const end = sim.state.tick + (FEED_S['jumping-spider'] ?? 0) * TICKS_PER_SECOND + (SATED_GD['jumping-spider'] ?? 0) * TICKS_PER_DAY;
    expect(SATED_GD['jumping-spider']).toBe(1);
    sim.state.tick = end - 1;
    expect(findVictim(sim, spider, rule)).toBeNull();
    sim.state.tick = end;
    expect(findVictim(sim, spider, rule)?.id).toBe(ant.id);
  });

  it('a colony-range spider at a ramp of 0 refuses the worker and ignores the colony for COLONY_RANGE_REFUSE_GD', () => {
    const { sim, ant, spider } = scene(true);
    const rule = { rangeMm: 200 };
    expect(findVictim(sim, spider, rule)).toBeNull(); // 1 worker: ramp 0
    expect(spider.bb.ignoreColony).toBe(ant.colony);
    expect(spider.bb.ignoreUntil).toBe(sim.state.tick + Math.round(COLONY_RANGE_REFUSE_GD * TICKS_PER_DAY));
  });

  it('at the ramp upper count a colony-range spider acquires as before', () => {
    const { sim, ant, spider } = scene(true);
    for (let i = 0; i < 40; i++) placeWorker(sim, 20 + (i % 10) * 3, 400 + Math.floor(i / 10) * 3);
    expect(findVictim(sim, spider, { rangeMm: 200 })?.id).toBe(ant.id);
  });
});
