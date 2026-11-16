// The opening on GENERATED worlds (FOUNDRESS_LONG=1; several minutes): the player path through the real primitives
// and the real founding code, and the founding outcome in the real environment over seeds. Numbers go to stderr.
//   FOUNDRESS_LONG=1 FOUNDRESS_SEEDS=1 npx vitest run src/sim/colony/founding/generated.long.test.ts
// FOUNDRESS_SEEDS=a,b,c chooses the generated seeds (default 1,2,3 for the player path, 1-8 for the outcome); one
// seed per process is the intended use (one generated world in memory). FOUNDRESS_NO_FLOOD=1 leaves out the nest
// flood system (weather-fix2's dry-weather drowning, L12) while it still reproduces.
import { describe, expect, it } from 'vitest';
import type { Sim, WorldData } from '@/sim/types';
import { begin } from '@/sim/ants';
import { navTo } from '@/sim/locomotion';
import { defaultGameConfig } from '@/sim/createGame';
import { TICKS_PER_DAY, calendarTick, currentSeason, daysPerYear, seasonLengthOf } from '@/sim/time';
import { requireSpecies } from '@/sim/species';
import { generateWorld } from '@/worldgen';
import { isWorkerCaste } from '../census';
import { cavityEntrances } from './dig';
import { plugRemnants } from './reopen';
import { foundingView } from './view';
import { goodSite, goodSites, playerCase, sealHeldThrough, sweepSim } from './sweepKit';
import { nestOf, phase, pinTemperature, queen, stepUntil } from './testkit';

const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined>; stderr: { write(s: string): void } } }).process;
const LONG = !!env?.env.FOUNDRESS_LONG;
const SEEDS = (env?.env.FOUNDRESS_SEEDS ?? '1,2,3').split(',').map(Number);
const NO_FLOOD = !!env?.env.FOUNDRESS_NO_FLOOD;
/** Good sites the scripted player tries, nearest first, when her dig never starts at one. */
const PLAYER_SITE_TRIES = 4;
const log = (...a: unknown[]) => env?.stderr.write(`[founding.long] ${a.join(' ')}\n`);

const worlds = new Map<number, WorldData>();
function newGame(seed: number): Sim {
  const cfg = { ...defaultGameConfig('lasius-niger', seed), cheats: true };
  let world = worlds.get(seed);
  if (!world) { world = generateWorld(cfg.world); worlds.set(seed, world); }
  return sweepSim(world, cfg, { noFlood: NO_FLOOD });
}

function walkTo(sim: Sim, p: { x: number; y: number; z: number }, tolBu: number, maxTicks: number): boolean {
  const q = queen(sim);
  if (!navTo(sim, q, p, tolBu * sim.world.bu)) return false;
  stepUntil(sim, () => q.nav.status !== 'moving', maxTicks);
  return q.nav.status === 'arrived';
}

function act(sim: Sim, id: Parameters<typeof begin>[2], maxTicks = 300): boolean {
  const q = queen(sim);
  const ok = begin(sim, q, id, null);
  stepUntil(sim, () => q.action === null, maxTicks);
  return ok;
}

