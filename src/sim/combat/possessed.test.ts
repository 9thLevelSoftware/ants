// Acceptance criterion 5: the possessed ant's bite, hold, spray and dodge go through the same primitives and the
// same combat rules as an autonomous ant's, and change the state the same way. App. E 11 (acid spray) too.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { idleIntent } from '@/sim/types';
import { begin } from '@/sim/ants/actions';
import { ant, arena, faceToFace, record, step } from './testkit';
import { setDodgeDirection } from './index';

type Verb = 'bite' | 'bite-hold' | 'spray-acid' | 'dodge';

interface Outcome {
  targetHp: number;
  lock: number;
  acid: number;
  moved: number;
  dodgeCd: number;
  hits: string;
}

/** One scene: the player worker uses `verb` on its rival, either possessed (commands) or as the AI would (begin). */
function scene(verb: Verb, possessed: boolean, seed = 4, noRng = false): Outcome {
  const a = arena({ seed, manual: true, flags: { noRetreat: true, noRng } });
  const [p, q] = faceToFace(a, verb === 'spray-acid' ? 1.2 : 0.9);
  const sim: Sim = a.sim;
  if (possessed) { sim.enqueue({ type: 'possess', antId: p.id }); step(sim, 1); } else step(sim, 1);
  const hits = record(sim, ['combat-hit', 'combat-lock', 'combat-spray']);
  const target = verb === 'spray-acid' || verb === 'dodge' ? null : { kind: 'ant' as const, id: q.id, pos: { ...q.pos } };
  const p0 = { ...p.pos };
  const side = { x: 0, y: 0, z: 1 };
  if (possessed) {
    if (verb === 'dodge') sim.setPlayerIntent({ ...idleIntent(), dir: side });
    sim.enqueue({ type: 'action', actionId: verb, ...(target ? { target } : {}), phase: 'start' });
    step(sim, 1);
    sim.setPlayerIntent(idleIntent());
  } else {
    if (verb === 'dodge') setDodgeDirection(p, side);
    expect(begin(sim, p, verb, target)).toBe(true);
    step(sim, 1);
  }
  step(sim, 35);
  sim.events.flush();
  return {
    targetHp: q.hp, lock: p.combat?.lock?.targetId ?? -1, acid: p.acid, moved: Math.round(Math.hypot(p.pos.x - p0.x, p.pos.z - p0.z) * 100) / 100,
    dodgeCd: (p.combat?.dodgeCdTick ?? 0) - sim.state.tick, hits: JSON.stringify(hits.map((h) => [h.type, h.dmg ?? '', h.kind ?? ''])),
  };
}

describe('possessed and autonomous ants share the combat verbs (criterion 5)', () => {
  for (const verb of ['bite', 'bite-hold', 'spray-acid', 'dodge'] as const) {
    it(`${verb}: same state changes`, () => {
      for (const seed of [4, 5]) expect(scene(verb, true, seed)).toEqual(scene(verb, false, seed));
      const ai = scene(verb, false, 4, true);
      expect(scene(verb, true, 4, true)).toEqual(ai);
      if (verb === 'bite') expect(ai.targetHp).toBe(9);
      if (verb === 'bite-hold') { expect(ai.lock).toBeGreaterThanOrEqual(0); expect(ai.targetHp).toBeLessThan(10); }
      if (verb === 'spray-acid') { expect(ai.acid).toBe(4); expect(ai.targetHp).toBeCloseTo(7.5, 6); }
      if (verb === 'dodge') expect(ai.moved).toBeCloseTo(12, 0); // 3 L of a 4 mm worker
    });
  }
});

describe('acid spray (App. E 11)', () => {
  it('one charge, 2.5 acid over 2 s on the rival in the cone, nothing on the one at 1.8 L, alarm 1.0, 3 s cooldown, regen', () => {
    const a = arena({ seed: 2, manual: true, flags: { noRetreat: true } });
    const sim = a.sim;
    const [p, near] = faceToFace(a, 1.2);
    // the second rival 1.8 L ahead: outside the 1.5 L range
    const farAnt = ant(sim, a.rival, p.pos.x / sim.world.bu + 1.8, p.pos.z / sim.world.bu, 'worker', { x: -1, y: 0, z: 0 });
    sim.index.refresh();
    const deposits: number[] = [];
    const real = sim.phero.deposit.bind(sim.phero);
    sim.phero.deposit = (c, ch, pos, amt) => { if (ch === 'alarm' && c === p.colony) deposits.push(amt); real(c, ch, pos, amt); };
    sim.enqueue({ type: 'possess', antId: p.id });
    step(sim, 1);
    const ev = record(sim, ['combat-spray']);
    sim.enqueue({ type: 'action', actionId: 'spray-acid', phase: 'start' });
    step(sim, 12); // 0.8 + 0.3 s
    expect(p.acid).toBe(4);
    expect(deposits[0]).toBe(1);
    expect(near.hp).toBeGreaterThan(9.5); // acid flows over 2 s
    expect(near.hp).toBeLessThan(10);
    step(sim, 20);
    expect(near.hp).toBeCloseTo(7.5, 6); // health -0.25
    expect(farAnt.hp).toBe(10);
    sim.events.flush();
    expect(ev[0]).toMatchObject({ antId: p.id, hitIds: [near.id] });
    sim.enqueue({ type: 'action', actionId: 'spray-acid', phase: 'start' });
    const fails = record(sim, ['action-failed']);
    step(sim, 1);
    sim.events.flush();
    expect(fails[0]).toMatchObject({ action: 'spray-acid', reason: 'cooldown' });
    step(sim, 1200);
    expect(p.acid).toBe(5);
  });
});

