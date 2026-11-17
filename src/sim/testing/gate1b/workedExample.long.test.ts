// GDD 02 App. E 25 with real behaviour, re-derived per integrator ruling R7 (econ-growth). Long (one game day of 100
// workers): FOUNDRESS_LONG=1.
//
// Fixture (R7): summer, 100 workers on auto allocation, one entrance, the §15 standing brood (12 eggs, 5 larvae,
// 13 pupae) and stock (C 30, P 10); a REAL aphid herd (Tier 2 tending and drinking, no stand-in honeydew film)
// 150 BU from the entrance, and a dead beetle (`insect-large`, GDD 05 food table: 15 P in 40 bulk) 200 BU away,
// fixed in place. Both sources are known (as if scouts had reported them).
//
// Re-derivation from first principles (the §15 worked example's "0.9 P per trip" is superseded: a 1-bulk piece
// torn from the beetle carries 15 / 40 = 0.375 P and 0.0125 C):
// - Need (GDD 02 §5.5 need rates): workers 100 x 0.107 C = 10.7 C/gd (§15 time-weighted mix), queen 0.3 C + 0.1 P,
//   eggs 0.04 P each, a feeding larva 1.2 P + 0.4 C over 0.44 gd at 25 °C (2.7 P/gd, 0.9 C/gd): with ~5 larvae
//   feeding, about 15 C and 13-15 P per gd.
// - Protein supply: one carrion trip (200 BU at 6 BU/s each way, tear, unload) brings 0.375 P; at ~2 trips per
//   forager per gd, 13 P/gd takes ~35 trips, i.e. 15-20 carrion foragers. Carbohydrate: a 200-aphid herd at full
//   tendedness produces 200 x 0.10 = 20 C/gd (GDD 05 §1.4), enough for the need, drunk at the Tier 2 tending rate.
// - So the checks are ratios to the colony's own need over the measured day (the GDD's absolute 10-14 C / 11-15 P
//   came from the superseded 0.9 P pieces and 60 workers): C intake 0.9-1.5 x need, P intake 0.9-1.8 x need, eggs
//   laid in the chapter's 8-16, and the carbohydrate stock falls by no more than 3 loads. Foragers out are reported.
// - The stocks are the pool (GDD 02 §5.1). A nurse load given to a worker the allocator then moves to idle goes back
//   to the pool (colony/cropNetwork.ts; before that fix 60 idle workers kept 9 P of nurse loads and dC was -11.7).
//   The P stock change is reported, not asserted: R7 bounds only the carbohydrate stock (the GDD's check bounded
//   both; dP is about -1 here, inside the GDD's own +-3).
// - The standing brood is spread evenly over each stage (econ-growth review): spawned all at progress 0.5, the five
//   larvae pupated together a third of the way into the day, the protein need collapsed (rateP 11 -> 4.5 P/gd) and
//   the colony, rightly, stopped going out for protein, so the day's ratio measured the fixture (P 0.87 x need), not
//   the economy. Spread as the §15 flow it stands for: C 1.19, P 1.03 x need, 9 eggs, dC -1.2, dP -0.8 (seed 1).
//   Late in the day departures fall with surface activity (fEnv 0.22 at 0.5 gd): that is the day, not a stall.
// - The nest flood system is left out: the worked example is a fair summer day, and a trace of night-time flood
//   water (under 2 % of the nest) sends every idle ant to nurse (nest idle behaviour, flood evacuation), each loading
//   a crop, which moved ~25 loads out of the pool in one seed (reported to the nest owners).
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { colonySlotBit } from '@/sim/entities';
import { herdSourceOf } from '@/sim/ecology';
import { addHerd, plantSim } from '@/sim/ecology/plants/testkit';
import { announce, pinnedSystems } from '@/sim/ants/behaviours/outdoor/testkit';
import { establishQueen } from '@/sim/colony/testkit';

const LONG = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.FOUNDRESS_LONG;

/** Herd and carcass positions: bearing (deg) and distance (BU) from the world centre, where the test nest lies. */
const HERD = { distBu: 150, deg: 30 }, BEETLE = { distBu: 200, deg: 210 };
const APHIDS = 200;

