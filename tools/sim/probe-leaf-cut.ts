// PROBE (species-leafcutter; delete before finishing): cut trips after the Atta hand-over (snapshot of probe-leaf-life).
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { defaultGameConfig } from '@/sim/createGame';
import type { ArchetypeId } from '@/sim/types';
import { navTo } from '@/sim/locomotion';
interface Fs { readFileSync(p: string): Uint8Array }
export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as Fs;
  const arch = (args[0] ?? 'suburban-garden') as ArchetypeId, seed = Number(args[1] ?? 1), ticks = Number(args[2] ?? 3000);
  const base = defaultGameConfig('atta-texana', seed, 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(`test-output/leaf/probe/${arch}-${seed}.bin`))).state, world);
  const col = sim.state.colonies[0];
  const n = sim.state.nests.find((x) => x.colony === col.id)!;
  console.log('entrances', JSON.stringify(n.entrances.map((e) => ({ s: e.status, p: e.pos }))), 'sites', JSON.stringify((col.fungus!.leafSites ?? []).map((x, i) => `${i}:${x.kind} ${x.pos.x.toFixed(0)},${x.pos.y.toFixed(1)},${x.pos.z.toFixed(0)} lu${x.lu.toFixed(1)} q${x.q.toFixed(2)} blocked${sim.navGrid.blocked(x.pos.x, x.pos.z)}`)));
  const e0 = n.entrances[0].pos; const out: { x: number; y: number; z: number }[] = [];
  console.log('paths', (col.fungus!.leafSites ?? []).map((x, i) => `${i}:${sim.navGrid.findPath({ x: e0.x + 3 * sim.world.bu, y: e0.y, z: e0.z }, x.pos, out) ? 'ok' : 'NO'} c${sim.navGrid.classAt(x.pos.x, x.pos.z)}`).join(' '), 'entrance cell', sim.navGrid.classAt(e0.x, e0.z), sim.navGrid.blocked(e0.x, e0.z));
  const fails: Record<string, number> = {};
  sim.events.on('action-failed', (e) => { const a = sim.stores.ants.get(e.antId); if (a?.state.startsWith('cut')) fails[`${e.action}:${e.reason}`] = (fails[`${e.action}:${e.reason}`] ?? 0) + 1; });
  const last = new Map<number, string>();
  for (let t = 0; t < ticks; t++) {
    sim.tick();
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col.id || !a.state.startsWith('cut')) { if (last.has(a.id) && !a.state.startsWith('cut')) { console.log(t, a.id, 'left cut ->', a.state, a.task); last.delete(a.id); } continue; }
      const k = `${a.state} n${a.nestId} ch${a.chamberId} ${a.carry.kind} ${a.nav.status} ${a.medium}`;
      if (last.get(a.id) !== k || t % 300 === 0) {
        console.log(t, a.id, k, `pos ${a.pos.x.toFixed(0)},${a.pos.y.toFixed(0)},${a.pos.z.toFixed(0)} site ${a.bb['at.site']} act ${a.action?.id ?? '-'} why ${(a.nav as unknown as { failReason?: string }).failReason ?? ''}`);
        last.set(a.id, k);
      }
    }
  }
  console.log('fails', JSON.stringify(fails), 'chain', JSON.stringify(col.fungus!.chain));
}
