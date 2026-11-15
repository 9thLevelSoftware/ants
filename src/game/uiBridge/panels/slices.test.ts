// The panels' slices of the snapshot on a real test simulation (task ui-panels): Colony health carries published
// diagnostics with their cause chains and history, Nest overview the chambers, entrances and tunnels, the Journal its
// aims, entries and series, and the builder only makes a slice while its panel is open.
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { publishDiagnostic, recordMilestone, unlockCodex } from '@/sim/progression';
import type { Sim } from '@/sim/types';
import { SnapshotBuilder, type SnapshotSource } from '../../uiBridge';
import { hudRequests } from '../requests';
import { codexOf, dateOf, healthOf, journalOf, markerCountsOf, nestOf, sinceOf } from './index';

function src(sim: Sim | null): SnapshotSource {
  return { sim, mode: 'playing', view: 'observer', loading: null, speed: null, manualClock: false, toasts: [], hudHidden: false, error: null, underground: false, epitaph: null };
}
const diag = (id: string, status: 'ok' | 'warn' | 'bad', factors: { cause: string; weight: number; detail: string; diagId: string | null }[] = []) => ({
  id, system: 'colony', status, label: id, value: 0.5, factors, remedies: ['remedy.slider.nurse'], sinceTick: -1, focus: null,
});

beforeEach(() => { hudRequests.panels.health = hudRequests.panels.nest = hudRequests.panels.journal = false; });

describe('health slice', () => {
  it('carries the ranked diagnostics with factors, chain ids, remedies and a since label', () => {
    const sim = makeTestSim({ nest: 'small', workers: 6 });
    publishDiagnostic(sim, diag('diag-food-intake-p', 'bad', [{ cause: 'foragers', weight: 1, detail: '2 of 8 foragers', diagId: null }]));
    publishDiagnostic(sim, diag('diag-brood-growth', 'warn', [{ cause: 'protein', weight: 0.7, detail: 'short', diagId: 'diag-food-intake-p' }, { cause: 'nurses', weight: 0.3, detail: '3 of 12', diagId: null }]));
    publishDiagnostic(sim, diag('diag-stores', 'ok'));
    const h = healthOf(sim);
    expect(h.overall).toBe('bad');
    expect(h.rows.map((r) => r.id)).toEqual(['diag-food-intake-p', 'diag-brood-growth', 'diag-stores']);
    const brood = h.rows[1];
    expect(brood.factors.map((f) => [f.cause, f.diagId])).toEqual([['protein', 'diag-food-intake-p'], ['nurses', null]]);
    expect(brood.remedies).toEqual(['remedy.slider.nurse']);
    expect(brood.sinceLabel).toMatch(/^(Spring|Summer|Autumn|Winter) Day \d+, \d\d:\d\d$/);
  });
  it('a diagnostic with a history series gets its sparkline samples', () => {
    const sim = makeTestSim({ nest: 'small', workers: 6 });
    sim.state.progression.history.hourly['intake-p'] = { cap: 168, len: 4, head: 4, data: [1, 2, 3, 4, ...new Array(164).fill(0)] };
    publishDiagnostic(sim, diag('diag-food-intake-p', 'warn'));
    publishDiagnostic(sim, diag('diag-defence', 'warn'));
    const rows = healthOf(sim).rows;
    expect(rows.find((r) => r.id === 'diag-food-intake-p')).toMatchObject({ history: [1, 2, 3, 4], historyId: 'intake-p' });
    expect(rows.find((r) => r.id === 'diag-defence')).toMatchObject({ history: [], historyId: null });
  });
  it('no diagnostics is an ok colony with no rows', () => {
    const sim = makeTestSim({ nest: 'small', workers: 2 });
    expect(healthOf(sim)).toMatchObject({ overall: 'ok', rows: [] });
  });
});

describe('nest slice', () => {
  it('reads the player nest in BU relative to its origin', () => {
    const sim = makeTestSim({ nest: 'small', workers: 4 });
    const n = nestOf(sim);
    expect(n).not.toBeNull();
    expect(n!.chambers.length).toBeGreaterThan(0);
    for (const c of n!.chambers) {
      expect(Number.isFinite(c.p.x) && Number.isFinite(c.p.z) && Number.isFinite(c.p.depth)).toBe(true);
      expect(c.p.depth).toBeGreaterThanOrEqual(0);
      expect(c.volume).toBeGreaterThan(0);
      expect(c.humidity).toBeGreaterThanOrEqual(0);
    }
    expect(n!.entrances.length).toBeGreaterThan(0);
    expect(n!.broodBand?.lo).toBeLessThan(n!.broodBand!.hi);
    expect(n!.species).toBe(sim.state.colonies[0].species);
  });
  it('only valid designations are offered: big enough and allowed for the species', () => {
    const sim = makeTestSim({ nest: 'small', workers: 4 });
    const n = nestOf(sim)!;
    for (const c of n.chambers) for (const t of c.allowed) expect(['royal', 'nursery', 'food', 'midden', 'rest', 'general']).toContain(t);
    expect(n.chambers.every((c) => !c.allowed.includes('granary') && !c.allowed.includes('fungus'))).toBe(true);
  });
  it('no player nest is null', () => {
    const sim = makeTestSim({ nest: 'small', workers: 4 });
    for (const n of sim.state.nests) n.alive = false;
    expect(nestOf(sim)).toBeNull();
  });
});

