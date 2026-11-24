// Probe (opening-fix): when water enters the player's nest during the opening (beats 04-10), and from where.
//   node tools/sim/run-ts.mjs tools/sim/probe/waterProbe.ts --seed 2 [--until 10]
import { runOpening, type Driver } from '@/sim/colony/founding/playerOpeningKit';
import { entranceInflow, seepageOf } from '@/sim/nest/flood/inflow';
declare const process: { stdout: { write(s: string): void } };
export default async function main(args: string[]): Promise<void> {
  const seed = Number(args[args.indexOf('--seed') + 1] ?? 2);
  const ui = args.indexOf('--until');
  const until = ui >= 0 ? args[ui + 1] : '10';
  const out = (s: string) => process.stdout.write(s + '\n');
  let lastW = 0, lastRain = -1;
  const onTick = (d: Driver) => {
    const sim = d.sim, n = sim.state.nests.find((x) => x.colony === sim.state.player.colonyId);
    const rain = sim.state.env.weather.rainRateMmH;
    if ((rain > 0) !== (lastRain > 0)) { out(`t ${sim.state.tick} rain ${rain.toFixed(2)} state ${sim.state.env.weather.state}`); lastRain = rain; }
    if (!n) return;
    const w = n.flood.water;
    if (Math.abs(w - lastW) > 1e-6 && (w > lastW)) {
      const parts = n.entrances.map((e) => { const f = entranceInflow(sim, e, -1, n); return `${e.id}:${e.status}:${e.plugVoxelCount}:q${f.q.toFixed(4)}:I${f.intensity.toFixed(2)}:c${f.catchment.toFixed(2)}:rim${f.rim.toFixed(2)}:st${f.state}`; });
      if (sim.state.tick % 20 === 0 || lastW === 0) out(`t ${sim.state.tick} phase ${d.phase()} w ${lastW.toFixed(3)} -> ${w.toFixed(3)} seep ${seepageOf(sim, n).toFixed(4)} fnd ${n.founding?.state} ${parts.join(' ')}`);
    }
    lastW = w;
  };
  const { result } = runOpening({ seed, until, afterTicks: 0, onTick });
  out(`result ${JSON.stringify(result.checks.seal)} ${result.failure}`);
}
