// Regression tests of the fixes made after the independent review (the reviewer's own reproductions live in
// progression.verify.test.ts): player-colony checks of trigger rows, the full-list alert path, aim journal entries
// for aims another module closes, the per-year merge of a full timeline, and the held-back diagnostic alert.

import { describe, expect, it } from 'vitest';
import type { Diagnostic, Sim } from '@/sim/types';
import { ALERT_COOLDOWN_GAME_H, ALERTS_ACTIVE_MAX, DIAGNOSTICS_EVERY, JOURNAL_CAP } from '@/sim/balance';
import { createColony, spawnAnt } from '@/sim/entities';
import { TICKS_PER_HOUR, ticksPerYear } from '@/sim/time';
import { journalEntries, publishDiagnostic, raiseAlert } from './index';
import { AIM_DONE_REF } from './aims';
import { addJournal, SEASON_SUMMARY_KEY } from './journal';
import { frassFromPlayerSite } from './fixtures';
import { aWorker, makeProgSim, pollOnce, recordEvents } from './testkit';

function rivalWorker(sim: Sim): number {
  const c = createColony(sim, { species: 'formica-rufa', isPlayer: false });
  return spawnAnt(sim, { colony: c.id, caste: 'worker', pos: { ...aWorker(sim).pos }, nestId: -1, chamberId: -1 }).id;
}

function diag(id: string, status: Diagnostic['status']): Diagnostic {
  return { id, system: 'test', status, label: id, value: 0.5, factors: [], remedies: [], sinceTick: -1, focus: null };
}

describe('trigger rows only fire for the player colony', () => {
  it('a rival removing a corpse does not unlock cx-necrophoresis; a player worker does', () => {
    const sim = makeProgSim();
    sim.emit({ type: 'corpse-removed', antId: rivalWorker(sim), itemId: 1, to: 'midden' });
    pollOnce(sim);
    expect(sim.state.progression.codexSeen['cx-necrophoresis']).toBeUndefined();
    sim.emit({ type: 'corpse-removed', antId: aWorker(sim).id, itemId: 1, to: 'midden' });
    pollOnce(sim);
    expect(sim.state.progression.codexSeen['cx-necrophoresis']).toBeTypeOf('number');
  });

  it('frass from a site that is not the colony\'s fires neither ms-first-gallery nor cx-frass', () => {
    const sim = makeProgSim({ species: 'camponotus-pennsylvanicus' });
    sim.emit({ type: 'frass-ejected', siteId: 999, pos: { x: 0, y: 0, z: 0 } });
    sim.emit({ type: 'frass-pile-grew', pileId: 1, units: 3 });
    pollOnce(sim);
    expect(sim.state.progression.milestones['ms-first-gallery']).toBeUndefined();
    expect(sim.state.progression.codexSeen['cx-frass']).toBeUndefined();
    frassFromPlayerSite(sim);
    pollOnce(sim);
    expect(sim.state.progression.milestones['ms-first-gallery']).toBeDefined();
    expect(sim.state.progression.codexSeen['cx-frass']).toBeTypeOf('number');
  });
});

