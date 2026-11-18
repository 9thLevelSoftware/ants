// Colony-life round 8 (direction 15, the browser's first-play founding failure on seed 2): the real founding without a
// browser. A new game on ARCHETYPE / SEED, the queen digs with the real dig-bite and seals with E where she stands
// (site "start") or at the nearest good map cell (site "good"), lays the first clutch in batches as tests/e2e/firstplay
// does (lay-egg held 50 ticks, 4 batches), optionally waits WAIT ticks first (the browser's real-time waits), then
// runs the time-lapse to the hand-over or the failure. Logs the site reading, every brood death (cause, stage,
// chamber, depth, lapse progress) and the founding hazards. Usage:
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-found8.ts ARCHETYPE SEED [start|good] [WAIT]
import type { ArchetypeId } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { assessSite } from '@/sim/colony/founding/siteAssess';
import { generatedWorld, goodSite, playerCase, sweepSim } from '@/sim/colony/founding/sweepKit';
import { nestOf, phase, queen, stepUntil } from '@/sim/colony/founding/testkit';
import { chamberAtIn } from '@/sim/nest/chambers/registry';

const r2 = (x: number) => Math.round(x * 100) / 100;

export default async function main(args: string[]): Promise<void> {
  const [arch, seedS, where = 'start', waitS = '0'] = args;
  const { world, config } = generatedWorld(arch as ArchetypeId, Number(seedS));
  const sim = sweepSim(world, config);
  const bu = sim.world.bu;
  const q = queen(sim);
  const start = { ...q.pos };
  const site = where === 'good' ? goodSite(sim, 120) : null;
  const read = assessSite(sim, site ?? start);
  console.log(JSON.stringify({ start: { x: r2(start.x), z: r2(start.z) }, site, reading: { q: r2(read.q), word: read.word, factors: read.factors.map(r2), raw: read.raw } }));
  const deaths: Record<string, unknown>[] = [];
  const colId = q.colony;
  // last known place of each of the player's brood (a dead brood is gone from the store when the event arrives)
  const lastAt = new Map<number, { ch: number; depthBu: number }>();
  const note = () => {
    for (const b of sim.state.brood) if (b.alive && b.colony === colId) lastAt.set(b.id, { ch: b.chamberId, depthBu: r2((sim.field.height(b.pos.x, b.pos.z) - b.pos.y) / bu) });
  };
  sim.events.on('brood-died', (e) => {
    if (e.colonyId !== colId) return;
    deaths.push({ t: sim.state.tick, cause: e.cause, stage: e.stage, ...lastAt.get(e.broodId),
      lapseP: sim.state.player.timelapse ? r2(sim.state.player.timelapse.progress) : null });
  });
  const track: Record<string, unknown>[] = [];
  const sample = () => {
    const f = q.queen?.founding as unknown as { desiccation?: number; reserveLoads?: number } | undefined;
    track.push({ t: sim.state.tick, ph: phase(sim), qDepthBu: r2((sim.field.height(q.pos.x, q.pos.z) - q.pos.y) / bu), qCh: q.chamberId, qNest: q.nestId, medium: q.medium, regCh: chamberAtIn(sim, nestOf(sim), q.pos)?.id ?? -1, opCh: (sim.state.player.opening as unknown as { chamberId?: number } | null)?.chamberId ?? null,
      desicc: r2(f?.desiccation ?? -1), reserve: r2(f?.reserveLoads ?? -1), hp: r2(q.hp), brood: sim.state.brood.filter((b) => b.alive && b.colony === colId).length,
      lapseP: sim.state.player.timelapse ? r2(sim.state.player.timelapse.progress) : null });
  };
  const seal = playerCase(sim, site, true);
  const nest = nestOf(sim);
  console.log(JSON.stringify({ seal: { ok: seal.ok, phase: seal.phase, note: seal.note, template: seal.template }, tick: sim.state.tick,
    chambers: nest.chambers.map((c) => ({ id: c.id, type: c.type, depthBu: r2(c.depthMm / bu), volBu3: r2((c as unknown as { volumeBu3?: number }).volumeBu3 ?? -1) })),
    origin: nest.origin, queenDepthBu: r2((sim.field.height(q.pos.x, q.pos.z) - q.pos.y) / bu), queenChamber: q.chamberId }));
  stepUntil(sim, () => false, Number(waitS));
  let laid = 0;
  sim.events.on('egg-laid', () => laid++);
  for (let b = 0; b < 4 && phase(sim) === 'lay'; b++) {
    sim.enqueue({ type: 'action', actionId: 'lay-egg', phase: 'start' });
    stepUntil(sim, () => false, 50);
    sim.enqueue({ type: 'action', actionId: 'lay-egg', phase: 'stop' });
    stepUntil(sim, () => false, 5);
  }
  for (let k = 0; k < 120 && phase(sim) === 'lay'; k++) {
    sim.enqueue({ type: 'action', actionId: 'lay-egg', phase: 'start' });
    stepUntil(sim, () => false, 50);
    sim.enqueue({ type: 'action', actionId: 'lay-egg', phase: 'stop' });
    stepUntil(sim, () => false, 30);
  }
  note();
  const eggs = sim.state.brood.filter((b) => b.alive);
  console.log(JSON.stringify({ afterLay: phase(sim), laid, tick: sim.state.tick,
    eggs: eggs.filter((b) => b.colony === colId).map((b) => ({ ch: b.chamberId, depthBu: r2((sim.field.height(b.pos.x, b.pos.z) - b.pos.y) / bu) })) }));
  const t0 = sim.state.tick;
  stepUntil(sim, () => { if (sim.state.tick % 10 === 0) note(); if (sim.state.tick % 300 === 0) sample(); return ['handover', 'done', 'failed'].includes(phase(sim)); }, 6 * TICKS_PER_DAY);
  const op = sim.state.player.opening as unknown as { hazardLog?: unknown[]; lapse?: { outcome?: string } } | null;
  console.log(JSON.stringify({ end: phase(sim), gd: r2((sim.state.tick - t0) / TICKS_PER_DAY), outcome: op?.lapse?.outcome ?? null,
    hazards: op?.hazardLog ?? null, deaths, workers: sim.state.ants.filter((a) => a.alive && a.colony === colId && a.caste === 'worker').length }));
  for (const x of track) console.log(JSON.stringify(x));
}
