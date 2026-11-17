// Reviewer checks for the R25 colony-size ramp (threats-calibrate): properties the implementer's tests do not pin.
// - drawn kinds only grow with the colony, at every worker count, per preset;
// - worldgen's own residents never leave for the ramp (only colony-range residents do);
// - an engaged colony-range resident is kept past SETTING_DESPAWN_GD and leaves once free;
// - a dip that ends resets the timer, so a second dip gets the full SETTING_DESPAWN_GD again;
// - playerWorkers counts only live worker-caste ants of the player colony.
// Same set-up as predationRamp.test.ts: generated woodland-edge #1 with a minimal nest at the queen's start.

import { beforeAll, describe, expect, it } from 'vitest';
import type { CreatureKind, DifficultyId, Entrance, Sim, WorldData } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { createNest, killAnt } from '@/sim/entities';
import { restore, snapshot } from '@/sim/save';
import { generateWorld } from '@/worldgen';
import { DIFFICULTY_PARAMS, PREDATION_RAMP_WORKERS, resolveRules } from '@/sim/balance/difficulty';
import { SETTING_DESPAWN_GD } from '@/sim/balance/creatures';
import { TICKS_PER_DAY } from '@/sim/time';
import { isWorkerCaste } from '@/sim/colony/census';
import { runDirector } from './director';
import { COLONY_RANGE_KINDS, colonyAnchor, colonyRangeDrawn, isColonyRangeTerritory, playerWorkers } from './colonyRange';
import { placeWorker } from './testkit';

const PRESETS: readonly DifficultyId[] = ['gentle', 'naturalist', 'harsh'];
const RUN_TICKS = 50;
const GD_RUNS = Math.round((SETTING_DESPAWN_GD * TICKS_PER_DAY) / RUN_TICKS);
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

function setPreset(sim: Sim, id: DifficultyId, predators?: 'normal'): void {
  const d = sim.state.config.difficulty;
  d.preset = id;
  d.params = { ...DIFFICULTY_PARAMS[id] };
  d.custom = predators ? { predators } : {};
  sim.state.config.rules = { ...resolveRules(id, d.custom, sim.state.config.rules.seasonLengthDays), startSeason: sim.state.config.rules.startSeason };
}

function setWorkers(sim: Sim, n: number): void {
  const col = sim.state.player.colonyId;
  const e = colonyAnchor(sim)!;
  const live = sim.stores.ants.list.filter((a) => a.alive && a.colony === col && a.caste === 'worker');
  for (let i = n; i < live.length; i++) killAnt(sim, live[i].id, 'old-age');
  for (let i = live.length; i < n; i++) placeWorker(sim, e.x + (i % 5) - 2, e.z + Math.floor(i / 5) % 5 - 2, col);
}

function directorRuns(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) { runDirector(sim); sim.state.tick += RUN_TICKS; }
}

/** Live occupants of territories: colony-range ones and worldgen ones, by creature id. */
function occupants(sim: Sim): { range: Set<number>; worldgen: Set<number> } {
  const range = new Set<number>(), worldgen = new Set<number>();
  sim.state.ecology.director.territories.forEach((t, i) => {
    if (t.occupantId < 0 || !sim.stores.creatures.get(t.occupantId)?.alive) return;
    (isColonyRangeTerritory(sim, i) ? range : worldgen).add(t.occupantId);
  });
  return { range, worldgen };
}

