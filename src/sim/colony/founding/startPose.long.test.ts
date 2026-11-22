// Colony-life round 9 (direction 20 item 1): the founding a first-time player gets. For seeds 1-5 of each Tier 1
// archetype, a new game is founded the way the browser's first-play script does it: the queen digs where the game
// puts her (sweepKit playerCase at the start pose: the scripted player's dig, one press of E to seal), walks on down
// the shaft, lays four batches with lay-egg and presses "Tend the brood"; a relay clutch after a total loss is laid
// the same way. The run goes through the lapse and the hand-over until a first worker is out on the surface.
//
// Required (per archetype, direction 20.1's bar as direction 23 item 4 restates it): every start pose seals (the
// scripted player's one press of E; a seal that never closes is a defect of the guide, not a hazard of the site:
// SG1-SG3 of round 9 took 3 of 25 start poses from "no seal" to sealed, so reverting one of them fails here), and
// >= 4 of 5 start poses hand over with a worker out on the surface, whatever the site grade.
// Poor: the designed rate. GDD 06 §5.12 caps the brood hazard at mu 0.6 / GD; over the ~4.2 GD of a lapse an egg
// survives with p >= e^(-0.6 x 4.2) = 0.08, so a 24-egg clutch gives no worker with probability <= 0.92^24 = 0.14:
// the design promises first workers on >= 86 % of Poor starts; asserted on the Poor cases pooled over the archetypes
// run, from 5 Poor cases on.
//
//   FOUNDRESS_LONG=1 npx vitest run src/sim/colony/founding/startPose.long.test.ts
//   FOUNDRESS_ARCHETYPES=suburban-garden,woodland-edge FOUNDRESS_SEEDS=1,2,3,4,5 (defaults: all five Tier 1, seeds 1-5)
// About 2 min of CPU per founding; one archetype per process is the intended use (its worlds stay in memory).
import { describe, expect, it } from 'vitest';
import type { ArchetypeId, Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { isWorkerCaste } from '../census';
import { assessSite } from './siteAssess';
import { TIER1_ARCHETYPES, generatedWorld, playerCase, sweepSim } from './sweepKit';
import { nestOf, phase, queen, stepUntil } from './testkit';

const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined>; stderr: { write(s: string): void } } }).process;
const LONG = !!env?.env.FOUNDRESS_LONG;
const ARCHETYPES = (env?.env.FOUNDRESS_ARCHETYPES?.split(',') ?? TIER1_ARCHETYPES) as ArchetypeId[];
const SEEDS = (env?.env.FOUNDRESS_SEEDS ?? '1,2,3,4,5').split(',').map(Number);
const log = (...a: unknown[]) => env?.stderr.write(`[startPose.long] ${a.join(' ')}\n`);

/** How deep the script walks the queen down the shaft before laying (tests/e2e/firstplay.mjs SHAFT_DEPTH_BU - 1). */
const LAY_DEPTH_BU = 8;
/** How long after the hand-over a first worker must be out on the surface, GD. */
const OUT_WITHIN_GD = 1.5;

/** The script's clutch: four batches of lay-egg held 50 ticks. */
function layFourBatches(sim: Sim): void {
  for (let b = 0; b < 4 && phase(sim) === 'lay'; b++) {
    sim.enqueue({ type: 'action', actionId: 'lay-egg', phase: 'start' });
    stepUntil(sim, () => false, 50);
    sim.enqueue({ type: 'action', actionId: 'lay-egg', phase: 'stop' });
    stepUntil(sim, () => false, 5);
  }
}

/** A worker of the player colony out on the surface, at least 3 BU from every entrance of its nest. */
function workerOutside(sim: Sim): boolean {
  const nest = nestOf(sim), bu = sim.world.bu;
  return sim.state.ants.some((a) => a.alive && a.colony === nest.colony && isWorkerCaste(a.caste) && a.nestId < 0
    && sim.field.height(a.pos.x, a.pos.z) - a.pos.y < 0.5 * bu
    && nest.entrances.every((e) => Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z) > 3 * bu));
}

