// Reviewer's adversarial checks of the combat module (GDD 05 §4). Tests that pass are kept as regression tests;
// a failing test documents a real defect for the fixer (see the review report).
import { describe, expect, it } from 'vitest';
import { begin } from '@/sim/ants/actions';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save';
import { idleIntent } from '@/sim/types';
import { ant, arena, COMBAT_TEST_BEHAVIOURS, COMBAT_TEST_SYSTEMS, faceToFace, MANUAL_TASK, record, stateHash, step, stepUntil } from './testkit';
import { beginGrapple, engage, releaseGrapple, resolveBite, setDodgeDirection } from './index';

describe('bite attribution through the action library (applyDamage without attacker)', () => {
  it('AI free bites roll the 0.7 hit chance and every combat-hit names the biter', () => {
    const a = arena({ seed: 11, manual: true, flags: { noRetreat: true } });
    const [p, q] = faceToFace(a);
    p.task = MANUAL_TASK; q.task = MANUAL_TASK;
    const hits = record(a.sim, ['combat-hit']);
    let tries = 0;
    for (let i = 0; i < 60; i++) {
      q.hp = q.maxHp;
      if (begin(a.sim, p, 'bite', { kind: 'ant', id: q.id, pos: { ...q.pos } })) tries++;
      step(a.sim, 10);
    }
    a.sim.events.flush();
    expect(tries).toBe(60);
    const frac = hits.length / tries;
    expect(frac).toBeGreaterThan(0.5);
    expect(frac).toBeLessThan(0.88);
    expect(hits.every((h) => h.attackerId === p.id && h.targetId === q.id)).toBe(true);
  });

  it('two biters landing in the same tick are told apart: damages 1.0 then 1.25 (M(2)), distinct attackers', () => {
    const a = arena({ seed: 2, manual: true, flags: { noRetreat: true, noRng: true } });
    const victim = ant(a.sim, a.rival, 40, 40);
    const b1 = ant(a.sim, a.home, 39.1, 40, 'worker', { x: 1, y: 0, z: 0 });
    const b2 = ant(a.sim, a.home, 40.9, 40, 'worker', { x: -1, y: 0, z: 0 });
    a.sim.index.refresh();
    const hits = record(a.sim, ['combat-hit']);
    expect(begin(a.sim, b1, 'bite', { kind: 'ant', id: victim.id, pos: { ...victim.pos } })).toBe(true);
    expect(begin(a.sim, b2, 'bite', { kind: 'ant', id: victim.id, pos: { ...victim.pos } })).toBe(true);
    step(a.sim, 8);
    a.sim.events.flush();
    expect(hits.map((h) => h.dmg)).toEqual([1, 1.25]);
    expect(new Set(hits.map((h) => h.attackerId))).toEqual(new Set([b1.id, b2.id]));
    expect(victim.hp).toBeCloseTo(10 - 2.25, 9);
  });
});

describe('fight record and injuries (§4.7)', () => {
  it('the fight record of a victim that never struck back starts at its health before the first hit', () => {
    // An ant ambushed while not fighting: the first bite opens its fight record. The record must start from the
    // health before that bite, or "lost >= 0.3 health in the fight" undercounts by one hit (3 hits of 1.0 on a
    // 10 HP worker would never roll injuries).
    const a = arena({ manual: true, flags: { noRng: true } });
    const [p, q] = faceToFace(a);
    resolveBite(a.sim, p, 'ant', q.id, false);
    expect(q.hp).toBe(9);
    expect(q.bb['cb.hp0']).toBe(10);
  });
});

