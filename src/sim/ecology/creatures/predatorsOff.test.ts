// AC3 "zero with predators off" for a game already running (GDD 06 §14: a toggle that removes a threat applies at
// once, existing creatures despawn over 1 GD): residents present when the Predators setting goes to `off` leave -
// unseen ones at the next director run, one in view of the focus within SETTING_DESPAWN_GD - and no telegraph
// follows. Lowering the setting keeps the cap's worth nearest the colony.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { SETTING_DESPAWN_GD } from '@/sim/balance/creatures';
import { TICKS_PER_DAY } from '@/sim/time';
import { capOf } from './caps';
import { captureEvents, creatureScene, installFakeCombat, placeWorker, setClock, spawnAt, step } from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

function setPredators(sim: Sim, v: 'off' | 'few'): void {
  sim.state.config.difficulty.custom = { ...sim.state.config.difficulty.custom, predators: v };
  sim.state.config.rules = { ...sim.state.config.rules, predators: v };
}

describe('Predators setting lowered mid-game', () => {
  it('off: every ant predator leaves within 1 gd and none strikes', () => {
    const sim = creatureScene({ seed: 9, director: true, sizeBu: 200 });
    setClock(sim, 'summer', 3, 12);
    const ant = placeWorker(sim, 400, 400);
    for (const [k, x] of [['wolf-spider', 380], ['jumping-spider', 700], ['rove-beetle', 100]] as const) spawnAt(sim, k, x, 400, {});
    setPredators(sim, 'off');
    const tele = captureEvents(sim, ['predator-telegraph']);
    step(sim, Math.round(SETTING_DESPAWN_GD * TICKS_PER_DAY) + 100);
    expect(sim.state.creatures.filter((c) => c.alive && ['wolf-spider', 'jumping-spider', 'rove-beetle'].includes(c.kind)).length).toBe(0);
    expect(tele.length).toBe(0);
    expect(ant.alive).toBe(true);
  }, 30_000);

  it('few: the cap x 0.4 nearest the colony stay, the rest leave', () => {
    const sim = creatureScene({ seed: 9, director: true, sizeBu: 200 });
    setClock(sim, 'summer', 3, 12);
    for (const x of [200, 300, 500, 700]) spawnAt(sim, 'jumping-spider', x, 400, {});
    setPredators(sim, 'few');
    step(sim, Math.round(SETTING_DESPAWN_GD * TICKS_PER_DAY) + 100);
    const left = sim.state.creatures.filter((c) => c.alive && c.kind === 'jumping-spider').length;
    expect(left).toBe(capOf(sim, 'jumping-spider'));
  }, 30_000);
});
