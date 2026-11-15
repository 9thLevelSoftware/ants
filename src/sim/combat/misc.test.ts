// Injuries (§4.7), dodge refusals (§4.8), the bite cue's strength, the gaster wound, tunnel slots (§4.3, §4.10),
// queen-in-danger and diag-combat-losses (App. C, D).
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { begin } from '@/sim/ants/actions';
import { placeOnSurface } from '@/sim/locomotion';
import { ant, arena, faceToFace, record, setFlags, step } from './testkit';
import {
  beginGrapple, dodgeRefusal, hasInjury, injure, publishCombatDiagnostic, resolveBite, rollInjuries, slotsFor, sprayHit,
} from './index';
import { noteFightActivity } from './fightRecord';

describe('injuries and recovery (§4.7)', () => {
  it('a survivor that lost >= 0.3 health rolls leg 0.3 / antenna 0.15 / gaster 0.1; injured lifespans shorten', () => {
    const a = arena({ seed: 3, manual: true });
    const n = 300;
    const count = { leg: 0, antenna: 0, gaster: 0 };
    for (let i = 0; i < n; i++) {
      const w = ant(a.sim, a.home, 5 + (i % 20), 5 + Math.floor(i / 20));
      noteFightActivity(a.sim, w);
      w.hp = 6; // lost 0.4
      const life0 = w.lifespanGd;
      const got = rollInjuries(a.sim, w);
      for (const k of got) count[k]++;
      if (got.length > 0) expect(w.lifespanGd).toBeLessThan(life0);
    }
    expect(count.leg / n).toBeGreaterThan(0.2);
    expect(count.leg / n).toBeLessThan(0.4);
    expect(count.antenna / n).toBeGreaterThan(0.08);
    expect(count.antenna / n).toBeLessThan(0.22);
    expect(count.gaster / n).toBeGreaterThan(0.04);
    expect(count.gaster / n).toBeLessThan(0.16);
    const w = ant(a.sim, a.home, 60, 60);
    noteFightActivity(a.sim, w);
    w.hp = 8; // lost 0.2: no roll
    expect(rollInjuries(a.sim, w)).toEqual([]);
    injure(a.sim, w, 'leg');
    expect(hasInjury(w, 'leg')).toBe(true);
    expect(w.bb['cb.legs']).toBe(1);
  });

  it('the injury roll happens when the fight record closes 5 s after the last activity', () => {
    const a = arena({ seed: 9, manual: true });
    const w = ant(a.sim, a.home, 20, 20);
    const ev = record(a.sim, ['ant-injured']);
    let rolled = false;
    for (let i = 0; i < 40 && !rolled; i++) {
      w.injuries = 0;
      noteFightActivity(a.sim, w);
      w.hp = 5;
      step(a.sim, 51);
      rolled = w.bb['cb.f0'] === undefined;
    }
    expect(rolled).toBe(true);
    a.sim.events.flush();
    expect(ev.every((e) => e.antId === w.id)).toBe(true);
  });

  it('a gaster wound disables the spray', () => {
    const a = arena({ manual: true });
    const [p, q] = faceToFace(a, 1.2);
    injure(a.sim, p, 'gaster');
    expect(sprayHit(a.sim, p, 'ant', q.id)).toBe(0);
  });
});

describe('dodge (§4.8)', () => {
  it('refused while pinned, while carrying more than 0.5 carryCap, and during the 1.5 s cooldown', () => {
    const a = arena({ manual: true, flags: { noRng: true } });
    const [p, q] = faceToFace(a);
    expect(dodgeRefusal(a.sim, q)).toBe(null);
    beginGrapple(a.sim, p.id, 'ant', q.id);
    beginGrapple(a.sim, ant(a.sim, a.home, 40.9, 40.9).id, 'ant', q.id);
    expect(q.combat?.pinned).toBe(true);
    expect(dodgeRefusal(a.sim, q)).toBe('blocked');
    const w = ant(a.sim, a.home, 10, 10);
    expect(begin(a.sim, w, 'dodge', null)).toBe(true);
    expect(dodgeRefusal(a.sim, w)).toBe('cooldown');
    step(a.sim, 15);
    expect(dodgeRefusal(a.sim, w)).toBe(null);
  });
});

