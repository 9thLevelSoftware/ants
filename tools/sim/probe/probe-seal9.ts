// Round 9 probe (temporary): a start-pose founding that does not seal. playerCase at the start pose (the scripted
// player's dig and one E press), then the opening's state: phase, entrances, the seal's refusals, the queen.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-seal9.ts ARCHETYPE SEED
import type { ArchetypeId } from '@/sim/types';
import { generatedWorld, playerCase, setSweepDebug, sweepSim } from '@/sim/colony/founding/sweepKit';
import { nestOf, phase, queen } from '@/sim/colony/founding/testkit';
import { cavityEntrances } from '@/sim/colony/founding/dig';

const r2 = (x: number) => Math.round(x * 100) / 100;

export default async function main(args: string[]): Promise<void> {
  const [arch, seedS] = args;
  const { world, config } = generatedWorld(arch as ArchetypeId, Number(seedS));
  const sim = sweepSim(world, config);
  setSweepDebug((s) => console.log('[sweep]', s));
  const q = queen(sim), bu = sim.world.bu;
  const tick0 = sim.tick.bind(sim);
  let last = '';
  (sim as unknown as { tick: () => void }).tick = () => {
    tick0();
    if (phase(sim) !== 'seal') return;
    const e = nestOf(sim).entrances[0];
    const line = `sg ${q.bb['fd.sg'] ?? '-'} strat ${q.bb['fd.sgStrategy'] ?? '-'} replans ${q.bb['fd.sgReplans'] ?? '-'} nav ${q.nav.status}${q.nav.failReason ? ':' + q.nav.failReason : ''} poss ${sim.state.player.possessedAntId === q.id} act ${q.action?.id ?? '-'} ent ${e?.status}:${e?.plugVoxelCount}`;
    if (line !== last) { console.log(sim.state.tick, line, [r2(q.pos.x / bu), r2(q.pos.y / bu), r2(q.pos.z / bu)].join(',')); last = line; }
  };
  const res = playerCase(sim, null, true);
  const nest = nestOf(sim);
  console.log(JSON.stringify({ res, phase: phase(sim), tick: sim.state.tick, founding: nest.founding,
    entrances: nest.entrances.map((e) => ({ id: e.id, status: e.status, plug: e.plugVoxelCount, kind: e.kind, pos: [r2(e.pos.x / bu), r2(e.pos.y / bu), r2(e.pos.z / bu)] })),
    cavity: cavityEntrances(sim, nest).map((e) => e.id),
    chambers: nest.chambers.map((c) => ({ id: c.id, type: c.type, depthBu: r2((sim.field.height(c.center.x, c.center.z) - c.center.y) / bu) })),
    queen: { pos: [r2(q.pos.x / bu), r2(q.pos.y / bu), r2(q.pos.z / bu)], action: q.action?.id ?? null, state: q.state, alive: q.alive } }));
}
