// Round 7 probe (deleted at the end of the round): ants of the player colony inside their nest whose position the
// nest's exit field does not reach (trapped in a pocket the voxel graph does not connect), sampled every 100 ticks.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-trap7.ts CACHEFILE ARCHETYPE SEED GD
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, gdS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world);
  const col = sim.state.colonies.find((c) => c.isPlayer) ?? sim.state.colonies[0];
  const t0 = sim.state.tick, end = t0 + Math.round(Number(gdS) * TICKS_PER_DAY);
  let samples = 0, inNest = 0, trapped = 0, failed = 0;
  const byTask: Record<string, number> = {}, spells = new Map<number, number>(), longest: Record<string, number> = {};
  while (sim.state.tick < end) {
    sim.tick();
    if (sim.state.tick % 100 !== 0) continue;
    samples++;
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col.id || a.caste !== 'worker' || a.nestId < 0) continue;
      inNest++;
      const exit = `nest:${a.nestId}:exit:-1`;
      const d = sim.nestNav.hasTarget(exit) ? sim.nestNav.distanceAt(exit, a.pos) : 0;
      if (Number.isFinite(d)) { spells.delete(a.id); continue; }
      trapped++;
      if (a.nav.status === 'failed') failed++;
      byTask[a.task] = (byTask[a.task] ?? 0) + 1;
      const n = (spells.get(a.id) ?? 0) + 1;
      spells.set(a.id, n);
      const k = `${a.id}:${a.task}`;
      longest[k] = Math.max(longest[k] ?? 0, n);
    }
  }
  const perGd = 100 / TICKS_PER_DAY;
  console.log(JSON.stringify({ run: `${arch} ${seedS}`, gd: Number(gdS), inNestAntGd: +(inNest * perGd).toFixed(2), trappedAntGd: +(trapped * perGd).toFixed(2), trappedNavFailedAntGd: +(failed * perGd).toFixed(2), byTaskAntGd: Object.fromEntries(Object.entries(byTask).map(([k, v]) => [k, +(v * perGd).toFixed(2)])), longestSpellGd: Object.fromEntries(Object.entries(longest).filter(([, v]) => v * perGd >= 0.02).map(([k, v]) => [k, +(v * perGd).toFixed(2)])) }));
}
