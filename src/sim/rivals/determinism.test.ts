// Determinism and plain data (acceptance 6, App. E 24): same seed and commands -> identical rival, relation and
// territory state; the rivals' state is plain data (JSON-like and typed arrays) and survives a snapshot.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { rivalSim, rivalsOf } from './testkit';

const LONG = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FOUNDRESS_LONG;

function plain(v: unknown): unknown {
  if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>, (x) => Math.round(x * 1e6) / 1e6);
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) o[k] = plain((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Hash of the rival, relation and territory state plus every rival ant's kinematics and job. */
export function rivalHash(sim: Sim): number {
  const cols = rivalsOf(sim).map((c) => ({ id: c.id, rival: c.rival, queens: c.queens }));
  const ants = sim.state.ants.filter((a) => a.alive && a.colony !== sim.state.colonies[0].id)
    .map((a) => ({ id: a.id, pos: a.pos, task: a.task, hp: a.hp, bb: a.bb }));
  return hash(JSON.stringify(plain({ cols, ants, rivals: sim.state.rivals })));
}

function scenario(ticks: number): Sim {
  const sim = rivalSim({
    seed: 7, nest: 'small', workers: 15, sizeBu: 384,
    rivals: [{ species: 'tetramorium-immigrans', dx: 90, dz: 0 }, { species: 'lasius-niger', dx: -60, dz: 80, incipient: true }],
  });
  sim.tick();
  sim.enqueue({ type: 'cheat.setRelation', a: sim.state.colonies[0].id, b: rivalsOf(sim)[0].id, e: 12, state: null });
  for (let t = 0; t < ticks; t++) sim.tick();
  return sim;
}

describe('determinism', () => {
  it('two runs with seed 7 and the same commands end in identical rival state (1500 ticks)', () => {
    const a = scenario(1500), b = scenario(1500);
    expect(rivalHash(a)).toBe(rivalHash(b));
    expect(rivalsOf(a)[0].rival.fieldedIds.length).toBeGreaterThan(0);
  }, 120_000);

  it('the rivals state is plain data (no Maps, Sets, classes, functions)', () => {
    const sim = scenario(300);
    const bad: string[] = [];
    const walk = (v: unknown, path: string): void => {
      if (v === null || typeof v !== 'object') { if (typeof v === 'function') bad.push(path); return; }
      if (ArrayBuffer.isView(v)) return;
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== Array.prototype) { bad.push(path); return; }
      for (const k of Object.keys(v)) walk((v as Record<string, unknown>)[k], `${path}.${k}`);
    };
    walk(sim.state.rivals, 'rivals');
    for (const c of rivalsOf(sim)) walk(c.rival, `colony${c.id}.rival`);
    expect(bad).toEqual([]);
    expect(sim.state.rivals.module).toBeDefined();
    expect(JSON.parse(JSON.stringify(sim.state.rivals.module))).toEqual(sim.state.rivals.module);
  }, 60_000);

  it.skipIf(!LONG)('App. E 24: identical hashes after 1 gd', () => {
    const a = scenario(TICKS_PER_DAY), b = scenario(TICKS_PER_DAY);
    expect(rivalHash(a)).toBe(rivalHash(b));
  }, 1_200_000);
});
