// ui-hud bridge tests: the HUD slices, change detection (structural sharing), the roster page with its frozen order,
// the directives slice, the inspect card, and the refresh cost with 1,500 ants.
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import { defaultQuery } from '@/ui/panels/roster/rosterModel';
import { SnapshotBuilder, type SnapshotSource } from '../uiBridge';
import { hudRequests } from './requests';
import { plainEqual, share } from './share';

function src(sim: Sim | null, o: Partial<SnapshotSource> = {}): SnapshotSource {
  return {
    sim, mode: 'playing', view: 'observer', loading: null, speed: null, manualClock: false, toasts: [], hudHidden: false,
    error: null, underground: false, epitaph: null, ...o,
  };
}

function simWith(workers: number, extra = 0): Sim {
  const sim = makeTestSim({ nest: 'small', workers });
  if (extra > 0) {
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: sim.state.colonies[0].id, n: extra, caste: 'worker', ageGd: 5, task: null, pos: { ...sim.world.queenStart.pos } });
    sim.applyPendingCommands();
  }
  return sim;
}

beforeEach(() => { hudRequests.roster = null; hudRequests.inspect = null; hudRequests.hooks = null; });

describe('structural sharing', () => {
  it('plainEqual compares plain data deeply', () => {
    expect(plainEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(plainEqual({ a: [1, 2] }, { a: [1, 3] })).toBe(false);
    expect(plainEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(plainEqual([1], { 0: 1 })).toBe(false);
  });
  it('share keeps the previous object when nothing changed', () => {
    const a = { x: [1, 2] };
    expect(share(a, { x: [1, 2] })).toBe(a);
    expect(share(a, { x: [1, 3] })).not.toBe(a);
  });
  it('two refreshes without a sim change keep every slice object (nothing re-renders)', () => {
    const sim = simWith(4);
    sim.enqueue({ type: 'possess', role: 'queen' });
    sim.applyPendingCommands();
    const b = new SnapshotBuilder();
    const s1 = b.build(src(sim, { view: 'possess' }), 0, 0);
    const s2 = b.build(src(sim, { view: 'possess' }), s1.rev, 100);
    expect(s2.rev).toBe(s1.rev + 1);
    for (const k of ['time', 'speed', 'colony', 'possessed', 'prompt', 'alerts', 'directives', 'toasts'] as const) expect(s2[k], k).toBe(s1[k]);
  });
  it('a change in one slice replaces only that slice', () => {
    const sim = simWith(4);
    const b = new SnapshotBuilder();
    const s1 = b.build(src(sim), 0, 0);
    sim.state.colonies[0].stores.c += 1;
    const s2 = b.build(src(sim), s1.rev, 100);
    expect(s2.colony).not.toBe(s1.colony);
    expect(s2.time).toBe(s1.time);
    expect(s2.directives).not.toBe(s1.directives); // stores are in its readouts
    expect(s2.speed).toBe(s1.speed);
  });
});

describe('HUD slices', () => {
  it('time carries weather, temperature, day or night and the season length', () => {
    const sim = simWith(2);
    const s = new SnapshotBuilder().build(src(sim), 0, 0);
    expect(s.time?.weather?.word).toMatch(/^[A-Z]/);
    expect(Number.isInteger(s.time?.weather?.tempC)).toBe(true);
    expect(typeof s.time?.weather?.isDay).toBe('boolean');
    expect(s.time?.seasonLength).toBe(sim.state.config.rules.seasonLengthDays);
  });
  it('colony pulse: workers by group, trend inputs, stock days, status', () => {
    const sim = simWith(6);
    const c = new SnapshotBuilder().build(src(sim), 0, 0).colony!;
    expect(c.workers).toBe(6);
    const g = c.groups!;
    expect(g.forage + g.nurse + g.dig + g.defend + g.idle).toBe(6);
    expect(c.past).toEqual({ c: null, p: null }); // no history yet
    expect(c.spark!.c.length).toBeGreaterThanOrEqual(1);
    expect(['ok', 'warn', 'bad']).toContain(c.status);
  });
  it('possessed panel: name, queen flag, hand-over gate for Colony orders', () => {
    const sim = simWith(3);
    sim.enqueue({ type: 'possess', role: 'queen' });
    sim.applyPendingCommands();
    const op = sim.state.player.opening;
    const p = new SnapshotBuilder().build(src(sim, { view: 'possess' }), 0, 0).possessed!;
    expect(p.isQueen).toBe(true);
    expect(p.name).toMatch(/^Queen \d{4}$/);
    expect(p.colonyOrders).toBe(op === null || op.done);
    if (sim.state.player.opening) sim.state.player.opening.done = true;
    expect(new SnapshotBuilder().build(src(sim, { view: 'possess' }), 0, 0).possessed!.colonyOrders).toBe(true);
  });
  it('the queen prompt carries the Colony orders line with its input after hand-over', () => {
    const sim = simWith(3);
    if (sim.state.player.opening) sim.state.player.opening.done = true;
    sim.enqueue({ type: 'possess', role: 'queen' });
    sim.applyPendingCommands();
    const pr = new SnapshotBuilder().build(src(sim, { view: 'possess' }), 0, 0).prompt!;
    const orders = pr.lines!.find((l) => l.input === 'directives');
    expect(orders?.text).toBe('Colony orders');
    expect(pr.extras).toContain('Colony orders');
  });
  it('a worker never gets the Colony orders line', () => {
    const sim = simWith(5);
    if (sim.state.player.opening) sim.state.player.opening.done = true;
    sim.enqueue({ type: 'possess', role: 'queen' });
    sim.applyPendingCommands();
    const w = sim.state.ants.find((a) => a.caste === 'worker')!;
    sim.enqueue({ type: 'possess', antId: w.id });
    sim.applyPendingCommands();
    const s = new SnapshotBuilder().build(src(sim, { view: 'possess' }), 0, 0);
    expect(s.possessed!.colonyOrders).toBe(false);
    expect(s.prompt?.lines?.some((l) => l.input === 'directives') ?? false).toBe(false);
  });
});

describe('directives slice', () => {
  it('reports the allocation mode, shares, need, target and actual per group', () => {
    const sim = simWith(8);
    const d = new SnapshotBuilder().build(src(sim), 0, 0).directives!;
    expect(d.allocationMode).toBe('auto');
    const sum = d.shares.forage + d.shares.nurse + d.shares.dig + d.shares.defend;
    expect(Math.round(sum)).toBe(100);
    expect(d.workers).toBe(8);
    expect(d.architect === null || ['auto', 'suggest', 'off'].includes(d.architect)).toBe(true);
  });
  it('follows setDirectives: manual shares, diet, stay-in', () => {
    const sim = simWith(8);
    sim.enqueue({ type: 'setDirectives', allocation: { forage: 40, nurse: 30, dig: 20, defend: 10 }, diet: 30, stayIn: true });
    sim.applyPendingCommands();
    const d = new SnapshotBuilder().build(src(sim), 0, 0).directives!;
    expect(d.allocationMode).toBe('manual');
    expect(d.shares.forage).toBe(40);
    expect(d.diet).toBe(30);
    expect(d.stayIn).toBe(true);
    expect(d.stayInHoursLeft).toBeGreaterThan(0);
  });
});

describe('roster slice', () => {
  it('is empty while closed and answers a query while open', () => {
    const sim = simWith(10);
    const b = new SnapshotBuilder();
    expect(b.build(src(sim), 0, 0).roster).toBeNull();
    hudRequests.roster = { ...defaultQuery(), limit: 6 };
    const r = b.build(src(sim), 1, 0).roster!;
    expect(r.rows.length).toBe(6);
    expect(r.total).toBe(11); // ten workers and the queen
    expect(r.rows[0].name).toMatch(/^(Worker|Queen) \d{4}$/);
    expect(r.rows.map((x) => x.id)).toEqual([...r.rows.map((x) => x.id)].sort((a, c) => a - c));
  });
  it('filters by caste and searches by id', () => {
    const sim = simWith(10);
    const b = new SnapshotBuilder();
    hudRequests.roster = { ...defaultQuery(), caste: 'queen' };
    expect(b.build(src(sim), 0, 0).roster!.total).toBe(1);
    const id = sim.state.ants.find((a) => a.caste === 'worker')!.id;
    hudRequests.roster = { ...defaultQuery(), search: String(id) };
    const r = b.build(src(sim), 1, 1000).roster!;
    expect(r.rows.some((x) => x.id === id)).toBe(true);
  });
  it('keeps the order frozen between updates and shows Re-sort when it is stale', () => {
    const sim = simWith(8);
    const b = new SnapshotBuilder();
    hudRequests.roster = { ...defaultQuery(), sort: 'health', dir: 'desc', limit: 8 };
    const r1 = b.build(src(sim), 0, 0).roster!;
    const first = r1.rows.map((x) => x.id);
    expect(r1.stale).toBe(false);
    // hurt the healthiest ant so it should drop in a fresh sort
    const top = sim.stores.ants.get(first[0])!;
    top.hp = top.maxHp * 0.1;
    const r2 = b.build(src(sim), 1, 600).roster!;
    expect(r2.rows.map((x) => x.id)).toEqual(first); // unchanged order
    expect(r2.stale).toBe(true);
    hudRequests.roster = { ...hudRequests.roster!, resort: 1 };
    const r3 = b.build(src(sim), 2, 1200).roster!;
    expect(r3.rows[0].id).not.toBe(first[0]);
    expect(r3.stale).toBe(false);
  });
  it('rebuilds at most twice per real second', () => {
    const sim = simWith(6);
    const b = new SnapshotBuilder();
    hudRequests.roster = { ...defaultQuery() };
    const a = b.build(src(sim), 0, 0).roster!;
    const c = b.build(src(sim), 1, 200).roster!;
    expect(c).toBe(a);
  });
  it('counts roles for the quick-possess buttons', () => {
    const sim = simWith(6);
    hudRequests.roster = { ...defaultQuery() };
    const r = new SnapshotBuilder().build(src(sim), 0, 0).roster!;
    expect(r.roles.queen).toBe(1);
    expect(r.all).toBe(7);
  });
});

describe('inspect slice', () => {
  it('builds the card from the simulation read-out for an ant', () => {
    const sim = simWith(4);
    const w = sim.state.ants.find((a) => a.caste === 'worker')!;
    hudRequests.inspect = { kind: 'ant', id: w.id };
    const i = new SnapshotBuilder().build(src(sim), 0, 0).inspect!;
    expect(i.header).toMatch(/^Worker \d{4}$/);
    expect(i.senses.find((r) => r.key === 'caste')).toBeTruthy();
    expect(i.canPossess).toBe(true);
    expect(i.colonyOrders).toBe(false);
  });
  it("the queen's card offers Colony orders; a gone target gives no card", () => {
    const sim = simWith(4);
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    hudRequests.inspect = { kind: 'ant', id: q.id };
    expect(new SnapshotBuilder().build(src(sim), 0, 0).inspect!.colonyOrders).toBe(true);
    hudRequests.inspect = { kind: 'ant', id: 99999 };
    expect(new SnapshotBuilder().build(src(sim), 0, 0).inspect).toBeNull();
  });
  it('falls back to the game highlight (hover / inspect fields) when the UI has not chosen', () => {
    const sim = simWith(3);
    const w = sim.state.ants.find((a) => a.caste === 'worker')!;
    hudRequests.hooks = { gameInspect: () => ({ kind: 'ant', id: w.id }), gameHover: () => null };
    expect(new SnapshotBuilder().build(src(sim), 0, 0).inspect?.targetId).toBe(w.id);
  });
});

describe('refresh cost', () => {
  it('stays small with 1,500 ants (roster closed, then open)', () => {
    const sim = simWith(10, 1490);
    expect(sim.state.ants.filter((a) => a.alive).length).toBeGreaterThanOrEqual(1500);
    const b = new SnapshotBuilder();
    b.build(src(sim), 0, 0);
    const time = (f: () => void): number => { let best = Infinity; for (let r = 0; r < 7; r++) { const t0 = performance.now(); for (let i = 0; i < 20; i++) f(); best = Math.min(best, (performance.now() - t0) / 20); } return best; };
    const closed = time(() => b.build(src(sim), 1, 0));
    hudRequests.roster = { ...defaultQuery() };
    let t = 0;
    const open = time(() => b.build(src(sim), 1, (t += 600)));
    // the strict budget is 0.5 ms (documented); the test limit is load tolerant
    // eslint-disable-next-line no-console
    console.log(`bridge refresh with 1500 ants: closed ${closed.toFixed(3)} ms, roster open ${open.toFixed(3)} ms`);
    expect(closed).toBeLessThan(5);
    expect(open).toBeLessThan(15);
  });
});