function at(d: { distBu: number; deg: number }): { dx: number; dz: number } {
  const a = (d.deg * Math.PI) / 180;
  return { dx: Math.cos(a) * d.distBu, dz: Math.sin(a) * d.distBu };
}

describe.skipIf(!LONG)('GDD 02 App. E 25 with real behaviour, re-derived (R7; FOUNDRESS_LONG)', () => {
  it('one summer day of 100 workers on a real herd and a beetle: intake vs need, laying, stock', () => {
    const pinned = new Map<number, number>();
    const systems = pinnedSystems(pinned).filter((s) => s.name !== 'nest-flood');
    const { sim, plants } = plantSim({ workers: 100, sizeBu: 600, herbs: [at(HERD)], seed: 1, systems });
    const col = sim.state.colonies[0];
    const bu = sim.world.bu;
    const herd = addHerd(sim, plants[0], APHIDS, { kMax: APHIDS + 50 });
    const hs = herdSourceOf(sim, herd)!;
    hs.discoveredBy |= colonySlotBit(sim, col.id);
    const b = at(BEETLE), x = sim.world.size / 2 + b.dx * bu, z = sim.world.size / 2 + b.dz * bu;
    sim.enqueue({ type: 'cheat.spawnFood', kind: 'carrion', variant: 'insect-large', pos: { x, y: sim.field.height(x, z), z }, units: 1, stage: null });
    sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 30, p: 10, toxin: 0 });
    sim.applyPendingCommands();
    const beetle = sim.state.sources[sim.state.sources.length - 1];
    pinned.set(beetle.id, -1);
    announce(sim, col, beetle);
    announce(sim, col, hs);
    sim.state.player.opening!.phase = 'done'; sim.state.player.opening!.done = true;
    const nest = sim.stores.nests.get(col.nestIds[0])!;
    establishQueen(sim, nest.chambers.find((c) => c.type === 'royal') ?? nest.chambers[0]);
    // a standing brood is a flow: its items are spread over their stage, not all half-way through it
    const brood = (stage: 'egg' | 'larva' | 'pupa', n: number) => {
      for (let i = 0; i < n; i++) {
        sim.enqueue({ type: 'cheat.spawnBrood', colonyId: col.id, stage, n: 1, chamberId: -1, progress: (i + 0.5) / n, destined: null });
      }
    };
    brood('egg', 12); brood('larva', 5); brood('pupa', 13);
    sim.applyPendingCommands();

    let c = 0, p = 0, eggs = 0, needC = 0, needP = 0, samples = 0, outside = 0;
    sim.events.on('delivery', (e) => { if (e.colonyId === col.id) { c += e.c; p += e.p; } });
    sim.events.on('egg-laid', (e) => { if (e.queenId === col.queenId) eggs++; });
    const c0 = col.stores.c, p0 = col.stores.p;
    for (let t = 0; t < TICKS_PER_DAY; t++) {
      sim.tick();
      if (t % 100 !== 0) continue;
      samples++;
      needC += col.needs.rateC; needP += col.needs.rateP;
      for (const a of sim.stores.ants.list) if (a.colony === col.id && a.caste === 'worker' && a.nestId < 0) outside++;
    }
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const got = {
      intakeC: r2(c), intakeP: r2(p), needC: r2(needC / samples), needP: r2(needP / samples), eggs,
      ratioC: r2(c / (needC / samples)), ratioP: r2(p / (needP / samples)),
      dC: r2(col.stores.c - c0), dP: r2(col.stores.p - p0), meanOutside: r2(outside / samples),
    };
    console.log('App. E 25 (R7) with real behaviour:', JSON.stringify(got));
    expect(got.ratioC).toBeGreaterThanOrEqual(0.9);
    expect(got.ratioC).toBeLessThanOrEqual(1.5);
    expect(got.ratioP).toBeGreaterThanOrEqual(0.9);
    expect(got.ratioP).toBeLessThanOrEqual(1.8);
    expect(got.eggs).toBeGreaterThanOrEqual(8);
    expect(got.eggs).toBeLessThanOrEqual(16);
    expect(got.dC).toBeGreaterThan(-3);
  }, 1_800_000);
});
