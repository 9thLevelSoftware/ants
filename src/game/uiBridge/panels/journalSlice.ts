// The Journal's data (GDD 08 7.2, GDD 06 §9): aims, the timeline entries (ids and tokens: the interface words them
// through src/content/text), the event log, the thumbnails, and the history series the graphs draw. Built only while
// the Journal is open: it copies up to a few thousand small records.
import { tsToArray } from '@/core/timeSeries';
import { completedAims, currentAims, deathSummary, eventLog } from '@/sim/progression';
import { entryCalTick } from '@/sim/progression/journal';
import { dayOf, seasonLength } from '@/sim/time';
import type { Sim } from '@/sim/types';
import type { UiJournal } from '@/ui/api';
import { calTickOf } from './dates';

/** History series the graphs use (exact ids or `prefix:` families). */
const GRAPH_SERIES: readonly string[] = [
  'workers-by-caste:', 'workers', 'eggs', 'larvae', 'pupae', 'stores-c', 'stores-p', 'intake-c', 'intake-p', 'intake-by-kind:', 'deaths-by-cause:',
  'nest-volume', 'nursery-temp', 'air-temp',
];

const wanted = (id: string): boolean => GRAPH_SERIES.some((p) => (p.endsWith(':') ? id.startsWith(p) : id === p));

/** Calendar tick an aim was opened (`done` false) or completed (true), from the journal entry that recorded it; undefined when none was written. */
function aimCalTick(sim: Sim, id: string, done: boolean): number | undefined {
  const e = sim.state.progression.journal.entries.find((x) => x.kind === 'aim' && x.key === id && (x.refs.length > 0) === done);
  return e ? entryCalTick(sim, e) : undefined;
}

export function journalOf(sim: Sim): UiJournal {
  const p = sim.state.progression;
  const hourly: Record<string, number[]> = {};
  for (const id of Object.keys(p.history.hourly)) if (wanted(id)) hourly[id] = tsToArray(p.history.hourly[id]);
  const daily: Record<string, number[]> = {};
  for (const id of Object.keys(p.history.daily)) if (wanted(id)) daily[id] = p.history.daily[id].slice();
  const thumbs: Record<string, string> = {};
  for (const t of p.milestoneThumbs) thumbs[t.milestoneId] = t.dataUrl;
  const d = deathSummary(sim);
  const now = sim.state.tick;
  return {
    nowTick: now, startTick: sim.state.env.calendar.startTick, seasonLength: seasonLength(sim.state), species: sim.state.config.species,
    aims: {
      current: currentAims(sim).map((a) => ({ id: a.id, openedTick: a.openedTick, doneTick: -1, hint: a.hint, openedCal: aimCalTick(sim, a.id, false) })),
      done: completedAims(sim).map((a) => ({ id: a.id, openedTick: -1, doneTick: a.doneTick, hint: null, doneCal: aimCalTick(sim, a.id, true) })),
    },
    entries: p.journal.entries.map((e) => ({ id: e.id, tick: e.tick, calTick: entryCalTick(sim, e), kind: e.kind, key: e.key ?? '', tokens: { ...(e.tokens ?? {}) } })),
    thumbs,
    events: eventLog(sim).map((e) => ({
      tick: e.tick, calTick: entryCalTick(sim, e), kind: e.kind, level: e.level, text: e.text, key: e.key ?? '', tokens: { ...(e.tokens ?? {}) },
      focus: e.focus ? { kind: e.focus.kind, id: e.focus.id, pos: { ...e.focus.pos } } : null,
    })),
    hourly, daily, dailyEndDay: dayOf(calTickOf(sim, now)) - 1,
    deaths: { total: d.total, top: d.top },
  };
}
