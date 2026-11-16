// A founding queen on a low site (GDD 06 §13.1 `drowning`: water in her chamber while no ant moves her; §5.12: the
// claustral flood risk is the founding hazard): the plug of a sealed founding cell lets in no rain (task weather-fix2;
// established nests' sealed entrances keep GDD 03's x 0.1; a real hole into the cell takes rain as open), the cell takes water only by seepage from saturated
// subsoil (GDD 06 §3.10), the player is told at once in words (`founding-flooding`), a film of water never drowns her,
// she keeps her health for the 50 s grace once the water stands 0.5 BU deep, and she can still dig (possessed);
// then mound erosion and the flood diagnostics' statuses.

import { describe, expect, it } from 'vitest';
import type { Ant, Nest, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  FLOOD_ANT_SUB_KEY, FLOOD_SEEP_RATE, FLOOD_SEEP_THETA1, FLOOD_SUBMERGE_DEPTH_BU, FLOOD_SUBMERGE_GRACE_S,
} from '@/sim/balance/weather';
import { ALERT_TEXT } from '@/content/text/alerts';
import { REMEDY_WORD } from '@/content/text/words';
import { getDiagnostic } from '@/sim/progression/diagnostics';
import { canDo } from '@/sim/ants/actions/runner';
import { makeTestSim } from '@/sim/testing';
import { commandsSystem } from '@/sim/systems';
import { TICKS_PER_SECOND } from '@/sim/time';
import { createMound, moundVolume } from '../mounds';
import { placeWorker, playerNest, setMoisture } from '../nestTestKit';
import { floodCheats } from './cheats';
import { neutralSite } from './floodTestKit';
import { erodeMound } from './erosion';
import { floodSystem } from './index';
import { entranceInflow, nestInflow, seepageOf } from './inflow';

const run = (sim: Sim, n: number): void => { for (let i = 0; i < n; i++) sim.tick(); };
/** The player's nest without touching it (playerNest() also clears the founding record). */
const nestOf = (sim: Sim): Nest => sim.stores.nests.get(sim.state.colonies[0].nestIds[0])!;

function foundingOnLowSite(): Sim {
  const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, floodSystem] });
  sim.world.maps.floodRisk.data.fill(Math.round(0.8 * 255));
  setMoisture(sim, 0.5);
  const nest = playerNest(sim);
  nest.founding = { state: 'sealed', readiness: 1, cavitySeed: { ...nest.chambers[2].center }, abandoned: [], readyTick: 0, sealedTick: 0 };
  nest.entrances[0].status = 'sealed';
  return sim;
}

/** A founding queen of the player colony resting on the floor of the deepest chamber (the cell). */
function queenInCell(sim: Sim): Ant {
  const cell = nestOf(sim).chambers[2];
  const q = placeWorker(sim, { ...cell.center }, { x: 1, y: 0, z: 0 }, nestOf(sim).id);
  q.caste = 'queen';
  q.flags |= AntFlag.FOUNDING;
  sim.state.colonies[0].queenId = q.id;
  return q;
}

function alertText(kind: string, tokens: Record<string, unknown>): string {
  const t = (ALERT_TEXT as Record<string, { title: string; cause: string }>)[kind];
  return `${t.title}: ${t.cause.replace(/\{(\w+)\}/g, (_, k: string) => String(tokens[k]))}`;
}

