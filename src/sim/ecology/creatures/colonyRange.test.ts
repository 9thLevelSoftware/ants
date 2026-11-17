// threats-live cause 1 (placement): on a generated world the worldgen territories of every hunting ant predator lie
// far outside the colony's foraging ring (measured: 1,600-3,000 BU on the round-3 hand-overs, ants within ~200 BU),
// so no predator ever sensed an ant. The director now sites one territory per hunting kind with habitat in the ring
// and fills capped places nearest the colony first. Real generated world (woodland-edge #1), a minimal nest at the
// queen's start standing in for the founded one (founding takes ~3 gd of ticks).

import { beforeAll, describe, expect, it } from 'vitest';
import type { CreatureKind, Entrance, Sim } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { createNest } from '@/sim/entities';
import { restore, snapshot } from '@/sim/save';
import { generateWorld } from '@/worldgen';
import type { WorldData } from '@/sim/types';
import { COLONY_RANGE_BU } from '@/sim/balance/creatures';
import { runDirector } from './director';
import { COLONY_RANGE_KINDS, colonyAnchor, colonyRangeSite, ensureColonyRangeTerritories } from './colonyRange';
import { capOf } from './caps';
import { colonyRing } from './colonySites';

let world: WorldData;
let base: Uint8Array;

/** A post-hand-over colony: a nest with one entrance at the queen's start, the opening done. */
function founded(sim: Sim): void {
  const col = sim.state.colonies.find((c) => c.isPlayer)!;
  const p = sim.world.queenStart.pos;
  const nest = createNest(sim, { colony: col.id, origin: p });
  nest.entrances.push({ id: sim.state.nextId++, pos: { ...p } } as Entrance);
  if (sim.state.player.opening) sim.state.player.opening.done = true;
}

function freshSim(): Sim {
  return createSim(restore(base).state, world);
}

const ringBu = (sim: Sim, p: { x: number; z: number }): number => {
  const a = colonyAnchor(sim)!;
  return Math.hypot(p.x - a.x, p.z - a.z) / sim.world.bu;
};
const inRing = (sim: Sim, p: { x: number; z: number }, kind: CreatureKind | null = null) => {
  const d = ringBu(sim, p), [r0, r1] = colonyRing(kind);
  return d >= r0 && d <= r1;
};

beforeAll(() => {
  const d = defaultGameConfig('lasius-niger', 1);
  const cfg = { ...d, cheats: true, world: { ...d.world, archetype: 'woodland-edge' as const } };
  world = generateWorld(cfg.world);
  const sim = createSim(createNewGame(cfg, world).state, world);
  founded(sim);
  base = snapshot(sim);
}, 120_000);

describe('colony-range residents (generated woodland-edge #1)', () => {
  it('cause: worldgen leaves the colony ring without any hunting-predator territory', () => {
    const sim = freshSim();
    const near = sim.state.ecology.director.territories.filter((t) => COLONY_RANGE_KINDS.includes(t.kind) && inRing(sim, t.center, t.kind));
    expect(near.length).toBe(0); // the reproduction: the fix must not rely on worldgen
  });

  it('the director sites one territory per hunting kind with habitat in the ring, and its resident appears there', () => {
    const sim = freshSim();
    const expected = COLONY_RANGE_KINDS.filter((k) => colonyRangeSite(sim, colonyAnchor(sim)!, k) !== null);
    expect(expected).toContain('wolf-spider');
    for (let i = 0; i < 4; i++) { runDirector(sim); sim.state.tick += 50; }
    const terr = sim.state.ecology.director.territories;
    for (const k of expected) expect(terr.some((t) => t.kind === k && inRing(sim, t.center, k)), k).toBe(true);
    const wolf = sim.state.creatures.filter((c) => c.alive && c.kind === 'wolf-spider');
    expect(wolf.length).toBeLessThanOrEqual(capOf(sim, 'wolf-spider'));
    expect(wolf.some((c) => ringBu(sim, c.pos) <= COLONY_RANGE_BU[1] + 10), 'a wolf spider lives in the colony range').toBe(true);
  });

  it('is idempotent and deterministic (a reload adds nothing; same seed, same sites)', () => {
    const a = freshSim(), b = freshSim();
    expect(ensureColonyRangeTerritories(a)).toBeGreaterThan(0);
    expect(ensureColonyRangeTerritories(a)).toBe(0);
    ensureColonyRangeTerritories(b);
    expect(JSON.stringify(b.state.ecology.director.territories)).toBe(JSON.stringify(a.state.ecology.director.territories));
    const reloaded = createSim(restore(snapshot(a)).state, world);
    expect(ensureColonyRangeTerritories(reloaded)).toBe(0);
  });

  it('nothing is sited before the hand-over or with predators off', () => {
    const sim = freshSim();
    sim.state.player.opening!.done = false;
    sim.state.player.opening!.phase = 'dig';
    expect(ensureColonyRangeTerritories(sim)).toBe(0);
    const off = freshSim();
    off.state.config.difficulty.custom = { ...off.state.config.difficulty.custom, predators: 'off' };
    off.state.config.rules = { ...off.state.config.rules, predators: 'off' };
    const before = off.state.ecology.director.territories.length;
    runDirector(off);
    expect(off.state.ecology.director.territories.length).toBe(before);
    expect(off.state.creatures.filter((c) => c.alive && (c.kind === 'wolf-spider' || c.kind === 'jumping-spider')).length).toBe(0);
  });
});