describe('R25 ramp, reviewer checks', () => {
  it.each(PRESETS)('%s: the drawn kinds only grow with the worker count (every count 0..upper+5)', (id) => {
    const sim = fresh();
    setPreset(sim, id, 'normal');
    const [lo, hi] = PREDATION_RAMP_WORKERS[id];
    let prev: CreatureKind[] = [];
    for (let w = 0; w <= hi + 5; w++) {
      const now = COLONY_RANGE_KINDS.filter((k) => colonyRangeDrawn(sim, k, w));
      for (const k of prev) expect(now, `${k} drawn at ${w - 1} but not at ${w}`).toContain(k);
      if (w <= lo) expect(now, `nothing at ${w} <= ${lo}`).toEqual([]);
      prev = now;
    }
    expect(prev.length).toBeGreaterThan(0);
  });

  it('a shrinking colony loses only colony-range residents to the ramp; worldgen residents are never despawned for it', () => {
    const sim = fresh();
    setWorkers(sim, 40);
    directorRuns(sim, 8);
    const before = occupants(sim);
    expect(before.range.size).toBeGreaterThan(0);
    const ramped: number[] = [];
    sim.events.onAny((type, payload) => {
      const ev = payload as { id: number; cause: string };
      if (type === 'creature-despawned' && ev.cause === 'ramp') ramped.push(ev.id);
    });
    setWorkers(sim, 5);
    directorRuns(sim, GD_RUNS + 20);
    sim.events.flush();
    expect(ramped.length).toBe(before.range.size);
    for (const id of ramped) expect(before.range.has(id), `ramp despawned ${id}, not a colony-range resident`).toBe(true);
    for (const id of before.worldgen) expect(ramped).not.toContain(id);
  });

  it('an engaged colony-range resident stays past SETTING_DESPAWN_GD and leaves at the first run once free', () => {
    const sim = fresh();
    setWorkers(sim, 40);
    directorRuns(sim, 8);
    const id = [...occupants(sim).range][0];
    const c = sim.stores.creatures.get(id)!;
    setWorkers(sim, 5);
    const victim = sim.stores.ants.list.find((a) => a.alive && a.colony === sim.state.player.colonyId && a.caste === 'worker')!;
    c.seizedAntId = victim.id; // engaged (isEngaged: seized an ant)
    directorRuns(sim, GD_RUNS + 10);
    expect(sim.stores.creatures.get(id)?.alive).toBe(true);
    c.seizedAntId = -1;
    directorRuns(sim, 1);
    expect(sim.stores.creatures.get(id)?.alive ?? false).toBe(false);
  });

  it('a dip that ends resets the timer: a second dip right after gets the full SETTING_DESPAWN_GD', () => {
    const sim = fresh();
    setWorkers(sim, 40);
    directorRuns(sim, 8);
    const before = [...occupants(sim).range].sort();
    expect(before.length).toBeGreaterThan(0);
    setWorkers(sim, 5);
    directorRuns(sim, GD_RUNS - 10); // first dip, almost the whole delay
    setWorkers(sim, 40);
    directorRuns(sim, 1); // grown again for one director run
    for (const id of before) expect(sim.stores.creatures.get(id)?.bb.rampOut).toBeUndefined();
    setWorkers(sim, 5);
    directorRuns(sim, GD_RUNS - 10); // second dip, again just under the delay
    expect([...occupants(sim).range].sort()).toEqual(before);
    directorRuns(sim, 20);
    expect(occupants(sim).range.size).toBe(0);
  });

  it('playerWorkers counts live worker-caste ants of the player colony only', () => {
    const sim = fresh();
    setWorkers(sim, 12);
    const col = sim.state.player.colonyId;
    const expected = sim.stores.ants.list.filter((a) => a.alive && a.colony === col && isWorkerCaste(a.caste)).length;
    expect(playerWorkers(sim)).toBe(expected);
    expect(expected).toBe(12);
    const other = sim.state.colonies.find((c) => c.id !== col);
    if (other) {
      const e = colonyAnchor(sim)!;
      placeWorker(sim, e.x + 5, e.z + 5, other.id);
      expect(playerWorkers(sim)).toBe(12);
    }
    killAnt(sim, sim.stores.ants.list.find((a) => a.alive && a.colony === col && a.caste === 'worker')!.id, 'old-age');
    expect(playerWorkers(sim)).toBe(11);
  });
});
