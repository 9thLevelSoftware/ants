// The opening on GENERATED worlds (FOUNDRESS_LONG=1; several minutes): the player path through the real primitives
// and the real founding code, and the founding outcome in the real environment over seeds. Numbers go to stderr.
//   FOUNDRESS_LONG=1 npx vitest run src/sim/colony/founding/generated.long.test.ts
// FOUNDRESS_SEEDS=a,b,c chooses the generated seeds (default 1,2,3).
import { describe, expect, it } from 'vitest';
import type { Sim, WorldData } from '@/sim/types';
import { begin } from '@/sim/ants';
import { navStop, navTo } from '@/sim/locomotion';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { makeTestSim } from '@/sim/testing';
import { runFoundingDig } from '@/sim/testing/e2e/foundingScript';
import { TICKS_PER_DAY, currentSeason } from '@/sim/time';
import { generateWorld } from '@/worldgen';
import { SUIT } from '@/worldgen/tuning/maps';
import { isWorkerCaste } from '../census';
import { cavityEntrances } from './dig';
import { plugInnerFace, plugRemnants } from './reopen';
import { foundingView } from './view';
import { nestOf, phase, pinTemperature, queen, stepUntil } from './testkit';

const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined>; stderr: { write(s: string): void } } }).process;
const LONG = !!env?.env.FOUNDRESS_LONG;
const SEEDS = (env?.env.FOUNDRESS_SEEDS ?? '1,2,3').split(',').map(Number);
const log = (...a: unknown[]) => env?.stderr.write(`[founding.long] ${a.join(' ')}\n`);

const worlds = new Map<number, WorldData>();
function newGame(seed: number, day?: number): Sim {
  const cfg = { ...defaultGameConfig('lasius-niger', seed), cheats: true, ...(day ? { startDayOfSeason: day } : {}) };
  let world = worlds.get(seed);
  if (!world) { world = generateWorld(cfg.world); worlds.set(seed, world); }
  return createSim(createNewGame(cfg, world).state, world);
}

/** The best static-map cell (good or better if any) within `rBu` of the queen, as a ground point. */
function goodSite(sim: Sim, rBu: number): { x: number; y: number; z: number; q: number } {
  const q = queen(sim), m = sim.world.maps.suitability['lasius-niger'], bu = sim.world.bu;
  let best = { x: q.pos.x, y: 0, z: q.pos.z, q: -1 };
  for (let iz = 0; iz < m.nz; iz++) for (let ix = 0; ix < m.nx; ix++) {
    const x = (ix + 0.5) * m.cell, z = (iz + 0.5) * m.cell, v = m.data[iz * m.nx + ix] / 255;
    const d = Math.hypot(x - q.pos.x, z - q.pos.z);
    // nearest good site; else the best one
    const better = best.q < SUIT.good ? v > best.q : v >= SUIT.good && d < Math.hypot(best.x - q.pos.x, best.z - q.pos.z);
    if (d <= rBu * bu && better) best = { x, y: sim.field.height(x, z), z, q: v };
  }
  return best;
}

function walkTo(sim: Sim, p: { x: number; y: number; z: number }, tolBu: number, maxTicks: number): boolean {
  const q = queen(sim);
  if (!navTo(sim, q, p, tolBu * sim.world.bu)) return false;
  stepUntil(sim, () => q.nav.status !== 'moving', maxTicks);
  return q.nav.status === 'arrived';
}

/**
 * The player widening the cell until the nest reports it ready: from the room's centre, level bites outward at
 * spreading angles, stepping back to the centre between them (as a player digs round the shaft's end).
 */
function widenCell(sim: Sim, maxTicks: number): void {
  const q = queen(sim), bu = sim.world.bu, c = { ...q.pos };
  let k = 0;
  const end = sim.state.tick + maxTicks;
  while (phase(sim) === 'dig' && sim.state.tick < end) {
    const a = k * 2.4, r = Math.min(2.5, 0.8 + 0.05 * k) * bu;
    walkTo(sim, { x: c.x + Math.cos(a) * r * 0.5, y: c.y, z: c.z + Math.sin(a) * r * 0.5 }, 0.5, 400);
    for (let b = 0; b < 2 && phase(sim) === 'dig'; b++) {
      begin(sim, q, 'dig-bite', { kind: 'point', id: -1, pos: { x: q.pos.x + Math.cos(a) * 2 * bu, y: q.pos.y - 0.2 * bu, z: q.pos.z + Math.sin(a) * 2 * bu } });
      stepUntil(sim, () => q.action === null, 300);
    }
    stepUntil(sim, () => phase(sim) !== 'dig', 15);
    k++;
  }
}

