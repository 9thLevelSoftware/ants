// PROBE (colony-life round 4; deleted after use): why an open entrance goes `sealing` after the hand-over.
//   node tools/sim/run-ts.mjs tools/sim/probe-entrance.ts --archetype A --seed S --cache DIR --from GD --to GD
// Every 10 ticks from FROM to TO gd after the hand-over: per entrance, plugCount, status and the PLUG-flagged samples
// within 3 BU of it (open value, substrate distance, counted?). On a change of the counted set, the samples that
// changed and the actions of the ants within 4 BU.
import type { Sim } from '@/sim/types';
import { VoxelFlag } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { TICKS_PER_DAY } from '@/sim/time';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { plugCount } from '@/sim/nest/entrances';
import { nestRuntime } from '@/sim/nest/runtime';
import { OPEN_MIN } from '@/sim/nest/carve/keys';

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
  sim.events.on('entrance-state-changed', (e) => console.log(`${gd(sim, t0)} EVENT entrance ${e.entranceId} ${e.prev} -> ${e.status}`));
  const t0 = sim.state.tick;
  const from = t0 + Number(o.from) * TICKS_PER_DAY, to = t0 + Number(o.to) * TICKS_PER_DAY;
  const last = new Map<number, string>();
  while (sim.state.tick < to) {
    sim.tick();
    if (sim.state.tick < from || sim.state.tick % 10 !== 0) continue;
    for (const n of sim.state.nests) {
      if (!n.alive || n.colony !== col) continue;
      for (const e of n.entrances) {
        const counted = plugSamples(sim, e.pos);
        const key = counted.filter((s) => s.counted).map((s) => s.key).join(' ');
        if (last.get(e.id) === key) continue;
        const prev = new Set((last.get(e.id) ?? '').split(' ').filter(Boolean));
        last.set(e.id, key);
        const added = counted.filter((s) => s.counted && !prev.has(s.key));
        const ants: string[] = [];
        for (const a of sim.stores.ants.list) {
          if (!a.alive || Math.hypot(a.pos.x - e.pos.x, a.pos.y - e.pos.y, a.pos.z - e.pos.z) > 4 * sim.world.bu) continue;
          ants.push(`${a.id}:${a.task}/${a.state}/${a.action?.id ?? '-'}/carry ${a.carry.kind}`);
        }
        console.log(`${gd(sim, t0)} entrance ${e.id} ${e.status} plugCount ${plugCount(sim, e)} recorded ${e.plugVoxelCount} baseline ${e.plugBaseline ?? 0} | new counted ${added.map((s) => `${s.key} open ${s.open} sub ${s.sub}`).join('; ')} | flagged ${counted.length} | ants ${ants.join(', ')}`);
      }
    }
  }
}

function gd(sim: Sim, t0: number): string {
  return ((sim.state.tick - t0) / TICKS_PER_DAY).toFixed(3);
}

function plugSamples(sim: Sim, p: { x: number; y: number; z: number }): { key: string; open: number; sub: number; counted: boolean }[] {
  const v = sim.carve.voxel, r = Math.ceil((3 * sim.world.bu) / v);
  const ci = Math.round(p.x / v), cj = Math.round(p.y / v), ck = Math.round(p.z / v);
  const flags = nestRuntime(sim).flags, out: { key: string; open: number; sub: number; counted: boolean }[] = [];
  for (let k = ck - r; k <= ck + r; k++) for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
    if ((flags.get(i, j, k) & VoxelFlag.PLUG) === 0) continue;
    const open = sim.carve.sampleAt(i, j, k), sub = sim.field.substrateXYZ(i * v, j * v, k * v);
    out.push({ key: `${i},${j},${k}`, open: Math.round(open), sub: Math.round(sub * 10) / 10, counted: open < OPEN_MIN && sub < 0 });
  }
  return out;
}
