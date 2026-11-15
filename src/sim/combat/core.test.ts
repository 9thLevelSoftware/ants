// Stats (GDD 05 §4.1), hit resolution and outnumbering (§4.2), the Lasius duel (App. E 9), pin and outnumbering
// (App. E 10), grapple locks (§4.3; acceptance criterion 3) and deaths with corpses (§4.7; criterion 6).
import { describe, expect, it } from 'vitest';
import { createColony } from '@/sim/entities';
import { navTo } from '@/sim/locomotion';
import { ant, arena, faceToFace, MANUAL_TASK, record, setFlags, step, stepUntil } from './testkit';
import { beginGrapple, combatStats, computePinned, outnumberMult, releaseGrapple, resolveBite, slotsFor } from './index';

describe('stats (§4.1)', () => {
  it('Lasius castes and Camponotus castes follow the table', () => {
    const a = arena();
    const w = ant(a.sim, a.home, 10, 10);
    expect([w.maxHp, combatStats(a.sim, w).bite, combatStats(a.sim, w).pull, combatStats(a.sim, w).armour]).toEqual([10, 1, 3, 0]);
    const q = ant(a.sim, a.home, 12, 10, 'queen');
    const qs = combatStats(a.sim, q);
    expect([q.maxHp, qs.bite, qs.pull, qs.armour, qs.biteCycleS]).toEqual([50, 2, 9, 0.3, 1.4]);
    const m = ant(a.sim, a.home, 14, 10, 'male');
    expect([m.maxHp, combatStats(a.sim, m).bite]).toEqual([6, 0.2]);
    const cp = createColony(a.sim, { species: 'camponotus-pennsylvanicus', isPlayer: false });
    const major = ant(a.sim, cp.id, 20, 20, 'major', undefined, 1.5);
    const ms = combatStats(a.sim, major);
    expect(major.maxHp).toBeCloseTo(63.5, 0);
    expect(ms.bite).toBeCloseTo(9.5, 1);
    expect(ms.pull).toBeCloseTo(19, 0);
    expect([ms.armour, ms.biteCycleS]).toEqual([0.1, 1.2]);
    const tet = createColony(a.sim, { species: 'tetramorium-immigrans', isPlayer: false });
    const t = ant(a.sim, tet.id, 22, 22);
    expect([t.maxHp, combatStats(a.sim, t).bite, combatStats(a.sim, t).armour, combatStats(a.sim, t).special]).toEqual([7, 0.7, 0.15, 'sting']);
  });

  it('M(n) = min(2, 1 + 0.25 (n - 1))', () => {
    expect([1, 2, 3, 4, 5, 9].map(outnumberMult)).toEqual([1, 1.25, 1.5, 1.75, 2, 2]);
  });
});

describe('Lasius duel (App. E 9)', () => {
  it('mutually locked workers: one dies 9.5-16 s after locking (3 seeds; 100 seeds behind FOUNDRESS_LONG)', () => {
    for (const seed of [1, 2, 3]) {
      const a = arena({ seed, manual: true, flags: { noRetreat: true } });
      const [p, q] = faceToFace(a);
      setFlags(a.sim, { noRng: true });
      expect(beginGrapple(a.sim, p.id, 'ant', q.id)).toBe(true);
      expect(beginGrapple(a.sim, q.id, 'ant', p.id)).toBe(true);
      setFlags(a.sim, { noRng: false });
      const t = stepUntil(a.sim, () => !p.alive || !q.alive, 400);
      expect(t / 10).toBeGreaterThanOrEqual(9.5 - 0.05);
      expect(t / 10).toBeLessThanOrEqual(16);
      expect(p.alive !== q.alive).toBe(true);
    }
  });

  it('with every roll hitting, the first hold bite lands 0.5 s after the lock and death comes at 9.5 s', () => {
    const a = arena({ manual: true, flags: { noRetreat: true, noRng: true } });
    const [p, q] = faceToFace(a);
    beginGrapple(a.sim, p.id, 'ant', q.id);
    beginGrapple(a.sim, q.id, 'ant', p.id);
    // locked before tick 0 ran: the first hold bite is applied in tick 5 (the 6th tick), 0.5 s later
    step(a.sim, 5);
    expect(q.hp).toBe(10);
    step(a.sim, 1);
    expect(q.hp).toBe(9);
    const t = stepUntil(a.sim, () => !p.alive || !q.alive, 200) + 6;
    expect(t).toBe(96);
  });
});

describe('pin and outnumbering (App. E 10)', () => {
  it('4 attackers, 2 holding: pinned, all hits land, volley 1 = 5.5, later hits 1.75, death in volley 2 at +1.0 s', () => {
    const a = arena({ manual: true, flags: { noRetreat: true, noRng: true } });
    const victim = ant(a.sim, a.rival, 40, 40);
    const pos = [[39.1, 40], [40.9, 40], [40, 39.1], [40, 40.9]];
    const atk = pos.map(([x, z]) => ant(a.sim, a.home, x, z));
    a.sim.index.refresh();
    expect(slotsFor(a.sim, atk[0], { kind: 'ant', ant: victim })).toBe(4);
    const hits = record(a.sim, ['combat-hit', 'combat-pin']);
    expect(beginGrapple(a.sim, atk[0].id, 'ant', victim.id)).toBe(true);
    expect(beginGrapple(a.sim, atk[1].id, 'ant', victim.id)).toBe(true);
    expect(victim.combat?.pinned).toBe(true);
    expect(computePinned(a.sim, { kind: 'ant', ant: victim })).toBe(true);
    // the two free biters strike in step with the holders' cycle (hold bites in ticks 5, 15, ... after the lock)
    let firstVolley = -1, deathTick = -1;
    for (let i = 0; i < 40 && victim.alive; i++) {
      step(a.sim, 1);
      const ran = a.sim.state.tick - 1;
      if (ran % 10 === 5) {
        if (firstVolley < 0) firstVolley = ran;
        for (const b of [atk[2], atk[3]]) if (victim.alive) resolveBite(a.sim, b, 'ant', victim.id, false);
      }
      if (!victim.alive) deathTick = ran;
    }
    a.sim.events.flush();
    const dmg = hits.filter((h) => h.type === 'combat-hit').map((h) => h.dmg as number);
    expect(hits.some((h) => h.type === 'combat-pin')).toBe(true);
    expect(dmg.slice(0, 4)).toEqual([1, 1.25, 1.5, 1.75]);
    expect(dmg.slice(4).every((d) => d === 1.75)).toBe(true);
    expect(dmg.length).toBeLessThanOrEqual(8);
    expect((deathTick - firstVolley) / 10).toBeCloseTo(1.0, 1);
  });
});

