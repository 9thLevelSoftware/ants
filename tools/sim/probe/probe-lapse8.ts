// Colony-life round 8 (direction 15, the winter lapse regressed): replays the winter lapse from a winter-start snapshot
// (life.ts --until winter writes winter-<species>-<archetype>-<seed>.bin), so trees can be compared on the same state.
// Prints the lapse's inputs (workers, stores, the cluster's chambers and flood risk, the hazard alerts that lift the
// R24 cap) and the winter record Begin wrote (losses by cause, floods, stores before / after). Usage:
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-lapse8.ts SNAPSHOT ARCHETYPE SEED
import type { ArchetypeId, Colony } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { currentSeason, TICKS_PER_DAY } from '@/sim/time';
import { clusterOf } from '@/sim/colony/overwinter/climate';

const r2 = (x: number) => Math.round(x * 100) / 100;

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS] = args;
  const seed = Number(seedS);
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world);
  const col = sim.stores.colonies.get(sim.state.player.colonyId) as Colony;
  const life = (col as unknown as { lifecycle?: Record<string, unknown> }).lifecycle ?? {};
  const workers = sim.state.ants.filter((a) => a.alive && a.colony === col.id && a.caste !== 'queen' && a.caste !== 'gyne' && a.caste !== 'male');
  const cl = clusterOf(sim, col);
  const nestChambers = sim.state.nests.filter((n) => n.alive && n.colony === col.id).flatMap((n) => n.chambers);
  console.log(JSON.stringify({
    tick: sim.state.tick, day: r2(sim.state.tick / TICKS_PER_DAY), season: currentSeason(sim.state),
    workers: workers.length, agesOverLife: workers.map((a) => r2(a.physioAgeGd / a.lifespanGd)).sort(),
    storesC: r2(col.stores.c), storesP: r2(col.stores.p),
    cluster: { ids: cl.chambers.map((c) => c.id), depthMm: r2(cl.depthMm), tNow: r2(cl.tNow), humidity: r2(cl.humidity), floodSafety: r2(cl.floodSafety) },
    chambers: nestChambers.map((c) => ({ id: c.id, type: c.type, depthMm: r2(c.depthMm), floodRisk: r2(c.floodRisk), flooded: r2(c.flooded), wetUntil: c.wetUntilTick })),
    hazardAlertTicks: life.hazardAlertTicks ?? null,
    alertsNow: sim.state.progression.alerts.map((a) => `${a.kind}@${a.level}`),
  }));
  const winters0 = ((life.winters as unknown[]) ?? []).length;
  let t = 0;
  for (; t < 5 * TICKS_PER_DAY; t++) {
    sim.tick();
    const ws = ((col as unknown as { lifecycle?: { winters?: unknown[] } }).lifecycle?.winters ?? []);
    if (ws.length > winters0) break;
  }
  const ws = ((col as unknown as { lifecycle?: { winters?: Record<string, unknown>[] } }).lifecycle?.winters ?? []);
  const rec = ws[ws.length - 1];
  if (!rec || ws.length === winters0) { console.log(JSON.stringify({ begin: 'not reached', ticks: t })); return; }
  const days = (rec.days as { flood: boolean; workers: number; rainMm: number }[]) ?? [];
  console.log(JSON.stringify({
    beginAfterTicks: t, workers0: rec.workers0, workers1: rec.workers1, losses: rec.losses, broodLosses: rec.broodLosses,
    floods: rec.floods, floodDays: days.map((d, i) => (d.flood ? i : -1)).filter((i) => i >= 0),
    heaviestRainMm: rec.heaviestRainMm, c0: rec.c0, c1: rec.c1, queenAlive: rec.queenAlive, queenCause: rec.queenCause,
  }));
}
