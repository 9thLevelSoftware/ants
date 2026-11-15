// Rival colonies on the full system list: real nests (chambers, queens, display brood), fielding (emergence rate,
// absorption with deliveries), the encounter ritual and discovery, the player's rally raid, the queen hiding,
// alerts and the diagnostic, new foundations.
import { describe, expect, it } from 'vitest';
import { commandsSystem } from '@/sim/systems';
import { behaviourSystem, lifecycleSystem } from '@/sim/ants';
import { BROOD_DISPLAY_MAX, EMERGE_EVERY_S } from '@/sim/balance/rivals';
import { TICKS_PER_HOUR, TICKS_PER_SECOND, calendarTickAt } from '@/sim/time';
import { absorbAgent, spawnAgent } from './agents';
import { isHostile, relationOf, rivalsSystem, rivalsTickSystem, rivalSummary } from './index';
import { destroy } from './lifecycle';
import { displayTarget, homeNest, placeOnFloor, setupRivalNest } from './setup';
import { encounterStep } from './encounter';
import { colExt, JOB, rmod, slotBit } from './state';
import { player, record, rivalSim, rivalsOf } from './testkit';

describe('real nests (GDD 05 §3.4)', () => {
  it('template chambers, queens (Myrmica 3) and min(24, ceil(B / 10)) display brood; nests never auto-expand', () => {
    const sim = rivalSim({ sizeBu: 512, rivals: [{ species: 'myrmica-rubra', dx: 120, dz: 0 }, { species: 'lasius-niger', dx: -120, dz: 0, incipient: true }], systems: [commandsSystem, rivalsTickSystem] });
    sim.tick();
    const [m, inc] = rivalsOf(sim);
    const nest = homeNest(sim, m)!;
    expect(nest.chambers.map((c) => c.type)).toEqual(['royal', 'nursery', 'general']);
    expect(nest.entrances.length).toBe(1);
    expect(nest.architect.mode).toBe('off');
    expect(m.queens.length).toBe(3);
    for (const q of m.queens) expect(sim.stores.ants.get(q.antId)?.nestId).toBe(nest.id);
    const display = sim.state.brood.filter((b) => b.alive && b.colony === m.id).length;
    expect(display).toBe(displayTarget(m.rival.b));
    expect(displayTarget(1000)).toBe(BROOD_DISPLAY_MAX);
    // the incipient: the founding cell only, one queen with founding stats, 12 abstract brood
    const inest = homeNest(sim, inc)!;
    expect(inest.chambers.map((c) => c.type)).toEqual(['royal']);
    expect(inc.queens.length).toBe(1);
    expect(inc.rival.b).toBe(12);
    expect(inc.rival.n).toBe(0);
    expect(sim.stores.ants.get(inc.queenId)!.maxHp).toBe(40);
    expect(rivalSummary(sim).length).toBe(2);
  }, 60_000);
});

describe('fielding (GDD 05 §3.3)', () => {
  it('agents emerge at most one per 2 s per entrance; an agent home again is absorbed with its load', () => {
    const sim = rivalSim({ sizeBu: 384, rivals: [{ species: 'tetramorium-immigrans', dx: 100, dz: 0 }] });
    sim.tick();
    const r = rivalsOf(sim)[0];
    const counts: number[] = [];
    for (let t = 0; t < 20 * TICKS_PER_SECOND; t++) { sim.tick(); counts.push(r.rival.fieldedIds.length); }
    const max = counts[counts.length - 1];
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(Math.ceil(20 / EMERGE_EVERY_S) + 1);
    // absorption: the load arrives in the stores and in this hour's deliveries, N is unchanged
    const a = sim.stores.ants.get(r.rival.fieldedIds[0])!;
    a.bb['rv.lc'] = 0.5; a.bb['rv.lp'] = 0.25;
    const n0 = r.rival.n, c0 = r.rival.cS, ext = colExt(sim.state, r.id), h0 = ext.hourC;
    expect(absorbAgent(sim, a)).toBe(true);
    expect(r.rival.n).toBe(n0);
    expect(r.rival.cS).toBeCloseTo(c0 + 0.5);
    expect(ext.hourC).toBeCloseTo(h0 + 0.5);
    sim.tick();
    expect(sim.stores.ants.get(a.id)).toBeUndefined();
    expect(sim.state.items.some((i) => i.alive && i.kind === 'corpse')).toBe(false); // no body
  }, 60_000);

  it('fielded deaths leave N', () => {
    const sim = rivalSim({ sizeBu: 384, rivals: [{ species: 'tetramorium-immigrans', dx: 100, dz: 0 }], systems: [commandsSystem, rivalsTickSystem, lifecycleSystem] });
    sim.tick();
    const r = rivalsOf(sim)[0];
    const a = spawnAgent(sim, r, JOB.forage, false)!;
    const n0 = r.rival.n;
    sim.enqueue({ type: 'cheat.kill', id: a.id, cause: 'combat' });
    sim.tick();
    expect(r.rival.n).toBe(n0 - 1);
  }, 60_000);
});

