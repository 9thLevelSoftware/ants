// PROBE (species-leafcutter; delete before finishing): an Atta game founded with the forced seal (as life.ts), the
// hand-over cached, then N game days logged with the fungus module's numbers.
//   node tools/sim/run-ts.mjs tools/sim/probe-leaf-life.ts <archetype> <seed> <days> [--fresh]
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { restore, snapshot } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import type { ArchetypeId, Sim } from '@/sim/types';
import { calendarNow } from '@/sim/environment/calendar';
import { surfaceActivityOf } from '@/sim/colony/envAdapter';

interface Fs { existsSync(p: string): boolean; readFileSync(p: string): Uint8Array; writeFileSync(p: string, d: Uint8Array): void; mkdirSync(p: string, o: object): void }

function line(sim: Sim): string {
  const col = sim.state.colonies[0];
  const m = col.fungus!;
  const q = sim.stores.ants.get(col.queenId);
  const tasks: Record<string, number> = {};
  const states: Record<string, number> = {};
  for (const a of sim.state.ants) {
    if (!a.alive || a.colony !== col.id || a.caste === 'queen') continue;
    const k = `${a.caste[0]}:${a.task}`;
    tasks[k] = (tasks[k] ?? 0) + 1;
    states[a.state] = (states[a.state] ?? 0) + 1;
  }
  const brood = sim.state.brood.filter((b) => b.alive && b.colony === col.id);
  const st = (s: string) => brood.filter((b) => b.stage === s).length;
  const g = m.gardens.map((x) => `${x.chamberId}:${x.state} G${x.biomass.toFixed(2)}/${(x.gcap ?? 0).toFixed(1)} h${x.health.toFixed(2)} i${x.infection.toFixed(2)} fs${(x.fsub ?? 0).toFixed(2)} fc${(x.fclim ?? 0).toFixed(2)}(T${(x.fT ?? 0).toFixed(2)} RH${(x.fRH ?? 0).toFixed(2)}) ft${(x.ftend ?? 0).toFixed(2)} W${x.waste.toFixed(2)} cache${(x.cache ?? []).reduce((a, l) => a + l.lu, 0).toFixed(2)} pulp${(x.pulp ?? []).reduce((a, l) => a + l.lu, 0).toFixed(2)} ys${(x.yieldStanding ?? 0).toFixed(2)}`).join(' | ');
  const c = m.chain;
  const ch = c ? `chain cut${(c.cut + (c.last?.cut ?? 0)).toFixed(1)} car${(c.carried + (c.last?.carried ?? 0)).toFixed(1)} pro${(c.processed + (c.last?.processed ?? 0)).toFixed(1)} pla${(c.planted + (c.last?.planted ?? 0)).toFixed(1)} har${(c.harvested + (c.last?.harvested ?? 0)).toFixed(2)} narrow ${c.narrow}` : 'chain -';
  const cal = calendarNow(sim);
  return [
    `t${(sim.state.tick / TICKS_PER_DAY).toFixed(2)} ${cal.phase} act${surfaceActivityOf(sim, col.species).toFixed(2)}`,
    `workers ${Object.values(tasks).reduce((a, b) => a + b, 0)} brood e${st('egg')} l${st('larva')} p${st('pupa')} eggsLaid ${col.counters.eggsLaid}`,
    `pool c${col.stores.c.toFixed(2)} p${col.stores.p.toFixed(2)} staph${(m.staphylae ?? 0).toFixed(2)} queen gut c${q?.queen?.gut.c.toFixed(2)} p${q?.queen?.gut.p.toFixed(2)} res ${q?.queen?.reserveP?.toFixed(2)} budget ${q?.queen?.eggBudget?.toFixed(2)}`,
    `gardens ${g}`, ch, `tasks ${JSON.stringify(tasks)}`, `states ${JSON.stringify(states)}`,
  ].join('\n  ');
}

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as Fs;
  const arch = (args[0] ?? 'suburban-garden') as ArchetypeId;
  const seed = Number(args[1] ?? 1), days = Number(args[2] ?? 2), fresh = args.includes('--fresh');
  const base = defaultGameConfig('atta-texana', seed, 'naturalist');
  const config = { ...base, cheats: true, world: { ...base.world, archetype: arch } };
  const world = generateWorld(config.world);
  const file = `test-output/leaf/probe/${arch}-${seed}.bin`;
  let sim: Sim;
  if (!fresh && fs.existsSync(file)) {
    sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world);
  } else {
    sim = createSim(createNewGame(config, world).state, world);
    sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
    let forced = false;
    for (let i = 0; i < 16 * TICKS_PER_DAY; i++) {
      sim.tick();
      const op = sim.state.player.opening;
      if (op?.phase === 'seal' && !forced) { sim.enqueue({ type: 'cheat.setFoundingState', nestId: -1, state: 'sealed' }); forced = true; }
      if (op?.phase === 'handover' || op?.done || op?.phase === 'failed') break;
    }
    console.log('founded', sim.state.player.opening?.phase, (sim.state.tick / TICKS_PER_DAY).toFixed(2));
    fs.mkdirSync('test-output/leaf/probe', { recursive: true });
    fs.writeFileSync(file, snapshot(sim));
  }
  console.log(line(sim));
  const end = sim.state.tick + days * TICKS_PER_DAY;
  while (sim.state.tick < end) {
    for (let i = 0; i < TICKS_PER_DAY / 4; i++) sim.tick();
    console.log(line(sim));
  }
}
