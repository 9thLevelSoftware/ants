// Possession rules (GDD 01 §3) and player control (§3.4, §7.2): commands, rejections, the action rules on possess,
// speed rule, AFK release, death while possessed, and AI / player symmetry of the primitives.
import { afterEach, describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { AntFlag, idleIntent } from '@/sim/types';
import { begin, stopAction } from '../actions/runner';
import { ahead, capture, installFakes, larva, makeAntSim, source, step, worker } from '../actions/testkit';
import { clonePlain } from '@/sim/entities';

let restore = (): void => {};
afterEach(() => restore());

function setup(seed = 1) {
  const sim = makeAntSim(seed);
  const f = installFakes(sim);
  restore = f.restore;
  return { sim, fake: f.fake };
}

describe('possess command', () => {
  it('App. E 2: possessing a forager at 8x sets 1x; controlled flag, suspended task, possession-started', () => {
    const { sim } = setup();
    sim.state.env.time.speed = 8;
    const f = worker(sim, 50, 50, 'worker', 'forage');
    const ev = capture(sim, ['possession-started'], () => {
      sim.enqueue({ type: 'possess', role: 'forager', nearPos: f.pos });
      step(sim, 1);
    });
    expect(sim.state.player.possessedAntId).toBe(f.id);
    expect(f.flags & AntFlag.POSSESSED).toBeTruthy();
    expect(f.suspendedTask).toBe('forage');
    expect(sim.state.env.time.speed).toBe(1);
    expect(ev[0]).toMatchObject({ antId: f.id, caste: 'worker' });
  });

  it('rejections: dead, unknown (brood / role nobody has), not-colony, view (time-lapse), no side effects', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    const b = larva(sim, w.pos);
    const foreign = worker(sim, 60, 60);
    foreign.colony = 777;
    const dead = worker(sim, 70, 70);
    sim.stores.ants.markDead(dead.id);
    const ev = capture(sim, ['possess-rejected'], () => {
      sim.enqueue({ type: 'possess', antId: dead.id });
      sim.enqueue({ type: 'possess', antId: b.id });
      sim.enqueue({ type: 'possess', role: 'digger' });
      sim.enqueue({ type: 'possess', antId: foreign.id });
      step(sim, 1);
      sim.state.player.timelapse = { kind: 'founding', startTick: 0, endTick: 10, progress: 0, stage: '', counters: {}, interrupt: null };
      sim.enqueue({ type: 'possess', antId: w.id });
      step(sim, 1);
    });
    expect(ev.map((e) => e.reason)).toEqual(['dead', 'unknown', 'unknown', 'not-colony', 'view']);
    expect(sim.state.player.possessedAntId).toBe(-1);
  });

  it('role ranking: nearest matching task, not carrying brood, ties to the lower id', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50, 'worker', 'dig');
    const b = worker(sim, 50, 50, 'worker', 'haul');
    const c = worker(sim, 49, 50, 'worker', 'dig');
    const br = larva(sim, c.pos);
    br.carriedBy = c.id;
    c.carry = { kind: 'brood', id: br.id };
    sim.enqueue({ type: 'possess', role: 'digger', nearPos: { ...c.pos } });
    step(sim, 1);
    expect(sim.state.player.possessedAntId).toBe(Math.min(a.id, b.id));
  });

  it('step 3: an interruptible AI action is cancelled (load kept); lay-egg past windup finishes', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    const l = larva(sim, ahead(sim, w, 0.6));
    begin(sim, w, 'pick-up', { kind: 'brood', id: l.id, pos: l.pos });
    step(sim, 5);
    begin(sim, w, 'groom', null);
    sim.enqueue({ type: 'possess', antId: w.id });
    step(sim, 1);
    expect(w.action).toBeNull();
    expect(w.carry.kind).toBe('brood');

    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    q.chamberId = 1;
    sim.state.player.opening!.phase = 'lay';
    begin(sim, q, 'lay-egg', null);
    step(sim, 20);
    sim.enqueue({ type: 'possess', antId: q.id });
    step(sim, 1);
    expect(q.action?.id).toBe('lay-egg');
  });

  it('switching releases the previous ant (reason switch) and keeps the speed', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50, 'worker', 'nurse');
    const b = worker(sim, 52, 50);
    sim.enqueue({ type: 'possess', antId: a.id });
    step(sim, 1);
    sim.state.env.time.speed = 2;
    const ev = capture(sim, ['possession-ended'], () => { sim.enqueue({ type: 'possess', antId: b.id }); step(sim, 1); });
    expect(ev[0]).toMatchObject({ antId: a.id, reason: 'switch' });
    expect(sim.state.player.previousAntId).toBe(a.id);
    expect(sim.state.env.time.speed).toBe(2);
    expect(a.flags & AntFlag.POSSESSED).toBe(0);
  });

  it('soft release (colony view) stores the return ant', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    sim.enqueue({ type: 'possess', antId: a.id });
    sim.enqueue({ type: 'release', reason: 'colony-view' });
    step(sim, 1);
    expect(sim.state.player.returnAntId).toBe(a.id);
    expect(sim.state.player.possessedAntId).toBe(-1);
  });
});

