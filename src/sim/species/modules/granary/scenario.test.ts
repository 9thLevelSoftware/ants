// Granary scenarios in a small Messor test nest (task species-harvester AC2; GDD 07 App. E 15, 17, 19, 20): care
// workers keep a damp granary from sprouting, a major mills at the table rate, minors cannot crack unsprouted seed,
// larvae starve beside a full granary without millers (and the Why view names it), the animal-protein minimum,
// the heat limit and the morning patrol gate.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { begin, canDo, workRate } from '@/sim/ants/actions';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { addAnts, addLarvae, messorKit } from './testkit';
import { addSeeds, totalsOf } from './cohorts';
import { MILL_WANT } from './actions';
import { heatOf, setTrailTempOverride, stepGate, gateMult } from './rhythm';
import { publishGranaryDiagnostics } from './diagnostics';
import { setClimateOverride } from '@/sim/colony/envAdapter';

function run(sim: Sim, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i++) { sim.tick(); each?.(); }
}

describe('granary care in the nest (E15, AC2)', () => {
  // E15 itself (4 care workers at work rate 1) is the pure model check in cohorts.test.ts. Here the colony's own
  // allocator has to find the care workers: 10 minors, rh 0.9 at 20 °C, where a Messor works at about half rate.
  it('the allocator puts care workers on a damp granary (100 M loads u 0.9): 0 sprouted after 0.8 GD', () => {
    const k = messorKit({ rh: 0.9, tempC: 20 });
    addSeeds(k.granary, k.g, 'M', 0.4, 100, 0.9, 0);
    const col = k.sim.state.colonies[0];
    col.stores.c = 6;
    col.stores.p = 2;
    addAnts(k, 'minor', 10, k.nest.chambers[1], 'idle');
    let gnawed = 0;
    k.sim.events.on('radicle-gnawed', (e) => { gnawed += e.loads; });
    run(k.sim, Math.round(0.8 * TICKS_PER_DAY));
    const t = totalsOf(k.granary);
    expect(t.sprouted).toBe(0);
    expect(gnawed).toBeGreaterThan(90);
    expect(t.loads).toBeGreaterThan(99);
  }, 60_000);

  it('without care (granaryHygiene 0) the same granary sprouts', () => {
    const k = messorKit({ rh: 0.9, tempC: 20 });
    addSeeds(k.granary, k.g, 'M', 0.4, 100, 0.9, 0);
    const col = k.sim.state.colonies[0];
    col.stores.c = 6;
    col.stores.p = 2;
    col.directives.granaryHygiene = 0;
    addAnts(k, 'minor', 10, k.nest.chambers[1], 'idle');
    run(k.sim, Math.round(0.8 * TICKS_PER_DAY));
    const t = totalsOf(k.granary);
    expect(t.sprouted + (100 - t.loads)).toBeGreaterThan(50);
  }, 60_000);
});

describe('milling (E17)', () => {
  it('a major mills 10 loads of hardness 0.5 in 360 s of work into 8 paste loads', () => {
    const k = messorKit();
    // a closed surface: the allocator's gatherer floor would send the colony's only worker out (allocation.ts)
    setClimateOverride(k.sim, { chamberTemp: () => 22, rh: () => 0.3, pointTemp: () => 22, surfaceActivity: () => 0 });
    addSeeds(k.granary, k.g, 'M', 0.5, 10, 0.3, 0);
    const [major] = addAnts(k, 'major', 1, k.granaryChamber, 'idle', 1.55);
    major.bb[MILL_WANT] = 10;
    let pasteOut = 0, milled = 0;
    k.sim.events.on('seed-milled', (e) => { pasteOut += e.pasteOut; milled += e.loads; });
    const ok = begin(k.sim, major, 'mill-seed', null);
    expect(ok).toBe(true);
    // the action's clock runs at the ant's work rate (GDD 01 §7.1), which follows her body temperature
    let workS = 0, ticks = 0;
    while (major.action?.id === 'mill-seed' && ticks < 20_000) { workS += workRate(k.sim, major) / TICKS_PER_SECOND; k.sim.tick(); ticks++; }
    expect(Math.abs(workS - 360)).toBeLessThan(4);
    expect(totalsOf(k.granary).loads).toBeLessThan(1e-6);
    expect(milled).toBeCloseTo(10, 6);
    expect(pasteOut).toBeCloseTo(8, 6);
  });

  it('a possessed minor facing unsprouted seed may not mill', () => {
    const k = messorKit();
    addSeeds(k.granary, k.g, 'M', 0.5, 10, 0.3, 0);
    const [minor] = addAnts(k, 'minor', 1, k.granaryChamber);
    expect(canDo(k.sim, minor, 'mill-seed', null).ok).toBe(false);
  });
});

