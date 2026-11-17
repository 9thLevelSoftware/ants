// threats-live review (adversarial): tests that try to break the colony-range siting, the resident rebalance and
// the possessed-danger card. A failing test here demonstrates a real defect and stays in place for the fixer.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Entrance, Sim, WorldData } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { createNest } from '@/sim/entities';
import { restore, snapshot } from '@/sim/save';
import { generateWorld } from '@/worldgen';
import { raiseAlert } from '@/sim/progression';
import { combatAlerts } from '@/sim/combat/alerts';
import { makeTestSim } from '@/sim/testing';
import { locomotionSystem } from '@/sim/locomotion';
import { COLONY_RANGE_BU } from '@/sim/balance/creatures';
import { COLONY_RANGE_KINDS, colonyAnchor, colonyRangeDrawn, colonyRangeSite, ensureColonyRangeTerritories } from './colonyRange';
import { creatureDirectorSystem, creatureSystem } from './index';
import { possessedDangerAlerts } from './alerts';
import { ensureCombat } from './attack';
import {
  captureEvents, creatureScene, installFakeCombat, placeWorker, possess, sendQueenAway, setClock, spawnAt, step,
} from './testkit';

type Setting = 'few' | 'normal' | 'many' | 'off';
function setPredators(sim: Sim, v: Setting): void {
  sim.state.config.difficulty.custom = { ...sim.state.config.difficulty.custom, predators: v };
  sim.state.config.rules = { ...sim.state.config.rules, predators: v };
}

// ------------------------------------------------------------------ colony-range siting on a generated world

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
const terrJson = (sim: Sim) => JSON.stringify(sim.state.ecology.director.territories);

describe('colony-range siting vs a Predators setting raised mid-game (GDD 06 §14 "adding threats spawns them")', () => {
  it('precondition: on this world some kind is sited at Normal but not drawn at Few', () => {
    const sim = fresh();
    setPredators(sim, 'few');
    const anchor = colonyAnchor(sim)!;
    const onlyNormal = COLONY_RANGE_KINDS.filter((k) => !colonyRangeDrawn(sim, k) && colonyRangeSite(sim, anchor, k) !== null);
    expect(onlyNormal.length).toBeGreaterThan(0);
  });

  it('raising Few -> Normal sites the same territories in the running game as after a save -> load', () => {
    const a = fresh();
    setPredators(a, 'few');
    ensureColonyRangeTerritories(a);
    setPredators(a, 'normal');
    ensureColonyRangeTerritories(a); // the running game (the runtime memo already "settled" every kind at Few)
    const reloaded = createSim(restore(snapshot(a)).state, world);
    ensureColonyRangeTerritories(reloaded);
    // a reload must not change what the director does: the uninterrupted game and the reloaded one diverge here
    expect(terrJson(reloaded)).toBe(terrJson(a));
  });

  it('sites stay inside the ring and on the world', () => {
    const sim = fresh();
    setPredators(sim, 'many');
    ensureColonyRangeTerritories(sim);
    const anchor = colonyAnchor(sim)!;
    for (const t of sim.state.ecology.director.territories) {
      if (!COLONY_RANGE_KINDS.includes(t.kind)) continue;
      const d = Math.hypot(t.center.x - anchor.x, t.center.z - anchor.z) / sim.world.bu;
      if (d > COLONY_RANGE_BU[1] + 1) continue; // a worldgen territory of the kind
      expect(d).toBeGreaterThanOrEqual(COLONY_RANGE_BU[0] - 1e-6);
      expect(Number.isFinite(t.center.y)).toBe(true);
      expect(t.center.x).toBeGreaterThanOrEqual(0);
      expect(t.center.z).toBeLessThanOrEqual(sim.world.size);
    }
  });
});

// ------------------------------------------------------------------ resident rebalance churn

