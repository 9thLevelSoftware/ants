// Independent review (int-1B-app) of the HUD adapters for the claustral founding (src/game/uiBridge/hudSlices.ts):
// the quiet alerts and diagnostics before the hand-over, the queen-reserve status, and everything else unchanged.
// The implementer's own tests (gate1b.test.ts) guard their opening checks with `if (op)`; these force an opening so
// the founding branch is always exercised.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { raiseAlert } from '@/sim/progression';
import type { OpeningState, Sim } from '@/sim/types';
import { alertsOf, colonyOf } from './uiBridge';

function opening(phase: OpeningState['phase'], done = false): OpeningState {
  return {
    phase, attempt: 1, retriesUsed: 0, startDoy: 9, siteFactors: [], siteQ: 0, siteWord: null, entranceId: -1, chamberId: -1,
    shaftDepthBu: 0, chamberVoxels: 0, sealed: false, layBatches: 0, threatsUsed: 0, lastThreatTick: -1, interruptsUsed: 0,
    hazardLog: [], lapse: null, garden: null, woodMoisture: -1, done,
  };
}

function founding(sim: Sim, reserveFrac: number | null): void {
  const col = sim.state.colonies[0]!;
  const q = sim.stores.ants.get(col.queenId);
  if (!q?.queen) throw new Error('test sim has no queen');
  q.queen.founding = reserveFrac === null ? null : { reserveLoads: 10 * reserveFrac, R0: 10, desiccation: 0, wings: false, eggsLaid: 0 };
}

const diags = (sim: Sim) => sim.state.progression.diagnostics as unknown as { id: string; label: string; status: string }[];

describe('review: alerts during the claustral founding', () => {
  it('the implementer tests run their founding branch (makeTestSim gives an opening)', () => {
    // If this fails, gate1b.test.ts's `if (op) {...}` blocks are skipped and those tests prove nothing about the opening.
    expect(makeTestSim({ nest: 'small', workers: 6 }).state.player.opening).not.toBeNull();
  });

  it('hides last-ants / food-low before the hand-over, shows them after, and never hides other alerts', () => {
    const sim = makeTestSim({ nest: 'small', workers: 6 });
    sim.state.player.opening = opening('lay');
    raiseAlert(sim, { kind: 'last-ants', level: 'critical', title: '', cause: '', subjectId: -1, focus: null, diagnosticId: null, tokens: { n: 1, cause: 'cold' } });
    raiseAlert(sim, { kind: 'food-c-low', level: 'warning', title: 'Carbohydrate stores low', cause: '', subjectId: 0, focus: null, diagnosticId: null });
    raiseAlert(sim, { kind: 'brood-stalled', level: 'warning', title: 'Brood growth has stalled', cause: '', subjectId: 0, focus: null, diagnosticId: null });
    const before = alertsOf(sim).map((a) => a.kind);
    expect(before).not.toContain('last-ants');
    expect(before).not.toContain('food-c-low');
    expect(before).toContain('brood-stalled');
    sim.state.player.opening = opening('handover');
    const after = alertsOf(sim).map((a) => a.kind);
    expect(after).toContain('last-ants');
    expect(after).toContain('food-c-low');
  });
});

describe('review: colony status during the claustral founding', () => {
  it('follows the queen reserves (ok >= 25 %, warn < 25 %, bad < 10 %)', () => {
    const sim = makeTestSim({ nest: 'small', workers: 6 });
    sim.state.progression.diagnostics.length = 0;
    sim.state.player.opening = opening('lay');
    founding(sim, 0.5);
    expect(colonyOf(sim)?.status).toBe('ok');
    founding(sim, 0.2);
    expect(colonyOf(sim)?.status).toBe('warn');
    founding(sim, 0.05);
    expect(colonyOf(sim)?.status).toBe('bad');
    expect(colonyOf(sim)?.queenReserves).toBeCloseTo(0.05, 6);
  });

  it('a by-design founding diagnostic stays quiet but any other bad diagnostic still turns the pulse red', () => {
    const sim = makeTestSim({ nest: 'small', workers: 6 });
    sim.state.player.opening = opening('lay');
    founding(sim, 0.9);
    const d = diags(sim);
    const tpl = d[0] ?? { id: '', label: '', status: 'ok' };
    d.length = 0;
    d.push({ ...tpl, id: 'diag-food-intake-p', label: 'Protein intake', status: 'bad' });
    expect(colonyOf(sim)?.status).toBe('ok');
    expect(colonyOf(sim)?.worst).toBeNull();
    d.push({ ...tpl, id: 'diag-brood-temperature', label: 'Brood temperature', status: 'bad' });
    expect(colonyOf(sim)?.status).toBe('bad');
    expect(colonyOf(sim)?.worst?.id).toBe('diag-brood-temperature');
  });

  it('after the hand-over the starvation stage decides again, whatever the reserves', () => {
    const sim = makeTestSim({ nest: 'small', workers: 6 });
    sim.state.progression.diagnostics.length = 0;
    sim.state.player.opening = opening('done', true);
    founding(sim, 0.01);
    const col = sim.state.colonies[0]!;
    col.starvationStage = 'fed';
    expect(colonyOf(sim)?.status).toBe('ok');
    col.starvationStage = 'lean';
    expect(colonyOf(sim)?.status).toBe('warn');
  });

  it('a non-finite or zero reserve pool does not leak NaN into the HUD', () => {
    const sim = makeTestSim({ nest: 'small', workers: 6 });
    sim.state.player.opening = opening('lay');
    const q = sim.stores.ants.get(sim.state.colonies[0]!.queenId)!;
    q.queen!.founding = { reserveLoads: 5, R0: 0, desiccation: 0, wings: false, eggsLaid: 0 };
    const c = colonyOf(sim);
    expect(c?.queenReserves).toBeNull();
    expect(['ok', 'warn', 'bad']).toContain(c?.status);
  });
});
