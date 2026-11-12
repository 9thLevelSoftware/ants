// sim-fix-colony item 2, acceptance 3: a nest of a 60-worker colony takes the spoil of two game days of digging
// with hauling throttled (most pellets stay in the nest and tamp after 1,200 s). Tamping never cuts a chamber off
// its entrance and never leaves a raised floor lower than the species' workers can walk (the passage rule, GDD 03
// §5.1 / §5.3 N1). With the entrance closed (no plug) the nest reports why (`entrance-closed`), the internal-dump
// query (GDD 03 §7.7) returns a valid dead-end tip, and the colony raises `midden-blocked` (GDD 02 §10.8).
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { rngFork, rngInt } from '@/core/rng';
import type { Nest, Sim } from '@/sim/types';
import { VoxelFlag } from '@/sim/types';
import { PELLET_TAMP_S } from '@/sim/balance/nest';
import { PHYSIO_EVERY } from '@/sim/balance';
import { removeItem } from '@/sim/entities';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { commandsSystem } from '@/sim/systems';
import { economySystem, isMiddenBlocked } from '@/sim/colony';
import { growWorkers } from './architect/architectTestKit';
import { layoutNest } from './architect/layout';
import { OPEN_MIN } from './carve/keys';
import { nestSampleBox } from './chambers/detect';
import { findChamberAtImpl } from './chambers/registry';
import { internalDumpSite } from './deadEnd';
import { nestSim } from './nestTestKit';
import { loosePellets, placePellet, spawnPellet } from './pellets';
import { nestRuntime } from './runtime';
import { nestSystem } from './system';
import { tampHeadroomSamples } from './tamp';

const PELLET = 0.85;

/** A 60-worker colony's nest laid out by the architect at the world centre, with the colony economy running. */
function colonyNest(seed: number): { sim: Sim; nest: Nest } {
  const sim = nestSim({ seed, sizeBu: 220, systems: [commandsSystem, nestSystem, economySystem] });
  const nest = sim.stores.nests.get(sim.state.colonies[0].nestIds[0])!;
  const c = sim.world.size / 2;
  nest.origin = { x: c, y: sim.field.height(c, c), z: c };
  layoutNest(sim, nest.id, 60);
  growWorkers(sim, nest, 60);
  return { sim, nest };
}

/** Floor samples of the nest's tunnels (open, solid below, in the soil, not inside a chamber), in key order. */
function tunnelFloors(sim: Sim, nest: Nest): Vec3[] {
  const b = nestSampleBox(sim, nest), v = sim.carve.voxel, out: Vec3[] = [];
  const keys = [...sim.carve.data.keys].sort((a, c) => a - c);
  for (const key of keys) {
    sim.carve.forEachOpenSample(key, (i, j, k) => {
      if (i < b.i0 || i > b.i1 || j < b.j0 || j > b.j1 || k < b.k0 || k > b.k1) return;
      if (sim.carve.sampleAt(i, j - 1, k) >= OPEN_MIN) return;
      const p = { x: i * v, y: j * v, z: k * v };
      if (sim.field.substrateXYZ(p.x, p.y + v, p.z) > 0 || findChamberAtImpl(sim, p)) return;
      out.push(p);
    });
  }
  return out;
}

/** Neck mouths of the chambers: where diggers' spoil piles sat while the rooms were dug (the anchors of their plans). */
function neckSites(nest: Nest): Vec3[] {
  return nest.digPlans.filter((p) => p.kind === 'chamber').map((p) => ({ ...p.anchor.pos }));
}

/** Every chamber still reaches an open entrance through the nest (D_exit finite, GDD 03 §5.3 N1). */
function cutOff(sim: Sim, nest: Nest): number[] {
  return nest.chambers.filter((c) => sim.nestNav.distance(nest.id, { kind: 'exit', id: -1 }, c.center) < 0).map((c) => c.id);
}

/** Raised (LOOSE) floor samples with less open headroom above them than the passage rule keeps. */
function lowCeilings(sim: Sim, nest: Nest, need: number): number {
  const flags = nestRuntime(sim).flags, b = nestSampleBox(sim, nest);
  let bad = 0;
  for (const key of sim.carve.data.keys) {
    sim.carve.forEachOpenSample(key, (i, j, k) => {
      if (i < b.i0 || i > b.i1 || k < b.k0 || k > b.k1) return;
      if (sim.carve.sampleAt(i, j - 1, k) >= OPEN_MIN || (flags.get(i, j - 1, k) & VoxelFlag.LOOSE) === 0) return;
      if ((flags.get(i, j - 1, k) & VoxelFlag.PLUG) !== 0) return;
      let run = 0;
      while (run < need && sim.carve.sampleAt(i, j + run, k) >= OPEN_MIN) run++;
      if (run < need) bad++;
    });
  }
  return bad;
}

