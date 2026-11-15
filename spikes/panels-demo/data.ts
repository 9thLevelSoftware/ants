// Mock data of every panel state (task ui-panels): a Lasius colony in its third week with a strained brood, a nest of seven
// chambers, eleven game days of history, fifteen milestones, a log, aims and a few codex entries observed.
import type {
  UiChamber, UiCodexSeen, UiDiagnostic, UiEntrance, UiEventLogLine, UiHealth, UiJournal, UiJournalEntry, UiMarkerCounts, UiNest, UiTunnel,
} from '@/ui/api';

export const TICKS_PER_DAY = 6000;
/** Calendar day 9 = Summer, Day 3 (the start of a Lasius game); now is 11.4 game days later. */
export const START_TICK = 9 * TICKS_PER_DAY;
export const NOW_TICK = Math.round(11.4 * TICKS_PER_DAY);

const f = (cause: string, weight: number, detail: string, diagId: string | null = null) => ({ cause, weight, detail, diagId });

function diag(id: string, status: UiDiagnostic['status'], label: string, value: number, sinceDay: number, factors: ReturnType<typeof f>[], remedies: string[], hist: number[] = [], historyId: string | null = null): UiDiagnostic {
  return { id, system: 'colony', status, label, value, sinceTick: Math.round(sinceDay * TICKS_PER_DAY), sinceLabel: `Summer Day ${3 + Math.floor(sinceDay)}, ${String(8 + Math.floor((sinceDay % 1) * 24) % 16).padStart(2, '0')}:00`, factors, remedies, focus: null, history: hist, historyId };
}

const wave = (n: number, base: number, amp: number, drift = 0, phase = 0): number[] => Array.from({ length: n }, (_, i) => Math.max(0, base + Math.sin(i / 7 + phase) * amp + drift * (i / n)));

export function demoHealth(): UiHealth {
  const rows: UiDiagnostic[] = [
    diag('diag-brood-growth', 'bad', 'Brood growth', 0.4, 6.2, [
      f('protein', 0.55, 'larva-time with protein in the gut', 'diag-food-intake-p'), f('nurses', 0.2, '3 of 12 nurses'), f('temperature', 0.15, 'nursery 17 °C, best 22-27 °C'),
      f('crowding', 0.06, 'brood chambers near capacity'), f('hygiene', 0.03, 'waste in brood chambers'), f('humidity', 0.01, 'dry brood chambers'),
    ], ['remedy.slider.nurse', 'remedy.dig.nursery', 'remedy.marker.move-brood'], wave(72, 0.8, 0.12, -0.35), 'larvae'),
    diag('diag-food-intake-p', 'warn', 'Protein intake', 0.55, 5.1, [
      f('foragers', 0.45, '5 of 11 foragers'), f('sources', 0.3, '1 known source', 'diag-foraging-trails'), f('weather', 0.15, 'surface activity 70 %'), f('distance', 0.1, '71 s per trip'),
    ], ['remedy.diet.protein', 'remedy.marker.forage', 'remedy.slider.forage', 'remedy.possess.forage'], wave(72, 0.9, 0.1, -0.3), 'intake-p'),
    diag('diag-foraging-trails', 'warn', 'Foraging trails', 0.62, 5.6, [f('trail-lost', 0.6, 'rain washed out the trail'), f('success', 0.4, '58 % of trips succeed')], ['remedy.marker.forage'], wave(72, 0.8, 0.08, -0.15), 'trip-success'),
    diag('diag-nest-space', 'info', 'Nest space', 0.9, 8.0, [f('brood-space', 0.7, 'nursery at 88 % capacity'), f('food-space', 0.3, 'room left')], ['remedy.dig.nursery', 'remedy.architect.auto'], wave(72, 180, 6, 40), 'nest-volume'),
    diag('diag-stores', 'ok', 'Food stores', 1, 1.0, [f('carbohydrate', 1, '4.6 of 4 days')], ['remedy.dig.food'], wave(72, 7, 1, 1), 'stores-c'),
    diag('diag-workforce', 'ok', 'Workforce', 1, 2.5, [], ['remedy.slider.dig'], wave(72, 30, 2, 4), 'workers'),
    diag('diag-queen-condition', 'ok', 'Queen condition', 1, 0.2, [], [], wave(72, 0.9, 0.02), 'queen-reserves'),
    diag('diag-nest-climate', 'ok', 'Nest climate', 0.95, 3.0, [], [], wave(72, 22, 1.5, 1), 'nursery-temp'),
  ];
  return { overall: 'bad', rows, nowTick: NOW_TICK };
}