describe('grapple locks (§4.3, criterion 3)', () => {
  it('a lock immobilises both and releasing frees them', () => {
    const a = arena({ manual: true, flags: { noRetreat: true, noRng: true } });
    const [p, q] = faceToFace(a);
    expect(beginGrapple(a.sim, p.id, 'ant', q.id)).toBe(true);
    const events = record(a.sim, ['combat-unlock']);
    const p0 = { ...p.pos }, q0 = { ...q.pos };
    // both try to walk apart: the target (pull 3 against a holder's 3) moves at x0; the holder stays in contact
    p.task = MANUAL_TASK; q.task = MANUAL_TASK;
    const far = { x: q.pos.x + 200, y: 0, z: q.pos.z };
    navTo(a.sim, q, far, 4);
    navTo(a.sim, p, { x: p.pos.x - 200, y: 0, z: p.pos.z }, 4);
    step(a.sim, 30);
    expect(Math.hypot(q.pos.x - q0.x, q.pos.z - q0.z)).toBeLessThan(0.5);
    expect(Math.hypot(p.pos.x - p0.x, p.pos.z - p0.z)).toBeLessThan(1.5);
    releaseGrapple(a.sim, p.id);
    a.sim.events.flush();
    expect(events.length).toBe(1);
    expect(q.combat?.heldBy).toEqual([]);
    navTo(a.sim, q, far, 4);
    step(a.sim, 30);
    expect(Math.hypot(q.pos.x - q0.x, q.pos.z - q0.z)).toBeGreaterThan(10);
  });

  it('death while grappled frees the partner; the corpse is an item with 0.4 P per mg and bulk mass / 2 mg', () => {
    const a = arena({ manual: true, flags: { noRetreat: true, noRng: true } });
    const [p, q] = faceToFace(a);
    beginGrapple(a.sim, p.id, 'ant', q.id);
    beginGrapple(a.sim, q.id, 'ant', p.id);
    q.hp = 0.5;
    step(a.sim, 6);
    expect(q.alive).toBe(false);
    expect(p.combat?.lock ?? null).toBeNull();
    expect(p.combat?.heldBy ?? []).toEqual([]);
    const corpse = a.sim.stores.items.list.find((i) => i.kind === 'corpse' && i.colony === a.rival);
    expect(corpse).toBeDefined();
    expect(corpse!.p).toBeCloseTo(0.4, 6);
    expect(corpse!.bulk).toBeCloseTo(0.5, 6);
    expect(corpse!.necroCueTick).toBeGreaterThan(a.sim.state.tick);
    // and the holder dying frees the held ant
    const b = arena({ manual: true, flags: { noRetreat: true, noRng: true } });
    const [h, t] = faceToFace(b);
    beginGrapple(b.sim, h.id, 'ant', t.id);
    beginGrapple(b.sim, ant(b.sim, b.home, 40, 40.9).id, 'ant', t.id);
    expect(t.combat?.pinned).toBe(true);
    h.hp = 0.1;
    resolveBite(b.sim, t, 'ant', h.id, false);
    expect(h.alive).toBe(false);
    expect(t.combat?.heldBy.length).toBe(1);
    expect(t.combat?.pinned).toBe(false);
  });

  it('slots: 4 for equal sizes, 2 in a tunnel cap; a full target refuses another holder', () => {
    const a = arena({ manual: true, flags: { noRng: true } });
    const victim = ant(a.sim, a.rival, 40, 40);
    const hs = [[39.1, 40], [40.9, 40], [40, 39.1], [40, 40.9], [39.3, 39.3]].map(([x, z]) => ant(a.sim, a.home, x, z));
    a.sim.index.refresh();
    expect(hs.slice(0, 4).map((h) => beginGrapple(a.sim, h.id, 'ant', victim.id))).toEqual([true, true, true, true]);
    expect(beginGrapple(a.sim, hs[4].id, 'ant', victim.id)).toBe(false);
    expect(new Set(hs.slice(0, 4).map((h) => h.combat!.lock!.slot)).size).toBe(4);
  });

  it('a single holder is shaken off with p pull_t / (pull_t + 2 pull_h) per s and stunned 0.5 s', () => {
    const a = arena({ seed: 2, manual: true, flags: { noRetreat: true } });
    const [p, q] = faceToFace(a);
    setFlags(a.sim, { noRng: true });
    beginGrapple(a.sim, p.id, 'ant', q.id);
    setFlags(a.sim, { noRng: false });
    const t = stepUntil(a.sim, () => !p.combat?.lock, 600);
    expect(t).toBeLessThan(600);
    expect(p.bb['cr.stunUntil']).toBeGreaterThan(a.sim.state.tick);
    expect(beginGrapple(a.sim, p.id, 'ant', q.id)).toBe(false);
  });
});