describe.skipIf(!LONG)('the player path on a generated world (no stand-ins; temperature pinned warm only to keep the lapse short)', () => {
  it('walk to a good site, dig with dig-bite, seal with one E press (seal-entrance), lay with lay-egg, lapse, hand-over; the workers reopen the entrance and walk out', () => {
    const sim = newGame(SEEDS[0]);
    const bu = sim.world.bu;
    const sites = goodSites(sim, 120, PLAYER_SITE_TRIES, 12);
    log('sites', JSON.stringify(sites), 'from', JSON.stringify(queen(sim).pos));
    expect(sites.length).toBeGreaterThan(0);
    pinTemperature(sim, 25);
    const nest = nestOf(sim);
    const q = queen(sim);
    // the browser player's dig and one press of E in the cell; the founding guide seals with seal-entrance. Where the
    // scripted digger gets no bite in, she walks on to the next good site, as a player would (never the template)
    let seal = playerCase(sim, sites[0], false);
    for (let i = 1; i < sites.length && seal.stage === 'dig' && phase(sim) === 'search'; i++) {
      log('no dig at site', i - 1, '- next site');
      seal = playerCase(sim, sites[i], false);
    }
    log('seal', JSON.stringify(seal));
    expect(seal.ok).toBe(true);
    expect(seal.refusals).not.toContain('no-target');
    // no stand-ins: the cell was dug by the scripted player's own bites, not carved by the cheat's template
    expect(seal.template).toBe(false);
    expect(phase(sim)).toBe('lay');
    sim.enqueue({ type: 'release', reason: 'player' });
    sim.tick();
    const cell = nest.chambers.find((c) => c.type === 'founding')!;
    expect(walkTo(sim, { x: cell.center.x, y: cell.center.y - cell.radii.y * 0.5, z: cell.center.z }, 0.8, 3000)).toBe(true);
    for (let i = 0; i < 3; i++) act(sim, 'lay-egg');
    sim.tick();
    log('eggs', q.queen?.founding?.eggsLaid);
    expect(q.queen!.founding!.eggsLaid).toBeGreaterThanOrEqual(12);
    sim.enqueue({ type: 'openingBeginTimelapse' });
    // sealed and staying sealed through the whole lapse, not only at its start
    const lost = sealHeldThrough(sim, () => phase(sim) !== 'lay' && phase(sim) !== 'timelapse', 8 * TICKS_PER_DAY, 100);
    log('handover', phase(sim), JSON.stringify(foundingView(sim)?.outcome), 'seal through the lapse:', lost ?? 'held');
    expect(lost).toBeNull();
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

/**
 * The passive opening where the queen stands (cheat.completeFounding: the founding template carved there, the real
 * seal by the guide, the colony's own laying, the lapse in the real environment). Margin: game days from the
 * hand-over to the first day of autumn (>= 1.0 wanted: hand-over no later than the start of the last summer day).
 */
function outcome(sim: Sim): { ok: boolean; gd: number; workers: number; q: number; margin: number; phase: string; lost: string | null } {
  sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
  stepUntil(sim, () => phase(sim) === 'timelapse' || phase(sim) === 'failed', 8000);
  const t0 = sim.state.tick;
  const winter = () => currentSeason(sim.state) === 'winter';
  // the seal must hold through the whole lapse
  const lost = phase(sim) === 'timelapse' ? sealHeldThrough(sim, () => phase(sim) !== 'timelapse' || winter(), 14 * TICKS_PER_DAY, 200) : null;
  const v = foundingView(sim);
  const L = seasonLengthOf(sim.state.config);
  const dayNow = (calendarTick(sim.state) / TICKS_PER_DAY) % daysPerYear(sim.state.config);
  return {
    ok: phase(sim) === 'handover' || phase(sim) === 'done', gd: (sim.state.tick - t0) / TICKS_PER_DAY, workers: v?.outcome?.workers ?? 0,
    q: sim.state.player.opening!.siteQ, margin: 2 * L - dayNow, phase: phase(sim), lost,
  };
}

const range = requireSpecies('lasius-niger').opening.expectedFirstWorkers;
/**
 * The chapter's range for the cheat's 24-egg clutch: 8-16 (GDD 06 §5.12 "typical", Q 0.55-0.8); an excellent site
 * (Q >= 0.85) may give up to the clutch-24 row's p90 at Q 0.9, 19.
 */
const maxFor = (q: number) => (q >= 0.85 ? 19 : range.max);
const fmt = (o: ReturnType<typeof outcome>) => `${o.ok ? 'ok' : `FAIL(${o.phase})`} lapse ${o.gd.toFixed(2)} GD, ${o.workers} workers, margin ${o.margin.toFixed(2)} GD (Q ${o.q.toFixed(2)})${o.lost ? `, ${o.lost}` : ''}`;
const accepted = (o: ReturnType<typeof outcome>) => o.ok && !o.lost && o.workers >= range.min && o.workers <= maxFor(o.q) && o.margin >= 1.0;

describe.skipIf(!LONG)('founding outcome in the real environment (default start date, GDD 06 §5.11 / §5.15)', () => {
  it('generated worlds 1-8, default start: hand-over in the chapter range with >= 1 GD before autumn', () => {
    const rows: string[] = [];
    let good = 0;
    const seeds = env?.env.FOUNDRESS_SEEDS ? SEEDS : [1, 2, 3, 4, 5, 6, 7, 8];
    for (const seed of seeds) {
      const a = outcome(newGame(seed));
      const s2 = newGame(seed);
      const site = goodSite(s2, 300);
      s2.enqueue({ type: 'cheat.teleport', antId: queen(s2).id, pos: { x: site.x, y: site.y + 0.5 * s2.world.bu, z: site.z } });
      s2.tick();
      const b = outcome(s2);
      if (accepted(b) || accepted(a)) good++;
      rows.push(`gen ${seed}: start ${fmt(a)}; nearest good site ${fmt(b)}`);
      log(rows[rows.length - 1]);
      worlds.clear(); // one generated world in memory at a time
    }
    log(`accepted (start or nearest good site): ${good} of ${seeds.length}; range ${range.min}-${range.max} (to 19 at Q >= 0.85)`);
    expect(good).toBe(seeds.length);
  }, 3_600_000);
});