describe('locks (§4.3)', () => {
  it('stalemate: no damage either way for 30 s, then the holder lets go with p 0.5 per s', () => {
    const a = arena({ seed: 6, manual: true, flags: { noRetreat: true } });
    const [p, q] = faceToFace(a);
    p.task = MANUAL_TASK; q.task = MANUAL_TASK;
    const sim = a.sim;
    // grab with certainty, then keep the hold bite in the future every tick
    // (noScan arena: nothing else acts on the pair)
    let grabbed = false;
    for (let i = 0; i < 20 && !grabbed; i++) grabbed = beginGrapple(sim, p.id, 'ant', q.id);
    expect(grabbed).toBe(true);
    // q holds a lock too so it never shakes p off (mutual-lock rule); hold bites suppressed on both
    let grabbedQ = false;
    for (let i = 0; i < 20 && !grabbedQ; i++) grabbedQ = beginGrapple(sim, q.id, 'ant', p.id);
    expect(grabbedQ).toBe(true);
    const t = stepUntil(sim, () => {
      p.bb['cb.hold'] = sim.state.tick + 100; q.bb['cb.hold'] = sim.state.tick + 100;
      return !p.combat?.lock || !q.combat?.lock;
    }, 600);
    expect(t / 10).toBeGreaterThanOrEqual(30);
    expect(t / 10).toBeLessThan(40);
    expect(p.hp).toBe(10);
  });

  it('a held ant that cannot move (one holder of equal pull) does not drag its holder away with a dodge', () => {
    // Movement under locks: target speed x max(0, 1 - Σ pull_h / pull_t) = 0 here; only a holder STRONGER than its
    // target may drag. A dodge (3 L) by the held ant must not carry it, and its holder with it, across the ground.
    const a = arena({ seed: 3, manual: true, flags: { noRetreat: true, noRng: true } });
    const [p, q] = faceToFace(a);
    p.task = MANUAL_TASK; q.task = MANUAL_TASK;
    expect(beginGrapple(a.sim, p.id, 'ant', q.id)).toBe(true);
    const p0 = { ...p.pos }, q0 = { ...q.pos };
    setDodgeDirection(q, { x: 1, y: 0, z: 0 });
    const dodged = begin(a.sim, q, 'dodge', null);
    step(a.sim, 10);
    const qMoved = Math.hypot(q.pos.x - q0.x, q.pos.z - q0.z);
    const pMoved = Math.hypot(p.pos.x - p0.x, p.pos.z - p0.z);
    // either the dodge is refused / stays put, or it breaks the lock; never both ants sliding 12 mm together
    const stillLocked = p.combat?.lock?.targetId === q.id;
    expect(dodged && stillLocked && qMoved > 4 && pMoved > 4).toBe(false);
  });

  it('releasing an unlocked ant and releasing twice are harmless', () => {
    const a = arena({ manual: true, flags: { noRng: true } });
    const [p, q] = faceToFace(a);
    releaseGrapple(a.sim, p.id);
    expect(beginGrapple(a.sim, p.id, 'ant', q.id)).toBe(true);
    releaseGrapple(a.sim, p.id);
    releaseGrapple(a.sim, p.id);
    expect(p.combat?.lock ?? null).toBeNull();
    expect(q.combat?.heldBy ?? []).toEqual([]);
    expect(q.combat?.pinned ?? false).toBe(false);
  });

  it('a nestmate cannot be grabbed or bitten', () => {
    const a = arena({ manual: true, flags: { noRng: true } });
    const p = ant(a.sim, a.home, 40, 40);
    const m = ant(a.sim, a.home, 40.9, 40, 'worker', { x: -1, y: 0, z: 0 });
    a.sim.index.refresh();
    expect(beginGrapple(a.sim, p.id, 'ant', m.id)).toBe(false);
    expect(resolveBite(a.sim, p, 'ant', m.id, false)).toBe(0);
    expect(m.hp).toBe(10);
  });
});

describe('alerts', () => {
  it('possessed-danger "pinned" is cleared when the player leaves the pinned ant', () => {
    const a = arena({ manual: true, flags: { noRng: true, noRetreat: true } });
    const sim = a.sim;
    const [p, q] = faceToFace(a);
    sim.enqueue({ type: 'possess', antId: p.id });
    step(sim, 1);
    p.hp = 1e4; // survives the holders' bites for the length of the test
    q.alive = false; q.hp = 0; sim.stores.ants.markDead(q.id);
    // p is the possessed player ant; two rivals hold it
    const r1 = ant(sim, a.rival, 40.9, 40, 'worker', { x: -1, y: 0, z: 0 });
    const r2 = ant(sim, a.rival, 40, 40.9, 'worker', { x: 0, y: 0, z: -1 });
    sim.index.refresh();
    expect(beginGrapple(sim, r1.id, 'ant', p.id)).toBe(true);
    expect(beginGrapple(sim, r2.id, 'ant', p.id)).toBe(true);
    expect(p.combat?.pinned).toBe(true);
    step(sim, 60);
    const open = (): boolean => sim.state.progression.alerts.some((x) => x.kind === 'possessed-danger' && x.subjectId === p.id);
    expect(open()).toBe(true);
    const other = ant(sim, a.home, 10, 10);
    sim.enqueue({ type: 'possess', antId: other.id });
    sim.setPlayerIntent(idleIntent());
    step(sim, 60);
    expect(sim.state.player.possessedAntId).toBe(other.id);
    expect(open()).toBe(false);
  });

  it('queen-in-danger clears after the player queen died', () => {
    const a = arena({ manual: true, flags: { noRng: true, noRetreat: true } });
    const sim = a.sim;
    const queen = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    const bu = sim.world.bu;
    const foe = ant(sim, a.rival, queen.pos.x / bu + 1, queen.pos.z / bu);
    sim.index.refresh();
    resolveBite(sim, foe, 'ant', queen.id, false);
    const open = (): boolean => sim.state.progression.alerts.some((x) => x.kind === 'queen-in-danger');
    expect(open()).toBe(true);
    queen.hp = 0.01;
    resolveBite(sim, foe, 'ant', queen.id, false);
    expect(queen.alive).toBe(false);
    step(sim, 400);
    expect(open()).toBe(false);
  });
});

