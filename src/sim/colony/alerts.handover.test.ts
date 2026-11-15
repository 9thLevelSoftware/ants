// Hand-over of diagnostics to progression: once progression's publishDiagnostic stores records (here a fake that
// stores a copy), the colony fallback must not overwrite them, and reports that it did not run (so the caller
// emits no diagnostic-changed event of its own). With a progression that stores nothing (the old stub), the
// fallback stores the record. Progression's real publishDiagnostic now stores records itself.

import { describe, expect, it } from 'vitest';
import type { Diagnostic, Sim } from '@/sim/types';
import { makeColonySim } from './testkit';
import { colonyPublish } from './alerts';

function diag(status: Diagnostic['status']): Diagnostic {
  return { id: 'diag-stores', system: 'colony', status, label: 'Stores', value: 1, factors: [], remedies: [], sinceTick: 0, focus: null } as Diagnostic;
}

/** A progression that stores its own copy of each record. */
function storingProgression(sim: Sim, d: Diagnostic): void {
  const list = sim.state.progression.diagnostics;
  const i = list.findIndex((x) => x.id === d.id);
  const copy = { ...d, label: `${d.label} (stored by progression)` };
  if (i < 0) list.push(copy);
  else list[i] = copy;
}

describe('diagnostics hand-over to progression', () => {
  it('a record progression stored is left alone and no fallback is reported', () => {
    const sim = makeColonySim();
    expect(colonyPublish(sim, diag('ok'), storingProgression)).toBe(false);
    expect(colonyPublish(sim, diag('warn'), storingProgression)).toBe(false);
    const list = sim.state.progression.diagnostics.filter((d) => d.id === 'diag-stores');
    expect(list).toHaveLength(1);
    expect(list[0].label).toContain('stored by progression');
    expect(list[0].status).toBe('warn');
  });

  it('with a progression that stores nothing the fallback upserts the record (one entry per id)', () => {
    const sim = makeColonySim();
    const stub = (): void => {};
    expect(colonyPublish(sim, diag('ok'), stub)).toBe(true);
    expect(colonyPublish(sim, diag('bad'), stub)).toBe(true);
    const list = sim.state.progression.diagnostics.filter((d) => d.id === 'diag-stores');
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('bad');
  });

  it('with the real progression the record is progression\'s and the fallback does not run', () => {
    const sim = makeColonySim();
    expect(colonyPublish(sim, diag('ok'))).toBe(false);
    expect(colonyPublish(sim, diag('bad'))).toBe(false);
    const list = sim.state.progression.diagnostics.filter((d) => d.id === 'diag-stores');
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('bad');
  });
});
