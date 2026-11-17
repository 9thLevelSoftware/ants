// possessed-danger (GDD 05 App. C sub-causes "seized", "stuck"; ruling R15: critical) through the real alert engine:
// raised the tick the possessed ant is seized by a predator or paralysed, cleared when it is freed, dies or the
// player leaves it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { addStruggleInput } from './attack';
import {
  captureEvents, creatureScene, installFakeCombat, placeWorker, possess, sendQueenAway, setClock, spawnAt, step,
} from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat({ realAlerts: true }).restore; });
afterEach(() => restore());

const danger = (sim: Sim) => sim.state.progression.alerts.filter((a) => a.kind === 'possessed-danger');

function seizedScene(): { sim: Sim; antId: number } {
  const sim = creatureScene({ seed: 4 });
  setClock(sim, 'summer', 3, 23);
  sendQueenAway(sim);
  const ant = placeWorker(sim, 150, 150);
  ant.maxHp = ant.hp = 60; // survives the hold long enough to watch the card
  possess(sim, ant);
  spawnAt(sim, 'rove-beetle', 150 - 6, 150, { state: 'forage' });
  const seized = captureEvents(sim, ['ant-seized']);
  step(sim, 400, () => seized.length > 0);
  expect(seized.length).toBe(1);
  return { sim, antId: ant.id };
}

describe('possessed-danger from creatures', () => {
  it('is critical with cause "seized" the tick after the grab and clears when the struggle frees the ant', () => {
    const { sim, antId } = seizedScene();
    step(sim, 1);
    const d = danger(sim);
    expect(d.length).toBe(1);
    expect(d[0].level).toBe('critical');
    expect(d[0].cause).toBe('seized');
    expect(d[0].subjectId).toBe(antId);
    const freed = captureEvents(sim, ['ant-freed']);
    for (let i = 0; i < 80 && freed.length === 0; i++) { addStruggleInput(sim, antId); step(sim, 2); }
    expect(freed.length).toBe(1);
    step(sim, 1);
    expect(danger(sim).length).toBe(0);
  });

  it('clears when the player leaves the seized ant', () => {
    const { sim, antId } = seizedScene();
    step(sim, 1);
    expect(danger(sim).length).toBe(1);
    const a = sim.stores.ants.get(antId)!;
    a.flags &= ~AntFlag.POSSESSED;
    sim.state.player.possessedAntId = -1;
    step(sim, 1);
    expect(danger(sim).length).toBe(0);
  });
});
