// PROBE (species-leafcutter; delete before finishing): why an Atta founding fails (forced seal as life.ts).
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { TICKS_PER_DAY } from '@/sim/time';
import type { ArchetypeId } from '@/sim/types';
import { chamberTempC, chamberRh } from '@/sim/colony/envAdapter';

export default async function main(args: string[]): Promise<void> {
  const arch = (args[0] ?? 'playground-park') as ArchetypeId;
  const seed = Number(args[1] ?? 1);
  const base = defaultGameConfig('atta-texana', seed, 'naturalist');
  const config = { ...base, cheats: true, world: { ...base.world, archetype: arch } };
  const world = generateWorld(config.world);
  const sim = createSim(createNewGame(config, world).state, world);
  sim.events.on('opening-failed' as never, (e: unknown) => console.log('EVENT opening-failed', JSON.stringify(e)));
  sim.events.on('garden-state' as never, (e: unknown) => console.log('EVENT garden-state', sim.state.tick, JSON.stringify(e)));
  sim.events.on('ant-died' as never, (e: unknown) => console.log('EVENT ant-died', sim.state.tick, JSON.stringify(e)));
  sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
  let forced = false;
  for (let i = 0; i < 16 * TICKS_PER_DAY; i++) {
    sim.tick();
    const op = sim.state.player.opening;
    if (op?.phase === 'seal' && !forced) { sim.enqueue({ type: 'cheat.setFoundingState', nestId: -1, state: 'sealed' }); forced = true; }
    if (i % 1500 === 0) {
      const col = sim.state.colonies[0];
      const q = sim.stores.ants.get(col.queenId);
      const g = col.fungus?.gardens[0];
      console.log(`t${(sim.state.tick / TICKS_PER_DAY).toFixed(2)} phase ${op?.phase} queen ${q?.alive} ch ${q?.chamberId} T ${q && q.chamberId >= 0 ? chamberTempC(sim, q.chamberId).toFixed(1) : '-'} RH ${q ? chamberRh(sim, q.chamberId, q.pos).toFixed(2) : '-'} pellet ${JSON.stringify((op as { garden?: unknown })?.garden)} res ${(q?.queen?.founding as { reserveLoads?: number } | null | undefined)?.reserveLoads?.toFixed(2)} brood ${sim.state.brood.filter((b) => b.alive && b.colony === col.id).map((b) => b.stage[0]).join("")} g ${g ? `${g.state} G${g.biomass.toFixed(2)} h${g.health.toFixed(2)} fT${(g.fT ?? 0).toFixed(2)}` : '-'}`);
    }
    if (op?.phase === 'handover' || op?.done || op?.phase === 'failed') { console.log('END', op?.phase, JSON.stringify((op as { failure?: unknown; failCause?: unknown }).failure ?? (op as { failCause?: unknown }).failCause ?? null)); break; }
  }
  console.log("player colony", sim.state.colonies[0].id, sim.state.colonies[0].isPlayer, "queen", sim.state.colonies[0].queenId, "flood", JSON.stringify(sim.state.nests.filter((n) => n.colony === sim.state.colonies[0].id).map((n) => n.chambers.map((c) => [c.id, c.type, c.flooded]))), "weather", sim.state.env.weather.state);
  const op = sim.state.player.opening as unknown as Record<string, unknown>;
  console.log('opening keys', Object.keys(op ?? {}).join(','));
  for (const k of Object.keys(op ?? {})) if (/fail|cause|reason/i.test(k)) console.log(k, JSON.stringify(op[k]));
}
