// Probe (opening-fix, R14): why a digger from the cell leaves dig.unplug at once (seed-4 hand-over, ant 8451 at +75).
//   node tools/sim/run-ts.mjs tools/sim/probe/unplugStand.ts <snapshot.bin> <antId> <fromTick> <ticks>
import { restore } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { UNPLUG_STAND_BU } from '@/sim/balance/nestwork';
declare const process: { stdout: { write(s: string): void } };
export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const { state } = restore(new Uint8Array(fs.readFileSync(args[0])));
  const sim = createSim(state, generateWorld(state.config.world));
  const id = Number(args[1]), from = Number(args[2]), n = Number(args[3]);
  const out = (s: string) => process.stdout.write(s + '\n');
  for (let i = 0; i < from; i++) sim.tick();
  const col = sim.state.player.colonyId;
  const e = sim.state.nests.find((x) => x.colony === col)!.entrances[0];
  const bu = sim.world.bu, inside = e.radius + UNPLUG_STAND_BU * bu;
  const stand = { x: e.pos.x - e.dir.x * inside, y: e.pos.y - e.dir.y * inside, z: e.pos.z - e.dir.z * inside };
  out(`entrance pos ${JSON.stringify(e.pos)} dir ${JSON.stringify(e.dir)} r ${e.radius} bu ${bu} stand ${JSON.stringify(stand)} f(stand) ${sim.field.sample(stand).toFixed(3)} navComp(stand) ${sim.nestNav.componentAt(stand)}`);
  for (let i = 0; i < n; i++) {
    sim.tick();
    const a = sim.stores.ants.get(id)!;
    out(`+${from + i + 1} ${a.task}/${a.state} act ${a.action?.id ?? '-'} nav ${a.nav.status} ${a.nav.failReason ?? ''} mode ${a.nav.mode} uu ${a.bb['bn.uu'] ?? '-'} uf ${a.bb['bn.uf'] ?? '-'} pos ${[a.pos.x, a.pos.y, a.pos.z].map((v) => v.toFixed(1)).join(',')} comp ${sim.nestNav.componentAt(a.pos)}`);
  }
}