describe('spoil inside the nest with hauling throttled (acceptance 3)', () => {
  it('two game days of spoil: tamping never cuts a chamber off and keeps the headroom; a closed nest has a dump site and midden-blocked', () => {
    const { sim, nest } = colonyNest(5);
    const col = sim.state.colonies[0];
    expect(nest.entrances.some((e) => e.status === 'open')).toBe(true);
    expect(nest.chambers.length).toBeGreaterThanOrEqual(3);
    const necks = neckSites(nest), floors = tunnelFloors(sim, nest);
    expect(floors.length).toBeGreaterThan(50);
    const rng = rngFork(5, 'spoil-scenario');
    const need = tampHeadroomSamples(sim, nest);
    const closedEvents: { cause: string }[] = [];
    sim.events.on('entrance-closed', (e) => closedEvents.push(e));
    let tamped = 0;
    sim.events.on('pellet-dumped', (e) => { if (e.into === 'tamp') tamped++; });
    const failures: string[] = [];
    // 2 gd of digging: a pellet every 5 s, two in three at a chamber neck (spoil piles), the rest on random tunnel
    // floors; the throttled haulers take one old pellet out every 20 s. Then 2 gd more (no new spoil, the same
    // haulers) so the last pellets reach tamping age (PELLET_TAMP_S = 2 gd).
    const DIG = 2 * TICKS_PER_DAY, END = DIG + PELLET_TAMP_S * TICKS_PER_SECOND + 300;
    for (let t = 0; t < END; t++) {
      if (t < DIG && t % 50 === 0) {
        const at = rngInt(rng, 0, 2) < 2 && necks.length > 0 ? necks[rngInt(rng, 0, necks.length - 1)] : floors[rngInt(rng, 0, floors.length - 1)];
        placePellet(sim, spawnPellet(sim, at, PELLET, 'loam', nest.id, nest.colony, -1), at);
      }
      if (t % 200 === 0) {
        const old = loosePellets(sim, nest.id).filter((it) => sim.state.tick - it.droppedTick > 600 * TICKS_PER_SECOND);
        if (old.length > 0) removeItem(sim, old[0].id, 'hauled');
      }
      sim.tick();
      sim.events.flush();
      if (t % 600 === 0 || t === END - 1) {
        const off = cutOff(sim, nest);
        if (off.length > 0) failures.push(`tick ${sim.state.tick}: chambers ${off} cut off`);
        const low = lowCeilings(sim, nest, need);
        if (low > 0) failures.push(`tick ${sim.state.tick}: ${low} raised floor samples under ${need} samples of headroom`);
      }
    }
    expect(failures).toEqual([]);
    expect(tamped).toBeGreaterThanOrEqual(10); // the spoil really was pressed into the floors
    expect(closedEvents).toEqual([]); // no entrance closed on its own
    expect(isMiddenBlocked(col)).toBe(false);
    const lying = loosePellets(sim, nest.id);
    for (const it of lying) expect(it.volume).toBeGreaterThan(0);
    expect(sim.state.tick - Math.min(...lying.map((it) => it.droppedTick))).toBeLessThanOrEqual(PELLET_TAMP_S * TICKS_PER_SECOND + 1);

    // close every entrance by filling its throat with loose soil (no plug): the nest says why
    for (const e of nest.entrances) {
      sim.enqueue({ type: 'cheat.fillSphere', pos: { x: e.pos.x, y: e.pos.y - 1.5 * sim.world.bu, z: e.pos.z }, r: 3 * sim.world.bu, loose: true });
    }
    for (let t = 0; t < 2 * PHYSIO_EVERY + 60; t++) { sim.tick(); sim.events.flush(); }
    expect(nest.entrances.every((e) => e.status === 'sealed' && e.plugVoxelCount === 0)).toBe(true);
    expect(closedEvents.length).toBe(nest.entrances.length);
    expect(closedEvents[0].cause).toBe('soil-slumped');
    expect(isMiddenBlocked(col)).toBe(true);

    // the internal dump: a dead-end tunnel tip on a floor, >= 6 BU (path) from every chamber, not in a chamber
    const site = internalDumpSite(sim, nest.id);
    expect(site).not.toBeNull();
    expect(site!.kind).toBe('tip');
    expect(site!.fromChamberBu).toBeGreaterThanOrEqual(6);
    const v = sim.carve.voxel, i = Math.round(site!.pos.x / v), j = Math.round(site!.pos.y / v), k = Math.round(site!.pos.z / v);
    expect(sim.carve.sampleAt(i, j, k)).toBeGreaterThanOrEqual(OPEN_MIN);
    expect(sim.carve.sampleAt(i, j - 1, k)).toBeLessThan(OPEN_MIN);
    expect(findChamberAtImpl(sim, site!.pos)).toBeNull();
    for (const c of nest.chambers) {
      const d = sim.nestNav.distance(nest.id, { kind: 'chamber', id: c.id }, site!.pos);
      expect(d).toBeGreaterThan(0);
    }
  }, 120_000);
});
