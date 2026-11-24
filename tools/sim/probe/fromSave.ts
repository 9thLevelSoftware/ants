// Probe (opening-fix): load a browser export (FIRSTPLAY_CHECKPOINT text) headless and watch the founding nest's
// reopening: entrances, founding plans, the workers' tasks / states / actions, every 250 ticks.
//   node tools/sim/run-ts.mjs tools/sim/probe/fromSave.ts <save.txt> [ticks]
import { parseText } from '@/game/save/container';
import { restoreSave } from '@/game/save/loader';
declare const process: { stdout: { write(s: string): void } };
export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string, e?: string): string & Uint8Array };
  const text = fs.readFileSync(args[0], 'utf8');
  const ticks = Number(args[1] ?? 3000);
  const p = parseText(text);
  if (!p.ok) throw new Error(p.message);
  const r = restoreSave(p.meta, p.state);
  if (!r.ok) throw new Error(r.message);
  const sim = r.sim;
  const out = (s: string) => process.stdout.write(s + '\n');
  const col = sim.state.player.colonyId;
  const nest = () => sim.state.nests.find((n) => n.colony === col)!;
  const show = () => {
    const n = nest();
    out(`t ${sim.state.tick} phase ${sim.state.player.opening?.phase} possessed ${sim.state.player.possessedAntId}`);
    out(`  entrances ${JSON.stringify(n.entrances.map((e) => ({ id: e.id, st: e.status, plug: e.plugVoxelCount, pos: [e.pos.x, e.pos.y, e.pos.z].map((v) => Math.round(v * 10) / 10) })))}`);
    out(`  chambers ${JSON.stringify(n.chambers.map((c) => ({ id: c.id, t: c.type, c: [c.center.x, c.center.y, c.center.z].map((v) => Math.round(v * 10) / 10) })))}`);
    out(`  plans ${JSON.stringify(n.digPlans.filter((q) => q.status !== 'complete' && q.status !== 'cancelled').map((q) => ({ id: q.id, k: q.kind, src: q.source, st: q.status, created: q.createdTick, anchor: q.anchor.pos })))}`);
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col) continue;
      out(`  ant ${a.id} ${a.caste} task ${a.task} state ${a.state} act ${a.action?.id ?? '-'} pos ${[a.pos.x, a.pos.y, a.pos.z].map((v) => v.toFixed(1)).join(',')} nav ${a.nav.status} carry ${a.carry.kind}`);
    }
  };
  show();
  for (let t = 0; t < ticks; t += 250) {
    for (let i = 0; i < 250; i++) sim.tick();
    show();
    if (nest().entrances.some((e) => e.status === 'open')) { out('OPEN'); break; }
  }
}