interface Case { arch: ArchetypeId; seed: number; word: string; q: number; end: string; workers: number; out: boolean; note: string }

function foundAtStart(arch: ArchetypeId, seed: number): Case {
  const { world, config } = generatedWorld(arch, seed);
  const sim = sweepSim(world, config);
  const q = queen(sim), bu = sim.world.bu;
  const read = assessSite(sim, { ...q.pos });
  const c: Case = { arch, seed, word: read.word, q: Math.round(read.q * 100) / 100, end: '', workers: 0, out: false, note: '' };
  const seal = playerCase(sim, null, true);
  c.note = seal.template ? 'dig by template' : '';
  if (phase(sim) !== 'lay') { c.end = `no seal (${phase(sim)})`; return c; }
  // on down the shaft, along her heading, as the script walks her
  const h = Math.hypot(q.fwd.x, q.fwd.z) || 1, intent = sim.state.player.intent;
  const depth = () => (sim.field.height(q.pos.x, q.pos.z) - q.pos.y) / bu;
  for (let i = 0; i < 40 && depth() < LAY_DEPTH_BU; i++) { intent.dir.x = q.fwd.x / h; intent.dir.z = q.fwd.z / h; stepUntil(sim, () => false, 3); }
  intent.dir.x = 0; intent.dir.z = 0;
  for (let clutch = 0; clutch < 2 && phase(sim) === 'lay'; clutch++) {
    layFourBatches(sim);
    if (phase(sim) === 'lay') sim.enqueue({ type: 'openingBeginTimelapse' });
    sim.tick();
    stepUntil(sim, () => ['handover', 'done', 'failed', 'lay'].includes(phase(sim)), 8 * TICKS_PER_DAY);
  }
  c.end = phase(sim);
  if (c.end !== 'handover' && c.end !== 'done') return c;
  c.workers = sim.state.ants.filter((a) => a.alive && a.colony === q.colony && isWorkerCaste(a.caste)).length;
  stepUntil(sim, () => workerOutside(sim), OUT_WITHIN_GD * TICKS_PER_DAY);
  c.out = workerOutside(sim);
  if (!c.out) c.note += ` entrances ${nestOf(sim).entrances.map((e) => `${e.status}:${e.plugVoxelCount}`).join(',')}`;
  return c;
}

const FAIR_OR_BETTER = new Set(['fair', 'good', 'excellent']);

describe.skipIf(!LONG)('the founding at the start pose (first-play script), seeds 1-5 of each Tier 1 archetype', () => {
  const poor: Case[] = [];
  for (const arch of ARCHETYPES) {
    it(`${arch}: every start pose seals, >= 4 of 5 hand over with a worker out`, () => {
      const cases = SEEDS.map((seed) => {
        const c = foundAtStart(arch, seed);
        log(JSON.stringify(c));
        return c;
      });
      poor.push(...cases.filter((c) => !FAIR_OR_BETTER.has(c.word)));
      const ok = cases.filter((c) => c.out).length;
      log(`${arch}: ${ok} of ${cases.length} start poses got workers out (Fair or better ${cases.filter((c) => FAIR_OR_BETTER.has(c.word)).length})`);
      expect(cases.filter((c) => c.end.startsWith('no seal')).map((c) => `seed ${c.seed}: ${c.end}`)).toEqual([]);
      expect(ok).toBeGreaterThanOrEqual(Math.ceil(0.8 * cases.length));
    }, 3_600_000);
  }
  it('Poor starts: first workers out on >= 86 % (the design rate)', () => {
    const ok = poor.filter((c) => c.out).length;
    log(`Poor: ${ok} of ${poor.length}`);
    if (poor.length >= 5) expect(ok / poor.length).toBeGreaterThanOrEqual(0.86);
  });
});