const load = (adults = 0, brood = 0, food = 0) => ({ adults, brood, food, other: 0 });
function ch(id: number, type: string, x: number, z: number, depth: number, radius: number, volume: number, occ: ReturnType<typeof load>, cap: ReturnType<typeof load>, temp: number, rh: number, o: Partial<UiChamber> = {}): UiChamber {
  return { id, type, designatedBy: type === 'royal' ? 'auto' : 'player', p: { x, z, depth }, radius, volume, occupancy: occ, capacity: cap, temp, humidity: rh, flooded: 0, floodRisk: 0.05, allowed: ['royal', 'nursery', 'food', 'midden', 'rest', 'general'], ...o };
}

export function demoNest(): UiNest {
  const chambers: UiChamber[] = [
    ch(1, 'royal', 2, 1, 9, 3.2, 52, load(5, 6, 0), load(15, 104, 0), 23.5, 0.82),
    ch(2, 'nursery', 12, 3, 12, 3.6, 71, load(3, 26, 0), load(21, 107, 0), 25, 0.78),
    ch(3, 'nursery', -9, -2, 14, 3.1, 46, load(2, 43, 0), load(14, 69, 0), 17.5, 0.62, { floodRisk: 0.1 }),
    ch(4, 'food', -17, 4, 8, 2.6, 30, load(1, 0, 16), load(6, 0, 60), 20, 0.7),
    ch(5, 'midden', 20, -3, 6, 2.4, 26, load(0, 0, 0), load(5, 0, 0), 19, 0.6),
    ch(6, 'general', 4, -9, 18, 4.2, 95, load(40, 0, 0), load(28, 0, 0), 15, 0.9, { floodRisk: 0.42 }),
    ch(7, 'rest', -3, 11, 22, 3.4, 64, load(6, 0, 0), load(19, 0, 0), 12, 0.95, { flooded: 0.18, floodRisk: 0.8 }),
  ];
  const e = (id: number, x: number, status: string, mound: number | null, tin: number, tout: number): UiEntrance => ({ id, status, kind: 'founding', p: { x, z: 0, depth: 0 }, moundBu: mound, trafficIn: tin, trafficOut: tout });
  const tunnels: UiTunnel[] = [
    { planId: 11, kind: 'shaft', status: 'complete', pts: [{ x: 0, z: 0, depth: 0 }, { x: 1, z: 0, depth: 5 }, { x: 2, z: 1, depth: 9 }] },
    { planId: 12, kind: 'tunnel', status: 'complete', pts: [{ x: 2, z: 1, depth: 9 }, { x: 7, z: 2, depth: 10.5 }, { x: 12, z: 3, depth: 12 }] },
    { planId: 13, kind: 'tunnel', status: 'complete', pts: [{ x: 2, z: 1, depth: 9 }, { x: -4, z: -1, depth: 12 }, { x: -9, z: -2, depth: 14 }] },
    { planId: 14, kind: 'tunnel', status: 'active', pts: [{ x: -9, z: -2, depth: 14 }, { x: -13, z: 1, depth: 10 }, { x: -17, z: 4, depth: 8 }] },
    { planId: 15, kind: 'entrance', status: 'complete', pts: [{ x: 20, z: -3, depth: 0 }, { x: 20, z: -3, depth: 6 }] },
  ];
  return {
    nestId: 1, species: 'lasius-niger', broodBand: { lo: 22, hi: 27, rhLo: 0.7, rhHi: 0.9 }, volumeOpen: chambers.reduce((a, c) => a + c.volume, 0) + 40,
    chambers, entrances: [e(1, 0, 'open', 2.4, 42, 38), e(2, 20, 'sealed', null, 0, 0)], tunnels, openPlans: 2,
  };
}

