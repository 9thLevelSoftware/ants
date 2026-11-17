// LONG (FOUNDRESS_LONG=1): custom rules that switch a threat off yield no event of that kind in a real game
// (difficulty-rules AC3). One generated world, the founding completed with the cheat hand-over, then 3 game days.
// The same game with default rules is the control: it must show the events the rules remove.
// The 28-day three-preset comparison is tools/sim/difficultyRun.ts (numbers in the task report).

import { describe, expect, it } from 'vitest';
import type { CustomRules, SimEvent } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { CREATURE_STATS } from '@/sim/balance/creatures';
import { TICKS_PER_DAY } from '@/sim/time';
import { generateWorld } from '@/worldgen';
import { applyRules } from './rules';

interface Counts { predators: number; humanStarts: number; rivalEvents: number; birds: number; rivalColonies: number }

function play(rules: Partial<CustomRules>, days: number): Counts {
  const base = defaultGameConfig('lasius-niger', 1, 'naturalist');
  const { config } = applyRules({ ...base, cheats: true, world: { ...base.world, archetype: 'suburban-garden' } }, rules);
  const world = generateWorld(config.world);
  const sim = createSim(createNewGame(config, world).state, world);
  const c: Counts = { predators: 0, humanStarts: 0, rivalEvents: 0, birds: 0, rivalColonies: 0 };
  const on = <T extends SimEvent['type']>(t: T, f: (e: Extract<SimEvent, { type: T }>) => void): void => { sim.events.on(t, f as never); };
  on('creature-spawned', (e) => { if (CREATURE_STATS[e.kind]?.family === 'ant-predator') c.predators++; });
  on('human.start', () => { c.humanStarts++; });
  on('bird-approach', () => { c.birds++; });
  for (const t of ['rival-encounter', 'rival-raid-started', 'rival-founded', 'rival-relation-changed'] as const) on(t, () => { c.rivalEvents++; });
  sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
  const op = () => sim.state.player.opening;
  for (let i = 0; i < 16 * TICKS_PER_DAY; i++) {
    sim.tick();
    const p = op()?.phase;
    if (p === 'handover' || p === 'failed' || op()?.done) break;
  }
  const end = sim.state.tick + days * TICKS_PER_DAY;
  while (sim.state.tick < end) sim.tick();
  c.rivalColonies = sim.state.colonies.filter((x) => x.alive && !x.isPlayer).length;
  return c;
}

const LONG = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FOUNDRESS_LONG;

describe.skipIf(!LONG)('custom rules switch their threats off (LONG)', () => {
  it('control: default rules show predators, people and rival colonies', () => {
    const control = play({}, 3);
    expect(control.predators).toBeGreaterThan(0);
    expect(control.humanStarts).toBeGreaterThan(0);
    expect(control.rivalColonies).toBeGreaterThan(0);
  }, 900_000);

  it('predators off, rivals 0, humanActivity off: no predator spawn, no bird, no human event, no rival event, no rival colony', () => {
    const c = play({ predators: 'off', rivals: 0, humanActivity: 'off' }, 3);
    expect(c).toEqual({ predators: 0, humanStarts: 0, rivalEvents: 0, birds: 0, rivalColonies: 0 });
  }, 900_000);
});
