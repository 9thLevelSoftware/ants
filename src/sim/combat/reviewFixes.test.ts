// Regression tests for the fixes made after the combat review: holder follow speed and the dodge under a lock
// (§4.3, §4.8), the pinned ant's front holder (§4.3), the gentle founding queen beyond the attack roll (§3.10),
// acid doses (§4.4), the gaster wound and the spray (§4.7), fight exit at low health (GDD 02 §10.13), queens
// defending themselves (§3.10, §4.1) and the fight alarm deposit (GDD 02 §8 ALARM_FIGHT_RATE).
import { describe, expect, it } from 'vitest';
import { begin } from '@/sim/ants/actions';
import { casteSpeeds } from '@/sim/locomotion';
import { createColony } from '@/sim/entities';
import { ant, arena, faceToFace, MANUAL_TASK, record, step } from './testkit';
import {
  beginGrapple, endFight, engage, injure, resolveBite, startDodge, startFight,
} from './index';
import { heldSpeedFactor } from './grapple';
import { scheduleDose, tickDoses } from './doses';
import { CB } from './state';

describe('movement under a lock (§4.3) and the dodge (§4.8)', () => {
  it('a held ant that its holders do not immobilise dodges a shortened distance; the holder never outruns its own speed', () => {
    const a = arena({ seed: 5, manual: true, flags: { noRetreat: true, noRng: true } });
    const sim = a.sim;
    const cp = createColony(sim, { species: 'camponotus-pennsylvanicus', isPlayer: false });
    const cp2 = createColony(sim, { species: 'camponotus-pennsylvanicus', isPlayer: false });
    const big = ant(sim, cp.id, 40, 40, 'major', { x: 1, y: 0, z: 0 }, 1.5);
    const small = ant(sim, cp2.id, 40 - (big.radius * 2) / sim.world.bu - 0.4, 40, 'minor', { x: 1, y: 0, z: 0 }, 0.78);
    big.task = MANUAL_TASK; small.task = MANUAL_TASK;
    sim.index.refresh();
    expect(beginGrapple(sim, small.id, 'ant', big.id)).toBe(true);
    const f = heldSpeedFactor(sim, { kind: 'ant', ant: big });
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(1);
    big.bb[CB.dodgeX] = 1; big.bb[CB.dodgeY] = 0; big.bb[CB.dodgeZ] = 0;
    expect(startDodge(sim, big)).toBe(true);
    expect(big.bb[CB.dodgeLeft]).toBeCloseTo(3 * big.lengthBu * sim.world.bu * f, 6);
    const big0 = { ...big.pos };
    let prev = { ...small.pos }, prevBig = { ...big.pos };
    let maxStep = 0, bigStep = 0;
    for (let i = 0; i < 10; i++) {
      step(sim, 1);
      maxStep = Math.max(maxStep, Math.hypot(small.pos.x - prev.x, small.pos.z - prev.z));
      bigStep = Math.max(bigStep, Math.hypot(big.pos.x - prevBig.x, big.pos.z - prevBig.z));
      prev = { ...small.pos }; prevBig = { ...big.pos };
    }
    const moved = Math.hypot(big.pos.x - big0.x, big.pos.z - big0.z);
    expect(moved).toBeLessThanOrEqual(3 * big.lengthBu * sim.world.bu * f + 1e-6);
    // the holder follows at most at its sprint x 0.3 (one tick = 0.1 s)
    const cap = casteSpeeds('camponotus-pennsylvanicus', 'minor', sim.world.bu).sprint * 0.3 * 0.1;
    expect(maxStep).toBeLessThanOrEqual(cap + 1e-6);
    expect(maxStep).toBeLessThan(bigStep); // it could not keep up with the dodge
  });

  it('a held ant that cannot move refuses the dodge', () => {
    const a = arena({ seed: 3, manual: true, flags: { noRetreat: true, noRng: true } });
    const [p, q] = faceToFace(a);
    p.task = MANUAL_TASK; q.task = MANUAL_TASK;
    expect(beginGrapple(a.sim, p.id, 'ant', q.id)).toBe(true);
    expect(heldSpeedFactor(a.sim, { kind: 'ant', ant: q })).toBe(0);
    expect(startDodge(a.sim, q)).toBe(false);
  });
});