function act(sim: Sim, id: Parameters<typeof begin>[2], maxTicks = 300): boolean {
  const q = queen(sim);
  const ok = begin(sim, q, id, null);
  stepUntil(sim, () => q.action === null, maxTicks);
  return ok;
}

describe.skipIf(!LONG)('the player path on a generated world (no stand-ins; temperature pinned warm only to keep the lapse short)', () => {
  it('walk to a good site, dig with dig-bite, seal with seal-entrance, lay with lay-egg, lapse, hand-over; the workers reopen the entrance and walk out', () => {
    const sim = newGame(SEEDS[0]);
    const bu = sim.world.bu;
    sim.enqueue({ type: 'openingSkipIntro' });
    stepUntil(sim, () => phase(sim) === 'search', 200);
    const site = goodSite(sim, 120);
    log('site', JSON.stringify(site), 'from', JSON.stringify(queen(sim).pos));
    expect(site.q).toBeGreaterThan(0);
    expect(walkTo(sim, site, 1.5, 6000)).toBe(true);
    navStop(sim, queen(sim));
    pinTemperature(sim, 25);
    const nest = nestOf(sim);
    const q = queen(sim);
    const dig = runFoundingDig(sim, q, nest, { x: q.fwd.x, z: q.fwd.z }, 30_000);
    log('dig', JSON.stringify(dig), 'phase', phase(sim), 'readiness', nest.founding?.readiness);
    widenCell(sim, 20_000);
    log('cell', phase(sim), 'readiness', nest.founding?.readiness);
    expect(phase(sim)).toBe('seal');
    // E at the shaft: up into the throat, hold seal-entrance (the founding rule puts soil in her mandibles)
    const e = cavityEntrances(sim, nest)[0];
    const face = plugInnerFace(sim, nest, e)!;
    expect(face).not.toBeNull();
    expect(walkTo(sim, face, 0.6, 3000)).toBe(true);
    const refused: string[] = [];
    sim.events.on('action-failed', (ev) => { if (ev.antId === q.id) refused.push(`${ev.action}:${ev.reason}`); });
    for (let i = 0; i < 8 && phase(sim) === 'seal'; i++) { act(sim, 'seal-entrance'); stepUntil(sim, () => false, 5); }
    log('seal', phase(sim), 'refused', refused.join(','));
    expect(phase(sim)).toBe('lay');
    const cell = nest.chambers.find((c) => c.type === 'founding')!;
    expect(walkTo(sim, { x: cell.center.x, y: cell.center.y - cell.radii.y * 0.5, z: cell.center.z }, 0.8, 3000)).toBe(true);
    for (let i = 0; i < 3; i++) act(sim, 'lay-egg');
    sim.tick();
    log('eggs', q.queen?.founding?.eggsLaid);
    expect(q.queen!.founding!.eggsLaid).toBeGreaterThanOrEqual(12);
    sim.enqueue({ type: 'openingBeginTimelapse' });
    stepUntil(sim, () => phase(sim) === 'handover' || phase(sim) === 'failed', 8 * TICKS_PER_DAY);
    log('handover', phase(sim), JSON.stringify(foundingView(sim)?.outcome));
    expect(phase(sim)).toBe('handover');
    const t0 = sim.state.tick;
    if (env?.env.FOUNDRESS_DEBUG) {
      sim.events.on('plan-created', (ev) => log('  plan+', ((sim.state.tick - t0) / TICKS_PER_DAY).toFixed(3), ev.kind, ev.planId));
      sim.events.on('entrance-state-changed', (ev) => log('  entr', ((sim.state.tick - t0) / TICKS_PER_DAY).toFixed(3), ev.prev, '>', ev.status));
      for (let i = 0; i < 10; i++) {
        stepUntil(sim, () => false, TICKS_PER_DAY / 10);
        for (const x of cavityEntrances(sim, nest)) {
          log('  t', ((sim.state.tick - t0) / TICKS_PER_DAY).toFixed(2), x.id, x.status, x.plugVoxelCount, 'soil', plugRemnants(sim, x, 'soil').length, 'ghost', plugRemnants(sim, x, 'ghost').length,
            'plans', JSON.stringify(nest.digPlans.filter((p) => p.source === 'founding').map((p) => [p.id, p.status, p.removedVolume.toFixed(2), p.slots.map((sl) => sl.antId)])));
        }
      }
    }
    stepUntil(sim, () => cavityEntrances(sim, nest).some((x) => x.status === 'open'), TICKS_PER_DAY);
    const openGd = (sim.state.tick - t0) / TICKS_PER_DAY;
    let outGd = -1;
    stepUntil(sim, () => {
      const out = sim.state.ants.some((a) => a.alive && isWorkerCaste(a.caste) && a.nestId < 0 && sim.field.height(a.pos.x, a.pos.z) - a.pos.y < 0.5 * bu
        && nest.entrances.every((x) => Math.hypot(a.pos.x - x.pos.x, a.pos.z - x.pos.z) > 3 * bu));
      if (out) outGd = (sim.state.tick - t0) / TICKS_PER_DAY;
      return out;
    }, 2 * TICKS_PER_DAY);
    log('reopened after', openGd.toFixed(3), 'GD; first worker out after', outGd.toFixed(3), 'GD; entrances', cavityEntrances(sim, nest).map((x) => `${x.status}:${x.plugVoxelCount}`).join(','));
    expect(cavityEntrances(sim, nest).map((x) => x.status)).toContain('open');
    expect(outGd).toBeGreaterThanOrEqual(0);
  }, 1_800_000);
});