describe('save and restore during a fight (§4.10 "Save during fight"; criterion 7)', () => {
  it('a snapshot taken mid-lock resumes to the same state as the uninterrupted fight', () => {
    const N = 40, M = 200;
    const mk = (): ReturnType<typeof arena> => {
      const a = arena({ seed: 13 });
      const [p, q] = faceToFace(a);
      p.task = MANUAL_TASK; q.task = MANUAL_TASK;
      engage(a.sim, p.id, 'ant', q.id);
      engage(a.sim, q.id, 'ant', p.id);
      return a;
    };
    const straight = mk();
    step(straight.sim, N + M);
    const first = mk();
    step(first.sim, N);
    expect(first.sim.state.ants.some((x) => x.combat?.lock)).toBe(true);
    const resumed = createSim(restore(snapshot(first.sim)).state, first.sim.world, {
      systems: COMBAT_TEST_SYSTEMS, behaviours: COMBAT_TEST_BEHAVIOURS,
    });
    step(resumed, M);
    expect(stateHash(resumed)).toBe(stateHash(straight.sim));
  });
});

describe('pin (§4.3): a pinned ant only bites a holder in its front 60°', () => {
  it('a pinned AI fighter held from behind and from the side does not turn round and bite', () => {
    // "Pin: target cannot move or start a bite except against the holder in its front 60°". The fight behaviour
    // must not rotate the pinned ant (face()) to bring a rear holder into its front cone.
    const a = arena({ seed: 3, manual: true, flags: { noRetreat: true, noRng: true } });
    const sim = a.sim;
    const v = ant(sim, a.rival, 40, 40, 'worker', { x: 1, y: 0, z: 0 });
    const behind = ant(sim, a.home, 39.1, 40, 'worker', { x: 1, y: 0, z: 0 });
    const side = ant(sim, a.home, 40, 40.9, 'worker', { x: 0, y: 0, z: -1 });
    behind.task = MANUAL_TASK; side.task = MANUAL_TASK;
    sim.index.refresh();
    expect(beginGrapple(sim, behind.id, 'ant', v.id)).toBe(true);
    expect(beginGrapple(sim, side.id, 'ant', v.id)).toBe(true);
    expect(v.combat?.pinned).toBe(true);
    v.hp = 1e4; // outlives the test
    expect(engage(sim, v.id, 'ant', behind.id)).toBe(true);
    const hits = record(sim, ['combat-hit']);
    step(sim, 30);
    sim.events.flush();
    expect(hits.filter((h) => h.attackerId === v.id)).toEqual([]);
    expect(behind.hp).toBe(10);
    expect(side.hp).toBe(10);
  });
});

describe('diagnostics and robustness', () => {
  it('a player worker killed in a fight counts in combatSummary and diag-combat-losses (full systems)', async () => {
    const { combatSummary, publishCombatDiagnostic } = await import('./index');
    const { makeTestSim } = await import('@/sim/testing/testWorld');
    const { createColony } = await import('@/sim/entities');
    const sim = makeTestSim({ seed: 4, sizeBu: 96 });
    const rival = createColony(sim, { species: 'lasius-niger', isPlayer: false });
    const home = sim.state.colonies[0].id;
    const p = ant(sim, home, 40, 40);
    const q = ant(sim, rival.id, 40.9, 40, 'worker', { x: -1, y: 0, z: 0 });
    sim.index.refresh();
    p.hp = 0.5;
    let n = 0;
    while (p.alive && n++ < 50) resolveBite(sim, q, 'ant', p.id, false);
    expect(p.alive).toBe(false);
    step(sim, 1);
    expect(combatSummary(sim).combatLossesLastGd).toBe(1);
    publishCombatDiagnostic(sim);
    expect(sim.state.progression.diagnostics.find((d) => d.id === 'diag-combat-losses')?.value).toBe(1);
  });

  it('applyDamage ignores NaN, negative and zero damage and unknown ids', async () => {
    const { applyDamage } = await import('./index');
    const a = arena({ manual: true });
    const w = ant(a.sim, a.home, 20, 20);
    expect(applyDamage(a.sim, 'ant', w.id, Number.NaN, 'predation')).toBe(0);
    expect(applyDamage(a.sim, 'ant', w.id, -3, 'predation')).toBe(0);
    expect(applyDamage(a.sim, 'ant', w.id, 0, 'combat')).toBe(0);
    expect(applyDamage(a.sim, 'ant', 999_999, 5, 'combat')).toBe(0);
    expect(applyDamage(a.sim, 'creature', 999_999, 5, 'combat')).toBe(0);
    expect(w.hp).toBe(10);
    expect(Number.isFinite(w.alarmLevel)).toBe(true);
  });
});

