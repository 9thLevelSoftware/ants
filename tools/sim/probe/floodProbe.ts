// Probe (opening-fix): the headless opening up to the clutch, then the lapse tick by tick recording the player nest's
// water, inflow per entrance and seepage, the entrances' status, rain at the site.
//   node tools/sim/run-ts.mjs tools/sim/probe/floodProbe.ts --seed 2
import { runOpening } from '@/sim/colony/founding/playerOpeningKit';
import { entranceInflow, seepageOf, intensityAt } from '@/sim/nest/flood/inflow';
declare const process: { stdout: { write(s: string): void } };
export default async function main(args: string[]): Promise<void> {
  const seed = Number(args[args.indexOf('--seed') + 1] ?? 2);
  const { driver: d } = runOpening({ seed, until: '10', afterTicks: 0 });
  const sim = d.sim;
  const out = (s: string) => process.stdout.write(s + '\n');
  const n0 = d.nest();
  out(`after clutch tick ${sim.state.tick} entrances ${JSON.stringify(n0.entrances.map((e) => ({ id: e.id, st: e.status, pos: e.pos, r: e.radius, plug: e.plugVoxelCount, mound: e.moundId })))}`);
  out(`chambers ${JSON.stringify(n0.chambers.map((c) => ({ id: c.id, t: c.type, c: c.center })))} founding ${JSON.stringify(n0.founding)}`);
  d.command({ type: 'openingBeginTimelapse' } as never);
  let last = '';
  for (let i = 0; i < 40000 && d.phase() === 'timelapse'; i++) {
    d.step(1);
    const n = d.nest();
    if (i % 100 !== 0) continue;
    const parts = n.entrances.map((e) => { const f = entranceInflow(sim, e, -1, n); return `${e.id}:${e.status}:${e.plugVoxelCount}:q${f.q.toFixed(4)}:st${f.state}`; });
    const qn = sim.stores.ants.get(sim.stores.colonies.get(sim.state.player.colonyId)?.queenId ?? -1);
    const br = sim.state.brood.filter((b) => b.alive && b.colony === sim.state.player.colonyId);
    const line = `q ${qn ? `${qn.pos.x.toFixed(1)},${qn.pos.y.toFixed(1)},${qn.pos.z.toFixed(1)} hp ${qn.hp.toFixed(2)}` : 'dead'} lvl ${n.flood.level.toFixed(2)} brood ${br.length} ys ${br.slice(0, 3).map((b) => b.pos.y.toFixed(1)).join('/')} w ${n.flood.water.toFixed(3)} seep ${seepageOf(sim, n).toFixed(4)} I ${intensityAt(sim, n.entrances[0]?.pos ?? n.origin).toFixed(2)} ${parts.join(' ')} fnd ${n.founding?.state}`;
    if (line !== last && (i % 100 === 0 || n.flood.water > 0)) { out(`t ${sim.state.tick} ${line}`); last = line; }
  }
  out(`end phase ${d.phase()} tick ${sim.state.tick} lapse ${JSON.stringify(sim.state.player.opening?.lapse)} hazards ${JSON.stringify(sim.state.player.opening?.hazardLog.slice(-5))}`);
  out(`deaths ${JSON.stringify(sim.state.progression.deaths.recent.slice(-5))}`);
  out(`events ${JSON.stringify(d.log.filter((e) => e.type.startsWith('opening') || e.type.includes('flood') || e.type.includes('brood')).slice(-30).map((e) => [e.tick, e.type, e.ev]))}`);
  out(`entrances ${JSON.stringify(d.nest().entrances.map((e) => ({ id: e.id, st: e.status, pos: e.pos, plug: e.plugVoxelCount })))}`);
}
