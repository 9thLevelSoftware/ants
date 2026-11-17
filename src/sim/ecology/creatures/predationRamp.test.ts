// Ruling R25 (threats-calibrate): the director's colony-range siting of hunting predators is multiplied by a
// colony-size ramp per preset (Naturalist 0 up to 10 workers -> 1 at 40; Gentle 20 -> 60; Harsh 0 -> 20). Residents of
// worldgen's own territories are not ramped. A colony that shrinks below the draw loses its colony-range residents
// SETTING_DESPAWN_GD later, not at once; save -> load gives the same result. Real generated world (woodland-edge #1)
// with a minimal nest at the queen's start standing in for the founded one.

import { beforeAll, describe, expect, it } from 'vitest';
import type { CreatureKind, DifficultyId, Entrance, Sim, WorldData } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { createNest, killAnt } from '@/sim/entities';
import { restore, snapshot, stateHash } from '@/sim/save';
import { generateWorld } from '@/worldgen';
import { DIFFICULTY_PARAMS, PREDATION_RAMP_WORKERS, predationRamp, predationRampWorkers, resolveRules } from '@/sim/balance/difficulty';
import { COLONY_RANGE_P, COLONY_RANGE_RADIUS_MM, RESIDENT_KINDS, SETTING_DESPAWN_GD } from '@/sim/balance/creatures';
import { TICKS_PER_DAY } from '@/sim/time';
import { presetCard } from '@/sim/config/presetDisplay';
import { runDirector } from './director';
import {
  COLONY_RANGE_KINDS, colonyAnchor, colonyRangeDrawn, colonyRangeSite, ensureColonyRangeTerritories, isColonyRangeTerritory, playerWorkers,
} from './colonyRange';
import { conditions } from './conditions';
import { placeWorker } from './testkit';

const PRESETS: readonly DifficultyId[] = ['gentle', 'naturalist', 'harsh'];
let world: WorldData;
let base: Uint8Array;

beforeAll(() => {
  const d = defaultGameConfig('lasius-niger', 1);
  const cfg = { ...d, cheats: true, world: { ...d.world, archetype: 'woodland-edge' as const } };
  world = generateWorld(cfg.world);
  const sim = createSim(createNewGame(cfg, world).state, world);
  const col = sim.state.colonies.find((c) => c.isPlayer)!;
  const p = sim.world.queenStart.pos;
  const nest = createNest(sim, { colony: col.id, origin: p });
  nest.entrances.push({ id: sim.state.nextId++, pos: { ...p } } as Entrance);
  if (sim.state.player.opening) sim.state.player.opening.done = true;
  base = snapshot(sim);
}, 120_000);

const fresh = (): Sim => createSim(restore(base).state, world);

function setPreset(sim: Sim, id: DifficultyId): void {
  const d = sim.state.config.difficulty;
  d.preset = id;
  d.params = { ...DIFFICULTY_PARAMS[id] };
  d.custom = {};
  sim.state.config.rules = { ...resolveRules(id, {}, sim.state.config.rules.seasonLengthDays), startSeason: sim.state.config.rules.startSeason };
}

/** Sets the player colony to exactly `n` workers (new ones stand at the entrance, inside the spawn-distance rules' focus). */
function setWorkers(sim: Sim, n: number): void {
  const col = sim.state.player.colonyId;
  const e = colonyAnchor(sim)!;
  const live = sim.stores.ants.list.filter((a) => a.alive && a.colony === col && a.caste === 'worker');
  for (let i = n; i < live.length; i++) killAnt(sim, live[i].id, 'old-age');
  for (let i = live.length; i < n; i++) placeWorker(sim, e.x + (i % 5) - 2, e.z + Math.floor(i / 5) % 5 - 2, col);
}

function directorRuns(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) { runDirector(sim); sim.state.tick += 50; }
}

const flaggedKinds = (sim: Sim): CreatureKind[] =>
  sim.state.ecology.director.territories.filter((t) => t.colonyRange === 1).map((t) => t.kind).sort();

/**
 * Occupants of colony-range territories alive now, by kind; `residentsOnly` leaves out the visitors (centipede, rove
 * beetle), which come out at night and burrow at dawn whatever the ramp says.
 */