/** cheat.completeFounding where the queen stands, real environment; outcome before winter. */
function outcome(sim: Sim): { ok: boolean; gd: number; workers: number; q: number } {
  sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
  stepUntil(sim, () => phase(sim) === 'timelapse', 4000);
  const t0 = sim.state.tick;
  const winter = () => currentSeason(sim.state) === 'winter';
  stepUntil(sim, () => phase(sim) !== 'timelapse' || winter(), 14 * TICKS_PER_DAY);
  const v = foundingView(sim);
  return { ok: phase(sim) === 'handover' || phase(sim) === 'done', gd: (sim.state.tick - t0) / TICKS_PER_DAY, workers: v?.outcome?.workers ?? 0, q: sim.state.player.opening!.siteQ };
}

describe.skipIf(!LONG)('founding outcome in the real environment (default start date, GDD 06 §5.11 / §5.15)', () => {
  it('generated worlds: at the start and at the nearest good site; test worlds: Summer 3 (default) vs Summer 2', () => {
    const rows: string[] = [];
    let ok = 0, n = 0;
    for (const seed of SEEDS) {
      const a = outcome(newGame(seed));
      const s2 = newGame(seed);
      const site = goodSite(s2, 300);
      s2.enqueue({ type: 'cheat.teleport', antId: queen(s2).id, pos: { x: site.x, y: site.y + 0.5 * s2.world.bu, z: site.z } });
      s2.tick();
      const b = outcome(s2);
      rows.push(`gen ${seed}: start ${a.ok ? 'ok' : 'FAIL'} ${a.gd.toFixed(2)} GD ${a.workers} w (Q ${a.q.toFixed(2)}); good site ${b.ok ? 'ok' : 'FAIL'} ${b.gd.toFixed(2)} GD ${b.workers} w (Q ${b.q.toFixed(2)})`);
      ok += (a.ok ? 1 : 0) + (b.ok ? 1 : 0); n += 2;
    }
    for (let seed = 1; seed <= 8; seed++) {
      const d3 = outcome(makeTestSim({ sizeBu: 128, seed }));
      const d2 = outcome(makeTestSim({ sizeBu: 128, seed, config: { startDayOfSeason: 2 } }));
      rows.push(`test ${seed}: Summer 3 ${d3.ok ? 'ok' : 'FAIL'} ${d3.gd.toFixed(2)} GD ${d3.workers} w; Summer 2 ${d2.ok ? 'ok' : 'FAIL'} ${d2.gd.toFixed(2)} GD ${d2.workers} w`);
    }
    for (const r of rows) log(r);
    log(`generated: ${ok} of ${n} reach the hand-over before winter`);
    expect(rows.length).toBe(SEEDS.length + 8);
  }, 3_600_000);
});