describe('player control', () => {
  it('App. E 23: no input for 120 real s (1200 ticks at 1x, 4800 at 4x) -> possession-ended afk', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    sim.enqueue({ type: 'possess', antId: a.id });
    const ev = capture(sim, ['possession-ended'], () => step(sim, 1199));
    expect(ev).toHaveLength(0);
    const ev2 = capture(sim, ['possession-ended'], () => step(sim, 3));
    expect(ev2[0]).toMatchObject({ antId: a.id, reason: 'afk' });

    sim.enqueue({ type: 'possess', antId: a.id });
    step(sim, 1);
    sim.state.env.time.speed = 4;
    step(sim, 1200 * 3);
    expect(sim.state.player.possessedAntId).toBe(a.id);
    sim.setPlayerIntent({ ...idleIntent(), dir: { x: 1, y: 0, z: 0 } });
    step(sim, 4000);
    expect(sim.state.player.possessedAntId).toBe(a.id); // input keeps it
  });

  it('the AFK clock restarts when lastInputTick is reset (a load), although its count lives in the saved ant.bb', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    sim.enqueue({ type: 'possess', antId: a.id });
    step(sim, 1000);
    sim.state.player.lastInputTick = sim.state.tick; // what the load path does (App. A: not persisted)
    step(sim, 1000);
    expect(sim.state.player.possessedAntId).toBe(a.id);
    step(sim, 210);
    expect(sim.state.player.possessedAntId).toBe(-1);
  });

  it('held inputs start and stop hold primitives; movement > 0.5 for > 0.15 s cancels a cancellable one', () => {
    const { sim, fake } = setup();
    const a = worker(sim, 50, 50);
    sim.enqueue({ type: 'possess', antId: a.id });
    sim.setPlayerIntent({ ...idleIntent(), held: ['dig-bite'] });
    step(sim, 25);
    expect(fake.bites).toBe(2);
    sim.setPlayerIntent(idleIntent());
    step(sim, 20);
    expect(fake.bites).toBe(3);
    expect(a.action).toBeNull();
    sim.setPlayerIntent({ ...idleIntent(), grip: true });
    step(sim, 1);
    expect(a.action?.id).toBe('grip');
    sim.setPlayerIntent(idleIntent());
    step(sim, 1);
    expect(a.action).toBeNull();
    begin(sim, a, 'groom', null);
    sim.setPlayerIntent({ ...idleIntent(), dir: { x: 0.9, y: 0, z: 0 } });
    step(sim, 1);
    expect(a.action?.id).toBe('groom');
    const ev = capture(sim, ['action-cancelled'], () => step(sim, 1));
    expect(ev).toHaveLength(1);
  });

  it('App. E 24 (sim part): the possessed ant dies -> possessedAntId -1, possessed-ant-died once, corpse', () => {
    const { sim } = setup();
    const a = worker(sim, 50, 50);
    sim.enqueue({ type: 'possess', antId: a.id });
    step(sim, 1);
    const ev = capture(sim, ['possessed-ant-died', 'possession-ended'], () => {
      sim.enqueue({ type: 'cheat.kill', id: a.id, cause: 'combat' });
      step(sim, 35);
    });
    expect(ev.filter((e) => e.type === 'possessed-ant-died')).toEqual([{ type: 'possessed-ant-died', antId: a.id, cause: 'combat' }]);
    expect(ev.find((e) => e.type === 'possession-ended')).toMatchObject({ reason: 'death' });
    expect(sim.state.player.possessedAntId).toBe(-1);
    expect(sim.state.items.some((i) => i.kind === 'corpse' && i.alive)).toBe(true);
  });
});

