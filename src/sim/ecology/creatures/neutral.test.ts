// Neutral fauna (GDD 05 §2.2b): woodlice roll, snails retract and leave slime (ant speed x0.7), stranded worms die
// in daylight and become a large carcass, millipedes coil and repel the biter.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aiSpeed } from '@/sim/locomotion/speed';
import { SLIME_SPEED_MULT, WOODLOUSE_ROLLED_ARMOUR, WORM_DYING_GD } from '@/sim/balance/creatures';
import { TICKS_PER_DAY } from '@/sim/time';
import { creatureArmour, noteCreatureHit, threatsNear } from './index';
import { ensureHooks } from './hooks';
import { creatureScene, installFakeCombat, placeWorker, sendQueenAway, setClock, spawnAt, step } from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

describe('neutral fauna', () => {
  it('a rolling woodlouse rolls after 2 bites (armour 0.9), others do not', () => {
    const sim = creatureScene({ seed: 1 });
    setClock(sim, 'summer', 3, 23);
    const roller = spawnAt(sim, 'woodlouse', 200, 200, { state: 'wander', bb: { roller: 1 } });
    const other = spawnAt(sim, 'woodlouse', 300, 300, { state: 'wander', bb: { roller: 0 } });
    for (const c of [roller, other]) { noteCreatureHit(sim, c.id, -1, 'bite'); noteCreatureHit(sim, c.id, -1, 'bite'); }
    expect(roller.state).toBe('roll');
    expect(creatureArmour(roller)).toBe(WOODLOUSE_ROLLED_ARMOUR);
    expect(other.state).not.toBe('roll');
    expect(creatureArmour(other)).toBe(0.5);
  });

  it('woodlice shelter at home by day', () => {
    const sim = creatureScene({ seed: 1 });
    setClock(sim, 'summer', 3, 12);
    const w = spawnAt(sim, 'woodlouse', 200, 200, { state: 'wander' });
    step(sim, 5);
    expect(w.state).toBe('shelter');
  });

  it('a crawling snail leaves slime: ants on it walk at x0.7; touched, it retracts', () => {
    const sim = creatureScene({ seed: 1 });
    setClock(sim, 'summer', 3, 23);
    sendQueenAway(sim);
    ensureHooks(sim);
    const sn = spawnAt(sim, 'snail', 200, 200, { state: 'graze', stateS: 0.1 });
    step(sim, 600);
    const slime = sim.state.ecology.hazards.filter((h) => h.kind === 'slime-trail');
    expect(slime.length).toBeGreaterThan(0);
    const ant = placeWorker(sim, slime[0].pos.x, slime[0].pos.z);
    const s = { speedKind: 'cruise', speedMult: 1, speedFixed: 0 } as never;
    const on = aiSpeed(sim, ant, s, { creature: 0 } as never);
    ant.pos.x += 50;
    const off = aiSpeed(sim, ant, s, { creature: 0 } as never);
    expect(on / off).toBeCloseTo(SLIME_SPEED_MULT, 5);
    placeWorker(sim, sn.pos.x + sn.radius, sn.pos.z);
    step(sim, 12);
    expect(sn.state).toBe('retract');
  });

  it('a worm stranded on pavement dies after 0.3 gd of daylight and leaves 120 P', () => {
    const sim = creatureScene({ seed: 1 });
    setClock(sim, 'summer', 3, 9);
    const w = spawnAt(sim, 'earthworm', 200, 200, { state: 'surface', bb: { stranded: 1 } });
    step(sim, 2);
    expect(w.state).toBe('dying');
    step(sim, Math.round(WORM_DYING_GD * TICKS_PER_DAY) + 2);
    expect(w.alive).toBe(false);
    const src = sim.stores.sources.list.find((s) => s.alive && s.kind === 'carrion');
    expect(src).toBeDefined();
    expect(src!.p * src!.units).toBeCloseTo(120, 6);
  });

  it('a surface worm burrows (despawns) at dawn', () => {
    const sim = creatureScene({ seed: 1 });
    setClock(sim, 'summer', 3, 10);
    const w = spawnAt(sim, 'earthworm', 200, 200, { state: 'surface' });
    step(sim, 100);
    expect(w.alive).toBe(false);
  });

  it('a bitten millipede coils; its secretion repels ants nearby for 4 s', () => {
    const sim = creatureScene({ seed: 1 });
    setClock(sim, 'summer', 3, 23);
    const m = spawnAt(sim, 'millipede', 200, 200, { state: 'wander' });
    noteCreatureHit(sim, m.id, -1, 'bite');
    expect(m.state).toBe('coil');
    const t0 = sim.state.tick;
    step(sim, 1); // the entity index sees it
    const t = threatsNear(sim, m.pos, 20).find((x) => x.creatureId === m.id);
    expect(t).toBeDefined();
    expect(t!.repelUntilTick - t0).toBe(40);
  });
});