describe('encounters (GDD 05 §3.6)', () => {
  it('contact: discovery both ways, +1 escalation, the ritual display, then a withdrawal (agg 0)', () => {
    const sim = rivalSim({ sizeBu: 384, nest: 'small', workers: 1, rivals: [{ species: 'lasius-niger', dx: 90, dz: 0 }], systems: [commandsSystem] });
    const r = rivalsOf(sim)[0];
    setupRivalNest(sim, r);
    r.rival.agg = 0;
    const ev = record(sim, ['rival-encounter', 'rival-discovered']);
    const w = sim.state.ants.find((a) => a.alive && a.colony === player(sim).id && a.caste === 'worker')!;
    const agent = spawnAgent(sim, r, JOB.patrol, false)!;
    const p = { x: sim.world.size / 2 + 30 * sim.world.bu, y: 4, z: sim.world.size / 2 };
    w.nestId = -1;
    placeOnFloor(sim, w, p);
    placeOnFloor(sim, agent, { x: p.x + 0.8 * sim.world.bu, y: 4, z: p.z });
    sim.index.refresh();
    expect(encounterStep(sim, agent, r)).toBe(true); // display
    sim.state.tick += 40; // past the 1-3 s display
    expect(encounterStep(sim, agent, r)).toBe(true); // withdrawal (p = 1 - agg = 1)
    sim.events.flush();
    const outcomes = ev.filter((e) => e.type === 'rival-encounter').map((e) => (e as { outcome: string }).outcome);
    expect(outcomes).toEqual(['display', 'withdraw']);
    const disc = ev.filter((e) => e.type === 'rival-discovered') as { colonyId: number; by: number }[];
    expect(disc.some((d) => d.colonyId === r.id && d.by === player(sim).id)).toBe(true);
    const rel = sim.state.rivals.relations.find((x) => (x.a === r.id || x.b === r.id));
    expect(rel?.e).toBeCloseTo(1, 5);
    // the same pair counts again only after 60 s
    delete agent.bb['rv.wd'];
    expect(encounterStep(sim, agent, r)).toBe(false);
    expect(rel?.e).toBeCloseTo(1, 5);
    expect(relationOf(sim, player(sim).id, r.id)).toBe('peace');
    expect(isHostile(sim, player(sim).id, r.id)).toBe(true);
    expect(isHostile(sim, r.id, r.id)).toBe(false);
  }, 60_000);
});

