// gate-sim-2 fix probe: a fresh founding continued in-process (A) against its hand-over snapshot restored (B), in
// lockstep; prints the first checkpoint whose state hash differs and the first differing state paths.
//   node tools/sim/run-ts.mjs tools/sim/probe/g2f-handover.ts ARCH SEED TICKS EVERY
import type { ArchetypeId, Sim } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { generateWorld } from '@/worldgen';
import { restore, snapshot, stateHash } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';

function diffPaths(a: unknown, b: unknown, path: string, out: string[], max: number): void {
  if (out.length >= max) return;
  if (typeof a === 'number' && typeof b === 'number') { if (a !== b && !(Number.isNaN(a) && Number.isNaN(b))) out.push(`${path}: ${a} vs ${b}`); return; }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { if (a !== b) out.push(`${path}: ${String(a).slice(0, 40)} vs ${String(b).slice(0, 40)}`); return; }
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    const x = a as unknown as ArrayLike<number>, y = b as unknown as ArrayLike<number>;
    if (x.length !== y.length) { out.push(`${path}: length ${x.length} vs ${y.length}`); return; }
    for (let i = 0; i < x.length && out.length < max; i++) if (x[i] !== y[i]) { out.push(`${path}[${i}]: ${x[i]} vs ${y[i]}`); }
    return;
  }
  const ka = Object.keys(a as object), kb = new Set(Object.keys(b as object));
  for (const k of ka) {
    if (!kb.has(k)) { out.push(`${path}.${k}: missing in B`); continue; }
    diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out, max);
  }
  for (const k of kb) if (!(k in (a as object))) out.push(`${path}.${k}: missing in A`);
}

export default async function main(args: string[]): Promise<void> {
  const [arch, seedS, ticksS, everyS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const config = { ...base, cheats: true, world: { ...base.world, archetype: arch as ArchetypeId } };
  const world = generateWorld(config.world);
  const a: Sim = createSim(createNewGame(config, world).state, world, { systems: SYSTEMS });
  a.enqueue({ type: 'cheat.completeFounding', workers: 10 });
  const end = a.state.tick + 16 * TICKS_PER_DAY;
  while (a.state.tick < end) {
    a.tick();
    const op = a.state.player.opening;
    if (op?.phase === 'handover' || op?.phase === 'failed' || op?.done) break;
  }
  console.log(`hand-over at tick ${a.state.tick}, phase ${a.state.player.opening?.phase}, hash ${stateHash(a.state)}`);
  const b: Sim = createSim(restore(snapshot(a)).state, world, { systems: SYSTEMS });
  console.log(`restored hash ${stateHash(b.state)}`);
  const n = Number(ticksS), every = Number(everyS);
  for (let i = 1; i <= n; i++) {
    a.tick(); b.tick();
    if (i % every === 0 || i <= 5) {
      const ha = stateHash(a.state), hb = stateHash(b.state);
      if (ha !== hb) {
        const out: string[] = [];
        diffPaths(JSON.parse(JSON.stringify(a.state)), JSON.parse(JSON.stringify(b.state)), 'state', out, 30);
        console.log(`FIRST DIFF by +${i} ticks (tick ${a.state.tick}): ${ha} vs ${hb}\n  ${out.join('\n  ')}`);
        return;
      }
      if (i % every === 0) console.log(`+${i} equal ${ha}`);
    }
  }
  console.log('EQUAL');
}