function rangeResidents(sim: Sim, residentsOnly = false): Map<CreatureKind, number> {
  const out = new Map<CreatureKind, number>();
  sim.state.ecology.director.territories.forEach((t, i) => {
    if (!isColonyRangeTerritory(sim, i) || t.occupantId < 0) return;
    if (residentsOnly && !RESIDENT_KINDS.includes(t.kind)) return;
    if (sim.stores.creatures.get(t.occupantId)?.alive) out.set(t.kind, t.occupantId);
  });
  return out;
}

describe('the colony-size ramp (accessor, balance/difficulty.ts)', () => {
  it.each(PRESETS)('%s: 0 at or below the lower bound, 1 at the upper, linear between', (id) => {
    const src = { state: { config: { difficulty: { preset: id } } } } as unknown as Sim;
    const [lo, hi] = PREDATION_RAMP_WORKERS[id];
    expect(predationRampWorkers(src)).toEqual([lo, hi]);
    expect(predationRamp(src, lo)).toBe(0);
    expect(predationRamp(src, Math.max(0, lo - 5))).toBe(0);
    expect(predationRamp(src, hi)).toBe(1);
    expect(predationRamp(src, hi + 100)).toBe(1);
    expect(predationRamp(src, (lo + hi) / 2)).toBeCloseTo(0.5, 9);
    expect(predationRamp(src, lo + (hi - lo) / 4)).toBeCloseTo(0.25, 9);
  });

  it('carries the ruling\'s numbers, and the New Game cards show them', () => {
    expect(PREDATION_RAMP_WORKERS).toEqual({ gentle: [20, 60], naturalist: [10, 40], harsh: [0, 20] });
    const row = (id: DifficultyId) => presetCard(id).rows.find((r) => r.label === 'Hunters settling by a growing colony')?.value;
    expect([row('gentle'), row('naturalist'), row('harsh')]).toEqual([
      'from 20 workers, all by 60', 'from 10 workers, all by 40', 'from the first workers, all by 20',
    ]);
  });
});

