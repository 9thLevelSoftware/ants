// Independent review after colony-life round 10: R37b (direction 24a) at the level of behaviour, not of findVictim.
// The ruling's own test: "a spider with a line of workers walking past takes one in a game day, the next no sooner
// than SATED_GD after the feed ends". Here a resident jumping spider (no colony-range ramp: only satiation can stop
// it) has one lone worker standing in front of it at all times (a new one is placed when the last is killed), for
// 1.6 game days of summer. It must kill, and after every kill it must strike at nothing until its feed and its
// SATED_GD are over.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ant } from '@/sim/types';
import { FEED_S, SATED_GD } from '@/sim/balance/creatures';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { captureEvents, creatureScene, installFakeCombat, placeWorker, sendQueenAway, setClock, spawnAt } from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

describe('R37b verify: a fed spider does not hunt for SATED_GD (behaviour)', () => {
  it('a resident jumping spider with a lone worker always in reach: no strike between a kill and the end of its satiation', () => {
    const sim = creatureScene({ seed: 9 });
    sim.state.config.difficulty.preset = 'naturalist';
    setClock(sim, 'summer', 3, 8);
    sendQueenAway(sim);
    const terr = sim.state.ecology.director.territories;
    terr.push({ kind: 'jumping-spider', center: { x: 120, y: 0, z: 150 }, radius: 50, occupantId: -1, vacantUntilTick: 0, colonyRange: 0 });
    const spider = spawnAt(sim, 'jumping-spider', 120, 150, { state: 'scan', territoryId: terr.length - 1 });
    terr[terr.length - 1].occupantId = spider.id;
    const strikes = captureEvents(sim, ['predator-strike']);
    const deaths = captureEvents(sim, ['ant-died']);
    let victim: Ant = placeWorker(sim, 132, 150);
    const total = Math.round(1.6 * TICKS_PER_DAY);
    for (let i = 0; i < total; i++) {
      sim.tick();
      if (!victim.alive || !sim.stores.ants.has(victim.id)) {
        // the next worker of the line, where the spider sits now (lone: the last one is dead)
        victim = placeWorker(sim, spider.pos.x + 12, spider.pos.z);
      }
    }
    const kills = deaths.filter((d) => (d.ev as { cause: string }).cause === 'predation').map((d) => d.tick);
    const mine = strikes.filter((s) => (s.ev as { creatureId: number }).creatureId === spider.id).map((s) => s.tick);
    const quiet = Math.round((FEED_S['jumping-spider'] ?? 0) * TICKS_PER_SECOND + (SATED_GD['jumping-spider'] ?? 0) * TICKS_PER_DAY);
    console.log(`R37b verify: ${mine.length} strikes, kills at ticks ${kills.join(', ')}; satiation window ${quiet} ticks`);
    expect(kills.length).toBeGreaterThanOrEqual(1);
    for (const k of kills) {
      const early = mine.filter((t) => t > k + 1 && t < k + quiet);
      expect(early, `strikes within ${quiet} ticks after the kill at tick ${k}`).toEqual([]);
    }
    // one spider, 1.6 gd: at most two meals (the second no sooner than the end of the first satiation)
    expect(kills.length).toBeLessThanOrEqual(2);
  }, 120_000);
});