describe('player raids (GDD 05 §3.7)', () => {
  it('a rally attack marker within 30 BU of a known foreign entrance sends 30 % of the foragers and guards', () => {
    const sim = rivalSim({ sizeBu: 384, nest: 'small', workers: 20, rivals: [{ species: 'lasius-niger', dx: 70, dz: 0 }] });
    sim.tick();
    const r = rivalsOf(sim)[0], col = player(sim);
    for (const a of sim.state.ants) if (a.alive && a.colony === col.id && a.caste === 'worker') a.task = 'forage';
    rmod(sim.state).playerKnowsNest |= slotBit(sim.state, r.id);
    const e = homeNest(sim, r)!.entrances[0];
    const ev = record(sim, ['rival-raid-started']);
    sim.enqueue({ type: 'placeMarker', kind: 'rally', pos: { x: e.pos.x - 10 * sim.world.bu, y: 0, z: e.pos.z }, radius: 8 * sim.world.bu, params: { mode: 'attack' } });
    for (let t = 0; t < 20; t++) sim.tick();
    sim.events.flush();
    const s = ev[0] as { attacker: number; target: number; partySize: number } | undefined;
    expect(s?.attacker).toBe(col.id);
    expect(s?.target).toBe(r.id);
    expect(s?.partySize).toBe(6);
    expect(sim.state.ants.filter((a) => a.alive && a.colony === col.id && a.task === 'raid').length).toBe(6);
  }, 60_000);
});

describe('the queen, alerts and the diagnostic', () => {
  it('a hostile within 10 BU sends the queen to the deepest chamber; >= 3 hostile ants in the player nest raise nest-attacked', () => {
    const sim = rivalSim({ sizeBu: 384, nest: 'small', workers: 0, rivals: [{ species: 'lasius-niger', dx: 80, dz: 0 }], systems: [commandsSystem, behaviourSystem, rivalsTickSystem, rivalsSystem] });
    sim.tick();
    const r = rivalsOf(sim)[0];
    const q = sim.stores.ants.get(r.queenId)!;
    const intruder = sim.state.ants.find((a) => a.alive && a.colony === player(sim).id)!; // the player's queen
    intruder.thinkTick = 1e9;
    placeOnFloor(sim, intruder, { x: q.pos.x + 4 * sim.world.bu, y: q.pos.y, z: q.pos.z });
    sim.index.refresh();
    for (let t = 0; t < 30; t++) sim.tick();
    expect((q.bb['rv.hide'] ?? 0)).toBeGreaterThan(sim.state.tick);
    // three rival agents inside the player nest
    const pn = homeNest(sim, player(sim))!;
    const ch = pn.chambers[0];
    for (let i = 0; i < 3; i++) {
      const a = spawnAgent(sim, r, JOB.defend, false)!;
      a.thinkTick = 1e9;
      a.nestId = pn.id;
      placeOnFloor(sim, a, { x: ch.center.x + i, y: ch.center.y, z: ch.center.z });
    }
    const ev = record(sim, ['alert']);
    for (let t = 0; t < 20; t++) sim.tick();
    sim.events.flush();
    expect(ev.some((e) => (e as { alert: { kind: string } }).alert.kind === 'nest-attacked')).toBe(true);
    for (let t = 0; t < TICKS_PER_HOUR; t++) sim.tick();
    expect(sim.state.progression.diagnostics.some((d) => d.id === 'diag-rivals')).toBe(true);
  }, 60_000);
});

describe('new foundations (GDD 05 §3.9)', () => {
  it('with every established rival gone, the flight window at 16:00 brings an incipient colony (p 1.0)', () => {
    const sim = rivalSim({ sizeBu: 768, rivals: [{ species: 'tetramorium-immigrans', dx: 300, dz: 0 }], systems: [commandsSystem, rivalsTickSystem, rivalsSystem] });
    sim.tick();
    const r = rivalsOf(sim)[0];
    destroy(sim, r);
    expect(rivalsOf(sim).length).toBe(0);
    // jump to day 10 (inside the Lasius flight window 9-13) at 15:59
    const target = calendarTickAt('summer', 3, 15.99, 7);
    sim.state.tick = target - sim.state.env.calendar.startTick;
    sim.state.tick -= sim.state.tick % TICKS_PER_HOUR; // land on an hourly boundary before 16:00
    const ev = record(sim, ['rival-founded']);
    for (let t = 0; t < 3 * TICKS_PER_HOUR; t++) sim.tick();
    sim.events.flush();
    expect(ev.length).toBe(1);
    const inc = rivalsOf(sim)[0];
    expect(inc.rival.incipient).toBe(true);
    expect(inc.species).toBe(sim.state.config.species);
  }, 60_000);
});
