// Independent review after colony-life round 10: R37's strike share where it is used (attack.ts landStrike).
// The round's colonyRangeStrike.test.ts drives a whole hunt, and since R37b refuses most victims at acquisition its
// first case passes with or without the share in landStrike ("hit is not true": null = no strike at all); its third
// case reads colonyRangeStrikeShare by itself. This file lands strikes directly (beginWindup + landStrike), so it
// fails if landStrike stops applying the share: at a ramp of 0 a colony-range strike never lands, at a ramp of 0.2
// about a fifth land, and a resident's strike lands every time.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ant, Creature, Sim } from '@/sim/types';
import { predationRamp } from '@/sim/balance/difficulty';
import { beginWindup, landStrike } from './attack';
import { playerWorkers } from './colonyRange';
import { creatureScene, installFakeCombat, placeWorker, possess, sendQueenAway, setClock, spawnAt } from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

function scene(colonyRange: boolean, extraWorkers: number): { sim: Sim; spider: Creature; ant: Ant } {
  const sim = creatureScene({ seed: 11 });
  sim.state.config.difficulty.preset = 'naturalist';
  setClock(sim, 'summer', 3, 14);
  sendQueenAway(sim);
  const ant = placeWorker(sim, 126, 150);
  possess(sim, ant); // no AI dodge: only the share can make a strike miss
  for (let i = 0; i < extraWorkers; i++) placeWorker(sim, 20 + (i % 10) * 3, 400 + Math.floor(i / 10) * 3);
  const terr = sim.state.ecology.director.territories;
  terr.push({ kind: 'jumping-spider', center: { x: 120, y: 0, z: 150 }, radius: 50, occupantId: -1, vacantUntilTick: 0, colonyRange: colonyRange ? 1 : 0 });
  const spider = spawnAt(sim, 'jumping-spider', 120, 150, { state: 'scan', territoryId: terr.length - 1 });
  terr[terr.length - 1].occupantId = spider.id;
  return { sim, spider, ant };
}

/** n strikes aimed at the ant where she stands (healed and un-immune before each); returns how many landed. */
function landed(sim: Sim, spider: Creature, ant: Ant, n: number): number {
  let hits = 0;
  for (let i = 0; i < n; i++) {
    sim.state.tick += 50; // past the 1 s immunity after the last strike
    ant.hp = ant.maxHp = 1000; // never killed: the strike only counts
    beginWindup(sim, spider, ant);
    if (landStrike(sim, spider, false) !== 'miss') hits++;
  }
  return hits;
}

describe('R37 verify: landStrike applies the colony-size ramp to colony-range strikes', () => {
  it('ramp 0 (one worker): a colony-range strike never lands; a resident strike always does', () => {
    const cr = scene(true, 0);
    expect(predationRamp(cr.sim, playerWorkers(cr.sim))).toBe(0);
    expect(landed(cr.sim, cr.spider, cr.ant, 40)).toBe(0);
    const res = scene(false, 0);
    expect(landed(res.sim, res.spider, res.ant, 40)).toBe(40);
  });

  it('ramp 0.2 (16 workers): about a fifth of the colony-range strikes land', () => {
    const { sim, spider, ant } = scene(true, 15);
    expect(predationRamp(sim, playerWorkers(sim))).toBeCloseTo(0.2, 9);
    const n = 400, hits = landed(sim, spider, ant, n);
    console.log(`R37 verify: ${hits} of ${n} colony-range strikes landed at ramp 0.2`);
    expect(hits / n).toBeGreaterThan(0.12);
    expect(hits / n).toBeLessThan(0.28);
  });
});
