// Round 14 Part B probe (tool-side, measures only): the outdoor determinism scenario (determinism.perf.test.ts).
// Runs A for SEG ticks, snapshots, then continues A and a restored copy C tick by tick, comparing state hashes; at
// the first tick that differs, prints the fields that differ (path: A vs C).
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-restore14.ts [SEG] [MAXTICKS]
import { restore, snapshot, stateHash } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { decode, encode } from '@/core/serialize';
import { announce, forageScenario } from '@/sim/ants/behaviours/outdoor/testkit';

export function diff(a: unknown, b: unknown, path: string, out: string[], max = 60): void {
  if (out.length >= max) return;
  if (a === b) return;
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); return; }
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    const x = a as unknown as ArrayLike<number>, y = b as unknown as ArrayLike<number>;
    if (x.length !== y.length) { out.push(`${path}: typed length ${x.length} vs ${y.length}`); return; }
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i] && !(Number.isNaN(x[i]) && Number.isNaN(y[i]))) { out.push(`${path}[${i}]: ${x[i]} vs ${y[i]}`); if (out.length >= max) return; }
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) { out.push(`${path}: array vs object`); return; }
  const ka = Object.keys(a as object), kb = Object.keys(b as object);
  const ord = ka.join(',') !== kb.join(',');
  for (const k of new Set([...ka, ...kb])) diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out, max);
  if (ord && out.length < max && ka.length === kb.length) out.push(`${path}: key order ${ka.join(',')} vs ${kb.join(',')}`);
}

export default function main(args: string[]): void {
  const SEG = Number(args[0] ?? 1500), MAX = Number(args[1] ?? 1500);
  const mk = () => {
    const s = forageScenario({
      seed: 4, holdStores: { c: 2, p: 0.3 },
      sources: [
        { kind: 'sugar', variant: 'sugar-granules', distBu: 90, bearingDeg: 30, units: 300 },
        { kind: 'carrion', variant: 'insect-medium', distBu: 120, bearingDeg: 200, units: 1 },
      ],
    });
    for (const src of s.sources) announce(s.sim, s.col, src);
    return s;
  };
  const a = mk();
  for (let i = 0; i < SEG; i++) a.sim.tick();
  const saved = snapshot(a.sim);
  const h0 = stateHash(a.sim.state);
  const c = createSim(restore(saved).state, a.sim.world, { systems: a.sim.systems });
  console.log(`saved at tick ${a.sim.state.tick}, hash ${h0}; restored hash right after createSim ${stateHash(c.state)}`);
  if (stateHash(c.state) !== h0) {
    const out: string[] = []; diff(decode(encode(a.sim.state)), decode(encode(c.state)), 'state', out); console.log(out.join('\n'));
  }
  for (let t = 1; t <= MAX; t++) {
    a.sim.tick(); c.tick();
    const ha = stateHash(a.sim.state), hc = stateHash(c.state);
    if (ha !== hc) {
      console.log(`first difference ${t} ticks after the save (tick ${a.sim.state.tick}): ${ha} vs ${hc}`);
      const out: string[] = []; diff(decode(encode(a.sim.state)), decode(encode(c.state)), 'state', out); console.log(out.join('\n'));
      return;
    }
  }
  console.log(`equal for ${MAX} ticks`);
}