describe('founding queen on a low site', () => {
  it('the plug of a sealed founding cell lets in no rain, a real hole into it all; a sealed entrance of an established nest a tenth', () => {
    const sim = foundingOnLowSite();
    const nest = nestOf(sim);
    const e = nest.entrances[0];
    expect(entranceInflow(sim, e, 1, nest).q).toBe(0);
    expect(nestInflow(sim, nest, undefined, 1)).toBe(0);
    e.status = 'reopening';
    expect(entranceInflow(sim, e, 1, nest).q).toBe(0);
    e.status = 'open'; // the test nest's throat is carved open: a real hole into the cell (review finding 2)
    const hole = entranceInflow(sim, e, 1, nest).q;
    nest.founding = null; // established: GDD 03 §4.2 by status, SEAL_LEAK for a sealed entrance
    const open = entranceInflow(sim, e, 1, nest).q;
    expect(open).toBeGreaterThan(0);
    expect(hole).toBeCloseTo(open, 12);
    e.status = 'sealed';
    expect(entranceInflow(sim, e, 1, nest).q).toBeCloseTo(open * 0.1, 9);
  });

  it('a downpour over the sealed cell on dry-enough soil: no water, no alert, the queen untouched', () => {
    const sim = foundingOnLowSite();
    const nest = nestOf(sim);
    const q = queenInCell(sim);
    floodCheats(sim.state).rainI = 1;
    run(sim, 3000);
    expect(nest.flood.water).toBe(0);
    expect(nest.chambers.every((c) => c.flooded === 0)).toBe(true);
    expect(sim.state.progression.alerts.some((a) => a.kind === 'founding-flooding')).toBe(false);
    expect(q.alive).toBe(true);
    expect(q.hp).toBe(q.maxHp);
  });

  it('waterlogged subsoil seeps in at the GDD rate; the alert in words comes first, the 50 s grace after 0.5 BU of water', () => {
    const sim = foundingOnLowSite();
    const nest = nestOf(sim);
    const q = queenInCell(sim);
    setMoisture(sim, FLOOD_SEEP_THETA1 + 0.03);
    const expected = nest.chambers.reduce((a, c) => a + FLOOD_SEEP_RATE * c.floorArea, 0);
    expect(seepageOf(sim, nest)).toBeCloseTo(expected, 9);
    expect(nestInflow(sim, nest)).toBeCloseTo(expected, 9);
    let alertTick = -1, subTick = -1, depthAtSub = 0;
    const bu = sim.world.bu;
    sim.events.on('alert', (e) => { if (e.op === 'raise' && e.alert.kind === 'founding-flooding' && alertTick < 0) alertTick = sim.state.tick; });
    sim.events.on('ant-submerged', (e) => {
      if (e.id !== q.id || subTick >= 0) return;
      subTick = sim.state.tick;
      depthAtSub = nest.flood.level - (q.pos.y - q.up.y * q.footOffset);
    });
    for (let i = 0; i < 40000 && subTick < 0 && q.alive; i++) sim.tick();
    expect(alertTick).toBeGreaterThan(0);
    const alert = sim.state.progression.alerts.find((a) => a.kind === 'founding-flooding')!;
    expect(alert.level).toBe('critical');
    expect(alertText(alert.kind, alert.tokens ?? {})).toMatch(/^Founding chamber flooding: water rising around the queen — \d+ % of the cell$/);
    expect(subTick).toBeGreaterThan(alertTick);
    expect(depthAtSub).toBeGreaterThanOrEqual(FLOOD_SUBMERGE_DEPTH_BU * bu - 1e-9);
    // the queen herself: `queen-in-danger` (rising water) from her first second under water
    const qa = sim.state.progression.alerts.find((a) => a.kind === 'queen-in-danger' && a.subjectId === q.id);
    expect(qa).toBeDefined();
    expect(alertText(qa!.kind, qa!.tokens ?? {})).toBe('Queen under attack: rising water, royal chamber');
    // time to react: health untouched for the whole grace once she is submerged; she can still dig her way up
    run(sim, FLOOD_SUBMERGE_GRACE_S * TICKS_PER_SECOND - 20);
    expect(q.alive).toBe(true);
    expect(q.hp).toBe(q.maxHp);
    expect(q.bb[FLOOD_ANT_SUB_KEY]).toBeGreaterThan(0);
    expect(canDo(sim, q, 'dig-bite', null).ok).toBe(true);
  });

  it('a film of water on the cell floor (below 0.5 BU deep) never submerges the resting queen', () => {
    const sim = foundingOnLowSite();
    const nest = nestOf(sim);
    const q = queenInCell(sim);
    floodCheats(sim.state).drainScale = 0;
    nest.flood.water = 0.7; // the sweep-4 film: about 0.05 BU over the cell floor
    let submerged = 0;
    sim.events.on('ant-submerged', (e) => { if (e.id === q.id) submerged++; });
    run(sim, 3000);
    expect(nest.chambers[2].flooded).toBeGreaterThan(0); // the cell is wet (and the player told) ...
    expect(sim.state.progression.alerts.some((a) => a.kind === 'founding-flooding')).toBe(true);
    expect(submerged).toBe(0); // ... but nobody is under water
    expect(q.hp).toBe(q.maxHp);
  });

  it('the alert clears when the cell is dry again', () => {
    const sim = foundingOnLowSite();
    const nest = nestOf(sim);
    nest.flood.water = 3;
    run(sim, 30);
    expect(sim.state.progression.alerts.some((a) => a.kind === 'founding-flooding')).toBe(true);
    floodCheats(sim.state).drainScale = 50;
    run(sim, 1000);
    expect(nest.flood.water).toBe(0);
    expect(sim.state.progression.alerts.some((a) => a.kind === 'founding-flooding')).toBe(false);
  });
});

describe('diag-nest-flood statuses', () => {
  it('ok -> info (predicted) on a bare entrance; bad once the royal chamber is a quarter under water', () => {
    const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, floodSystem] });
    neutralSite(sim); // flat-ground catchment c = 1
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

describe('diag-nest-flood ruling (GDD 03 §11.3): the critical alert only for a quarter-flooded brood or royal chamber', () => {
  it('a predicted flood is an info note with worded remedies; never warn, so the registry raises no alert', () => {
    const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, floodSystem] });
    neutralSite(sim); // flat-ground catchment c = 1
    const nest = playerNest(sim);
    const id = `diag-nest-flood:${nest.id}`;
    const seen = new Set<string>();
    sim.events.on('diagnostic-changed', (e) => { if (e.id === id) seen.add(e.status); });
    run(sim, 260);
    const d = getDiagnostic(sim, id)!;
    expect(d.status).toBe('info');
    expect(d.remedies.length).toBeGreaterThan(0);
    for (const r of d.remedies) expect(REMEDY_WORD[r]).toBeTruthy();
    expect(sim.state.progression.alerts.some((a) => a.kind === 'nest-flooding')).toBe(false);
    // a storm: the status goes from info straight to bad (royal chamber a quarter under water), never through warn
    floodCheats(sim.state).rainI = 1;
    run(sim, 600);
    expect(seen.has('bad')).toBe(true);
    expect(seen.has('warn')).toBe(false);
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
