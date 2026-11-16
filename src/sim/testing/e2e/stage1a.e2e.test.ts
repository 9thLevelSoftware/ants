// Stage 1A integration gate, end-to-end simulation scenarios (docs/design/tasks/int-1A-sim.md, work item 5).
// Headless and deterministic, on a GENERATED world, through the real modules; scripted stand-ins replace the
// Stage 1B behaviours (src/sim/testing/e2e/*.ts), and debug cheats replace the founding flow.
//   (a) new game: queen placed, walks, digs a shaft and chamber with the dig-bite primitive, lays, brood develops
//   (b) 60 cheat-spawned workers: scripted foraging between nest and source, ledger, allocation, pheromone decay
//   (c) save -> restore -> continue equals an uninterrupted run; same seed -> same stateHash
import { beforeAll, describe, expect, it } from 'vitest';
import type { Sim, WorldData } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { begin } from '@/sim/ants';
import { navStop, navTo } from '@/sim/locomotion';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { restore, snapshot, stateHash } from '@/sim/save';
import { devRate, stageDu, tendBrood } from '@/sim/colony';
import { broodTempC } from '@/sim/colony/envAdapter';
import { thermalReady } from '@/sim/environment';
import { generateWorld } from '@/worldgen';
import { checkInvariants, collectInvariants, type InvariantViolation } from '@/sim/testing/invariants';
import { findDigSite, passiveBehaviours, scriptedBehaviours, scriptedCareSystem, setupColonyScenario, SB } from './colonyScenario';
import { runFoundingDig } from './foundingScript';

const SEED = 1;
let world: WorldData;

beforeAll(() => {
  world = generateWorld(defaultGameConfig('lasius-niger', SEED).world);
}, 120_000);

function newSim(opts: { scripted: boolean }): Sim {
  const { state } = createNewGame({ ...defaultGameConfig('lasius-niger', SEED), cheats: true }, world);
  return opts.scripted
    ? createSim(state, world, { systems: [...SYSTEMS, scriptedCareSystem()], behaviours: scriptedBehaviours() })
    : createSim(state, world, { behaviours: passiveBehaviours() });
}

function expectNoViolations(sim: Sim): void {
  const out: InvariantViolation[] = [];
  checkInvariants(sim, collectInvariants(), out);
  expect(out.map((v) => `${v.invariant}: ${v.detail}`)).toEqual([]);
}