describe('pin (§4.3): the front holder', () => {
  it('a pinned AI fighter bites the holder in front of it and never the one at its side', () => {
    const a = arena({ seed: 3, manual: true, flags: { noRetreat: true, noRng: true } });
    const sim = a.sim;
    const v = ant(sim, a.rival, 40, 40, 'worker', { x: 1, y: 0, z: 0 });
    const front = ant(sim, a.home, 40.9, 40, 'worker', { x: -1, y: 0, z: 0 });
    const side = ant(sim, a.home, 40, 40.9, 'worker', { x: 0, y: 0, z: -1 });
    front.task = MANUAL_TASK; side.task = MANUAL_TASK;
    front.hp = 1e4; side.hp = 1e4; v.hp = 1e4;
    v.acid = 0;
    sim.index.refresh();
    expect(beginGrapple(sim, front.id, 'ant', v.id)).toBe(true);
    expect(beginGrapple(sim, side.id, 'ant', v.id)).toBe(true);
    expect(v.combat?.pinned).toBe(true);
    // keep the holders from biting, so the test watches the victim only
    const hits = record(sim, ['combat-hit']);
    expect(engage(sim, v.id, 'ant', side.id)).toBe(true);
    for (let i = 0; i < 40; i++) { front.bb[CB.holdNext] = sim.state.tick + 100; side.bb[CB.holdNext] = sim.state.tick + 100; step(sim, 1); }
    sim.events.flush();
    const mine = hits.filter((h) => h.attackerId === v.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((h) => h.targetId === front.id)).toBe(true);
    expect(v.fwd.x).toBeCloseTo(1, 6);
  });
});

describe('gentle founding queen (§3.10) through recruitment and the hit reaction', () => {
  function gentle(): { a: ReturnType<typeof arena>; q: ReturnType<typeof ant>; foe: ReturnType<typeof ant> } {
    const a = arena({ seed: 8 });
    const sim = a.sim;
    sim.state.config.difficulty.preset = 'gentle';
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    const bu = sim.world.bu;
    const foe = ant(sim, a.rival, q.pos.x / bu + 2.5, q.pos.z / bu, 'worker', { x: -1, y: 0, z: 0 });
    sim.index.refresh();
    return { a, q, foe };
  }

  it('an alarm whose attacker is the queen recruits toward the alarm point, never against her', () => {
    const { a, q, foe } = gentle();
    foe.alarmLevel = 2;
    foe.bb[CB.alarmX] = q.pos.x; foe.bb[CB.alarmY] = q.pos.y; foe.bb[CB.alarmZ] = q.pos.z;
    foe.bb[CB.alarmBy] = q.id;
    step(a.sim, 100);
    expect(q.hp).toBe(q.maxHp);
    expect(foe.bb[CB.tgtKind] === 1 && foe.bb[CB.tgtId] === q.id).toBe(false);
  });

  it('a rival bitten by the protected queen backs off instead of fighting her', () => {
    const { a, q, foe } = gentle();
    const bu = a.sim.world.bu;
    foe.pos.x = q.pos.x + 1.4 * bu;
    a.sim.index.refresh();
    let landed = 0;
    for (let i = 0; i < 20 && landed === 0; i++) landed = resolveBite(a.sim, q, 'ant', foe.id, false);
    expect(landed).toBeGreaterThan(0);
    step(a.sim, 10);
    expect(foe.task).toBe('flee');
  });
});

describe('acid doses (§4.4)', () => {
  it('every dose runs on its own 2 s clock; doses past the slots merge and are still delivered in full', () => {
    const bb: Record<string, number> = {};
    for (let i = 0; i < 6; i++) scheduleDose(bb, 1, 2, 100 + i);
    let dealt = 0;
    const by = new Set<number>();
    for (let t = 0; t < 20; t++) tickDoses(bb, (d, src) => { dealt += d; by.add(src); return true; });
    // 4 slots: 2 merged doses ride on one slot at twice its rate, all within the 2 s
    expect(dealt).toBeCloseTo(6, 9);
    expect(bb[CB.acidLeft]).toBeUndefined();
    expect(by.size).toBe(4);
  });
});

