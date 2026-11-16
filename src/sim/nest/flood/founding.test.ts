// A founding queen on a low site (GDD 06 §13.1 `drowning`: water in her chamber while no ant moves her): the sealed
// cell takes water only through the plug's leak (x 0.1), the player is told at once (`founding-flooding`), and
// mound erosion and the flood diagnostics' statuses.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { getDiagnostic } from '@/sim/progression/diagnostics';
import { makeTestSim } from '@/sim/testing';
import { commandsSystem } from '@/sim/systems';
import { createMound, moundVolume } from '../mounds';
import { playerNest } from '../nestTestKit';
import { floodCheats } from './cheats';
import { erodeMound } from './erosion';
import { floodSystem } from './index';
import { entranceInflow } from './inflow';

const run = (sim: Sim, n: number): void => { for (let i = 0; i < n; i++) sim.tick(); };
/** The player's nest without touching it (playerNest() also clears the founding record). */
const nestOf = (sim: Sim) => sim.stores.nests.get(sim.state.colonies[0].nestIds[0])!;

function foundingOnLowSite(): Sim {
  const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, floodSystem] });
  sim.world.maps.floodRisk.data.fill(Math.round(0.8 * 255));
  const nest = playerNest(sim);
  nest.founding = { state: 'sealed', readiness: 1, cavitySeed: { ...nest.chambers[2].center }, abandoned: [], readyTick: 0, sealedTick: 0 };
  nest.entrances[0].status = 'sealed';
  return sim;
}

describe('founding queen on a low site', () => {
  it('the sealed plug lets in a tenth of the inflow; water in the cell raises founding-flooding with its share', () => {
    const sim = foundingOnLowSite();
    const nest = nestOf(sim);
    const e = nest.entrances[0];
    const sealed = entranceInflow(sim, e, 1).q;
    e.status = 'open';
    expect(sealed).toBeCloseTo(entranceInflow(sim, e, 1).q * 0.1, 9);
    e.status = 'sealed';
    floodCheats(sim.state).rainI = 1;
    run(sim, 750);
    expect(nest.flood.water).toBeGreaterThan(0);
    const alert = sim.state.progression.alerts.find((a) => a.kind === 'founding-flooding');
    expect(alert).toBeDefined();
    expect(alert!.level).toBe('critical');
    expect(alert!.subjectId).toBe(nest.id);
    expect(Number(alert!.tokens?.pct)).toBeGreaterThan(0);
  });

  it('the alert clears when the cell is dry again', () => {
    const sim = foundingOnLowSite();
    const nest = nestOf(sim);
    floodCheats(sim.state).rainI = 1;
    run(sim, 500);
    floodCheats(sim.state).rainI = 0;
    floodCheats(sim.state).drainScale = 50;
    run(sim, 1000);
    expect(nest.flood.water).toBe(0);
    expect(sim.state.progression.alerts.some((a) => a.kind === 'founding-flooding')).toBe(false);
  });
});

describe('diag-nest-flood statuses', () => {
  it('ok -> info (predicted) on a bare entrance; bad once the royal chamber is a quarter under water', () => {
    const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, floodSystem] });
    const nest = playerNest(sim);
    const id = `diag-nest-flood:${nest.id}`;
    run(sim, 260); // a reference-storm prediction ran
    expect(getDiagnostic(sim, id)?.status).toBe('info');
    floodCheats(sim.state).rainI = 1;
    run(sim, 600);
    expect(nest.chambers[2].flooded).toBeGreaterThanOrEqual(0.25);
    expect(getDiagnostic(sim, id)?.status).toBe('bad');
    expect(sim.state.progression.alerts.some((a) => a.kind === 'nest-flooding')).toBe(true);
  });
});

describe('mound rain erosion (GDD 03 §1.4)', () => {
  it('a downpour hour slumps a steep pile (volume conserved); light rain (I <= 0.2) does nothing', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const nest = playerNest(sim);
    const e = nest.entrances[0];
    const m = createMound(sim, nest, e, e.pos.x, e.pos.z, 'loam');
    const bu = sim.world.bu;
    for (let idx = 0; idx < m.h.length; idx++) {
      const ix = idx % m.n, iz = (idx - ix) / m.n;
      const d = Math.hypot((ix - (m.n - 1) / 2) * m.cell, (iz - (m.n - 1) / 2) * m.cell);
      if (d > e.radius + bu && d < e.radius + 3 * bu) m.h[idx] = 3 * bu; // a steep wall
    }
    const v0 = moundVolume(sim, m);
    const spread = (): number => m.h.reduce((n, h) => n + (h > 0 ? 1 : 0), 0);
    const cells0 = spread();
    expect(erodeMound(sim, m, 0.1)).toBe(0);
    expect(erodeMound(sim, m, 0.7)).toBeGreaterThan(0);
    expect(moundVolume(sim, m)).toBeCloseTo(v0, 6);
    expect(spread()).toBeGreaterThan(cells0); // the wall slumps outward
  });
});