const MS: [string, number][] = [
  ['ms-first-shaft', 0.05], ['ms-founding-chamber', 0.4], ['ms-sealed-in', 0.8], ['ms-first-eggs', 1.5], ['ms-first-larva', 3.2], ['ms-first-pupa', 4.9], ['ms-first-worker', 6.1],
  ['ms-nest-reopened', 6.6], ['ms-first-food', 6.9], ['ms-first-trail', 7.8], ['ms-second-chamber', 8.3], ['ms-first-honeydew', 8.9], ['ms-workers-25', 9.8], ['ms-nursery', 10.2], ['ms-first-rain', 10.9],
];

function entries(): UiJournalEntry[] {
  const out: UiJournalEntry[] = MS.map(([key, day], i) => ({ id: i + 1, tick: Math.round(day * TICKS_PER_DAY), kind: 'milestone', key, tokens: (key === 'ms-first-shaft' ? { depth_mm: 32 } : {}) as Record<string, string | number> }));
  out.push({ id: 100, tick: Math.round(7.2 * TICKS_PER_DAY), kind: 'season', key: 'season.2', tokens: { workers: 12, brood: 40, c: 5.2, p: 1.1, weather: 'clear' } });
  return out;
}

const hourly = (base: number, amp: number, drift: number, phase = 0): number[] => wave(168, base, amp, drift, phase).map((v) => Math.round(v * 100) / 100);
const daily = (n: number, base: number, amp: number, drift: number): number[] => wave(n, base, amp, drift).map((v) => Math.round(v * 100) / 100);
const DAYS = 11;

export function demoJournal(): UiJournal {
  const ev = (day: number, kind: string, level: string, key: string, tokens: Record<string, string | number> = {}, text = ''): UiEventLogLine => ({ tick: Math.round(day * TICKS_PER_DAY), kind, level, text, key, tokens, focus: kind.startsWith('alert') ? { kind: 'chamber', id: 3, pos: { x: 0, y: -20, z: 0 } } : null });
  const events: UiEventLogLine[] = [
    ev(6.1, 'milestone', 'info', 'ms-first-worker'), ev(6.4, 'codex', 'info', 'cx-callow'), ev(7.8, 'milestone', 'info', 'ms-first-trail'),
    ev(8.5, 'alert.raise', 'notice', 'source-found', { kind: 'honeydew', dist: 140, dir: 'north-east' }), ev(9.4, 'alert.raise', 'warning', 'food-p-low', { larvae: 18, p: 0.3 }),
    ev(10.2, 'milestone', 'info', 'ms-nursery'), ev(10.7, 'alert.raise', 'warning', 'brood-stalled', { cause: 'protein short', temp: 17 }), ev(10.9, 'milestone', 'info', 'ms-first-rain'), ev(11.1, 'alert.clear', 'notice', 'source-found'),
  ];
  const castes = { worker: [3, 38], minor: [0, 0], queen: [1, 1] };
  const hs: Record<string, number[]> = {
    'workers-by-caste:worker': hourly(18, 6, 22), 'workers-by-caste:queen': hourly(1, 0, 0), 'workers-by-caste:male': hourly(0, 0, 0),
    eggs: hourly(10, 3, 4, 1), larvae: hourly(16, 4, 8, 2), pupae: hourly(5, 2, 6, 3), 'stores-c': hourly(6, 1.4, 1.4), 'stores-p': hourly(2, 0.5, -1.1, 1),
    'intake-c': hourly(3, 1, 0.5), 'intake-p': hourly(0.8, 0.25, -0.4, 2), 'nest-volume': hourly(120, 8, 90), 'nursery-temp': hourly(21, 3, 2), 'air-temp': hourly(19, 6, 3, 0.5),
    'intake-by-kind:honeydew': hourly(2, 0.8, 0.4), 'intake-by-kind:prey': hourly(0.6, 0.3, -0.2, 2), 'intake-by-kind:nectar': hourly(0.8, 0.4, 0.1, 1),
  };
  void castes;
  const ds: Record<string, number[]> = {
    'workers-by-caste:worker': daily(DAYS, 6, 2, 30), 'workers-by-caste:queen': daily(DAYS, 1, 0, 0), eggs: daily(DAYS, 8, 3, 6), larvae: daily(DAYS, 10, 3, 9), pupae: daily(DAYS, 3, 2, 6),
    'stores-c': daily(DAYS, 4, 1, 3), 'stores-p': daily(DAYS, 2, 0.4, -1), 'intake-c': daily(DAYS, 2, 0.8, 1.5), 'intake-p': daily(DAYS, 0.6, 0.2, -0.2), 'nest-volume': daily(DAYS, 60, 6, 130),
    'nursery-temp': daily(DAYS, 21, 2, 1), 'air-temp': daily(DAYS, 19, 4, 1),
    'intake-by-kind:honeydew': daily(DAYS, 1.6, 0.6, 0.8), 'intake-by-kind:prey': daily(DAYS, 0.5, 0.2, -0.1), 'intake-by-kind:nectar': daily(DAYS, 0.7, 0.3, 0.1),
    'deaths-by-cause:old-age': [0, 0, 0, 1, 0, 0, 2, 1, 0, 1, 0], 'deaths-by-cause:predation': [0, 0, 0, 0, 0, 1, 0, 2, 1, 0, 1], 'deaths-by-cause:cold': [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1],
  };
  return {
    nowTick: NOW_TICK, startTick: START_TICK, seasonLength: 7, species: 'lasius-niger',
    aims: {
      current: [{ id: 'aim-first-protein', openedTick: 5 * TICKS_PER_DAY, doneTick: -1, hint: null }, { id: 'aim-second-chamber', openedTick: 8 * TICKS_PER_DAY, doneTick: -1, hint: null }, { id: 'aim-first-trail', openedTick: 8.5 * TICKS_PER_DAY, doneTick: -1, hint: null }],
      done: [{ id: 'aim-find-site', openedTick: 0, doneTick: 0.3 * TICKS_PER_DAY, hint: null }, { id: 'aim-dig-chamber', openedTick: 0.3 * TICKS_PER_DAY, doneTick: 0.5 * TICKS_PER_DAY, hint: null }, { id: 'aim-seal', openedTick: 0.5 * TICKS_PER_DAY, doneTick: 0.8 * TICKS_PER_DAY, hint: null }, { id: 'aim-first-clutch', openedTick: 0.8 * TICKS_PER_DAY, doneTick: 1.5 * TICKS_PER_DAY, hint: null }],
    },
    entries: entries(), thumbs: {}, events, hourly: hs, daily: ds, dailyEndDay: Math.floor((START_TICK + NOW_TICK) / TICKS_PER_DAY) - 1, deaths: { total: 9, top: [{ cause: 'old-age', n: 5 }, { cause: 'predation', n: 4 }] },
  };
}

