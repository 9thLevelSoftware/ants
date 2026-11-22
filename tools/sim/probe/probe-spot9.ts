// Round 9 probe (temporary): what is around a point of a world: solid primitives within R BU (with their object's
// template), and a map of the walkable surface height (field height) minus the terrain height, 1 BU steps.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-spot9.ts ARCH SEED X_BU Z_BU [R]
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { generateWorld } from '@/worldgen';
import { heightAt } from '@/sim/world/terrainSample';

export default async function main(args: string[]): Promise<void> {
  const [arch, seedS, xs, zs, rs] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const bu = world.bu, x = Number(xs) * bu, z = Number(zs) * bu, R = Number(rs ?? 12) * bu;
  const r = (v: number) => Math.round(v * 100) / 100;
  for (let i = 0; i < world.prims.length; i++) {
    const p = world.prims[i];
    const reach = Math.max(p.size.x, p.size.y, p.size.z) + R;
    if (Math.abs(p.pos.x - x) > reach || Math.abs(p.pos.z - z) > reach) continue;
    const obj = world.objects.find((o) => i >= o.primStart && i < o.primStart + o.primCount);
    console.log(JSON.stringify({ i, shape: p.shape, pos: [r(p.pos.x / bu), r(p.pos.y / bu), r(p.pos.z / bu)], size: [r(p.size.x / bu), r(p.size.y / bu), r(p.size.z / bu)], rot: [r(p.rot.x), r(p.rot.y), r(p.rot.z), r(p.rot.w)], mat: p.material, flags: p.flags, obj: obj?.templateId, tags: obj?.tags }));
  }
  console.log(`terrain height at point ${r(heightAt(world.terrain, x, z) / bu)} BU`);
}
