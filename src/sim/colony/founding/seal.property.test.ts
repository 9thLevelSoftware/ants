// Sealing in every throat the dig can produce (task founding-close §1). Headless, real actions: the throat geometry
// is carved with the debug brushes (set-up), the queen is possessed as in the game, and the player presses E once
// (the `action` command for seal-entrance) from the founding cell, far out of the throat's reach. From there the
// founding guide (sealGuide.ts) walks her by her own movement input and plugs the leak with the real seal-entrance.
// Always-on: three cases (the round-2 browser failure 55 deg / 2.1 BU, the steep wide and the shallow narrow ends).
// The full matrix (pitch 30-85 deg x width 1.5 / 2.1 / 3.0 BU x loam / sand) runs with FOUNDRESS_LONG=1.
import { describe, expect, it } from 'vitest';
import type { MaterialId } from '@/sim/types';
import { OPEN_AUTO_SEAL_GD, SEAL_MAX_PLUGS } from '@/sim/balance/founding';
import { TICKS_PER_DAY } from '@/sim/time';
import { cavityEntrances } from './dig';
import { throatLeak } from './leak';
import { cellReachesAir } from './sealPlan';
import { SG } from './sealGuide';
import { throatCase, type ThroatSpec } from './sealKit';
import { nestOf, phase, pinTemperature, queen, stepUntil } from './testkit';

const LONG = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FOUNDRESS_LONG;
/** Ticks one E press may take to seal (the measured worst case of the matrix is about 500). */
const SEAL_TICKS_MAX = 3000;

interface Outcome { phase: string; ticks: number; plugs: number; nestStatus: string[]; leak: boolean; air: boolean; exitD: number; refusedInReach: number }

function sealCase(spec: ThroatSpec): Outcome {
  const c = throatCase(spec);
  const sim = c.sim;
  pinTemperature(sim, 22);
  const q = queen(sim), nest = nestOf(sim);
  sim.enqueue({ type: 'possess', antId: q.id });
  sim.tick();
  // refusals once the guide has her moving: none may be `no-target` (the first press, from the cell, is out of reach)
  let refusedInReach = 0, pressed = false;
  sim.events.on('action-failed', (e) => {
    if (e.antId !== q.id || e.action !== 'seal-entrance') return;
    if (pressed && e.reason === 'no-target') refusedInReach++;
    pressed = true;
  });
  sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
  const ticks = stepUntil(sim, () => phase(sim) !== 'seal', SEAL_TICKS_MAX);
  const cell = nest.chambers.find((ch) => ch.type === 'founding')!;
  const ents = cavityEntrances(sim, nest);
  return {
    phase: phase(sim), ticks, plugs: q.bb[SG.total] ?? 0,
    nestStatus: ents.map((e) => e.status), leak: ents.some((e) => throatLeak(sim, e) !== null),
    air: cellReachesAir(sim, nest), exitD: sim.nestNav.distance(nest.id, { kind: 'exit', id: -1 }, cell.center),
    refusedInReach,
  };
}

function expectSealed(o: Outcome): void {
  expect(o.phase).toBe('lay');
  // the nest module agrees: every throat of the cell reads sealed (a narrow throat the nest had marked `reopening`
  // before any plug stays `reopening`, with no passage left: GDD 03 §4.2 "as sealed"; see leak.ts throatClosed)
  for (const s of o.nestStatus) expect(['sealed', 'reopening']).toContain(s);
  expect(o.leak).toBe(false);
  // the cell connects to nothing outside: no path of open samples to the air, no exit distance (-1: unreachable)
  expect(o.air).toBe(false);
  expect(o.exitD).toBe(-1);
  expect(o.plugs).toBeGreaterThan(0);
  expect(o.plugs).toBeLessThanOrEqual(SEAL_MAX_PLUGS);
  expect(o.refusedInReach).toBe(0);
}

describe('sealing from the actual leak (task founding-close §1)', () => {
  const always: ThroatSpec[] = [
    { pitchDeg: 55, widthBu: 2.1, soil: 'loam' },
    { pitchDeg: 85, widthBu: 3.0, soil: 'sand' },
    { pitchDeg: 30, widthBu: 1.5, soil: 'loam' },
  ];
  for (const spec of always) {
    it(`${spec.pitchDeg} deg, ${spec.widthBu} BU, ${spec.soil}: one E press seals, in at most ${SEAL_MAX_PLUGS} plugs`, () => {
      expectSealed(sealCase(spec));
    }, 60_000);
  }
});

describe.skipIf(!LONG)('sealing: the whole matrix (FOUNDRESS_LONG=1)', () => {
  it('pitch 30-85 deg x throat 1.5 / 2.1 / 3.0 BU x loam / sand: every case ends sealed', () => {
    const rows: string[] = [];
    const bad: string[] = [];
    for (const soil of ['loam', 'sand'] as MaterialId[]) for (const pitchDeg of [30, 45, 55, 70, 85]) for (const widthBu of [1.5, 2.1, 3.0]) {
      const o = sealCase({ pitchDeg, widthBu, soil });
      rows.push(`${soil} ${pitchDeg} ${widthBu}: ${o.phase} after ${o.ticks} ticks, ${o.plugs} plugs, nest ${o.nestStatus.join('/')}`);
      try { expectSealed(o); } catch { bad.push(rows[rows.length - 1]); }
    }
    (globalThis as { process?: { stderr: { write(s: string): void } } }).process?.stderr.write(`[seal matrix]\n${rows.join('\n')}\n`);
    expect(bad).toEqual([]);
  }, 1_800_000);
});

describe('the passive player (task founding-close §1: the auto-seal uses the same code path)', () => {
  it(`with no input for ${OPEN_AUTO_SEAL_GD} GD in phase seal, the queen seals by herself with seal-entrance`, () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
    const sim = c.sim;
    pinTemperature(sim, 22);
    const q = queen(sim);
    sim.enqueue({ type: 'possess', antId: q.id });
    sim.tick();
    // the first plug lands only after the idle time (the plug's voxels carry the PLUG flag: seal-entrance's own)
    let sealedTick = -1;
    sim.events.on('entrance-state-changed', (e) => { if (e.status === 'sealed' && sealedTick < 0) sealedTick = sim.state.tick; });
    const t0 = sim.state.tick;
    stepUntil(sim, () => phase(sim) !== 'seal', OPEN_AUTO_SEAL_GD * TICKS_PER_DAY + SEAL_TICKS_MAX);
    expect(phase(sim)).toBe('lay');
    expect(sealedTick - t0).toBeGreaterThanOrEqual(OPEN_AUTO_SEAL_GD * TICKS_PER_DAY - 20);
    expect(cavityEntrances(sim, nestOf(sim)).reduce((n, e) => n + e.plugVoxelCount, 0)).toBeGreaterThan(0);
    expect(cellReachesAir(sim, nestOf(sim))).toBe(false);
  }, 60_000);
});