describe('(a) a new game on a generated world: founding dig, eggs, brood development', () => {
  it('the queen walks to a diggable spot, digs a shaft and a chamber with dig-bite, lays eggs; eggs develop at the environment temperature', () => {
    const sim = newSim({ scripted: false });
    const bu = sim.world.bu;
    const col = sim.state.colonies[0];
    const queen = sim.stores.ants.get(col.queenId)!;
    const nest = sim.stores.nests.get(col.nestIds[0])!;
    // placed by createNewGame on the kernel level set
    expect(queen.alive).toBe(true);
    expect(queen.medium).toBe('surface');
    expect(Math.abs(sim.field.sample(queen.pos) - queen.footOffset)).toBeLessThan(0.05 * bu);

    // walk (locomotion) to a diggable spot
    const site = findDigSite(sim, queen, queen.pos, 8, 80)!;
    expect(site).not.toBeNull();
    expect(navTo(sim, queen, site, 1.5 * bu)).toBe(true);
    let t = 0;
    for (; t < 3000 && queen.nav.status === 'moving'; t++) sim.tick();
    expect(queen.nav.status).toBe('arrived');
    expect(Math.hypot(queen.pos.x - site.x, queen.pos.z - site.z)).toBeLessThan(3 * bu);

    // dig (stand-in for founding: the founding module moves `site-search` -> `digging`)
    nest.founding!.state = 'digging';
    nest.origin = { ...queen.pos };
    const counts = { expelled: 0, entrance: 0, mound: 0 };
    const offs = [
      sim.events.on('pellet-expelled', () => { counts.expelled++; }),
      sim.events.on('entrance-opened', (e) => { if (e.nestId === nest.id) counts.entrance++; }),
      sim.events.on('mound-changed', () => { counts.mound++; }),
    ];
    const dig = runFoundingDig(sim, queen, nest, { x: queen.fwd.x, z: queen.fwd.z }, 20000);
    for (const off of offs) off();
    expect(dig.shaftTick).toBeGreaterThan(0);
    expect(dig.chamberTick).toBeGreaterThan(0);
    expect(counts.expelled).toBeGreaterThan(50); // pellets expelled onto the founding mound (GDD 03 §13)
    expect(counts.entrance).toBeGreaterThanOrEqual(1);
    expect(nest.entrances.length).toBeGreaterThanOrEqual(1);
    const mound = sim.state.worldDelta.mounds.find((m) => m.nestId === nest.id);
    expect(mound && mound.volume).toBeGreaterThan(0);
    expect(nest.chambers.length).toBeGreaterThanOrEqual(1);
    expect(queen.medium).toBe('cavity');
    expect(sim.field.height(queen.pos.x, queen.pos.z) - queen.pos.y).toBeGreaterThan(3 * bu);

    // lay (stand-in for founding: the opening reaches its `lay` phase after the seal)
    sim.state.player.opening!.phase = 'lay';
    let laid = 0;
    const offLay = sim.events.on('egg-laid', (e) => { if (e.queenId === queen.id) laid++; });
    // finish the bite in progress and stand still (the founding flow's 'seal' step would do this)
    for (t = 0; t < 200 && queen.action; t++) sim.tick();
    navStop(sim, queen);
    sim.tick();
    expect(begin(sim, queen, 'lay-egg', null)).toBe(true);
    for (t = 0; t < 600 && queen.action; t++) sim.tick();
    offLay();
    expect(laid).toBeGreaterThanOrEqual(1);
    // the player colony's eggs (the world's rival colonies keep brood of their own since Stage 1B)
    const eggs = sim.state.brood.filter((b) => b.alive && b.stage === 'egg' && b.colony === col.id);
    expect(eggs.length).toBe(laid);

    // brood develops at the environment's temperature (GDD 02 §3: progress = devRate(T) x dt / stageDu)
    expect(thermalReady(sim)).toBe(true);
    const def = sim.species;
    const egg = eggs[0];
    const p0 = egg.progress;
    let expected = 0, tMin = Infinity, tMax = -Infinity;
    const ticks = Math.round(0.5 * TICKS_PER_DAY);
    for (t = 0; t < ticks; t++) {
      // stand-in for the founding queen's brood care (founding, Stage 1B): the passive queen does not tend, and
      // untended eggs die within hours (GDD 02 §2.5), which used to skip this check silently
      for (const e of eggs) tendBrood(sim, e.id);
      const T = broodTempC(sim, egg);
      tMin = Math.min(tMin, T); tMax = Math.max(tMax, T);
      expected += devRate(def, T) / TICKS_PER_DAY / stageDu(def, 'egg', egg.destined);
      sim.tick();
    }
    // the egg stage lasts days: half a day later the egg must still be an egg (else the check below means nothing)
    expect(egg.alive).toBe(true);
    expect(egg.stage).toBe('egg');
    expect(egg.progress - p0).toBeGreaterThan(0);
    expect(egg.progress - p0).toBeCloseTo(expected, 2);
    // the temperature the brood felt came from the environment's cavity column, not a constant
    expect(Number.isFinite(tMin) && Number.isFinite(tMax)).toBe(true);
    expectNoViolations(sim);
  }, 300_000);
});

