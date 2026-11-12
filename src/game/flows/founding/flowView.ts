// Builds the founding screens' read-out (src/ui/screens/founding/store.ts FoundingUi) from the simulation and the
// flow's own presentation flags. Pure reads; words come from fixed tables here (the GDD 06 §5.7 factor labels,
// the GDD 08 §9.2 prompt texts), never from the simulation.
import type { Sim } from '@/sim/types';
import { foundingView, type FoundingView } from '@/sim/colony/founding';
import { airTemp } from '@/sim/environment';
import { currentDayOfSeason, currentHour, currentSeason } from '@/sim/time';
import { WEATHER_WORDS } from '@/game/uiBridge/words';
import type { FoundingUi } from '@/ui/screens/founding/store';
import { placeName } from './placeName';

const cap = (s: string): string => (s.length ? s[0].toUpperCase() + s.slice(1) : s);

const FACTOR_LABELS: Record<string, string> = {
  diggability: 'Diggability', moisture: 'Moisture', warmth: 'Warmth', cover: 'Cover', floodSafety: 'Flood safety',
  rivalScent: 'Rival scent', exposure: 'Exposure',
};

const ARCHETYPE_WORDS: Record<string, string> = {
  'woodland-edge': 'Woodland Edge', 'suburban-garden': 'Suburban Garden', 'playground-park': 'Playground Park',
  'car-park-verge': 'Car Park Verge', 'kitchen-door': 'Kitchen Door', 'field-margin': 'Field Margin',
};

const FAIL_TEXT: Record<string, string> = {
  desiccation: 'She dried out in the open before she was sealed in.',
  predation: 'She was caught before the first workers emerged.',
  crushed: 'She was crushed.',
  heat: 'The ground was too hot.',
  cold: 'The cold took her.',
  drowning: 'Water filled the burrow.',
  exhaustion: 'Her reserves ran out.',
  'no-workers': 'The brood was lost, and she had nothing left to raise another.',
  'brood-lost': 'The brood was lost.',
};

const AIM_TEXT: Record<string, string> = {
  'aim-first-food': 'Where does the nearest sugar lie?',
  'aim-second-chamber': 'Is one chamber enough for a growing brood?',
  'aim-nest-open': 'Can the workers reach the surface?',
  'aim-garden': 'Is the garden taking hold?',
  'aim-trunk-trail': 'Which way do the seeds lie?',
};

export interface FlowFlags {
  /** The skip control was used for this lapse (game-level playback choice). */
  skipping: boolean;
  /** The final card is still up (until Continue, or 2 s after a skip). */
  outcomeOpen: boolean;
  /** The hand-over banner is up (until the player chooses). */
  handoverOpen: boolean;
  /** The failure card was dismissed. */
  failureDismissed: boolean;
  reducedMotion: boolean;
}

function clock(sim: Sim): string {
  const h = currentHour(sim.state), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function dateLabel(sim: Sim): string {
  return `${cap(currentSeason(sim.state))} · Day ${currentDayOfSeason(sim.state)}`;
}

function prompts(v: FoundingView): FoundingUi['prompts'] {
  switch (v.phase) {
    case 'search': {
      const out = [{ action: 'move', text: 'Walk' }, { action: 'inspect', text: 'Antennate the ground' }];
      if (v.site && v.site.factors[0].value > 0) out.push({ action: 'dig', text: 'Dig' });
      return out;
    }
    case 'dig': return [{ action: 'dig', text: 'Dig' }];
    case 'seal': return [{ action: 'interact', text: 'Seal the entrance' }];
    case 'lay': return v.clutch && v.clutch.batches > 0
      ? [{ action: 'interact', text: 'Lay eggs' }, { action: 'tend', text: 'Tend the brood' }]
      : [{ action: 'interact', text: 'Lay eggs' }];
    case 'handover': return [{ action: 'possess-next', text: 'Next ant' }];
    default: return [];
  }
}

export function buildFoundingUi(sim: Sim, flags: FlowFlags): FoundingUi | null {
  const v = foundingView(sim);
  if (!v) return null;
  const def = sim.species;
  const w = sim.state.env.weather;
  const intro: FoundingUi['intro'] = {
    common: def.commonName, binomial: def.binomial,
    locality: ARCHETYPE_WORDS[sim.state.config.world.archetype] ?? cap(String(sim.state.config.world.archetype)),
    place: placeName(sim.state.config.world.seed), season: cap(currentSeason(sim.state)), day: currentDayOfSeason(sim.state),
    clock: clock(sim), weather: WEATHER_WORDS[w.state] ?? cap(w.state), tempC: Math.round(airTemp(sim)),
  };
  const site: FoundingUi['site'] = v.site ? {
    active: v.site.active,
    rows: v.site.factors.map((f) => ({ id: f.id, label: FACTOR_LABELS[f.id] ?? f.id, value: f.value, word: f.word })),
    q: v.site.q, word: v.site.word, chamberQ: v.phase !== 'search' ? v.site.q : null,
  } : null;
  const fc = v.clutch?.forecast ?? null;
  const clutch: FoundingUi['clutch'] = v.clutch ? {
    eggs: v.clutch.eggs, limit: v.clutch.limit, batches: v.clutch.batches,
    expected: fc ? fc.range : null, reservesAtFirst: fc ? fc.reserves : null, safeEggs: fc ? fc.safeEggs : null,
    risk: !fc ? 'ok' : fc.reserves < 0.15 ? 'red' : v.clutch.eggs > fc.safeEggs || fc.reserves < 0.25 ? 'amber' : 'ok',
  } : null;
  const lapse: FoundingUi['lapse'] = v.timelapse ? {
    progress: v.timelapse.progress, stage: v.timelapse.stage, counters: v.timelapse.counters, date: dateLabel(sim),
    skipping: flags.skipping || v.timelapse.skipped, reducedMotion: flags.reducedMotion,
  } : null;
  const failed = v.phase === 'failed' && !flags.failureDismissed;
  return {
    phase: v.phase, intro,
    queen: v.reserves !== null ? {
      reserves: v.reserves, desiccation: v.desiccation ?? 0, health: v.health ?? 0,
      reservesFalling: v.reserveDrainPerGd > 0, drying: v.desiccationPerGd > 0,
    } : null,
    site, readiness: v.readiness, prompts: prompts(v), clutch,
    canBeginLapse: v.phase === 'lay' && !!v.clutch && v.clutch.eggs > 0,
    lapse,
    outcome: flags.outcomeOpen && v.outcome ? v.outcome : null,
    handover: flags.handoverOpen && !flags.outcomeOpen && (v.phase === 'handover' || v.phase === 'done')
      ? { aims: sim.state.progression.aims.filter((a) => a.state === 'open').slice(0, 3).map((a) => AIM_TEXT[a.id] ?? a.id) }
      : null,
    failure: failed ? { cause: v.failCause ?? 'unknown', text: FAIL_TEXT[v.failCause ?? ''] ?? 'The founding did not succeed.', retriesLeft: v.retriesLeft } : null,
  };
}
