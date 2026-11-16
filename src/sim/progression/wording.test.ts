// Every text id progression writes into state has wording in the content tables, with exactly the tokens the
// wording expects (addendum: state carries ids and token values; the interface formats them).

import { describe, expect, it } from 'vitest';
import type { AimId, JournalEntry, MilestoneId, Sim, StageId } from '@/sim/types';
import { MILESTONE_IDS } from '@/sim/types';
// Test-only read of the content tables (task addendum). Relative paths: layering.test.ts allows only the
// @/core, @/sim and @/worldgen aliases in src/sim; simulation code itself never imports src/content.
import {
  AIM_TEXT, ALERT_TEXT, FLIGHT_ENTRY, LOSS_ENTRY, MILESTONE_TEXT, SEASON_ENTRY, STAGE_ENTRY, WEATHER_FIRST_ENTRY,
  WINTER_REPORT, templateTokens,
} from '../../content/text';
import { hasCodexEntry } from '../../content/codex';
import { killAnt } from '@/sim/entities';
import { MILESTONE_FIXTURES, addWorkers } from './fixtures';
import { makeProgSim, pollOnce } from './testkit';

const tokensOf = (...templates: string[]): string[] => [...new Set(templates.flatMap(templateTokens))].sort();

/** The wording template(s) a journal key resolves to; null = a known gap reported to the content task. */
function templatesFor(e: JournalEntry): string[] | null {
  const k = e.key!;
  if ((MILESTONE_IDS as readonly string[]).includes(k)) return [MILESTONE_TEXT[k as MilestoneId].title, MILESTONE_TEXT[k as MilestoneId].text];
  if (k.startsWith('stage.')) { const s = STAGE_ENTRY[k.slice(6) as StageId]; return [s.title, s.text]; }
  if (k.startsWith('season.')) { const s = SEASON_ENTRY[Number(k.slice(7))]; return [s.title, s.text]; }
  if (k.startsWith('weather.')) { const w = WEATHER_FIRST_ENTRY[k.slice(8) as keyof typeof WEATHER_FIRST_ENTRY]; return [w.title, w.text]; }
  if (k === 'loss') return [LOSS_ENTRY.title, LOSS_ENTRY.text];
  if (k === 'winter-report') return [WINTER_REPORT.survived];
  if (k === 'flight') return [FLIGHT_ENTRY.title, FLIGHT_ENTRY.text];
  if (e.kind === 'aim') return [AIM_TEXT[k as AimId].text];
  if (k.startsWith('event.')) return null; // no `event` wording yet (reported)
  // no wording yet for the queen's loss entry and the per-year season summary (reported to the content task)
  if (k === 'loss.queen' || k === 'season-summary') return null;
  throw new Error(`unknown journal key ${k}`);
}

/** A sim that went through every kind of entry progression writes. */
function eventfulSim(): Sim {
  const sim = makeProgSim({ workers: 4 });
  sim.state.player.opening!.phase = 'handover';
  for (const id of MILESTONE_IDS) if (id !== 'ms-year-1' && id !== 'ms-year-5') MILESTONE_FIXTURES[id](sim);
  pollOnce(sim);
  sim.emit({ type: 'time.season', season: 'autumn', year: 1 });
  for (const to of ['rain', 'storm', 'heat', 'frost'] as const) sim.emit({ type: 'weather.changed', from: 'clear', to, intensityClass: null, reason: 'test' });
  sim.emit({ type: 'overwinter.report', report: { workersLost: 3, cold: 2, starvation: 1, storesUsedC: 4, storesUsedP: 1 } });
  sim.emit({ type: 'flight.launched', id: 1, nGynes: 4, nMales: 8, weather: 'clear' });
  sim.emit({ type: 'flight.ended', id: 1, nFounded: 1 });
  sim.emit({ type: 'flood-started', nestId: sim.state.nests[0].id, water: 1, level: 0, chambers: [] });
  const col = sim.state.colonies[0];
  const ants = sim.stores.ants.list.filter((a) => a.alive && a.colony === col.id && a.caste === 'worker');
  for (const a of ants.slice(0, 6)) killAnt(sim, a.id, 'heat');
  pollOnce(sim);
  addWorkers(sim, 0);
  return sim;
}

describe('wording of progression text ids', () => {
  it('journal entries: every key has wording and exactly its tokens', () => {
    const sim = eventfulSim();
    const entries = sim.state.progression.journal.entries;
    const kinds = new Set(entries.map((e) => e.kind));
    for (const k of ['milestone', 'stage', 'season', 'weather', 'loss', 'winter-report', 'flight', 'aim', 'event']) expect(kinds.has(k as JournalEntry['kind']), k).toBe(true);
    for (const e of entries) {
      expect(e.title).toBe('');
      expect(e.text).toBe('');
      const t = templatesFor(e);
      if (!t) continue;
      expect(Object.keys(e.tokens ?? {}).sort(), e.key).toEqual(tokensOf(...t));
    }
  });

  it('alerts progression raises carry exactly their tokens; codex ids in the log have entries', () => {
    const sim = makeProgSim({ workers: 4 });
    const col = sim.state.colonies[0];
    sim.state.player.opening!.phase = 'done'; sim.state.player.opening!.done = true; // established (no last-ants while the opening runs)
    for (const a of sim.stores.ants.list.filter((x) => x.alive && x.colony === col.id && x.caste === 'worker').slice(0, 2)) killAnt(sim, a.id, 'cold');
    pollOnce(sim);
    const last = sim.state.progression.alerts.find((a) => a.kind === 'last-ants')!;
    expect(last.level).toBe('critical');
    expect(Object.keys(last.tokens!).sort()).toEqual(tokensOf(ALERT_TEXT['last-ants'].title, ALERT_TEXT['last-ants'].cause));
    for (const r of sim.state.progression.eventLog.filter((x) => x.kind === 'codex')) expect(hasCodexEntry(r.key!), r.key).toBe(true);
  });
});