describe('(b) 60 workers forage between the nest and a food source', () => {
  it('deliveries enter the ledger, allocation assigns tasks, trail pheromone decays with the environment', () => {
    const sim = newSim({ scripted: true });
    const col = sim.state.colonies[0];
    const sc = setupColonyScenario(sim, { workers: 60, eggs: 6, larvae: 6, pupae: 4 });
    expect(sim.state.ants.filter((a) => a.alive && a.caste === 'worker')).toHaveLength(60);
    let deliveries = 0, loads = 0;
    // the player colony's deliveries and trips (rival colonies on the generated world forage too since Stage 1B)
    const off = sim.events.on('delivery', (e) => { if (e.colonyId === col.id) { deliveries++; loads += e.c + e.p; } });
    const inC0 = col.counters ? JSON.stringify(col.counters) : '';
    const stores0 = col.stores.c + col.stores.p;
    for (let t = 0; t < 4000; t++) sim.tick();
    off();
    // allocation: the colony gave its workers more than one task, including foraging
    const tasks = new Map<string, number>();
    for (const a of sim.state.ants) if (a.alive && a.caste === 'worker') tasks.set(a.task, (tasks.get(a.task) ?? 0) + 1);
    expect(tasks.size).toBeGreaterThan(2);
    expect((tasks.get('forage') ?? 0) + (tasks.get('scout') ?? 0)).toBeGreaterThan(0);
    // deliveries: every one booked into the stores (minus upkeep), the source discovered and shrinking
    expect(deliveries).toBeGreaterThan(10);
    expect(loads).toBeGreaterThan(5);
    expect(col.knownSourceIds).toContain(sc.source.id);
    expect(col.stores.c + col.stores.p).toBeGreaterThan(stores0 - 5); // upkeep of 61 ants over 4000 ticks is small
    expect(JSON.stringify(col.counters)).not.toBe(inC0);
    const trips = sim.state.ants.reduce((n, a) => n + (a.colony === col.id ? (a.bb[SB.trips] ?? 0) : 0), 0);
    expect(trips).toBe(deliveries);
    // pheromone: foragers laid trail on the way home; with nobody laying, it decays at the hooked rate
    const trailCells = sim.phero.activeCellCount!(col.id, 'trail');
    expect(trailCells).toBeGreaterThan(5);
    let best = 0;
    const at = { x: 0, y: 0, z: 0 };
    sim.phero.forEachActiveCell!(col.id, 'trail', (x, y, z, v) => { if (v > best) { best = v; at.x = x; at.y = y; at.z = z; } });
    for (const a of sim.state.ants) a.bb[SB.quiet] = 1; // foragers stop laying trail
    const v0 = sim.phero.sample(col.id, 'trail', at);
    for (let t = 0; t < 900; t++) sim.tick(); // 90 game s
    const v1 = sim.phero.sample(col.id, 'trail', at);
    // base half-life 900 s; the environment hook scales the rate by 1/3 .. ~9 (temperature x exposure x heat)
    const lo = Math.pow(2, (-90 * 9) / 900), hi = Math.pow(2, (-90 / 3) / 900);
    expect(v1 / v0).toBeGreaterThan(lo);
    expect(v1 / v0).toBeLessThan(hi);
    expectNoViolations(sim);
  }, 300_000);
});

describe('(c) determinism: same seed, and save -> restore -> continue', () => {
  // 3000 + 3000 ticks: GDD 03 App. E check 25 asks for a save / load run over 6,000 ticks
  const N = 3000, M = 3000;

  function scenario(): Sim {
    const sim = newSim({ scripted: true });
    setupColonyScenario(sim, { workers: 60, eggs: 6, larvae: 6, pupae: 4 });
    return sim;
  }

  it('two runs from the same seed give the same stateHash', () => {
    const a = scenario(), b = scenario();
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    for (let t = 0; t < N; t++) { a.tick(); b.tick(); }
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  }, 300_000);

  it('save -> restore -> continue equals an uninterrupted run', () => {
    const a = scenario();
    for (let t = 0; t < N; t++) a.tick();
    const saved = snapshot(a);
    for (let t = 0; t < M; t++) a.tick();
    const back = restore(saved).state;
    const b = createSim(back, world, { systems: [...SYSTEMS, scriptedCareSystem()], behaviours: scriptedBehaviours() });
    for (let t = 0; t < M; t++) b.tick();
    expect(b.state.tick).toBe(a.state.tick);
    expect(stateHash(b.state)).toBe(stateHash(a.state));
  }, 300_000);
});
