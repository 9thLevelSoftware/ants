// Bird event (GDD 05 §2.6, E15): approach 3.0 s before landing, a peck every 1.5 s, at most 12 kills, covered
// ants never targeted; the hourly roll respects the worker minimum, the gap and the threat director.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Primitive } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { BIRD_MAX_KILLS } from '@/sim/balance/creatures';
import { triggerBird } from './index';
import { birdHourly, isExposedAnt } from './bird';
import { conditions } from './conditions';
import { requestMajorThreat, endMajorThreat } from './threat';
import { captureEvents, creatureScene, installFakeCombat, placeWorker, quietHistory, sendQueenAway, setClock, step } from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

const C = 250;
/** A low slab 8 mm above the ground over x in [C+40, C+70]: cover for the ants under it. */
const slab: Primitive = {
  id: 1, shape: 'box', pos: { x: C + 55, y: 9, z: C }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 15, y: 1, z: 15 }, round: 0,
  material: 'stone', flags: PrimFlag.SHELTER, objectId: -1,
};

function birdScene() {
  const sim = creatureScene({ seed: 4, prims: [slab] });
  setClock(sim, 'summer', 2, 12);
  sendQueenAway(sim);
  quietHistory(sim, 20);
  const exposed = [];
  for (let i = 0; i < 20; i++) exposed.push(placeWorker(sim, C - 40 + (i % 5) * 10, C - 20 + Math.floor(i / 5) * 10));
  const covered = [placeWorker(sim, C + 50, C), placeWorker(sim, C + 60, C + 5)];
  return { sim, exposed, covered };
}

describe('bird event (E15)', () => {
  it('approach 3.0 s before landing, pecks every 1.5 s, <= 12 kills, covered workers never targeted', () => {
    const { sim, exposed, covered } = birdScene();
    expect(covered.every((a) => !isExposedAnt(sim, a))).toBe(true);
    expect(exposed.every((a) => isExposedAnt(sim, a))).toBe(true);
    const ev = captureEvents(sim, ['bird-approach', 'bird-landed', 'bird-peck', 'bird-left']);
    expect(triggerBird(sim, 'thrush', { x: C, y: 0, z: C }, false)).toBe(true);
    step(sim, 600, () => ev.some((e) => e.ev.type === 'bird-left'));
    const at = (t: string) => ev.filter((e) => e.ev.type === t).map((e) => e.tick);
    expect(at('bird-landed')[0] - at('bird-approach')[0]).toBe(30);
    const pecks = at('bird-peck');
    expect(pecks.length).toBeGreaterThan(5);
    for (let i = 1; i < pecks.length; i++) expect(pecks[i] - pecks[i - 1]).toBe(15);
    const left = ev.find((e) => e.ev.type === 'bird-left')!.ev as { kills: number };
    expect(left.kills).toBeLessThanOrEqual(BIRD_MAX_KILLS);
    expect(left.kills).toBeGreaterThan(0);
    const targets = ev.filter((e) => e.ev.type === 'bird-peck').map((e) => (e.ev as { targetId: number }).targetId);
    for (const c of covered) expect(targets).not.toContain(c.id);
    expect(covered.every((a) => a.alive)).toBe(true);
    expect(sim.state.rivals.threatDirector.activeKind).toBe(null);
  });

  it('the hourly roll needs >= 30 workers and >= 15 exposed ants, keeps 0.5 gd gaps and asks the threat director', () => {
    const { sim } = birdScene();
    const cond = conditions(sim);
    // 22 workers: never
    for (let i = 0; i < 300; i++) expect(birdHourly(sim, cond)).toBe(false);
    for (let i = 0; i < 10; i++) placeWorker(sim, C - 40 + i * 8, C + 30);
    step(sim, 1); // the entity index sees the new workers
    // another major threat active: refused
    expect(requestMajorThreat(sim, 'raid')).toBe(true);
    for (let i = 0; i < 300; i++) expect(birdHourly(sim, cond)).toBe(false);
    endMajorThreat(sim, 'raid');
    sim.state.rivals.threatDirector.lastEndTick = -1;
    let started = false;
    for (let i = 0; i < 2000 && !started; i++) started = birdHourly(sim, cond);
    expect(started).toBe(true);
    expect(sim.state.ecology.birdEvent).not.toBe(null);
  });
});
