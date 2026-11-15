// Resolves a journal entry (its `key` and `tokens` as the progression module writes them) to its title and text.
// Progression keeps ids in the tokens (a death cause, a weather state); this is the one place that turns them
// into words, so the timeline panel only calls `journalEntryText`.
import type { AimId, DeathCause, HumanEventKind, MilestoneId, StageId, WeatherState, ZoneType } from '@/sim/types';
import { AIM_IDS, HUMAN_EVENT_KINDS, MILESTONE_IDS } from '@/sim/types';
import { formatText } from './format';
import type { TextTokens } from './format';
import { AIM_TEXT } from './hints';
import {
  EVENT_ENTRY, FLIGHT_ENTRY, HUMAN_EVENT_ENTRY, LOSS_ENTRY, LOSS_WHERE_WORD, QUEEN_LOSS_ENTRY, SEASON_ENTRY,
  SEASON_SUMMARY_ENTRY, STAGE_ENTRY, WEATHER_FIRST_ENTRY, WINTER_REPORT,
} from './journal';
import { MILESTONE_TEXT } from './milestones';
import { DEATH_CAUSE_WORD, WEATHER_WORD } from './words';

export interface JournalWording {
  title: string;
  text: string;
}

const has = (list: readonly string[], k: string): boolean => list.includes(k);
const deathCause = (id: unknown): (typeof DEATH_CAUSE_WORD)[DeathCause] => DEATH_CAUSE_WORD[id as DeathCause] ?? DEATH_CAUSE_WORD.unknown;
const lower = (s: string): string => s.toLowerCase();

/** Title and text of a journal entry, or null for a key that has no wording (a bug in this table; the test lists all keys). */
export function journalEntryText(key: string, tokens: TextTokens = {}): JournalWording | null {
  const fill = (w: { title: string; text: string }, t: TextTokens = tokens): JournalWording => ({
    title: formatText(w.title, t), text: formatText(w.text, t),
  });
  if (has(MILESTONE_IDS, key)) return fill(MILESTONE_TEXT[key as MilestoneId]);
  if (key.startsWith('stage.')) {
    const s = STAGE_ENTRY[key.slice(6) as StageId];
    return s ? fill(s) : null;
  }
  if (key.startsWith('season.')) {
    const s = SEASON_ENTRY[Number(key.slice(7))];
    const w = WEATHER_WORD[tokens.weather as WeatherState];
    return s ? fill(s, { ...tokens, weather: w ? lower(w) : String(tokens.weather ?? '') }) : null;
  }
  if (key === 'season-summary') return fill(SEASON_SUMMARY_ENTRY);
  if (key.startsWith('weather.')) {
    const w = WEATHER_FIRST_ENTRY[key.slice(8) as keyof typeof WEATHER_FIRST_ENTRY];
    return w ? fill(w) : null;
  }
  if (key === 'loss') {
    const where = LOSS_WHERE_WORD[tokens.where as 'nest' | ZoneType] ?? LOSS_WHERE_WORD.nest;
    return fill(LOSS_ENTRY, { ...tokens, cause: deathCause(tokens.cause).noun, where });
  }
  if (key === 'loss.queen') return fill(QUEEN_LOSS_ENTRY, { ...tokens, cause: deathCause(tokens.cause).phrase });
  if (key === 'winter-report') {
    const lost = Number(tokens.n) > 0;
    return { title: WINTER_REPORT.title, text: formatText(lost ? WINTER_REPORT.survived : WINTER_REPORT.untouched, tokens) };
  }
  if (key === 'flight') return fill(FLIGHT_ENTRY);
  if (has(AIM_IDS, key)) return { title: 'Aim', text: AIM_TEXT[key as AimId].text };
  if (key === 'event.flood') return fill(EVENT_ENTRY.flood);
  if (key === 'event.raid') return fill(EVENT_ENTRY.raid);
  if (key.startsWith('event.human.')) {
    const kind = key.slice(12);
    return has(HUMAN_EVENT_KINDS, kind) ? fill(HUMAN_EVENT_ENTRY[kind as HumanEventKind]) : null;
  }
  return null;
}
