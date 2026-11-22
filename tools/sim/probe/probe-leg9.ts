// Round 9 probe (temporary): sweep-8 sg #3, nest walkers failing nav 'leg'. Restores a cached hand-over and, on the
// first ticks where a worker's nav reads failed:leg, prints where it stands and what the nest nav says about it.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-leg9.ts CACHE.bin ARCHETYPE SEED [TICKS]
import type { ArchetypeId, Colony } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { scratchOf } from '@/sim/locomotion/scratch';

const r1 = (x: number) => Math.round(x * 100) / 100;

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, ticksS] = args;
  const seed = Number(seedS), ticks = Number(ticksS ?? 3000);
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId) as Colony;
  const bu = sim.world.bu, v = sim.carve.voxel;
  const nest = sim.state.nests.find((n) => n.alive && n.colony === col.id)!;
  const P = (p: { x: number; y: number; z: number }) => [r1(p.x / bu), r1(p.y / bu), r1(p.z / bu)];
  console.log(JSON.stringify({ tick: sim.state.tick, entrances: nest.entrances.map((e) => ({ id: e.id, status: e.status, pos: P(e.pos), r: r1(e.radius / bu), plug: e.plugVoxelCount })),
    chambers: nest.chambers.map((c) => ({ id: c.id, type: c.type, c: P(c.center), comp: sim.nestNav.componentAt(c.center) })) }));
  const seen = new Set<number>();
  for (let t = 0; t < ticks; t++) {
    sim.tick();
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== col.id || a.caste !== 'worker' || seen.has(a.id)) continue;
      if (a.nav.status !== 'failed' || a.nav.failReason !== 'leg') continue;
      seen.add(a.id);
      const s = scratchOf(a);
      const near = { x: 0, y: 0, z: 0 };
      const hasNear = sim.nestNav.nearestOpen(a.pos, near);
      const i = Math.round(a.pos.x / v), j = Math.round(a.pos.y / v), k = Math.round(a.pos.z / v);
      const nb: number[] = [];
      for (let dj = -1; dj <= 1; dj++) nb.push(sim.carve.sampleAt(i, j + dj, k));
      console.log(JSON.stringify({ tick: sim.state.tick, ant: a.id, task: a.task, state: a.state, nestId: a.nestId, chamber: a.chamberId, medium: a.medium, pos: P(a.pos), up: P({ x: a.up.x * bu, y: a.up.y * bu, z: a.up.z * bu }),
        dest: P(a.nav.dest), destKind: a.nav.destKind, mode: a.nav.mode, legField: s.legField, legNest: s.legNest, goalField: s.goalField, legExit: s.legExit,
        dist: r1(sim.nestNav.distanceAt(s.legField, a.pos) / bu), comp: sim.nestNav.componentAt(a.pos), nearOpen: hasNear ? P(near) : null,
        nearComp: hasNear ? sim.nestNav.componentAt(near) : null, nearDist: hasNear ? r1(sim.nestNav.distanceAt(s.legField, near) / bu) : null,
        f: r1(sim.field.sample(a.pos) / bu), sub: r1(sim.field.substrate(a.pos) / bu), carveCol: nb, ground: r1(sim.field.height(a.pos.x, a.pos.z) / bu) }));
    }
    if (seen.size >= 12) break;
  }
  console.log(JSON.stringify({ done: sim.state.tick, entrances: nest.entrances.map((e) => `${e.id}:${e.status}:${e.plugVoxelCount}`) }));
}
