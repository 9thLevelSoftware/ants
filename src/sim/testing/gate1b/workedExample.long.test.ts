// GDD 02 App. E 25 at integration level (int-1B review): the §15 worked example's set-up rebuilt by cheats with the
// sources fixed in place, run for one game day with the REAL behaviours (foraging, nursing, queen care, laying),
// not the scripted intake of colony/workedExample.test.ts. Long (one game day of 60 workers): FOUNDRESS_LONG=1.
//
// Set-up (GDD 02 §15): summer, 60 workers on auto allocation, one entrance; known sources an aphid-honeydew source
// 150 BU away (Tier 1 has no herds: a pinned honeydew film stands in, GDD 05 §0) and a dead beetle 200 BU away
// (carrion `insect-large`); stock C 30, P 10; standing brood about 12 eggs, 5 larvae, 13 pupae.
// Expected (App. E 25): C intake 10-14, P intake 11-15, eggs laid 8-16, stocks change by less than +-3 loads each.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { announce, forageScenario } from '@/sim/ants/behaviours/outdoor/testkit';
import { establishQueen } from '@/sim/colony/testkit';

const LONG = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.FOUNDRESS_LONG;

describe.skipIf(!LONG)('GDD 02 App. E 25 with real behaviour (FOUNDRESS_LONG)', () => {
  it('one summer day of the §15 colony: intake, laying and stock change in the chapter ranges', () => {
    const { sim, col, sources } = forageScenario({
      seed: 1, workers: 60, stores: { c: 30, p: 10 }, pinned: true,
      sources: [
        { kind: 'honeydew', variant: 'honeydew-film', distBu: 150, bearingDeg: 30, units: 50 },
        { kind: 'carrion', variant: 'insect-large', distBu: 200, bearingDeg: 210, units: 30 },
      ],
    });
    for (const s of sources) announce(sim, col, s);
    // an established colony: the test world's opening record is still at its intro card and its queen claustral
    sim.state.player.opening!.phase = 'done'; sim.state.player.opening!.done = true;
    const nest = sim.stores.nests.get(col.nestIds[0])!;
    establishQueen(sim, nest.chambers.find((c) => c.type === 'royal') ?? nest.chambers[0]);
    const brood = (stage: 'egg' | 'larva' | 'pupa', n: number, progress: number) =>
      sim.enqueue({ type: 'cheat.spawnBrood', colonyId: col.id, stage, n, chamberId: -1, progress, destined: null });
    brood('egg', 12, 0.5); brood('larva', 5, 0.5); brood('pupa', 13, 0.5);
    sim.applyPendingCommands();
    let c = 0, p = 0, eggs = 0;
    sim.events.on('delivery', (e) => { if (e.colonyId === col.id) { c += e.c; p += e.p; } });
    sim.events.on('egg-laid', (e) => { if (e.queenId === col.queenId) eggs++; });
    const c0 = col.stores.c, p0 = col.stores.p;
    for (let t = 0; t < TICKS_PER_DAY; t++) sim.tick();
    const got = {
      intakeC: Math.round(c * 100) / 100, intakeP: Math.round(p * 100) / 100, eggs,
      dC: Math.round((col.stores.c - c0) * 100) / 100, dP: Math.round((col.stores.p - p0) * 100) / 100,
    };
    console.log('App. E 25 with real behaviour:', JSON.stringify(got));
    expect(got.intakeC).toBeGreaterThanOrEqual(10);
    expect(got.intakeC).toBeLessThanOrEqual(14);
    expect(got.intakeP).toBeGreaterThanOrEqual(11);
    expect(got.intakeP).toBeLessThanOrEqual(15);
    expect(got.eggs).toBeGreaterThanOrEqual(8);
    expect(got.eggs).toBeLessThanOrEqual(16);
    expect(Math.abs(got.dC)).toBeLessThan(3);
    expect(Math.abs(got.dP)).toBeLessThan(3);
  }, 900_000);
});
