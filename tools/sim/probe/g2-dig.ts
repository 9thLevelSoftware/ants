// gate-sim-2 item 5 probe: sg #2 digging with no open plan. Restores a hand-over and prints, every PERIOD ticks
// until game day DAYS after it: the colony's dig / haul demand and target, every plan (status, slots, volume), every
// dig-task worker (state, plan / slot claim, position, carry); per period the pellets created by ant state and the
// carve volume. Reads state only.
//   node tools/sim/run-ts.mjs tools/sim/probe/g2-dig.ts FILE ARCH SEED [DAYS] [PERIOD]
import type { ArchetypeId } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { defaultGameConfig } from '@/sim/createGame';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import { ti } from '@/sim/colony/taskIdx';

interface Fs { readFileSync(p: string): Uint8Array }
const f2 = (x: number) => x.toFixed(2);

export default async function main(args: string[]): Promise<void> {
  const { readFileSync } = (await import('node:fs' as string)) as Fs;
  const [file, arch, seedS, daysS, periodS] = args;
  const days = Number(daysS ?? 8), period = Number(periodS ?? 1500);
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const config = { ...base, cheats: true, world: { ...base.world, archetype: arch as ArchetypeId } };
  const sim = createSim(restore(new Uint8Array(readFileSync(file))).state, generateWorld(config.world), { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!;
  const t0 = sim.state.tick;
  let made: Record<string, number> = {};
  const ev: string[] = [];
  sim.events.on('pellet-created' as never, (e: { antId: number }) => {
    const a = sim.stores.ants.get(e.antId);
    const k = a ? `${a.task}/${a.state}/plan${a.bb.planId ?? -1}` : `ant${e.antId}`;
    made[k] = (made[k] ?? 0) + 1;
  });
  for (const t of ['plan-created', 'plan-status-changed', 'plan-complete', 'architect-proposal'] as const) {
    sim.events.on(t as never, (e: object) => { ev.push(`t ${sim.state.tick} ${JSON.stringify(e)}`); });
  }
  while (sim.state.tick - t0 < days * TICKS_PER_DAY) {
    sim.tick();
    if ((sim.state.tick - t0) % period !== 0) continue;
    const gd = (sim.state.tick - t0) / TICKS_PER_DAY;
    console.log(`T ${sim.state.tick} gd ${f2(gd)} C ${f2(col.stores.c)} P ${f2(col.stores.p)} dig d ${f2(col.alloc.demand[ti('dig')])} t ${col.alloc.target[ti('dig')]} a ${col.alloc.actual[ti('dig')]} haul d ${f2(col.alloc.demand[ti('haul')])} t ${col.alloc.target[ti('haul')]} tend t ${col.alloc.target[ti('tend')]} a ${col.alloc.actual[ti('tend')]} forage t ${col.alloc.target[ti('forage')]}`);
    console.log(`  pellets by digger ${JSON.stringify(made)}`);
    made = {};
    while (ev.length) console.log(`  E ${ev.shift()}`);
    for (const n of sim.stores.nests.list) {
      if (!n.alive || n.colony !== col.id) continue;
      console.log(`  nest ${n.id} entrances ${n.entrances.map((e) => `${e.id}:${e.status}`).join(',')} chambers ${n.chambers.length}`);
      for (const p of n.digPlans) console.log(`  plan ${p.id} ${p.kind} ${p.source} ${p.status} ${p.blockedReason ?? ''} slots ${p.slots.map((s) => s.antId).join(',')} vol ${f2(p.removedVolume)}/${f2(p.targetVolume)}`);
    }
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== col.id || a.task !== 'dig') continue;
      console.log(`  Dg ${a.id} ${a.state} plan ${a.bb.planId ?? -1}:${a.bb.slotIdx ?? -1} pos ${f2(a.pos.x)},${f2(a.pos.y)},${f2(a.pos.z)} ch ${a.chamberId} nest ${a.nestId} carry ${a.carry.kind}:${a.carry.id} act ${a.action?.id ?? '-'} age ${sim.state.tick - a.stateTick}`);
    }
  }
}
