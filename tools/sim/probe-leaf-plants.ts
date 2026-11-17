import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { generateWorld } from '@/worldgen';
declare const process: { argv: string[] };
const arch = (process.argv[2] ?? 'suburban-garden') as never;
const cfg = defaultGameConfig({ species: 'atta-texana', seed: 1, archetype: arch } as never);
const { world } = createNewGame(cfg as never) as never as { world: ReturnType<typeof generateWorld> };
const w = world as unknown as { objects: { id: number; templateId: string; pos: { x: number; z: number }; tags: string[]; primStart: number; primCount: number }[]; prims: { material: string; pos: { y: number }; shape: string }[]; queenStart: { pos: { x: number; z: number } }; bu: number };
const q = w.queenStart.pos;
const byT: Record<string, { n: number; near: number; leaves: number; minD: number }> = {};
for (const o of w.objects) {
  if (!o.tags.includes('plant')) continue;
  const d = Math.hypot(o.pos.x - q.x, o.pos.z - q.z) / w.bu;
  let leaves = 0;
  for (let i = o.primStart; i < o.primStart + o.primCount; i++) if (w.prims[i].material === 'plant' && w.prims[i].shape === 'ellipsoid') leaves++;
  const r = (byT[o.templateId] ??= { n: 0, near: 0, leaves: 0, minD: 1e9 });
  r.n++; if (d < 300) r.near++; r.leaves += leaves; r.minD = Math.min(r.minD, d);
}
console.log(arch, JSON.stringify(byT, null, 0));
