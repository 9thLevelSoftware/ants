// Probe (opening-fix): restore a hand-over snapshot of tools/sim/opening.ts (--save-handover) and log the founding
// nest's reopening every N ticks: entrances, founding plans, the colony's ants (task, state, action, nav, carry).
//   node tools/sim/run-ts.mjs tools/sim/probe/reopenProbe.ts <snapshot.bin> [ticks] [every]
import { restore } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import type { Sim } from '@/sim/types';
import { ti } from '@/sim/colony/taskIdx';
import { censusOf } from '@/sim/colony/census';
import { unplugFloor } from '@/sim/colony/allocation/demand';
const taskIndex = (t: string): number => { try { return ti(t as never); } catch { return -1; } };
declare const process: { stdout: { write(s: string): void } };

export function showReopen(sim: Sim, out: (s: string) => void, ants = true): void {
  const col = sim.state.player.colonyId;
  const n = sim.state.nests.find((x) => x.colony === col)!;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  out(`t ${sim.state.tick} phase ${sim.state.player.opening?.phase} possessed ${sim.state.player.possessedAntId} fnd ${n.founding?.state}`);
  out(`  entrances ${JSON.stringify(n.entrances.map((e) => ({ id: e.id, st: e.status, plug: e.plugVoxelCount, pos: [e.pos.x, e.pos.y, e.pos.z].map(r1) })))}`);
  out(`  chambers ${JSON.stringify(n.chambers.map((c) => ({ id: c.id, t: c.type, c: [c.center.x, c.center.y, c.center.z].map(r1) })))}`);
  out(`  plans ${JSON.stringify(n.digPlans.filter((q) => q.status !== 'complete' && q.status !== 'cancelled').map((q) => ({ id: q.id, k: q.kind, src: q.source, st: q.status, why: q.blockedReason, rem: Math.round(q.removedVolume*100)/100, tgt: Math.round(q.targetVolume*100)/100, created: q.createdTick, a: [q.anchor.pos.x, q.anchor.pos.y, q.anchor.pos.z].map(r1) })))}`);
  const col0 = sim.stores.colonies.get(col)!;
  const TN = ['nurse','queen-care','forage','store','garden','mill','cut','tend','scout','haul','dig','guard','patrol','idle'];
  const tg: string[] = [];
  for (const t of TN) { const i = taskIndex(t); if (i >= 0 && (col0.alloc.target[i] || col0.alloc.demand[i] > 0.01)) tg.push(`${t}:${col0.alloc.target[i]}/${col0.alloc.demand[i].toFixed(2)}`); }
  const cen = censusOf(sim, col);
  out(`  alloc ${tg.join(' ')} | avail ${cen.available} adult ${cen.availableAdult} outside ${cen.availableOutside} callows ${cen.callows} unplugFloor ${unplugFloor(sim, col0)}`);
  if (!ants) return;
  for (const a of sim.state.ants) {
    if (!a.alive || a.colony !== col) continue;
    out(`  ant ${a.id} ${a.caste} task ${a.task} state ${a.state} act ${a.action?.id ?? '-'} pos ${[a.pos.x, a.pos.y, a.pos.z].map((v) => v.toFixed(1)).join(',')} nav ${a.nav.status} carry ${a.carry.kind}`);
  }
}

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string, e?: string): string & Uint8Array };
  const { state } = restore(new Uint8Array(fs.readFileSync(args[0])));
  const sim = createSim(state, generateWorld(state.config.world));
  const ticks = Number(args[1] ?? 7500), every = Number(args[2] ?? 250);
  const out = (s: string) => process.stdout.write(s + '\n');
  showReopen(sim, out);
  const t0 = sim.state.tick;
  for (let t = 0; t < ticks; t += every) {
    for (let i = 0; i < every; i++) sim.tick();
    showReopen(sim, out);
    const n = sim.state.nests.find((x) => x.colony === sim.state.player.colonyId)!;
    if (n.entrances.some((e) => e.status === 'open')) { out(`OPEN after ${sim.state.tick - t0} ticks`); break; }
  }
}
