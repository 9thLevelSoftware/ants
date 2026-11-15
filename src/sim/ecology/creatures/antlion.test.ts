// Antlion pit (GDD 05 E14, §2.4): upslope speed x0.4, a flick every 0.8 s (p 0.6), a grabbed AI worker with no
// help dies in 6.7 s (drag 1.5/s vs AI struggle 2 inputs/s), witnesses learn the pit, rain collapses it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { placeOnSurface } from '@/sim/locomotion';
import { aiSpeed } from '@/sim/locomotion/speed';
import { colonySlotBit } from '@/sim/entities';
import { ANTLION_UPSLOPE_MULT } from '@/sim/balance/creatures';
import { spawnCreatureOfKind, knownHazardsNear } from './index';
import { captureEvents, creatureScene, installFakeCombat, placeWorker, sendQueenAway, setClock, step } from './testkit';
import { ensureHooks } from './hooks';
import { ports } from './ports';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

const X = 150, Z = 150;

function pitScene(): { sim: Sim; pitId: number } {
  const sim = creatureScene({ seed: 5 });
  setClock(sim, 'summer', 3, 14);
  sendQueenAway(sim);
  const al = spawnCreatureOfKind(sim, 'antlion', { x: X, y: 0, z: Z })!;
  return { sim, pitId: al.bb.pit };
}

describe('antlion pit (E14)', () => {
  it('slows an ant heading upslope to x0.4', () => {
    const { sim } = pitScene();
    ensureHooks(sim);
    const ant = placeWorker(sim, X + 12, Z);
    const s = ant.nav.loco ?? ({ speedKind: 'cruise', speedMult: 1, speedFixed: 0 } as never);
    ant.fwd = { x: 1, y: 0, z: 0 }; // away from the centre
    const up = aiSpeed(sim, ant, { ...s, speedKind: 'cruise', speedMult: 1 } as never, { creature: 0 } as never);
    ant.fwd = { x: -1, y: 0, z: 0 };
    const down = aiSpeed(sim, ant, { ...s, speedKind: 'cruise', speedMult: 1 } as never, { creature: 0 } as never);
    expect(up / down).toBeCloseTo(ANTLION_UPSLOPE_MULT, 5);
  });

  it('flicks every 0.8 s and drags a grabbed AI worker under in 6.7 s; a witness learns the pit', () => {
    const { sim, pitId } = pitScene();
    const ant = placeWorker(sim, X + 12, Z);
    ant.maxHp = ant.hp = 10;
    const witness = placeWorker(sim, X + 30, Z); // outside the pit, within 6 L of the flicked ant
    const ev = captureEvents(sim, ['antlion-flick', 'antlion-grab', 'ant-freed']);
    step(sim, 400, () => ev.some((e) => e.ev.type === 'antlion-grab'));
    const flicks = ev.filter((e) => e.ev.type === 'antlion-flick').map((e) => e.tick);
    expect(flicks.length).toBeGreaterThan(0);
    for (let i = 1; i < flicks.length; i++) expect((flicks[i] - flicks[0]) % 8).toBe(0);
    const grab = ev.find((e) => e.ev.type === 'antlion-grab');
    expect(grab).toBeDefined();
    step(sim, 90, () => !ant.alive);
    expect(ant.alive).toBe(false);
    const s = (sim.state.tick - 1 - grab!.tick) / 10;
    expect(s).toBeGreaterThan(6.4);
    expect(s).toBeLessThan(7.0);
    const pit = sim.state.ecology.hazards.find((h) => h.id === pitId)!;
    expect(pit.knownBy & colonySlotBit(sim, witness.colony)).not.toBe(0);
    expect(knownHazardsNear(sim, witness.colony, witness.pos, 100).map((h) => h.id)).toEqual([pitId]);
    expect(pit.state).toBe('feed');
  });

  it('two nestmates pulling free a grabbed worker before it dies', () => {
    const { sim } = pitScene();
    const ant = placeWorker(sim, X + 2, Z);
    const freed = captureEvents(sim, ['ant-freed']);
    step(sim, 2);
    expect(ant.combat?.seizedBy).toBeGreaterThan(0);
    // helpers stand next to it (they would be pulling): +0.10/s each -> 0.11 + 0.2 = 0.31/s -> 3.2 s
    for (const dz of [-2, 2]) {
      const h = placeWorker(sim, ant.pos.x, ant.pos.z + dz);
      placeOnSurface(sim, h, { x: ant.pos.x, y: 0, z: ant.pos.z + dz });
    }
    step(sim, 60, () => freed.length > 0);
    expect(freed.length).toBe(1);
    expect(ant.alive).toBe(true);
  });

  it('rain collapses the pit; no flicks while collapsed', () => {
    const { sim, pitId } = pitScene();
    ports.isRaining = () => true;
    const ev = captureEvents(sim, ['antlion-flick', 'antlion-grab']);
    placeWorker(sim, X + 12, Z);
    step(sim, 30);
    const pit = sim.state.ecology.hazards.find((h) => h.id === pitId)!;
    expect(pit.state).toBe('collapsed');
    expect(ev.length).toBe(0);
  });
});