describe('gaster wound (§4.7)', () => {
  it('a wounded formicine cannot start a spray: no charge spent, no combat-spray, no own-spray alarm', () => {
    const a = arena({ manual: true, flags: { noRng: true } });
    const [p, q] = faceToFace(a, 1.2);
    p.task = MANUAL_TASK; q.task = MANUAL_TASK;
    injure(a.sim, p, 'gaster');
    step(a.sim, 1);
    const acid0 = p.acid;
    const ev = record(a.sim, ['combat-spray', 'alarm-raised']);
    expect(begin(a.sim, p, 'spray-acid', null)).toBe(false);
    step(a.sim, 15);
    a.sim.events.flush();
    expect(p.acid).toBe(acid0);
    expect(ev).toEqual([]);
    expect(q.hp).toBe(q.maxHp);
  });
});

describe('fight exit (GDD 02 §10.13)', () => {
  it('below 0.25 health: rest at once inside the nest, flee outside; otherwise resume the earlier task', () => {
    const a = arena({ manual: true, nest: true });
    const sim = a.sim;
    const nid = sim.state.colonies[0].nestIds[0];
    const [p] = faceToFace(a);
    p.task = 'forage';
    expect(startFight(sim, p, null, p.pos, 'alarm')).toBe(true);
    expect(p.task).toBe('fight');
    p.hp = 2;
    p.nestId = nid;
    endFight(sim, p);
    expect(p.task).toBe('rest');
    p.task = 'forage';
    startFight(sim, p, null, p.pos, 'alarm');
    p.nestId = -1;
    endFight(sim, p);
    expect(p.task).toBe('flee');
    p.task = 'forage';
    p.hp = 9;
    startFight(sim, p, null, p.pos, 'alarm');
    endFight(sim, p);
    expect(p.task).toBe('forage');
  });
});

describe('queens defend themselves in place (§3.10, §4.1)', () => {
  it('a bitten AI founding queen answers with her spray or bite, keeps her task and does not leave', () => {
    const a = arena({ seed: 4, manual: true, flags: { noRetreat: true } });
    const sim = a.sim;
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    const bu = sim.world.bu;
    const foe = ant(sim, a.rival, q.pos.x / bu - 1.6, q.pos.z / bu, 'worker', { x: 1, y: 0, z: 0 });
    foe.task = MANUAL_TASK;
    foe.hp = 1e4;
    sim.index.refresh();
    const task0 = q.task;
    const hits = record(sim, ['combat-hit']);
    let landed = 0;
    for (let i = 0; i < 20 && landed === 0; i++) landed = resolveBite(sim, foe, 'ant', q.id, false);
    expect(landed).toBeGreaterThan(0);
    step(sim, 30);
    sim.events.flush();
    expect(hits.some((h) => h.attackerId === q.id && h.targetId === foe.id)).toBe(true);
    expect(q.task).toBe(task0);
  });
});

describe('alarm deposit while fighting (GDD 02 §8 ALARM_FIGHT_RATE 1.5 ph per s)', () => {
  it('two ants in a lock mark the spot with alarm although neither is hurt', () => {
    const a = arena({ manual: true, flags: { noRng: true, noRetreat: true } });
    const sim = a.sim;
    const [p, q] = faceToFace(a);
    p.task = MANUAL_TASK; q.task = MANUAL_TASK;
    expect(beginGrapple(sim, p.id, 'ant', q.id)).toBe(true);
    expect(beginGrapple(sim, q.id, 'ant', p.id)).toBe(true);
    for (let i = 0; i < 20; i++) { p.bb[CB.holdNext] = sim.state.tick + 100; q.bb[CB.holdNext] = sim.state.tick + 100; step(sim, 1); }
    expect(p.hp).toBe(10);
    expect(sim.phero.sample(p.colony, 'alarm', p.pos)).toBeGreaterThan(0.5);
    expect(sim.phero.sample(q.colony, 'alarm', q.pos)).toBeGreaterThan(0.5);
  });
});