describe('the paste bottleneck (AC2)', () => {
  function larvaeColony(withMajors: boolean) {
    const k = messorKit({ tempC: 26 });
    // a closed surface (night): nobody forages, so the larvae have only what the granary gives (the gatherer floor
    // of allocation.ts would otherwise send a minor out to the test world's food)
    setClimateOverride(k.sim, { chamberTemp: () => 26, rh: () => 0.3, pointTemp: () => 26, surfaceActivity: () => 0 });
    addSeeds(k.granary, k.g, 'M', 0.5, 400, 0.3, 0);
    const nursery = k.nest.chambers[1];
    addAnts(k, 'minor', 6, nursery, 'nurse');
    if (withMajors) addAnts(k, 'major', 3, k.granaryChamber, 'mill', 1.6);
    const col = k.sim.state.colonies[0];
    col.stores.c = 0;
    col.stores.p = 0;
    addLarvae(k, 8, nursery);
    return { k, col };
  }

  it('with no majors the larvae go hungry beside a full granary and diag-mb-milling names the millers', () => {
    const { k, col } = larvaeColony(false);
    run(k.sim, Math.round(0.6 * TICKS_PER_DAY));
    const larvae = k.sim.state.brood.filter((b) => b.alive && b.stage === 'larva');
    const fed = larvae.reduce((a, b) => a + b.fedC + b.fedP, 0);
    expect(fed).toBeLessThan(0.05);
    expect(totalsOf(k.granary).loads).toBeGreaterThan(390);
    const diags = publishGranaryDiagnostics(k.sim, col, k.g);
    const mill = diags.find((d) => d.id === 'diag-mb-milling')!;
    expect(mill.status).toBe('warn');
    expect(['majors-few', 'millers-few']).toContain(mill.factors[0]?.cause);
  }, 60_000);

  it('with majors milling the paste reaches the larvae', () => {
    const { k } = larvaeColony(true);
    run(k.sim, Math.round(0.6 * TICKS_PER_DAY));
    const larvae = k.sim.state.brood.filter((b) => b.alive && b.stage === 'larva');
    const fed = larvae.reduce((a, b) => a + b.fedC + b.fedP, 0);
    expect(fed).toBeGreaterThan(0.1);
    expect(totalsOf(k.granary).loads).toBeLessThan(400);
  }, 60_000);
});

describe('heat and the patrol gate (E20, §5.3.7)', () => {
  it('E20: trail cells at 44 °C: nobody leaves; 30 °C: full range; 39 °C: 30 %', () => {
    const k = messorKit();
    const col = k.sim.state.colonies[0];
    setTrailTempOverride(k.sim, () => 44);
    expect(heatOf(k.sim, col, k.g).heatStress).toBe(1);
    k.sim.tick();
    setTrailTempOverride(k.sim, () => 30);
    expect(heatOf(k.sim, col, k.g).tripMult).toBeCloseTo(1, 9);
    k.sim.tick();
    setTrailTempOverride(k.sim, () => 39);
    expect(heatOf(k.sim, col, k.g).tripMult).toBeCloseTo(0.3, 9);
  });

  it('no departure before the morning patrol is back; the gate opens on 3 safe returns', () => {
    const k = messorKit();
    const col = k.sim.state.colonies[0];
    setClimateOverride(k.sim, { chamberTemp: () => 22, rh: () => 0.3, pointTemp: () => 22, surfaceActivity: () => 1 });
    setTrailTempOverride(k.sim, () => 25);
    addAnts(k, 'media', 16, k.nest.chambers[1]);
    const pats = addAnts(k, 'media', 4, k.nest.chambers[0], 'patrol');
    stepGate(k.sim, col, k.g);
    expect(gateMult(k.sim, col, k.g)).toBe(0);
    for (const p of pats) p.nestId = -1;
    stepGate(k.sim, col, k.g);
    expect(gateMult(k.sim, col, k.g)).toBe(0);
    for (const p of pats.slice(0, 3)) p.nestId = k.nest.nest.id;
    stepGate(k.sim, col, k.g);
    expect(gateMult(k.sim, col, k.g)).toBe(1);
  });
});