describe('active-alert cap', () => {
  it('a full list refuses a lower alert (log only) but makes room for a higher one, which clears the dropped card', () => {
    const sim = makeProgSim();
    const ev = recordEvents(sim, ['alert']);
    for (let i = 0; i < ALERTS_ACTIVE_MAX; i++) {
      raiseAlert(sim, { kind: 'nest-crowded', level: 'notice', subjectId: i, title: 't', cause: 'c', focus: null, diagnosticId: null });
    }
    expect(raiseAlert(sim, { kind: 'source-exhausted', level: 'info', subjectId: 1, title: 't', cause: 'c', focus: null, diagnosticId: null })).toBe(-1);
    expect(sim.state.progression.eventLog.some((r) => r.kind === 'alert.full')).toBe(true);
    const id = raiseAlert(sim, { kind: 'nest-attacked', level: 'critical', subjectId: 1, title: 't', cause: 'c', focus: null, diagnosticId: null });
    sim.tick();
    expect(sim.state.progression.alerts).toHaveLength(ALERTS_ACTIVE_MAX);
    expect(sim.state.progression.alerts.some((a) => a.id === id)).toBe(true);
    const cleared = ev.filter((e) => e.type === 'alert' && e.op === 'clear');
    expect(cleared).toHaveLength(1);
    expect(cleared[0].type === 'alert' && cleared[0].alert.subjectId).toBe(0); // the oldest notice
  });

  it('a diagnostic whose raise was refused by a full list gets its alert once there is room', () => {
    const sim = makeProgSim();
    for (let i = 0; i < ALERTS_ACTIVE_MAX; i++) {
      raiseAlert(sim, { kind: 'nest-attacked', level: 'critical', subjectId: i, title: 't', cause: 'c', focus: null, diagnosticId: null });
    }
    publishDiagnostic(sim, diag('diag-dig-progress:3', 'warn'));
    expect(sim.state.progression.alerts.some((a) => a.kind === 'dig-stalled')).toBe(false);
    sim.state.progression.alerts.splice(0, 1);
    for (let i = 0; i < DIAGNOSTICS_EVERY + 1; i++) sim.tick(); // one registry upkeep
    expect(sim.state.progression.alerts.some((a) => a.kind === 'dig-stalled' && a.subjectId === 3)).toBe(true);
  });

  it('a held-back raise is forgotten when the status clears before the cooldown ends', () => {
    const sim = makeProgSim();
    const id = 'diag-dig-progress:4';
    for (const s of ['warn', 'ok', 'warn', 'ok'] as const) {
      publishDiagnostic(sim, diag(id, s));
      sim.tick();
    }
    for (let t = 0; t < (ALERT_COOLDOWN_GAME_H.notice + 1) * TICKS_PER_HOUR; t += 200) for (let i = 0; i < 200; i++) sim.tick();
    expect(sim.state.progression.alerts.some((a) => a.kind === 'dig-stalled')).toBe(false);
    expect(sim.state.progression.engine!.mem[`dheld:${id}`]).toBeUndefined();
  });
});

describe('aim journal entries', () => {
  it('an aim another module closes gets one completed entry; progression\'s own entries are not doubled', () => {
    const sim = makeProgSim({ workers: 4 });
    sim.state.progression.aims.push({ id: 'aim-seal', state: 'open', openedTick: 0, doneTick: -1 });
    sim.emit({ type: 'aim.opened', id: 'aim-seal' });
    sim.tick();
    const a = sim.state.progression.aims.find((x) => x.id === 'aim-seal')!;
    a.state = 'done';
    sim.emit({ type: 'aim.completed', id: 'aim-seal' });
    sim.tick();
    sim.emit({ type: 'aim.completed', id: 'aim-seal' }); // a repeat writes nothing
    sim.tick();
    const entries = journalEntries(sim, ['aim']).filter((e) => e.key === 'aim-seal');
    expect(entries.map((e) => e.refs)).toEqual([[], [AIM_DONE_REF]]);
  });
});

describe('full timeline (GDD 06 §9.1)', () => {
  it('merges an earlier year\'s season and weather notes into one summary before dropping anything else', () => {
    const sim = makeProgSim();
    const entries = sim.state.progression.journal.entries;
    addJournal(sim, 'milestone', 'ms-first-eggs');
    for (let i = 0; i < 3; i++) addJournal(sim, 'season', `season.${i}`, { workers: 1, brood: 0, c: 0, p: 0, weather: 'clear' });
    addJournal(sim, 'weather', 'weather.rain');
    // move the calendar on one year (the notes above keep their calendar date, so they are last year's) and fill
    // the timeline up to the cap with entries that cannot be merged
    const year = ticksPerYear(sim.state.config);
    sim.state.env.calendar.startTick += year;
    for (const e of entries) e.tick -= year;
    addJournal(sim, 'season', 'season.0', { workers: 1, brood: 0, c: 0, p: 0, weather: 'clear' });
    while (entries.length < JOURNAL_CAP) addJournal(sim, 'event', 'event.flood');
    addJournal(sim, 'event', 'event.flood');
    expect(entries.length).toBe(JOURNAL_CAP - 2); // CAP + 1 entries, 4 notes merged into 1 summary
    const summary = entries.find((e) => e.key === SEASON_SUMMARY_KEY)!;
    expect(summary.tokens).toEqual({ year: 1, seasons: 3, weather: 1 });
    expect(entries.some((e) => e.key === 'weather.rain')).toBe(false);
    expect(entries[0].key).toBe('ms-first-eggs');
    expect(entries[1]).toBe(summary);
    expect(entries.filter((e) => e.kind === 'season' && e.key === 'season.0')).toHaveLength(1); // this year's note stays
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    expect(entries.every((e, i) => i === 0 || e.id > entries[i - 1].id)).toBe(true);
  });
});