describe('journal slice', () => {
  it('carries milestones, event log lines, series and calendar info', () => {
    const sim = makeTestSim({ nest: 'small', workers: 4 });
    recordMilestone(sim, 'ms-first-food');
    unlockCodex(sim, 'cx-honeydew');
    const j = journalOf(sim);
    expect(j.entries.some((e) => e.kind === 'milestone' && e.key === 'ms-first-food')).toBe(true);
    expect(j.events.some((e) => e.kind === 'milestone')).toBe(true);
    expect(j.seasonLength).toBe(sim.state.config.rules.seasonLengthDays);
    expect(j.startTick).toBe(sim.state.env.calendar.startTick);
    expect(Array.isArray(j.aims.current)).toBe(true);
  });
  it('keeps only the series the graphs draw', () => {
    const sim = makeTestSim({ nest: 'small', workers: 4 });
    sim.state.progression.history.hourly['range-max'] = { cap: 168, len: 1, head: 1, data: [5, ...new Array(167).fill(0)] };
    sim.state.progression.history.hourly['stores-c'] = { cap: 168, len: 2, head: 2, data: [1, 2, ...new Array(166).fill(0)] };
    sim.state.progression.history.daily['deaths-by-cause:cold'] = [0, 1];
    const j = journalOf(sim);
    expect(j.hourly['range-max']).toBeUndefined();
    expect(j.hourly['stores-c']).toEqual([1, 2]);
    expect(j.daily['deaths-by-cause:cold']).toEqual([0, 1]);
  });
});

describe('codex and marker slices', () => {
  it('codex: ids observed in this game with a date line', () => {
    const sim = makeTestSim({ nest: 'small', workers: 4 });
    unlockCodex(sim, 'cx-honeydew');
    const c = codexOf(sim);
    expect(Object.keys(c.seen)).toContain('cx-honeydew');
    expect(c.seen['cx-honeydew'].label).toMatch(/^(Spring|Summer|Autumn|Winter) · Day \d+ · Year \d+$/);
  });
  it('markers: counts against caps and the species comfort band', () => {
    const sim = makeTestSim({ nest: 'small', workers: 4 });
    const m = markerCountsOf(sim);
    for (const k of ['dig', 'forage', 'avoid', 'rally', 'entrance', 'move-brood', 'move-queen']) expect(m.counts[k].cap).toBeGreaterThan(0);
    expect(m.counts.forage).toEqual({ n: 0, cap: 4 });
    expect(m.comfortBand?.lo).toBeLessThan(m.comfortBand!.hi);
  });
  it('date helpers', () => {
    const sim = makeTestSim({ nest: 'small', workers: 2 });
    expect(dateOf(sim, 0)).toMatch(/^[A-Z][a-z]+ · Day \d+ · Year \d+$/);
    expect(sinceOf(sim, 250)).toMatch(/, \d\d:\d\d$/);
  });
});

describe('builder', () => {
  it('builds the heavy slices only while their panel is open, and shares unchanged ones', () => {
    const sim = makeTestSim({ nest: 'small', workers: 4 });
    const b = new SnapshotBuilder();
    const closed = b.build(src(sim), 0, 0);
    expect(closed.health).toBeNull();
    expect(closed.nest).toBeNull();
    expect(closed.journal).toBeNull();
    expect(closed.codex).not.toBeNull();
    expect(closed.markers).not.toBeNull();
    hudRequests.panels.health = hudRequests.panels.nest = hudRequests.panels.journal = true;
    const a = b.build(src(sim), closed.rev, 100);
    expect(a.health).not.toBeNull();
    expect(a.nest).not.toBeNull();
    expect(a.journal).not.toBeNull();
    const c = b.build(src(sim), a.rev, 200);
    expect(c.nest).toBe(a.nest);
    expect(c.journal).toBe(a.journal);
    expect(c.markers).toBe(a.markers);
  });
});
