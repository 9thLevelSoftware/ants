// Round 9 probe (temporary): the throat of the founding entrance after the hand-over reopen. Restores a cached
// hand-over, runs TICKS, then maps the carve samples within RADIUS BU of the entrance: per nest-nav component its
// sample count, y range, whether it touches open air (substrate > 0) and whether it holds a chamber centre; and the
// remaining PLUG samples. Also prints vertical slices (x-y at the entrance z, z-y at the entrance x).
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-throat9.ts CACHE.bin ARCHETYPE SEED [TICKS] [RADIUS]
import type { ArchetypeId, Colony } from '@/sim/types';
import { VoxelFlag } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { voxelAt } from '@/sim/nest';

const r1 = (x: number) => Math.round(x * 100) / 100;

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, ticksS, radS] = args;
  const seed = Number(seedS), ticks = Number(ticksS ?? 0), rad = Number(radS ?? 8);
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  for (let t = 0; t < ticks; t++) sim.tick();
  const col = sim.stores.colonies.get(sim.state.player.colonyId) as Colony;
  const bu = sim.world.bu, v = sim.carve.voxel;
  const nest = sim.state.nests.find((n) => n.alive && n.colony === col.id)!;
  const e = nest.entrances[0];
  console.log(JSON.stringify({ tick: sim.state.tick, e: { id: e.id, status: e.status, pos: [r1(e.pos.x / bu), r1(e.pos.y / bu), r1(e.pos.z / bu)], r: r1(e.radius / bu), plug: e.plugVoxelCount, dir: [r1(e.dir.x), r1(e.dir.y), r1(e.dir.z)] } }));
  const R = rad * bu;
  const comps = new Map<number, { n: number; y0: number; y1: number; air: number; chamber: boolean; near: number }>();
  const plugs: number[][] = [];
  const ci = Math.round(e.pos.x / v), cj = Math.round(e.pos.y / v), ck = Math.round(e.pos.z / v), n = Math.ceil(R / v);
  const p = { x: 0, y: 0, z: 0 };
  for (let k = ck - n; k <= ck + n; k++) for (let j = cj - n; j <= cj + n; j++) for (let i = ci - n; i <= ci + n; i++) {
    p.x = i * v; p.y = j * v; p.z = k * v;
    const d = Math.hypot(p.x - e.pos.x, p.y - e.pos.y, p.z - e.pos.z);
    if (d > R) continue;
    const s = voxelAt(sim, p);
    if ((s.flags & VoxelFlag.PLUG) && s.open < 127.5) plugs.push([r1(p.x / bu), r1(p.y / bu), r1(p.z / bu), r1(sim.field.substrate(p) / bu)]);
    if (s.open < 128) continue;
    const c = sim.nestNav.componentAt(p);
    const rec = comps.get(c) ?? { n: 0, y0: Infinity, y1: -Infinity, air: 0, chamber: false, near: Infinity };
    rec.n++; rec.y0 = Math.min(rec.y0, p.y / bu); rec.y1 = Math.max(rec.y1, p.y / bu); rec.near = Math.min(rec.near, d / bu);
    // a face neighbour in open air
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      if (sim.field.substrateXYZ(p.x + dx * v, p.y + dy * v, p.z + dz * v) > 0 && voxelAt(sim, { x: p.x + dx * v, y: p.y + dy * v, z: p.z + dz * v }).open < 128) { rec.air++; break; }
    }
    comps.set(c, rec);
  }
  for (const ch of nest.chambers) { const c = sim.nestNav.componentAt(ch.center); const rec = comps.get(c); if (rec) rec.chamber = true; else comps.set(c, { n: -1, y0: 0, y1: 0, air: 0, chamber: true, near: Infinity }); }
  for (const [c, rec] of comps) console.log(JSON.stringify({ comp: c, ...rec, y0: r1(rec.y0), y1: r1(rec.y1), near: r1(rec.near) }));
  console.log(JSON.stringify({ plugs: plugs.length, list: plugs.slice(0, 60) }));
  // slices: char per sample: '#' solid soil, '.' open air (substrate > 0, carve closed), 'P' plug, digits = component mod 10
  const ch = (i: number, j: number, k: number): string => {
    p.x = i * v; p.y = j * v; p.z = k * v;
    const s = voxelAt(sim, p);
    if (s.open >= 128) { const c = sim.nestNav.componentAt(p); return c < 0 ? '?' : String.fromCharCode(97 + (c % 26)); }
    if (s.flags & VoxelFlag.PLUG) return sim.field.substrate(p) < 0 ? 'P' : 'p';
    return sim.field.substrate(p) > 0 ? '.' : '#';
  };
  for (const [name, fn] of [['x-y at entrance z', (a: number, j: number) => ch(ci + a, j, ck)], ['z-y at entrance x', (a: number, j: number) => ch(ci, j, ck + a)]] as const) {
    console.log(name + ` (cols ${-n}..${n} voxels, rows y from ${(cj + n) * v / bu} BU down)`);
    for (let j = cj + n; j >= cj - 3 * n; j--) { let row = ''; for (let a = -n; a <= n; a++) row += fn(a, j); console.log(r1(j * v / bu).toString().padStart(6) + ' ' + row); }
  }
}
