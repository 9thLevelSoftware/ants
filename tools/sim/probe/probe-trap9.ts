// Round 9 probe (temporary): sweep-8 finding 1, the homeward trap. Restores a cached hand-over, runs until a worker
// of the colony in forage.return (or any return) is within NEAR BU (XZ) of the point X,Z (BU), then traces it every
// 2 game s for TRACE s: position, nav state, request, leg, flow value and stuck bookkeeping.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-trap9.ts CACHE.bin ARCHETYPE SEED X Z [NEAR] [TRACE] [MAXDAYS]
import type { ArchetypeId, Colony } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { scratchOf } from '@/sim/locomotion/scratch';
import { TICKS_PER_DAY } from '@/sim/time';

const r1 = (x: number) => Math.round(x * 100) / 100;

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, xS, zS, nearS, traceS, maxS] = args;
  const seed = Number(seedS), X = Number(xS), Z = Number(zS), near = Number(nearS ?? 5), trace = Number(traceS ?? 400), maxDays = Number(maxS ?? 12);
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId) as Colony;
  const bu = sim.world.bu;
  const nest = sim.state.nests.find((n) => n.alive && n.colony === col.id)!;
  const P = (p: { x: number; y: number; z: number }) => [r1(p.x / bu), r1(p.y / bu), r1(p.z / bu)];
  console.log(JSON.stringify({ tick: sim.state.tick, entrances: nest.entrances.map((e) => ({ id: e.id, status: e.status, pos: P(e.pos) })) }));
  let id = -1;
  const end = maxDays * TICKS_PER_DAY;
  while (sim.state.tick < end && id < 0) {
    sim.tick();
    if (sim.state.tick % 10 !== 0) continue;
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== col.id || a.nestId >= 0 || !a.state.endsWith('.return')) continue;
      if (Math.hypot(a.pos.x / bu - X, a.pos.z / bu - Z) <= near) { id = a.id; break; }
    }
  }
  if (id < 0) { console.log('none'); return; }
  const g = sim.navGrid as unknown as { cellOf(x: number, z: number): number; groundAt(c: number): number; isCellBlocked(c: number): boolean; cell: number };
  for (let t = 0; t < trace * 10; t++) {
    sim.tick();
    const a = sim.stores.ants.get(id);
    if (!a || !a.alive) { console.log(JSON.stringify({ tick: sim.state.tick, gone: id })); break; }
    if (t % Number(args[8] ?? 20) !== 0) continue;
    const s = scratchOf(a);
    const c = g.cellOf(a.pos.x, a.pos.z);
    console.log(JSON.stringify({ t: t / 10, ant: id, st: a.state, home: a.bb['fo.home'] ?? a.bb['fo.hm'], pos: P(a.pos), nest: a.nestId, nav: a.nav.status + (a.nav.failReason ? ':' + a.nav.failReason : ''), mode: a.nav.mode, req: s.req, flowKey: s.flowKey, legNest: s.legNest, legExit: s.legExit,
      goal: P(s.goal), dest: P(a.nav.dest), bestTick: sim.state.tick - s.bestTick, ladder: s.ladderUntil - sim.state.tick, reqAge: sim.state.tick - s.reqTick, cell: c, blocked: c >= 0 ? g.isCellBlocked(c) : null, speed: r1(a.speed / bu), upY: r1(a.up.y), med: a.medium, best: r1(s.best / bu), anchorY: r1(s.anchor.y / bu), planAge: sim.state.tick - s.planTick, ladderN: s.ladder, eps: s.episodes, path: a.nav.path ? a.nav.path.length : 0, pathIdx: a.nav.pathIdx }));
  }
}
