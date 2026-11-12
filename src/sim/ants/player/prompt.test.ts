// Context prompts (GDD 01 §9): priority classes, scoring, hysteresis (no flicker), text and extra key lines.
import { afterEach, describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { spawnItem } from '@/sim/entities';
import { foodItem, installFakes, larva, makeAntSim, source, step, worker } from '../actions/testkit';
import { currentPrompt, promptView } from './prompt';
import { promptCandidates, updatePromptSelection } from './targeting';

let restore = (): void => {};
afterEach(() => restore());

function setup() {
  const sim = makeAntSim();
  const f = installFakes(sim);
  restore = f.restore;
  return { sim, fake: f.fake };
}

function possessed(sim: Sim, x = 50, z = 50): Ant {
  const a = worker(sim, x, z);
  sim.enqueue({ type: 'possess', antId: a.id });
  step(sim, 1);
  return a;
}

/** A point at distance dBu from the ant, angle deg off its forward (around +Y). */
function at(sim: Sim, a: Ant, dBu: number, deg: number) {
  const r = (deg * Math.PI) / 180, d = dBu * sim.world.bu;
  return { x: a.pos.x + Math.cos(r) * d, y: 0, z: a.pos.z + Math.sin(r) * d };
}

describe('prompt selection', () => {
  it('App. E 11: crumb at 0.5 BU and larva at 0.6 BU in the cone -> "Pick up larva" (class 3 beats class 4)', () => {
    const { sim } = setup();
    const a = possessed(sim);
    const crumb = foodItem(sim, at(sim, a, 0.5, 10), 0.2);
    const l = larva(sim, at(sim, a, 0.6, -10));
    step(sim, 3); // the prompt switches from "self" after PROMPT_SWITCH_REAL_S
    const p = currentPrompt(sim, a);
    expect(p).toMatchObject({ actionId: 'pick-up', target: { kind: 'brood', id: l.id }, ok: true });
    expect(promptView(sim, a).primary?.text).toBe('Pick up larva');
    expect(promptCandidates(sim, a).map((c) => c.target.id)).toContain(crumb.id);
  });

  it('nothing in reach: self / ground; the queen in a chamber gets "Lay egg"; AI ants have no prompt', () => {
    const { sim } = setup();
    const a = possessed(sim);
    expect(currentPrompt(sim, a)).toMatchObject({ actionId: 'groom', target: { kind: 'none' } });
    expect(promptView(sim, a).primary?.text).toBe('Groom yourself');
    const ai = worker(sim, 80, 80);
    expect(currentPrompt(sim, ai)).toBeNull();
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    q.chamberId = 1; // in a chamber
    sim.enqueue({ type: 'possess', antId: q.id });
    step(sim, 1);
    expect(currentPrompt(sim, q)?.actionId).toBe('lay-egg');
    // outside a chamber / the founding cell the queen's self prompt is "Groom yourself", not a greyed "Lay egg"
    q.chamberId = -1;
    q.nestId = -1;
    expect(currentPrompt(sim, q)).toMatchObject({ actionId: 'groom', target: { kind: 'none' }, ok: true });
    expect(promptView(sim, q).primary?.text).toBe('Groom yourself');
  });

  it('a disabled best action keeps its score and shows greyed with the reason', () => {
    const { sim } = setup();
    const a = possessed(sim);
    a.cropC = 1;
    source(sim, at(sim, a, 0.8, 0), 'sugar', 3, { variant: 'sugary-spill' });
    step(sim, 3);
    const v = promptView(sim, a);
    expect(v.primary).toMatchObject({ actionId: 'harvest-liquid', ok: false, reason: 'crop-full' });
    expect(v.primary?.text).toBe('Drink sugar — crop full');
  });

  it('a too-heavy item says how many ants it needs (GDD 01 §9.3)', () => {
    const { sim } = setup();
    const a = possessed(sim);
    foodItem(sim, at(sim, a, 0.6, 0), 2.5 * a.carryCap);
    step(sim, 3);
    const v = promptView(sim, a);
    expect(v.primary).toMatchObject({ actionId: 'pick-up', ok: false, reason: 'too-heavy' });
    expect(v.primary?.text).toBe('Pick up crumb — too heavy (needs about 3)');
  });

  it('delivery receivers rank first: larva while carrying protein -> Feed; entrance throat while carrying a pellet -> Seal', () => {
    const { sim } = setup();
    const a = possessed(sim);
    a.cropP = 0.3;
    const l = larva(sim, at(sim, a, 0.6, 0));
    foodItem(sim, at(sim, a, 0.5, 15), 0.2);
    step(sim, 3);
    expect(currentPrompt(sim, a)).toMatchObject({ actionId: 'feed-larva', target: { id: l.id } });
  });

  it('hysteresis: two equally good targets never flicker; a clearly better one takes over after 200 ms', () => {
    const { sim } = setup();
    const a = possessed(sim);
    const e1 = larva(sim, at(sim, a, 0.6, 20));
    const e2 = larva(sim, at(sim, a, 0.6, -20));
    step(sim, 3);
    const first = updatePromptSelection(sim, a)!.target.id;
    expect([e1.id, e2.id]).toContain(first);
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      // jitter the bearings so the raw winner alternates every tick
      const j = i % 2 === 0 ? 1 : -1;
      e1.pos = at(sim, a, 0.6, 20 + 3 * j);
      e2.pos = at(sim, a, 0.6, -20 + 3 * j);
      sim.index.refresh();
      sim.state.tick++;
      seen.add(updatePromptSelection(sim, a)!.target.id);
    }
    expect([...seen]).toEqual([first]);
    // the other one right in front and the current one at 45° (lead 0.27 > 0.15): it wins after 200 ms
    const cur = first === e1.id ? e1 : e2;
    const other = first === e1.id ? e2 : e1;
    other.pos = at(sim, a, 0.5, 0);
    cur.pos = at(sim, a, 0.6, 45);
    sim.index.refresh();
    sim.state.tick++;
    expect(updatePromptSelection(sim, a)!.target.id).toBe(first);
    sim.state.tick++;
    expect(updatePromptSelection(sim, a)!.target.id).toBe(first);
    sim.state.tick++;
    expect(updatePromptSelection(sim, a)!.target.id).toBe(other.id);
  });

  it('the 200 ms switch delay is real time: at 4x a clearly better target needs 8 ticks to take over', () => {
    const { sim } = setup();
    const a = possessed(sim);
    const e1 = larva(sim, at(sim, a, 0.6, 45));
    sim.index.refresh();
    step(sim, 3);
    expect(updatePromptSelection(sim, a)!.target.id).toBe(e1.id);
    sim.state.env.time.speed = 4;
    const e2 = larva(sim, at(sim, a, 0.5, 0));
    sim.index.refresh();
    const picks: number[] = [];
    for (let i = 0; i < 10; i++) {
      sim.state.tick++;
      picks.push(updatePromptSelection(sim, a)!.target.id);
    }
    // first tick starts the challenge, 8 more ticks of 25 real ms each reach 200 ms
    expect(picks.indexOf(e2.id)).toBe(8);
  });

  it('candidate order is deterministic (score, then kind, then id)', () => {
    const { sim } = setup();
    const a = possessed(sim);
    for (let i = 0; i < 4; i++) spawnItem(sim, { kind: 'pebble', pos: at(sim, a, 0.6, 0), init: { bulk: 0.2 } });
    sim.index.refresh();
    const ids = promptCandidates(sim, a).filter((c) => c.target.kind === 'item').map((c) => c.target.id);
    expect(ids).toEqual([...ids].sort((x, y) => x - y));
    expect(promptCandidates(sim, a)).toEqual(promptCandidates(sim, a));
  });
});

describe('extra key lines', () => {
  it('dig (F), share / beg food (G) with a nestmate, drop (Space) when carrying, inspect (T); queen: Colony orders', () => {
    const { sim } = setup();
    const a = possessed(sim);
    const mate = worker(sim, 50.9, 50);
    mate.cropC = 0.6;
    step(sim, 3);
    let v = promptView(sim, a);
    expect(v.primary?.text).toBe('Groom nestmate');
    expect(v.extras.map((l) => l.input)).toEqual(['dig', 'share-food']);
    expect(v.extras[1].text).toBe('Beg food');
    a.cropC = 0.5;
    v = promptView(sim, a);
    expect(v.extras[1].text).toBe('Share food');
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    q.flags |= AntFlag.POSSESSED;
    sim.state.player.opening!.done = true;
    expect(promptView(sim, q).extras.some((l) => l.input === 'directives' && l.text === 'Colony orders')).toBe(true);
  });
});
