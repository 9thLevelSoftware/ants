// Probe (opening-fix, item 6): beat 13 -> 14 of firstplay.mjs headless on a small founding's hand-over snapshot. Run
// until the entrance is open, spawn the script's sugar spill 22 BU from the entrance, wait 9000 ticks for a trail, then
// place a forage marker on it and wait 9000 more; log the workers' tasks, known sources and deliveries every 1500.
//   node tools/sim/run-ts.mjs tools/sim/probe/trailProbe.ts <snapshot.bin>
import { restore } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import type { Command } from '@/sim/types';
declare const process: { stdout: { write(s: string): void } };

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const { state } = restore(new Uint8Array(fs.readFileSync(args[0])));
  const sim = createSim(state, generateWorld(state.config.world));
  const out = (s: string) => process.stdout.write(s + '\n');
  const col = sim.state.player.colonyId, bu = sim.world.bu;
  const nest = () => sim.state.nests.find((x) => x.colony === col)!;
  const cmd = (c: Command) => { sim.enqueue(c); sim.applyPendingCommands(); sim.events.flush(); };
  let trailEv = 0, deliveries = 0, layOn = 0, collects = 0;
  sim.events.onAny((type, e) => {
    const ev = (e ?? {}) as { action?: string; actionId?: string; antId?: number };
    if (String(type) === 'action-started' && (ev.action === 'lay-trail' || ev.actionId === 'lay-trail')) layOn++;
    if (String(type) === 'action-started' && ev.action === 'harvest-liquid') collects++;
  });
  sim.events.onAny((type) => { if (type === 'trail-established') trailEv++; if (String(type).includes('deliver')) deliveries++; });
  for (let i = 0; i < 4000 && !nest().entrances.some((e) => e.status === 'open'); i++) sim.tick();
  if (sim.state.player.possessedAntId !== -1) cmd({ type: 'release', reason: 'player' } as Command);
  const ent = nest().entrances.find((e) => e.status === 'open') ?? nest().entrances[0];
  let spot: { x: number; y: number; z: number } | null = null;
  for (let k = 0; k < 16 && !spot; k++) {
    const th = 0.7 + (k * Math.PI) / 8, x = ent.pos.x + Math.cos(th) * 22 * bu, z = ent.pos.z + Math.sin(th) * 22 * bu, y = sim.field.height(x, z);
    if (!sim.field.primAt({ x, y: y + 0.5 * bu, z }, bu)) spot = { x, y, z };
  }
  out(`t ${sim.state.tick} open ${ent.status} spot ${JSON.stringify(spot)}`);
  cmd({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugary-spill', pos: spot!, units: 400, stage: null } as Command);
  const food = sim.state.sources.filter((s) => Math.hypot(s.pos.x - spot!.x, s.pos.z - spot!.z) < 3 * bu)[0];
  out(`food ${food?.id} at ${food ? Math.round(Math.hypot(food.pos.x - ent.pos.x, food.pos.z - ent.pos.z)) : -1} mm`);
  const trailStats = () => {
    let n = 0, max = 0;
    sim.phero.forEachActiveCell?.call(sim.phero, col, 'trail', (_x: number, _y: number, _z: number, v: number) => { n++; if (v > max) max = v; });
    const mid = { x: (ent.pos.x + food.pos.x) / 2, y: (ent.pos.y + food.pos.y) / 2, z: (ent.pos.z + food.pos.z) / 2 };
    return `trailCells ${n} max ${max.toFixed(3)} mid ${sim.phero.sample(col, 'trail', mid).toFixed(4)} layOn ${layOn} collect ${collects}`;
  };
  const show = () => {
    const c = sim.stores.colonies.get(col)!;
    out('  ' + trailStats());
    const tasks: Record<string, number> = {};
    for (const a of sim.state.ants) if (a.alive && a.colony === col && a.caste === 'worker') { const k = `${a.task}/${a.state}`; tasks[k] = (tasks[k] ?? 0) + 1; }
    out(`t ${sim.state.tick} trailEv ${trailEv} deliv ${deliveries} known ${JSON.stringify(c.knownSourceIds)} foodKnown ${c.knownSourceIds.includes(food?.id ?? -1)} hour ${((sim.state.tick % 6000) / 250).toFixed(1)} tasks ${JSON.stringify(tasks)}`);
  };
  for (let t = 0; t < 9000; t += 1500) { for (let i = 0; i < 1500; i++) sim.tick(); show(); }
  cmd({ type: 'placeMarker', kind: 'forage', pos: food.pos } as Command);
  out(`marker placed: ${sim.state.markers?.length ?? '?'}`);
  for (let t = 0; t < 9000; t += 1500) { for (let i = 0; i < 1500; i++) sim.tick(); show(); }
}
