// Text tables (task codex-content, deliverable 2): every id of the design index has wording, the wording follows
// GDD 08's tone and conflict-wording rules, and the alert patterns keep their length limits.
import { describe, expect, it } from 'vitest';
import {
  AIM_IDS, ALERT_KINDS, ALERT_LEVELS, DEATH_CAUSES, DIAGNOSTIC_STATUSES, HINT_IDS, HUMAN_EVENT_KINDS, MILESTONE_IDS,
  RALLY_MODES, RELATION_STATES, STAGES, WEATHER_STATES, ZONE_TYPES, JOURNAL_KINDS, FOUNDING_FAIL_CAUSES, SITE_FACTORS, SITE_WORDS,
} from '@/sim/types';
import { wordingProblems } from '../codex/banned';
import {
  AIM_TEXT, ALERT_TEXT, DEATH_CAUSE_WORD, EPITAPH, FIRST_BROOD_REPORT, FLIGHT_ENTRY, HINT_TEXT, HUMAN_EVENT_WARNING,
  JOURNAL_KIND_WORD, LOSS_ENTRY, MILESTONE_TEXT, RALLY_MODE_WORD, RELATION_NOTE, RELATION_WORD, REMEDY_WORD,
  SEASON_ENTRY, SEASON_WORD, STAGE_ENTRY, STAGE_WORD, STATUS_WORD, WEATHER_CHANGE_TITLE, WEATHER_FIRST_ENTRY,
  WEATHER_WORD, WINTER_REPORT, ZONE_WORD, FACTOR_CAUSE_WORD, FOUNDING_FAIL_TEXT, SITE_FACTOR_WORD, SITE_QUALITY_WORD, aimText, alertText, formatText, hintText, humanEventWarningText,
  milestoneText, templateTokens, weatherChangeText,
} from './index';

/** Tokens a template may use, by the milestone and report contracts (GDD 06 §8) and the alert patterns (GDD 08 §6.5). */
const MILESTONE_TOKENS = ['n', 'depth_mm', 'zone', 'zone_from', 'zone_to', 'species', 'doy_date'];

function allStrings(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const add = (where: string, text: string | undefined) => { if (text) out.push({ where, text }); };
  for (const [id, m] of Object.entries(MILESTONE_TEXT)) { add(`${id} title`, m.title); add(`${id} text`, m.text); }
  for (const [id, a] of Object.entries(ALERT_TEXT)) { add(`${id} title`, a.title); add(`${id} cause`, a.cause); }
  for (const [id, h] of Object.entries(HINT_TEXT)) add(id, h.verb);
  for (const [id, a] of Object.entries(AIM_TEXT)) { add(id, a.text); add(`${id} hint`, a.hint); }
  for (const [id, w] of Object.entries(RELATION_WORD)) add(id, w);
  for (const [id, w] of Object.entries(RELATION_NOTE)) add(`${id} note`, w);
  for (const [id, w] of Object.entries(DEATH_CAUSE_WORD)) { add(`${id} noun`, w.noun); add(`${id} phrase`, w.phrase); }
  for (const [id, w] of Object.entries(STAGE_ENTRY)) { add(`${id} stage`, w.title); add(`${id} stage text`, w.text); }
  for (const [id, w] of Object.entries(STAGE_WORD)) { add(`${id} word`, w.title); add(`${id} note`, w.note); }
  SEASON_ENTRY.forEach((s, i) => { add(`season ${i}`, s.title); add(`season ${i} text`, s.text); });
  for (const [id, w] of Object.entries(WEATHER_FIRST_ENTRY)) { add(id, w.title); add(`${id} text`, w.text); }
  for (const [id, w] of Object.entries(HUMAN_EVENT_WARNING)) { add(`${id} title`, w.title); add(`${id} cause`, w.cause); }
  for (const w of Object.values(WEATHER_CHANGE_TITLE)) add('weather change', w);
  for (const w of Object.values(FACTOR_CAUSE_WORD)) add('factor cause', w);
  for (const w of Object.values(REMEDY_WORD)) add('remedy', w);
  for (const w of Object.values(ZONE_WORD)) add('zone', w);
  for (const [id, w] of Object.entries(FOUNDING_FAIL_TEXT)) add(`${id} failure`, w);
  for (const w of Object.values(JOURNAL_KIND_WORD)) add('journal kind', w);
  add('loss', LOSS_ENTRY.text); add('flight', FLIGHT_ENTRY.text); add('first brood', FIRST_BROOD_REPORT.outcome);
  add('winter', WINTER_REPORT.survived); add('winter', WINTER_REPORT.untouched); add('winter', WINTER_REPORT.banner);
  add('epitaph', EPITAPH.lifeLine); add('epitaph', EPITAPH.howItEnded);
  return out;
}

