// Ruling R37 (direction 23 item 3): the R25 colony-size ramp also scales what a colony-range hunter takes. Sweep 9's
// suburban-garden #2 lost 6 of 15 workers in one day to one colony-range ant-spider sited at a ramp of 0.17: the ramp
// had only multiplied the siting draw (a fixed draw per world). A colony-range hunter's strike on a player worker now
// lands at the ramp's share; a resident of worldgen's own territories strikes as before.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { predationRamp } from '@/sim/balance/difficulty';
import { installFakeCombat, captureEvents, creatureScene, placeWorker, possess, sendQueenAway, setClock, spawnAt, step } from './testkit';
import { colonyRangeStrikeShare, playerWorkers } from './colonyRange';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

/**
 * One jumping-spider strike on a possessed worker (no AI dodge); `colonyRange`: its territory is a colony-range one.
 * hit is null when no strike came within 400 ticks (R37b: a colony-range hunter may refuse the victim at acquisition).
 */
function strike(colonyRange: boolean, extraWorkers: number, run = true): { sim: Sim; hit: boolean | null } {
  const sim = creatureScene({ seed: 9 });
  sim.state.config.difficulty.preset = 'naturalist';
  setClock(sim, 'summer', 3, 14);
  sendQueenAway(sim);
  const ant = placeWorker(sim, 150, 150);
  ant.maxHp = ant.hp = 10;
  possess(sim, ant);
  for (let i = 0; i < extraWorkers; i++) placeWorker(sim, 20 + (i % 10) * 3, 400 + Math.floor(i / 10) * 3);
  const terr = sim.state.ecology.director.territories;
  terr.push({ kind: 'jumping-spider', center: { x: 120, y: 0, z: 150 }, radius: 50, occupantId: -1, vacantUntilTick: 0, colonyRange: colonyRange ? 1 : 0 });
  const spider = spawnAt(sim, 'jumping-spider', 120, 150, { state: 'scan', territoryId: terr.length - 1 });
  terr[terr.length - 1].occupantId = spider.id;
  if (!run) return { sim, hit: null };
  const ev = captureEvents(sim, ['predator-strike']);
  step(sim, 400, () => ev.length > 0);
  return { sim, hit: ev.length > 0 ? (ev[0].ev as { hit: boolean }).hit : null };
}

describe('R37: the colony-size ramp scales a colony-range hunter strikes', () => {
  it('at a ramp of 0 (a colony of 1 worker) a colony-range spider never lands; a resident does', () => {
    const cr = strike(true, 0);
    expect(predationRamp(cr.sim, playerWorkers(cr.sim))).toBe(0);
    expect(cr.hit).not.toBe(true); // R37b refuses the victim at acquisition (null); a strike would miss (false)
    expect(strike(false, 0).hit).toBe(true);
  });

  it('at the ramp upper count (40 workers on Naturalist) it lands as before', () => {
    const r = strike(true, 40);
    expect(predationRamp(r.sim, playerWorkers(r.sim))).toBe(1);
    expect(r.hit).toBe(true);
  });

  it('the share is the ramp for colony-range hunters and 1 for others', () => {
    const { sim } = strike(true, 15, false); // 16 workers: (16 - 10) / 30
    const t = sim.state.ecology.director.territories.length - 1;
    const col = sim.state.colonies.find((c) => c.isPlayer)!.id;
    expect(colonyRangeStrikeShare(sim, { territoryId: t }, col)).toBeCloseTo(6 / 30, 9);
    expect(colonyRangeStrikeShare(sim, { territoryId: -1 }, col)).toBe(1);
    expect(colonyRangeStrikeShare(sim, { territoryId: t }, col + 999)).toBe(1);
  });
});