describe('cues and alerts', () => {
  it('one bite cue per bite with the target hardness as strength (queen armour 0.3); misses at 0', () => {
    const a = arena({ manual: true, flags: { noRng: true } });
    const w = ant(a.sim, a.home, 40, 40);
    const q = ant(a.sim, a.rival, 40.9, 40, 'queen', { x: -1, y: 0, z: 0 });
    a.sim.index.refresh();
    const cues = record(a.sim, ['cue']);
    expect(begin(a.sim, w, 'bite', { kind: 'ant', id: q.id, pos: { ...q.pos } })).toBe(true);
    step(a.sim, 6);
    a.sim.events.flush();
    const bites = cues.filter((c) => c.cue === 'bite');
    expect(bites.length).toBe(1);
    expect(bites[0].strength).toBeCloseTo(0.3, 9);
  });

  it('queen-in-danger when the player queen is hurt; diag-combat-losses is published', () => {
    const a = arena({ manual: true });
    const col = a.sim.state.colonies[0];
    const queen = a.sim.stores.ants.get(col.queenId)!;
    const foe = ant(a.sim, a.rival, queen.pos.x / a.sim.world.bu + 1, queen.pos.z / a.sim.world.bu);
    a.sim.index.refresh();
    setFlags(a.sim, { noRng: true });
    resolveBite(a.sim, foe, 'ant', queen.id, false);
    expect(a.sim.state.progression.alerts.some((x) => x.kind === 'queen-in-danger')).toBe(true);
    publishCombatDiagnostic(a.sim);
    expect(a.sim.state.progression.diagnostics.some((d) => d.id === 'diag-combat-losses')).toBe(true);
  });
});

describe('tunnels (§4.3, §4.10)', () => {
  it('a target in a 2 BU tunnel offers at most 2 contact slots', () => {
    const a = arena({ manual: true, nest: true });
    const nest = a.sim.stores.nests.get(a.sim.state.colonies[0].nestIds[0])!;
    const [food, nursery] = nest.chambers;
    const bu = a.sim.world.bu;
    // midpoint of the food-nursery tunnel at its floor (testNest.ts geometry)
    const rim = (c: typeof food, toward: Vec3): Vec3 => {
      const dx = toward.x - c.center.x, dz = toward.z - c.center.z, l = Math.hypot(dx, dz) || 1;
      return { x: c.center.x + (dx / l) * c.radii.x * 0.7, y: c.center.y - c.radii.y + bu, z: c.center.z + (dz / l) * c.radii.z * 0.7 };
    };
    const ra = rim(food, nursery.center), rb = rim(nursery, food.center);
    const mid = { x: (ra.x + rb.x) / 2, y: (ra.y + rb.y) / 2 - bu, z: (ra.z + rb.z) / 2 };
    const t = ant(a.sim, a.rival, 1, 1);
    expect(placeOnSurface(a.sim, t, mid)).toBe(true);
    t.medium = 'cavity';
    const h = ant(a.sim, a.home, 2, 2);
    expect(slotsFor(a.sim, h, { kind: 'ant', ant: t })).toBe(2);
    const open = ant(a.sim, a.rival, 20, 20);
    expect(slotsFor(a.sim, h, { kind: 'ant', ant: open })).toBe(4);
    // a chamber is not a tunnel
    const c = ant(a.sim, a.rival, 3, 3);
    expect(placeOnSurface(a.sim, c, { x: food.center.x, y: food.center.y - food.radii.y, z: food.center.z })).toBe(true);
    c.medium = 'cavity';
    expect(slotsFor(a.sim, h, { kind: 'ant', ant: c })).toBe(4);
  });
});

describe('sting (§4.4)', () => {
  it('a rival pavement ant stings in contact: its catalogue 1.4 over 2 s, 5 s cooldown', () => {
    const a = arena({ manual: true, species: 'tetramorium-immigrans', flags: { noRng: true } });
    const [p, q] = faceToFace(a, 0.65); // bodies 0.8 mm apart: within 0.3 L of the 3.2 mm stinger
    const hits = record(a.sim, ['combat-hit']);
    expect(begin(a.sim, q, 'sting', { kind: 'ant', id: p.id, pos: { ...p.pos } })).toBe(true);
    step(a.sim, 30);
    a.sim.events.flush();
    expect(hits.map((h) => h.kind)).toEqual(['sting']);
    expect(10 - p.hp).toBeCloseTo(1.4, 6);
    expect(begin(a.sim, q, 'sting', { kind: 'ant', id: p.id, pos: { ...p.pos } })).toBe(false); // cooldown
    // a Lasius worker has no sting
    expect(begin(a.sim, p, 'sting', { kind: 'ant', id: q.id, pos: { ...q.pos } })).toBe(false);
  });
});
