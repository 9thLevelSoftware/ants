// The fight and patrol behaviours, the guard's combat branch, retreat and stance (GDD 05 §3.6, §4.6, §4.9, GDD 02
// §10.9-10.13; acceptance criterion 6), rally markers in defend mode.
import { describe, expect, it } from 'vitest';
import { placeMarker } from '@/sim/entities';
import { guardBehaviour } from '@/sim/ants/behaviours/nest/guard';
import { ant, arena, COMBAT_TEST_BEHAVIOURS, faceToFace, MANUAL_TASK, step, stepUntil } from './testkit';
import { attackChance, engage, localStrength, retreatHealth, retreatReason } from './index';

describe('fight behaviour', () => {
  it('a duel ends with a death; the winner goes back to its task', () => {
    const a = arena({ seed: 7, flags: { noRetreat: true } });
    const [p, q] = faceToFace(a);
    p.task = MANUAL_TASK; q.task = MANUAL_TASK;
    expect(engage(a.sim, p.id, 'ant', q.id)).toBe(true);
    expect(engage(a.sim, q.id, 'ant', p.id)).toBe(true);
    expect(p.task).toBe('fight');
    const t = stepUntil(a.sim, () => !p.alive || !q.alive, 600);
    expect(t).toBeLessThan(600);
    const winner = p.alive ? p : q;
    stepUntil(a.sim, () => winner.task !== 'fight', 400);
    // GDD 02 §10.13: below 0.25 health the winner flees (then rests), otherwise it resumes its task
    expect(winner.task).toBe(winner.hp / winner.maxHp < 0.25 ? 'flee' : MANUAL_TASK);
  });

  it('three against one: the single worker dies within 10 s', () => {
    const a = arena({ seed: 2, flags: { noRetreat: true } });
    const victim = ant(a.sim, a.rival, 40, 40, 'worker', { x: -1, y: 0, z: 0 });
    const atk = [[39.1, 40, 1, 0], [40, 39.1, 0, 1], [40, 40.9, 0, -1]].map(([x, z, fx, fz]) => ant(a.sim, a.home, x, z, 'worker', { x: fx, y: 0, z: fz }));
    a.sim.index.refresh();
    for (const w of atk) engage(a.sim, w.id, 'ant', victim.id);
    const t = stepUntil(a.sim, () => !victim.alive, 300);
    expect(t).toBeLessThan(100);
    expect(atk.every((w) => w.alive)).toBe(true);
  });

  it('retreat: below 0.35 health outside a fighter flees; noRetreat keeps it fighting', () => {
    const a = arena({ seed: 3 });
    const [p, q] = faceToFace(a);
    engage(a.sim, p.id, 'ant', q.id);
    p.hp = 3;
    expect(retreatReason(a.sim, p)).toBe('health');
    step(a.sim, 3);
    expect(p.task).toBe('flee');
    const b = arena({ seed: 3, flags: { noRetreat: true } });
    const [r, s] = faceToFace(b);
    engage(b.sim, r.id, 'ant', s.id);
    r.hp = 3;
    step(b.sim, 3);
    expect(r.task).toBe('fight');
  });

  it('retreat ratio: hostile strength within 5 L >= 2.5 x friendly; in the own nest the health line is 0.15', () => {
    const a = arena({ manual: true, nest: true });
    const w = ant(a.sim, a.home, 20, 20);
    const foes = [[21, 20], [20, 21], [19, 20]].map(([x, z]) => ant(a.sim, a.rival, x, z));
    a.sim.index.refresh();
    expect(retreatReason(a.sim, w)).toBe('outnumbered');
    foes[2].hp = 0; foes[2].alive = false;
    a.sim.stores.ants.markDead(foes[2].id);
    a.sim.index.refresh();
    expect(localStrength(a.sim, w)).toEqual({ hostile: 2, friendly: 1 });
    expect(retreatReason(a.sim, w)).toBe(null); // 2 < 2.5
    w.hp = 3;
    expect(retreatReason(a.sim, w)).toBe('health');
    expect(retreatHealth(a.sim, w)).toBe(0.35);
    w.nestId = a.sim.state.colonies[0].nestIds[0];
    expect(retreatHealth(a.sim, w)).toBe(0.15);
  });

  it('stance scales the attack roll: cautious x0.5, aggressive x1.3', () => {
    const a = arena({ manual: true });
    const [p, q] = faceToFace(a);
    const col = a.sim.stores.colonies.get(a.home)!;
    const base = attackChance(a.sim, p, q);
    col.directives.stance = 'cautious';
    expect(attackChance(a.sim, p, q)).toBeCloseTo(base * 0.5, 9);
    col.directives.stance = 'aggressive';
    expect(attackChance(a.sim, p, q)).toBeCloseTo(Math.min(1, base * 1.3), 9);
    expect(base).toBeCloseTo(0.5, 9); // agg 0.5 x terrF 1 x stance 1 x 1
  });
});