describe('colony-range siting x ramp (generated woodland-edge #1)', () => {
  it.each(PRESETS)('%s: nothing drawn at the lower bound; at the upper bound exactly the un-ramped draw; between, a subset', (id) => {
    const sim = fresh();
    setPreset(sim, id);
    const [lo, hi] = PREDATION_RAMP_WORKERS[id];
    const mult = conditions(sim).predatorMult;
    for (const k of COLONY_RANGE_KINDS) expect(colonyRangeDrawn(sim, k, lo), `${k} at ${lo}`).toBe(false);
    const atHi = COLONY_RANGE_KINDS.filter((k) => colonyRangeDrawn(sim, k, hi));
    const mid = COLONY_RANGE_KINDS.filter((k) => colonyRangeDrawn(sim, k, (lo + hi) / 2));
    for (const k of mid) expect(atHi).toContain(k);
    // the ramp is the only change at the upper bound: Normal and Many (x >= 1) draw every kind
    if (mult >= 1) expect(atHi).toEqual(COLONY_RANGE_KINDS.filter((k) => (COLONY_RANGE_P[k] ?? 0) > 0));
  });

  it('Naturalist: a founding-year colony (10 workers) gets no colony-range territory; at 40 every kind with habitat', () => {
    const small = fresh();
    setWorkers(small, 10);
    expect(playerWorkers(small)).toBe(10);
    directorRuns(small, 6);
    expect(flaggedKinds(small)).toEqual([]);
    const big = fresh();
    setWorkers(big, 40);
    directorRuns(big, 6);
    const anchor = colonyAnchor(big)!;
    const withHabitat = COLONY_RANGE_KINDS.filter((k) => colonyRangeSite(big, anchor, k) !== null).sort();
    expect(withHabitat.length).toBeGreaterThan(0);
    expect(flaggedKinds(big)).toEqual(withHabitat);
  });

  it('a colony that grows past the draw gets the kind at the next hourly run', () => {
    const sim = fresh();
    setWorkers(sim, 10);
    directorRuns(sim, 6);
    expect(ensureColonyRangeTerritories(sim)).toBe(0);
    setWorkers(sim, 40);
    expect(ensureColonyRangeTerritories(sim)).toBeGreaterThan(0);
  });

  it.each(PRESETS)('%s: a colony that shrinks below the lower bound loses its colony-range residents after SETTING_DESPAWN_GD, not at once', (id) => {
    const sim = fresh();
    setPreset(sim, id);
    // Gentle's Few setting (x0.4) draws no kind on this world; a custom Normal setting changes the siting chance only,
    // the ramp stays Gentle's (20 -> 60), which is what this case is about.
    if (id === 'gentle') { sim.state.config.difficulty.custom = { predators: 'normal' }; sim.state.config.rules.predators = 'normal'; }
    const [lo, hi] = PREDATION_RAMP_WORKERS[id];
    setWorkers(sim, hi);
    directorRuns(sim, 8);
    const before = rangeResidents(sim);
    const residentsBefore = rangeResidents(sim, true).size;
    expect(residentsBefore).toBeGreaterThan(0);
    setWorkers(sim, Math.max(0, lo - 5)); // Harsh: 0 workers (queen only) is its lower bound
    expect(predationRamp(sim, playerWorkers(sim))).toBe(0);
    const gdRuns = Math.round((SETTING_DESPAWN_GD * TICKS_PER_DAY) / 50);
    directorRuns(sim, gdRuns - 4); // just under the delay: all still there
    expect([...rangeResidents(sim).entries()]).toEqual([...before.entries()]);
    directorRuns(sim, 8); // past it: all gone, and the suspended territories stay empty
    expect(rangeResidents(sim).size).toBe(0);
    for (const id of before.values()) expect(sim.stores.creatures.get(id)?.alive ?? false).toBe(false);
    directorRuns(sim, 20);
    expect(rangeResidents(sim).size).toBe(0);
    // grown again: the residents come back
    setWorkers(sim, hi);
    directorRuns(sim, 8);
    expect(rangeResidents(sim, true).size).toBe(residentsBefore);
  });

  it('a dip shorter than SETTING_DESPAWN_GD keeps the residents', () => {
    const sim = fresh();
    setWorkers(sim, 40);
    directorRuns(sim, 8);
    const before = rangeResidents(sim, true);
    expect(before.size).toBeGreaterThan(0);
    setWorkers(sim, 5);
    directorRuns(sim, 40);
    setWorkers(sim, 40);
    directorRuns(sim, 120);
    expect([...rangeResidents(sim, true).entries()]).toEqual([...before.entries()]);
  });

  it.each(PRESETS)('%s: save -> load while a shrunk colony\'s residents are due to leave equals the uninterrupted run', (id) => {
    const a = fresh();
    setPreset(a, id);
    if (id === 'gentle') { a.state.config.difficulty.custom = { predators: 'normal' }; a.state.config.rules.predators = 'normal'; } // as above
    const [lo, hi] = PREDATION_RAMP_WORKERS[id];
    setWorkers(a, hi);
    directorRuns(a, 8);
    setWorkers(a, Math.max(0, lo - 5));
    const gdRuns = Math.round((SETTING_DESPAWN_GD * TICKS_PER_DAY) / 50);
    directorRuns(a, gdRuns / 2);
    const pending = rangeResidents(a, true);
    expect(pending.size).toBeGreaterThan(0); // departures are pending in the snapshot
    for (const cid of pending.values()) expect(a.stores.creatures.get(cid)!.bb.rampOut).toBeGreaterThanOrEqual(0);
    const b = createSim(restore(snapshot(a)).state, world);
    directorRuns(a, gdRuns / 2 + 20);
    directorRuns(b, gdRuns / 2 + 20);
    expect(rangeResidents(a).size).toBe(0);
    expect(stateHash(b.state)).toBe(stateHash(a.state));
  });

  it('worldgen territories are never ramped; unflagged ones from older saves are recognised by radius and ring', () => {
    const sim = fresh();
    const terr = sim.state.ecology.director.territories;
    const seeds = sim.world.placements.territories.length;
    for (let i = 0; i < seeds; i++) expect(isColonyRangeTerritory(sim, i)).toBe(false);
    setWorkers(sim, 40);
    ensureColonyRangeTerritories(sim);
    const i = terr.findIndex((t) => t.colonyRange === 1);
    expect(isColonyRangeTerritory(sim, i)).toBe(true);
    delete terr[i].colonyRange; // as saved before the flag existed
    expect(isColonyRangeTerritory(sim, i)).toBe(true);
    terr[i].radius = (COLONY_RANGE_RADIUS_MM[terr[i].kind] ?? 0) + 1; // a territory some other rule added
    expect(isColonyRangeTerritory(sim, i)).toBe(false);
  });
});