describe('rebalance of capped residents when the near territory cannot be filled', () => {
  let undo: () => void;
  beforeEach(() => { undo = installFakeCombat().restore; });
  afterEach(() => undo());

  it('a far resident is not despawned and respawned over and over while an ant stands on the near site', () => {
    const sim = makeTestSim({ seed: 3, sizeBu: 420, nest: 'small', workers: 2, systems: [creatureDirectorSystem, creatureSystem, locomotionSystem] });
    if (sim.state.player.opening) { sim.state.player.opening.done = true; sim.state.player.opening.phase = 'done'; }
    setClock(sim, 'summer', 3, 14);
    const e = sim.state.nests[0].entrances[0].pos;
    const bu = sim.world.bu;
    // the director's own colony-range sites first, then ants standing on every territory near the colony
    ensureColonyRangeTerritories(sim);
    const terr = sim.state.ecology.director.territories;
    const nearWolf = terr.filter((t) => t.kind === 'wolf-spider' && Math.hypot(t.center.x - e.x, t.center.z - e.z) <= COLONY_RANGE_BU[1] * bu);
    if (nearWolf.length === 0) terr.push({ kind: 'wolf-spider', center: { x: e.x + 80 * bu, y: sim.field.height(e.x + 80 * bu, e.z), z: e.z }, radius: 400, occupantId: -1, vacantUntilTick: -1 });
    for (const t of terr) {
      if (Math.hypot(t.center.x - e.x, t.center.z - e.z) <= COLONY_RANGE_BU[1] * bu) placeWorker(sim, t.center.x + 2, t.center.z);
    }
    // three far wolf territories (the cap at Normal is 3), on the world, > 60 BU from the entrance
    const far: [number, number][] = [[-170, -170], [170, -170], [-170, 170]];
    for (const [dx, dz] of far) {
      const x = Math.min(Math.max(e.x + dx * bu, 40), sim.world.size - 40), z = Math.min(Math.max(e.z + dz * bu, 40), sim.world.size - 40);
      terr.push({ kind: 'wolf-spider', center: { x, y: sim.field.height(x, z), z }, radius: 400, occupantId: -1, vacantUntilTick: -1 });
    }
    const gone = captureEvents(sim, ['creature-despawned']);
    step(sim, 1000); // 20 director runs
    const rebalanced = gone.filter((g) => (g.ev as { cause: string }).cause === 'rebalanced');
    expect(rebalanced.length).toBeLessThanOrEqual(1);
  }, 60_000);
});

// ------------------------------------------------------------------ possessed-danger shared card

describe('possessed-danger card shared with combat ("pinned")', () => {
  let undo: () => void;
  beforeEach(() => { undo = installFakeCombat({ realAlerts: true }).restore; });
  afterEach(() => undo());

  it('a pinned ant keeps a possessed-danger card after a predator lets go of her', () => {
    const sim = creatureScene({ seed: 4 });
    setClock(sim, 'summer', 3, 13);
    sendQueenAway(sim);
    const ant = placeWorker(sim, 150, 150);
    possess(sim, ant);
    const rove = spawnAt(sim, 'rove-beetle', 300, 300, { state: 'forage' });
    const cs = ensureCombat(ant);
    cs.pinned = true;
    combatAlerts(sim); // combat raises "pinned"
    const card = () => sim.state.progression.alerts.find((a) => a.kind === 'possessed-danger' && a.subjectId === ant.id);
    expect(card()?.cause).toBe('pinned');
    cs.seizedBy = rove.id; // a predator seizes the pinned ant
    possessedDangerAlerts(sim);
    combatAlerts(sim);
    cs.seizedBy = -1; // the predator lets go; the ant is still pinned by the rival ants
    possessedDangerAlerts(sim);
    combatAlerts(sim);
    expect(card(), 'still pinned: the critical card must stay').toBeDefined();
  });

  it('a card raised by another module is not re-raised (count) every tick while seized', () => {
    const sim = creatureScene({ seed: 4 });
    setClock(sim, 'summer', 3, 13);
    sendQueenAway(sim);
    const ant = placeWorker(sim, 150, 150);
    possess(sim, ant);
    const rove = spawnAt(sim, 'rove-beetle', 300, 300, { state: 'forage' });
    ensureCombat(ant).seizedBy = rove.id;
    raiseAlert(sim, {
      kind: 'possessed-danger', level: 'critical', subjectId: ant.id, title: 'Under water', cause: 'under-water',
      focus: null, diagnosticId: null,
    });
    for (let i = 0; i < 10; i++) possessedDangerAlerts(sim);
    const c = sim.state.progression.alerts.find((a) => a.kind === 'possessed-danger' && a.subjectId === ant.id)!;
    expect(c.count).toBeLessThanOrEqual(2);
  });
});
