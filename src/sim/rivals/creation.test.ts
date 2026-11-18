// sim-seams item 3: the real rival nests are built when the game is created (prepare.ts), not on the first rivals
// tick, which cost 1.5-2 s on generated worlds (test-output/sim-seams/rivalCost.txt). rivals 0 (R23) still means no
// rival colony and no incipient foundation.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { calendarTickAt, TICKS_PER_DAY } from '@/sim/time';
import { player, rivalSim, rivalsOf, run } from './testkit';
import { colExt } from './state';
import { homeNest } from './setup';
import { newFoundations } from './lifecycle';
import { initRivals } from './init';

describe('rival nests at game creation', () => {
  it('every rival colony has its nest, entrance and queen before the first tick', () => {
    const sim = rivalSim({
      nest: 'small', workers: 0,
      rivals: [{ species: 'tetramorium-immigrans', dx: 90, dz: 0 }, { species: 'lasius-niger', dx: -90, dz: 40, incipient: true }],
    });
    expect(sim.state.tick).toBe(0);
    const rivals = rivalsOf(sim);
    expect(rivals).toHaveLength(2);
    for (const col of rivals) {
      expect(colExt(sim.state, col.id).setupDone, col.species).toBe(true);
      const nest = homeNest(sim, col)!;
      expect(nest.entrances.length, col.species).toBeGreaterThan(0);
      expect(nest.chambers.some((c) => c.type === 'royal'), col.species).toBe(true);
      expect(sim.state.ants.some((a) => a.id === col.queenId && a.alive && a.caste === 'queen')).toBe(true);
    }
    // the first ticks find nothing left to build: the rival entities are the ones made at creation
    const ids = sim.state.ants.filter((a) => a.colony !== player(sim).id).map((a) => a.id).sort();
    run(sim, 3);
    const after = sim.state.ants.filter((a) => a.colony !== player(sim).id && ids.includes(a.id)).map((a) => a.id).sort();
    expect(after).toEqual(ids);
  });

  it('a nest left unbuilt (a save from before) is still built on the first rivals tick', () => {
    const sim = rivalSim({ nest: 'small', workers: 0, rivals: [{ species: 'lasius-niger', dx: 80, dz: 0, incipient: true }] });
    const col = rivalsOf(sim)[0];
    // undo the creation-time build in state terms: the flag is what the tick path reads
    colExt(sim.state, col.id).setupDone = false;
    const before = sim.state.ants.length;
    run(sim, 1);
    expect(colExt(sim.state, col.id).setupDone).toBe(true);
    expect(sim.state.ants.length).toBeGreaterThan(before); // a second queen: the tick path ran
  });

  it('creating a game without the heavy half loaded leaves the nests to the first rivals tick instead of throwing', () => {
    // a tool that imports only createGame has no wiring.ts in its graph (sim-seams review finding 2)
    const sim = rivalSim({ nest: 'small', workers: 0, rivals: [] });
    const x = sim.world.size * 0.3;
    sim.world.placements.rivalSites.push({ species: 'lasius-niger', origin: { x, y: sim.field.height(x, x), z: x }, incipient: true });
    expect(() => initRivals(sim, sim.world, null)).not.toThrow();
    const col = rivalsOf(sim)[0];
    expect(colExt(sim.state, col.id).setupDone).toBe(false);
    run(sim, 1);
    expect(colExt(sim.state, col.id).setupDone).toBe(true);
    expect(homeNest(sim, col)!.entrances.length).toBeGreaterThan(0);
  });

  /** Rival colonies after the foundation roll at 16:00 of every day of one year, with the given rival setting. */
  function foundedOverAYear(rivals: number): number {
    const sim = makeTestSim({ nest: 'small', workers: 0, sizeBu: 1024, config: { rules: { ...makeTestSim().state.config.rules, rivals } } });
    expect(sim.state.colonies.filter((c) => c.rival)).toHaveLength(0);
    // a vacant founding site far from the nest (added after creation, so no colony was made there)
    const x = sim.world.size * 0.15;
    sim.world.placements.rivalSites.push({ species: 'lasius-niger', origin: { x, y: sim.field.height(x, x), z: x }, incipient: true });
    const cfg = sim.state.config;
    for (let d = 1; d <= 28; d++) {
      sim.state.env.calendar.startTick = calendarTickAt('spring', 1, 16, cfg) + (d - 1) * TICKS_PER_DAY - sim.state.tick;
      newFoundations(sim);
    }
    return sim.state.colonies.filter((c) => c.rival).length;
  }

  it('rivals 0 (R23): no rival colony at creation and no incipient foundation in the flight window', () => {
    expect(foundedOverAYear(1)).toBeGreaterThan(0); // the control: with a setting, the empty world gets a foundation
    expect(foundedOverAYear(0)).toBe(0);
  });
});
