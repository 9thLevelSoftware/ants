// Probe (opening-fix, integrator ruling 3 (a)): where the player's clutch goes in the lapse. Runs the headless opening
// (beats 04-12) and counts the founding colony's eggs laid, brood deaths by stage and cause, eclosions, with the tick
// and the lapse progress of each death; plus the queen's reserves and the cell temperature at a few points.
//   node tools/sim/run-ts.mjs tools/sim/probe/clutchProbe.ts <seed>
import { openingSim, runOpening } from '@/sim/colony/founding/playerOpeningKit';
declare const process: { stdout: { write(s: string): void } };

export default async function main(args: string[]): Promise<void> {
  const seed = Number(args[0] ?? 4);
  const out = (s: string) => process.stdout.write(s + '\n');
  const sim = openingSim(seed);
  let laid = 0, eclosed = 0;
  const deaths: Record<string, number> = {};
  const lines: string[] = [];
  let lapseStart = -1;
  sim.events.onAny((t0, e) => {
    const type = String(t0);
    const ev = (e ?? {}) as Record<string, unknown>;
    const op = sim.state.player.opening;
    if (op?.phase === 'timelapse' && lapseStart < 0) lapseStart = sim.state.tick;
    if (type === 'egg-laid') { laid++; lines.push(`  t ${sim.state.tick} egg-laid`); }
    if ((type === 'action-started' || type === 'action-failed' || type === 'action-ended' || type === 'action-cancelled') && ev.action === 'lay-egg') {
      const q = sim.stores.ants.get(ev.antId as number);
      lines.push(`  t ${sim.state.tick} ${String(type)} lay-egg ${ev.reason ?? ''} queen tb ${q?.tb?.toFixed(1)} dur ${q?.action?.durationTicks ?? '-'}`);
    }
    if (type === 'brood-stage' && ev.to === 'adult') eclosed++;
    if (type === 'ant-born' || type === 'eclosion') eclosed++;
    if (type === 'brood-died') {
      const k = `${ev.stage}:${ev.cause}`;
      deaths[k] = (deaths[k] ?? 0) + 1;
      const q = sim.stores.ants.get(sim.stores.colonies.get(sim.state.player.colonyId)?.queenId ?? -1);
      lines.push(`  t ${sim.state.tick} (+${lapseStart >= 0 ? sim.state.tick - lapseStart : -1}) phase ${op?.phase} brood ${ev.broodId} ${k} queen ${q?.queen?.founding ? JSON.stringify(q.queen.founding) : '-'}`);
    }
  });
  const { result } = runOpening({ seed, until: '12', afterTicks: 0 }, sim);
  out(`seed ${seed}: beats ${result.beats.slice(-1)} failure ${result.failure}`);
  out(`eggs laid ${laid}; eclosed/adult events ${eclosed}; deaths ${JSON.stringify(deaths)}; outcome ${JSON.stringify(result.checks.outcome ?? null)}`);
  for (const l of lines) out(l);
}