describe('founding queen protection (App. E 23)', () => {
  it('gentle: rival workers in contact never attack the founding queen; naturalist: three of them start a fight', () => {
    for (const preset of ['gentle', 'naturalist'] as const) {
      const a = arena({ seed: 8 });
      a.sim.state.config.difficulty.preset = preset;
      const q = a.sim.stores.ants.get(a.sim.state.colonies[0].queenId)!;
      expect(q.flags & 16).toBe(16); // FOUNDING
      const bu = a.sim.world.bu;
      const foes = [[1.6, 0], [-1.6, 0], [0, 1.6]].map(([dx, dz]) => ant(a.sim, a.rival, q.pos.x / bu + dx, q.pos.z / bu + dz));
      for (const f of foes) f.task = MANUAL_TASK;
      a.sim.index.refresh();
      step(a.sim, 300);
      const attacked = foes.some((f) => f.task === 'fight') || q.hp < q.maxHp;
      expect(attacked).toBe(preset === 'naturalist');
    }
  });
});

describe('guard, patrol and rally', () => {
  it('a guard that meets an intruder raises the alarm and fights it', () => {
    const a = arena({ seed: 4, nest: true, behaviours: [...COMBAT_TEST_BEHAVIOURS, guardBehaviour] });
    const nest = a.sim.stores.nests.get(a.sim.state.colonies[0].nestIds[0])!;
    const e = nest.entrances[0];
    const bu = a.sim.world.bu;
    const g = ant(a.sim, a.home, e.pos.x / bu + 2, e.pos.z / bu);
    g.task = 'guard';
    const foe = ant(a.sim, a.rival, e.pos.x / bu + 3, e.pos.z / bu + 0.6);
    foe.task = MANUAL_TASK;
    a.sim.index.refresh();
    const t = stepUntil(a.sim, () => g.task === 'fight', 300);
    expect(t).toBeLessThan(300);
    expect(g.bb['cb.ti']).toBe(foe.id);
  });

  it('a patrol that sees a hostile near the entrance releases alarm and engages', () => {
    const a = arena({ seed: 5, nest: true, flags: { noRetreat: true } });
    const nest = a.sim.stores.nests.get(a.sim.state.colonies[0].nestIds[0])!;
    const e = nest.entrances[0];
    const bu = a.sim.world.bu;
    const pt = ant(a.sim, a.home, e.pos.x / bu - 6, e.pos.z / bu);
    pt.task = 'patrol';
    const foe = ant(a.sim, a.rival, e.pos.x / bu + 6, e.pos.z / bu);
    foe.task = MANUAL_TASK;
    a.sim.index.refresh();
    const t = stepUntil(a.sim, () => pt.task === 'fight', 100);
    expect(t).toBeLessThan(100);
    expect(pt.bb['cb.ti']).toBe(foe.id);
  });

  it('rally (defend): patrols hold within 8 BU, idle workers answer up to 25 %, intruders inside are fought', () => {
    const a = arena({ seed: 6, nest: true, flags: { noRetreat: true } });
    const bu = a.sim.world.bu;
    const home = a.sim.state.colonies[0];
    const m = placeMarker(a.sim, { kind: 'rally', colony: home.id, pos: { x: 30 * bu, y: 0, z: 30 * bu }, radius: 15 * bu, params: { mode: 'defend' } });
    const pt = ant(a.sim, a.home, 50, 50);
    pt.task = 'patrol';
    const idle = Array.from({ length: 8 }, (_, i) => ant(a.sim, a.home, 60 + i, 60));
    a.sim.index.refresh();
    stepUntil(a.sim, () => Math.hypot(pt.pos.x - m.pos.x, pt.pos.z - m.pos.z) <= 8 * bu, 600);
    expect(Math.hypot(pt.pos.x - m.pos.x, pt.pos.z - m.pos.z)).toBeLessThanOrEqual(8 * bu);
    expect(pt.state).toBe('patrol.rally');
    step(a.sim, 60);
    expect(idle.filter((w) => w.task === 'patrol').length).toBe(2);
    const foe = ant(a.sim, a.rival, 36, 30);
    foe.task = MANUAL_TASK;
    a.sim.index.refresh();
    stepUntil(a.sim, () => pt.task === 'fight', 50);
    expect(pt.task).toBe('fight');
  });
});