describe('gentle founding-queen protection (App. E 23, GDD 05 §3.10) beyond the attack roll', () => {
  it('a rival worker already fighting (no target left) does not pick the gentle founding queen as its next foe', async () => {
    const { startFight } = await import('./index');
    const a = arena({ seed: 8, flags: { noRetreat: true } });
    const sim = a.sim;
    sim.state.config.difficulty.preset = 'gentle';
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    expect(q.flags & 16).toBe(16); // FOUNDING
    const bu = sim.world.bu;
    const foe = ant(sim, a.rival, q.pos.x / bu + 2, q.pos.z / bu);
    sim.index.refresh();
    // e.g. its previous opponent died: the fight behaviour looks around for the nearest hostile
    expect(startFight(sim, foe, null, q.pos, 'alarm')).toBe(true);
    step(sim, 100);
    expect(q.hp).toBe(q.maxHp);
    expect(foe.bb['cb.ti'] === q.id && foe.bb['cb.tk'] === 1).toBe(false);
  });
});

describe('acid and outnumbering details', () => {
  it('two sprays landing together deliver both doses within the 2 s of a spray (not one after the other)', async () => {
    const { sprayHit } = await import('./index');
    const a = arena({ manual: true, flags: { noRetreat: true, noRng: true } });
    const sim = a.sim;
    const t = ant(sim, a.rival, 40, 40);
    const s1 = ant(sim, a.home, 38.8, 40, 'worker', { x: 1, y: 0, z: 0 });
    const s2 = ant(sim, a.home, 40, 38.8, 'worker', { x: 0, y: 0, z: 1 });
    sim.index.refresh();
    expect(sprayHit(sim, s1, 'ant', t.id)).toBeCloseTo(2.5, 9);
    expect(sprayHit(sim, s2, 'ant', t.id)).toBeCloseTo(2.5, 9);
    step(sim, 21);
    expect(10 - t.hp).toBeCloseTo(5, 6);
  });

  it('three colonies in one melee: each hit counts only its own colony for M(n) (§4.10)', async () => {
    const { createColony } = await import('@/sim/entities');
    const a = arena({ manual: true, flags: { noRetreat: true, noRng: true } });
    const sim = a.sim;
    const third = createColony(sim, { species: 'lasius-niger', isPlayer: false });
    const t = ant(sim, a.rival, 40, 40);
    const h1 = ant(sim, a.home, 39.1, 40, 'worker', { x: 1, y: 0, z: 0 });
    const h2 = ant(sim, a.home, 40, 39.1, 'worker', { x: 0, y: 0, z: 1 });
    const c1 = ant(sim, third.id, 40.9, 40, 'worker', { x: -1, y: 0, z: 0 });
    sim.index.refresh();
    expect(resolveBite(sim, h1, 'ant', t.id, false)).toBe(1);
    expect(resolveBite(sim, c1, 'ant', t.id, false)).toBe(1); // other colony: M(1)
    expect(resolveBite(sim, h2, 'ant', t.id, false)).toBe(1.25); // second of its own colony
  });
});

describe('bite cycle by caste (§4.1: "AI and player share it")', () => {
  it('the possessed founding queen (bite cycle 1.2 s) lands at most one bite per 1.2 s', () => {
    const a = arena({ manual: true, flags: { noRetreat: true, noRng: true } });
    const sim = a.sim;
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    const bu = sim.world.bu;
    const foe = ant(sim, a.rival, q.pos.x / bu + 1.6, q.pos.z / bu, 'worker', { x: -1, y: 0, z: 0 });
    foe.task = MANUAL_TASK;
    foe.hp = 1e4;
    q.fwd = { x: 1, y: 0, z: 0 };
    sim.index.refresh();
    sim.enqueue({ type: 'possess', antId: q.id });
    step(sim, 1);
    expect(sim.state.player.possessedAntId).toBe(q.id);
    const hits = record(sim, ['combat-hit']);
    // the player hammers the bite key every tick for 6 s
    for (let i = 0; i < 60; i++) {
      sim.enqueue({ type: 'action', actionId: 'bite', target: { kind: 'ant', id: foe.id, pos: { ...foe.pos } }, phase: 'start' });
      step(sim, 1);
    }
    sim.events.flush();
    const mine = hits.filter((h) => h.attackerId === q.id).length;
    expect(mine).toBeGreaterThan(0);
    expect(mine).toBeLessThanOrEqual(5); // 6 s / 1.2 s
  });
});