/** Codex entries observed in the demo game: a few of every kind. */
export const DEMO_SEEN = ['cx-species-lasius-niger', 'cx-claustral-founding', 'cx-brood-stages', 'cx-callow', 'cx-nanitics', 'cx-trail-pheromone', 'cx-trophallaxis', 'cx-honeydew', 'cx-raindrops', 'cx-springtail', 'cx-habitat-lawn', 'cx-material-loam', 'cx-interface-orders'];

export function demoCodex(all = false): UiCodexSeen {
  const seen: UiCodexSeen['seen'] = {};
  const ids = all ? [...DEMO_SEEN] : DEMO_SEEN;
  ids.forEach((id, i) => { seen[id] = { tick: i * 3000, label: `Summer · Day ${3 + (i % 5)} · Year 1` }; });
  return { seen };
}

export function demoMarkers(): UiMarkerCounts {
  return {
    counts: { dig: { n: 3, cap: 8 }, forage: { n: 4, cap: 4 }, avoid: { n: 1, cap: 8 }, rally: { n: 0, cap: 1 }, entrance: { n: 1, cap: 2 }, 'move-brood': { n: 0, cap: 1 }, 'move-queen': { n: 0, cap: 1 } },
    comfortBand: { lo: 22, hi: 27 },
    plans: [
      { id: 21, kind: 'chamber', chamberType: 'nursery', status: 'active', source: 'player', blockedReason: null, progress: 0.4 },
      { id: 22, kind: 'tunnel', chamberType: null, status: 'stalled', source: 'player', blockedReason: 'no-diggers', progress: 0.1 },
      { id: 23, kind: 'chamber', chamberType: 'food', status: 'queued', source: 'player', blockedReason: null, progress: 0 },
      { id: 24, kind: 'chamber', chamberType: 'rest', status: 'proposed', source: 'architect', blockedReason: null, progress: 0 },
      { id: 25, kind: 'chamber', chamberType: 'general', status: 'paused', source: 'player', blockedReason: null, progress: 0.2 },
    ],
  };
}
