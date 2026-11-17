// PROBE (colony-life round 4; deleted after use): waste in the brood's chambers of one hand-over, every 0.05 gd.
//   node tools/sim/run-ts.mjs tools/sim/probe-waste.ts --archetype A --seed S --cache DIR --days N
// Per sample: per chamber with brood: brood count, waste items by kind (lying, not carried), how many are on the floor
// in a hauler's reach (onSurface), haul-task ants and their states, entrance status, midden known. Events: waste
// spawned (kind, chamber), waste dumped, brood deaths by cause.
import type { Sim } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { TICKS_PER_DAY } from '@/sim/time';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { haulPriority } from '@/sim/ants/behaviours/nest/haul';
import { middenPoint } from '@/sim/ants/behaviours/nest/places';
import { ti } from '@/sim/colony/taskIdx';

interface NodeFs { readFileSync(p: string): Uint8Array }

export default async function main(args: string[]): Promise<void> {
  const o: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) o[args[i].slice(2)] = args[i + 1];
  const fs = (await import('node:fs' as string)) as NodeFs;
  const seed = Number(o.seed), arch = o.archetype;
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as never });
  const state = restore(new Uint8Array(fs.readFileSync(`${o.cache}/founded-lasius-niger-${arch}-${seed}-naturalist-d-any.bin`))).state;
  const sim: Sim = createSim(state, world, { systems: SYSTEMS });
  const col = sim.state.player.colonyId;
  const spawned: Record<string, number> = {}, dumped: Record<string, number> = {}, deaths: Record<string, number> = {};
  sim.events.on('entity-created', (e) => {
    const it = e.entity === 'item' ? sim.stores.items.get(e.id) : undefined;
    if (it && it.kind === 'waste') { const k = `${it.wasteKind}@${chType(sim, it.chamberId)}`; spawned[k] = (spawned[k] ?? 0) + 1; }
  });
  sim.events.on('waste-dumped', (e) => { dumped[e.to] = (dumped[e.to] ?? 0) + 1; });
  sim.events.on('brood-died', (e) => { const k = `${e.stage}:${e.cause}`; deaths[k] = (deaths[k] ?? 0) + 1; });
  const tr0 = Number(o.trace0 ?? -1), tr1 = Number(o.trace1 ?? -1);
  const inTrace = (): boolean => { const g = (sim.state.tick - t0) / TICKS_PER_DAY; return g >= tr0 && g <= tr1; };
  sim.events.on('action-failed', (e) => {
    const a = sim.stores.ants.get(e.antId);
    if (a && a.task === 'haul' && inTrace()) console.log(`  FAIL ${a.id} ${e.action} ${e.reason} state ${a.state}`);
  });
  sim.events.on('action-completed', (e) => {
    const a = sim.stores.ants.get(e.antId);
    if (a && a.task === 'haul' && inTrace()) {
      console.log(`  DONE ${a.id} ${e.action} state ${a.state} carry ${a.carry.kind} item ${a.bb['bn.ii']}`);
      if (e.action === 'put-down') watch.add(a.bb['bn.ii'] ?? -1);
    }
  });
  const watch = new Set<number>();
  const t0 = sim.state.tick, end = t0 + Number(o.days ?? 4) * TICKS_PER_DAY, every = Math.round(0.05 * TICKS_PER_DAY);
  while (sim.state.tick < end) {
    sim.tick();
    if (inTrace() && sim.state.tick % 50 === 0) {
      for (const id of watch) {
        const it = sim.stores.items.get(id);
        const nest = sim.state.nests.find((n) => n.alive && n.colony === col);
        const mid = nest ? middenPoint(sim, nest, { x: 0, y: 0, z: 0 }) : null;
        if (it) console.log(`  ITEM ${id} ${it.kind} pos ${it.pos.x.toFixed(1)},${it.pos.y.toFixed(1)},${it.pos.z.toFixed(1)} midden ${mid ? `${mid.x.toFixed(1)},${mid.y.toFixed(1)},${mid.z.toFixed(1)}` : '-'} prio ${nest ? haulPriority(sim, nest, it) : '-'} carriers ${it.carrierIds.length}`);
      }
      for (const a of sim.stores.ants.list) {
        if (!a.alive || a.colony !== col || a.task !== 'haul') continue;
        const it = a.carry.kind === 'item' ? sim.stores.items.get(a.carry.id) : undefined;
        console.log(`  T ${((sim.state.tick - t0) / TICKS_PER_DAY).toFixed(3)} ant ${a.id} ${a.state} carry ${it ? `${it.kind}/${it.wasteKind ?? ''}` : '-'} nest ${a.nestId} ch ${a.chamberId} nav ${a.nav.status} pos ${a.pos.x.toFixed(0)},${a.pos.y.toFixed(0)},${a.pos.z.toFixed(0)} drop ${(a.bb['bn.dx'] ?? NaN)}`);
      }
    }
    if ((sim.state.tick - t0) % every !== 0) continue;
    const t = ((sim.state.tick - t0) / TICKS_PER_DAY).toFixed(2);
    const brood = new Map<number, number>();
    for (const b of sim.stores.brood.list) if (b.alive && b.colony === col) brood.set(b.chamberId, (brood.get(b.chamberId) ?? 0) + 1);
    const parts: string[] = [];
    for (const [ch, n] of brood) {
      const kinds: Record<string, number> = {};
      let reach = 0;
      for (const it of sim.stores.items.list) {
        if (!it.alive || it.kind !== 'waste' || it.chamberId !== ch || it.carrierIds.length > 0) continue;
        kinds[String(it.wasteKind)] = (kinds[String(it.wasteKind)] ?? 0) + 1;
        if ((it as { onSurface?: boolean }).onSurface !== false) reach++;
      }
      parts.push(`${chType(sim, ch)}#${ch} brood ${n} waste ${JSON.stringify(kinds)} reach ${reach}`);
    }
    const haul: Record<string, number> = {};
    let workers = 0;
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== col || a.caste === 'queen') continue;
      workers++;
      if (a.task === 'haul') haul[a.state] = (haul[a.state] ?? 0) + 1;
    }
    const nest = sim.state.nests.find((n) => n.alive && n.colony === col);
    const ent = nest ? nest.entrances.map((e) => e.status).join(',') : '-';
    const c = sim.stores.colonies.get(col)!;
    const pr: string[] = [];
    if (nest) for (const it of sim.stores.items.list) if (it.alive && it.kind === 'waste' && pr.length < 3) pr.push(`${it.wasteKind}:${haulPriority(sim, nest, it)} inNest ${it.inNest} nest ${it.nestId}/${nest.id} bulk ${it.bulk}`);
    const mid = nest ? middenPoint(sim, nest, { x: 0, y: 0, z: 0 }) : null;
    parts.push(`haul demand ${c.alloc.demand[ti('haul')].toFixed(2)} actual ${c.alloc.actual[ti('haul')]} midden ${mid ? 'yes' : 'none'} prio [${pr.join('; ')}]`);
    console.log(`${t} gd w ${workers} | ${parts.join(' | ')} | haul ${JSON.stringify(haul)} | entrances ${ent} | chambers ${nest?.chambers.map((c) => c.type).join(',')}`);
  }
  console.log(`spawned ${JSON.stringify(spawned)}\ndumped ${JSON.stringify(dumped)}\nbrood deaths ${JSON.stringify(deaths)}`);
}

function chType(sim: Sim, id: number): string {
  for (const n of sim.state.nests) for (const c of n.chambers) if (c.id === id) return c.type;
  return id < 0 ? 'outside' : '?';
}
