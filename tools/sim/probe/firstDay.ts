// Probe (winter-sugar, integrator ruling 1): the first game day after a cached hand-over, to compare a tree with A3
// (unplug stand point) against one without. Prints the start state hash, when the entrance opens, every worker's
// task / state changes (compressed to task changes plus the dig states), how long each digger stays on dig.* after the
// entrance is open, food sources discovered (by whom, how far from the mouth), the first tender, and an hourly line
// of allocation (demand / target / actual for dig, forage, scout, tend) and of where each worker is.
//   node tools/sim/run-ts.mjs tools/sim/probe/firstDay.ts <snapshot.bin> [ticks=6000]
// Run it from the tree under test (frozen copies run their own code).
import { restore, stateHash } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { TASKS } from '@/sim/types';
import { ti } from '@/sim/colony/taskIdx';
declare const process: { stdout: { write(s: string): void } };

const HOUR = 250;
const WATCH = ['dig', 'forage', 'scout', 'tend', 'nurse', 'store', 'idle'] as const;

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const { state } = restore(new Uint8Array(fs.readFileSync(args[0])));
  const sim = createSim(state, generateWorld(state.config.world));
  const out = (s: string) => process.stdout.write(s + '\n');
  const col = sim.state.player.colonyId, t0 = sim.state.tick, ticks = Number(args[1] ?? 6000);
  out(`start tick ${t0} hash ${stateHash(sim.state)}`);
  const nest = () => sim.state.nests.find((x) => x.colony === col)!;
  const mouth = nest().entrances[0].pos;
  const dist = (p: { x: number; y: number; z: number }) => Math.round(Math.hypot(p.x - mouth.x, p.z - mouth.z) / sim.world.bu);
  sim.events.on('food-source-discovered', (e) => {
    if (e.colonyId !== col) return;
    const a = sim.stores.ants.get(e.byAntId);
    out(`+${sim.state.tick - t0} DISCOVER source ${e.sourceId} ${e.kind}${e.variant ? '/' + e.variant : ''} at ${dist(e.pos)} BU by ant ${e.byAntId} (${a?.task ?? '-'} ${a?.state ?? ''})`);
  });
  const last = new Map<number, string>();
  const digSince = new Map<number, number>();
  const digAfterOpen = new Map<number, number>();
  let openAt = -1, firstTend = -1, entranceStatus = '';
  for (let t = 1; t <= ticks; t++) {
    sim.tick();
    const rel = sim.state.tick - t0;
    const st = nest().entrances.map((e) => e.status).join(',');
    if (st !== entranceStatus) { out(`+${rel} ENTRANCE ${st}`); entranceStatus = st; if (openAt < 0 && st.split(',').includes('open')) openAt = rel; }
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col || a.caste !== 'worker') continue;
      const key = a.state.startsWith('dig.') ? a.state : a.task;
      if (last.get(a.id) !== key) {
        out(`+${rel} ant ${a.id} ${last.get(a.id) ?? '(start)'} -> ${key} ${a.nestId >= 0 ? 'in' : 'out ' + dist(a.pos) + ' BU'}`);
        last.set(a.id, key);
      }
      const digging = a.task === 'dig';
      if (digging && !digSince.has(a.id)) digSince.set(a.id, rel);
      if (!digging) digSince.delete(a.id);
      if (openAt >= 0 && digging) digAfterOpen.set(a.id, (digAfterOpen.get(a.id) ?? 0) + 1);
      if (firstTend < 0 && a.task === 'tend') { firstTend = rel; out(`+${rel} FIRST TENDER ant ${a.id}`); }
    }
    if (rel % HOUR === 0) {
      const c = sim.stores.colonies.get(col)!;
      const alloc = WATCH.map((k) => `${k} ${c.alloc.demand[ti(k)].toFixed(1)}/${c.alloc.target[ti(k)].toFixed(1)}/${c.alloc.actual[ti(k)]}`).join('  ');
      const where = sim.state.ants.filter((a) => a.alive && a.colony === col && a.caste === 'worker')
        .map((a) => `${a.id}:${a.task}${a.nestId >= 0 ? '' : '@' + dist(a.pos)}`).join(' ');
      out(`H${rel / HOUR} needC ${c.needs.needC.toFixed(2)} C ${c.stores.c.toFixed(2)} | ${alloc}\n    ${where}`);
    }
  }
  out(`open at +${openAt}; first tender +${firstTend}; dig ticks after open by ant: ${[...digAfterOpen].map(([id, n]) => `${id}:${n}`).join(' ') || 'none'}`);
  out(`end hash ${stateHash(sim.state)} (tasks known: ${TASKS.length})`);
}