describe('symmetry: a possessed ant and an AI ant doing the same primitive change state identically', () => {
  /** Drink for 6 s then feed a larva: through commands (possessed) or direct begin / stopAction calls (AI). */
  function run(possessed: boolean): Sim {
    const { sim } = setup(3);
    const a = worker(sim, 50, 50);
    const s = source(sim, ahead(sim, a, 0.8), 'sugar', 5, { variant: 'sugary-spill' });
    const l = larva(sim, ahead(sim, a, 0.6));
    const drink = { kind: 'source' as const, id: s.id, pos: s.pos };
    const feed = { kind: 'brood' as const, id: l.id, pos: l.pos };
    if (possessed) {
      sim.enqueue({ type: 'possess', antId: a.id });
      sim.enqueue({ type: 'action', actionId: 'harvest-liquid', target: drink, phase: 'start' });
    } else begin(sim, a, 'harvest-liquid', drink);
    step(sim, 60);
    if (possessed) {
      sim.enqueue({ type: 'action', actionId: 'harvest-liquid', phase: 'stop' });
      sim.enqueue({ type: 'action', actionId: 'feed-larva', target: feed, phase: 'start' });
    } else {
      stopAction(sim, a);
      begin(sim, a, 'feed-larva', feed);
    }
    step(sim, 41);
    return sim;
  }

  it('crop, source, larva and items end identical', () => {
    const pick = (sim: Sim) => {
      const a = sim.state.ants[sim.state.ants.length - 1];
      return clonePlain({
        crop: [a.cropC, a.cropP], src: sim.state.sources.map((x) => x.units),
        larva: sim.state.brood.map((b) => [b.gutC, b.gutP]), items: sim.state.items.length, action: a.action,
      });
    };
    const p = pick(run(true));
    expect(p.crop[0]).toBeCloseTo(0.2, 9);
    expect(pick(run(false))).toEqual(p);
  });
});

describe('possession diagnostics (GDD 01 App. D)', () => {
  it('a failed player action publishes diag-possessed-action; a release publishes diag-released-ant with the rule', async () => {
    const { sim } = setup();
    const { ports } = await import('../actions/ports');
    const seen: { id: string; value: number; factors: { cause: string }[] }[] = [];
    ports.publishDiagnostic = (_s, d) => { seen.push(d); };
    const a = worker(sim, 50, 50);
    sim.enqueue({ type: 'possess', antId: a.id });
    sim.enqueue({ type: 'action', actionId: 'lay-egg', phase: 'start' });
    step(sim, 1);
    expect(seen[0]).toMatchObject({ id: 'diag-possessed-action', factors: [{ cause: 'caste' }] });
    sim.enqueue({ type: 'release', reason: 'player' });
    step(sim, 1);
    expect(seen[1]).toMatchObject({ id: 'diag-released-ant', value: 16, focus: { kind: 'ant', id: a.id } });
  });
});