describe('text tables cover the ids of the design index', () => {
  it('has a title and a journal line for every milestone', () => {
    expect(Object.keys(MILESTONE_TEXT).sort()).toEqual([...MILESTONE_IDS].sort());
    for (const id of MILESTONE_IDS) {
      const m = MILESTONE_TEXT[id];
      expect(m.title.length, id).toBeGreaterThan(2);
      expect(m.text.endsWith('.'), `${id} ends with a full stop`).toBe(true);
      for (const t of [...templateTokens(m.title), ...templateTokens(m.text)]) expect(MILESTONE_TOKENS, `${id} token ${t}`).toContain(t);
    }
  });

  it('has wording for every alert kind, hint, aim, relation state, death cause, stage and status', () => {
    expect(Object.keys(ALERT_TEXT).sort()).toEqual([...ALERT_KINDS].sort());
    expect(Object.keys(HINT_TEXT).sort()).toEqual([...HINT_IDS].sort());
    expect(Object.keys(AIM_TEXT).sort()).toEqual([...AIM_IDS].sort());
    expect(Object.keys(RELATION_WORD).sort()).toEqual([...RELATION_STATES].sort());
    expect(Object.keys(RELATION_NOTE).sort()).toEqual([...RELATION_STATES].sort());
    expect(Object.keys(DEATH_CAUSE_WORD).sort()).toEqual([...DEATH_CAUSES].sort());
    expect(Object.keys(STAGE_WORD).sort()).toEqual([...STAGES].sort());
    expect(Object.keys(STAGE_ENTRY).sort()).toEqual([...STAGES].sort());
    expect(Object.keys(STATUS_WORD).sort()).toEqual([...DIAGNOSTIC_STATUSES].sort());
    expect(Object.keys(RALLY_MODE_WORD).sort()).toEqual([...RALLY_MODES].sort());
    expect(Object.keys(WEATHER_WORD).sort()).toEqual([...WEATHER_STATES].sort());
    expect(Object.keys(WEATHER_CHANGE_TITLE).sort()).toEqual([...WEATHER_STATES].sort());
    expect(Object.keys(HUMAN_EVENT_WARNING).sort()).toEqual([...HUMAN_EVENT_KINDS].sort());
    expect(Object.keys(ZONE_WORD).sort()).toEqual([...ZONE_TYPES].sort());
    expect(Object.keys(JOURNAL_KIND_WORD).sort()).toEqual([...JOURNAL_KINDS].sort());
    expect(Object.keys(FOUNDING_FAIL_TEXT).sort()).toEqual([...FOUNDING_FAIL_CAUSES].sort());
    expect(Object.keys(SITE_FACTOR_WORD).sort()).toEqual([...SITE_FACTORS].sort());
    expect(Object.keys(SITE_QUALITY_WORD).sort()).toEqual([...SITE_WORDS].sort());
    expect(SEASON_ENTRY.length).toBe(4);
    expect(SEASON_WORD).toEqual(['Spring', 'Summer', 'Autumn', 'Winter']);
  });

  it('keeps milestone titles unique', () => {
    const titles = Object.values(MILESTONE_TEXT).map((m) => m.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('wording rules (GDD 08 tone line, §6.4)', () => {
  it('breaks none of them in any table', () => {
    const problems: string[] = [];
    for (const { where, text } of allStrings()) {
      for (const p of wordingProblems(formatText(text, {}))) problems.push(`${where}: ${p.rule} "${p.match}" in ${text}`);
    }
    expect(problems).toEqual([]);
  });

  it('writes the rival relation states as GDD 08 §6.4 requires', () => {
    expect(RELATION_WORD).toEqual({
      peace: 'Neutral', tension: 'Wary', skirmish: 'Clashing', war: 'Territorial dispute', truce: 'Lull',
    });
    for (const w of Object.values(RELATION_WORD)) expect(w).not.toMatch(/\b(war|truce|peace|battle|enemy)\b/i);
  });

  it('uses the diagnostic words of GDD 08 §4.4', () => {
    expect(STATUS_WORD).toEqual({ ok: 'Good', info: 'Note', warn: 'Strained', bad: 'Failing' });
  });

  it('writes milestone and alert text without exclamation marks, and titles in sentence case', () => {
    for (const { where, text } of allStrings()) expect(text, where).not.toContain('!');
    for (const [kind, a] of Object.entries(ALERT_TEXT)) {
      if (a.title.startsWith('{')) continue;
      expect(a.title[0], `${kind} title starts with a capital`).toBe(a.title[0].toUpperCase());
      expect(a.title.endsWith('.'), `${kind} title has no full stop`).toBe(false);
      expect(a.title, kind).not.toMatch(/\byou\b|\byour\b/i);
    }
  });
});

describe('alert patterns (GDD 08 §6.2, §6.5)', () => {
  it('keeps the filled title within 48 characters and the cause within 72', () => {
    for (const kind of ALERT_KINDS) {
      const a = alertText(kind, ALERT_TEXT[kind].sample);
      expect(a.title.length, `${kind} title "${a.title}"`).toBeLessThanOrEqual(48);
      expect(a.cause.length, `${kind} cause "${a.cause}"`).toBeLessThanOrEqual(72);
      expect(a.title, kind).not.toMatch(/\{/);
      expect(a.cause, kind).not.toMatch(/\{/);
    }
  });

  it('uses a known level for every kind and the levels the catalogue names', () => {
    for (const a of Object.values(ALERT_TEXT)) expect(ALERT_LEVELS).toContain(a.level);
    expect(ALERT_TEXT['queen-in-danger'].level).toBe('critical');
    expect(ALERT_TEXT['food-c-low'].level).toBe('warning');
    expect(ALERT_TEXT['source-found'].level).toBe('notice');
    expect(ALERT_TEXT['audio-blocked'].level).toBe('info');
  });

  it('fills the documented examples exactly', () => {
    expect(alertText('queen-reserves-low', { pct: 38, temp: 21 })).toEqual({
      level: 'warning', title: 'Queen\'s reserves low', cause: '38 % left — founding chamber 21 °C',
    });
    expect(alertText('winter-coming', { x: 6, winterDays: 7 }).cause).toBe('stores cover 6 of 7 days');
    expect(weatherChangeText('rain', 2)).toEqual({ title: 'Rain coming', cause: 'within 2 game hours' });
    expect(humanEventWarningText('footsteps', 'lawn')).toEqual({ title: 'Ground is trembling', cause: 'footsteps approaching the lawn' });
  });

  it('keeps numbers with units: every number token sits beside a unit word or symbol', () => {
    for (const kind of ALERT_KINDS) {
      for (const field of ['title', 'cause'] as const) {
        const tmpl = ALERT_TEXT[kind][field];
        for (const m of tmpl.matchAll(/\{(pct|temp|h|dist|days|winterDays|x|n|c|p|larvae)\}([^{]*)/g)) {
          const next = m[2].trimStart();
          if (['n', 'larvae'].includes(m[1])) continue; // counts of ants carry their noun right after
          expect(next.length === 0 || /^[%°A-Za-z]/.test(next) || m[1] === 'x', `${kind} ${field} {${m[1]}}`).toBe(true);
        }
      }
    }
  });
});

describe('format and lookups', () => {
  it('fills tokens, leaves unknown tokens visible and lists a template\'s tokens', () => {
    expect(formatText('A {a} and {b}', { a: 1 })).toBe('A 1 and {b}');
    expect(templateTokens('{a} {b} {a}')).toEqual(['a', 'b']);
    expect(milestoneText('ms-first-shaft', { depth_mm: 12 }).text).toContain('12 mm');
    expect(milestoneText('ms-zone-crossed', { zone_from: 'the lawn', zone_to: 'the paving' }).text)
      .toBe('A forager has crossed from the lawn onto the paving. The ground underfoot has changed.');
  });

  it('gives the hand-over aims the texts of GDD 06 and the Messor variant of the founding aim', () => {
    expect(aimText('aim-first-food').text).toBe('Where does the nearest sugar lie?');
    expect(aimText('aim-find-site').text).toBe('Where is the ground sheltered, warm and diggable?');
    expect(aimText('aim-find-site', 'messor-barbarus').text).toBe('Where is the ground open, dry and deep?');
    expect(aimText('aim-alates').hint).toBe('Out of season');
  });

  it('names an input action for the hints that teach a key', () => {
    expect(hintText('hint-dig')).toMatchObject({ verb: 'Dig', action: 'dig', hold: true });
    expect(hintText('hint-readiness').action).toBeNull();
  });
});
