// What the audio does with every simulation event type (the union in src/sim/types/events*.ts). Each type is exactly
// one of: `sound` (the audio derives or plays a sound; where it lives is in the note), `covered` (the sound comes
// through a `cue` event the sim emits together with it, or through another mapped event), `silent` (deliberately no
// sound, with the reason). The exhaustiveness check below fails the TYPECHECK when the sim adds an event type that is
// listed nowhere, and eventMap.test.ts fails the same way at run time by reading the event files.
import type { SimEventType } from '@/sim/types';

export type Disposition =
  | { mode: 'sound'; note: string }
  | { mode: 'covered'; by: string }
  | { mode: 'silent'; why: string };

/** Events the audio turns into sounds (eventRouter.ts, system.ts). */
const SOUND = {
  // simulation cues, alerts, progression
  'cue': 'the sim\'s own cue events (cue table), with the bite hardness, dig-bite de-duplication and alarm setting rules',
  'alert': 'alert tones through the §6.3 gate',
  'milestone.reached': 'milestone motif',
  'stage.changed': 'milestone motif',
  'lineage.daughter-added': 'milestone motif',
  'opening.handover': 'milestone motif + music trigger (end of the founding time-lapse)',
  'opening.timelapse': 'page-turn swish at the start and end of a time-lapse',
  'overwinter.begin': 'page-turn swish',
  'overwinter.end': 'page-turn swish + music trigger',
  'aim.completed': 'soft switch tick',
  'codex.unlocked': 'page-turn swish',
  'time.phase': 'music trigger at dawn and dusk',
  // human events and weather
  'human.telegraph': 'giant warning phase (tremor, engine, hose, swish, tyre roll)',
  'human.start': 'giant main sound (loops, repeats, one-shots)',
  'human.impact': 'giant footfall thud, broom contact, hose splash',
  'human.end': 'giant sound fade-out',
  'human.cancelled': 'giant sound fade-out',
  'human.bait-placed': 'plastic clack at the station',
  'human.bait-removed': 'softer plastic clack',
  'weather.thunder': 'thunder after the sim\'s own distance delay',
  'weather.gust': 'wind gust swell, scaled by wind speed, damped underground',
  'weather.changed': 'first-drops volley when rain or a storm sets in (the bed follows the precipitation read-out)',
  'weather.puddle': 'water trickle when puddles form',
  // creatures
  'predator-telegraph': 'creature approach taps at the predator',
  'predator-strike': 'strike crack at the predator (quieter on a miss)',
  'ant-seized': 'grapple scuffle at the seized ant',
  'antlion-grab': 'sand spray at the seized ant',
  'bird-approach': 'bird wing whoosh',
  'bird-left': 'bird wing whoosh (take-off)',
  'creature-died': 'soft creature thud',
  'phorid-strike': 'fly buzz at the carrier',
  // combat and rivals
  'combat-lock': 'grapple scuffle at the holder',
  'combat-pin': 'grapple scuffle at the holder (heavier)',
  'combat-spray': 'acid hiss at the sprayer',
  'rival-encounter': 'scuffle (fight) or antenna brush (display, withdraw) at the meeting point',
  'rival-discovered': 'first contact: antenna brushes at the meeting point',
  'rival-raid-started': 'scuffles at the raided nest entrance',
  'brood-raided': 'mandible clicks at the raided nest entrance',
  // nest, water, soil
  'flood-started': 'flood gurgle at the first flooded chamber',
  'flood-level': 'water trickle at the flooded chamber (rate-limited)',
  'ant-submerged': 'small flood gurgle at the ant',
  'world.cave-in': 'mound slump at the cave-in',
  'founding-sealed': 'seal tamp at the sealed entrance',
  'egg-laid': 'membrane pop at the queen (first egg of the founding, then every egg)',
  'queen.egg-eaten': 'bite click at the queen',
  'pellet-expelled': 'pellet drop at the mound',
  'pellet-dumped': 'pellet drop at the item',
  'waste-dumped': 'frass drop at the ant',
  'corpse-removed': 'soft drop at the ant',
  'frass-ejected': 'frass drop at the site',
  // species
  'drum': 'Camponotus drumming at the ant',
  'seed-milled': 'seed crack at the ant',
  'radicle-gnawed': 'soft seed crack at the ant',
  'honeydew-relay': 'liquid ticks at the giver',
  'flight.launched': 'swarm wing buzz (non-positional)',
} as const satisfies Partial<Record<SimEventType, string>>;

/** The event itself is silent because the sim emits a `cue` (or another mapped event) with it. */
const COVERED = {
  'action-completed': 'the action runner\'s cue (pick-up, drop, dig-bite, grapple, acid-spray, trophallaxis, lay-egg, antennate, seal-tamp...)',
  'alarm-raised': 'cue alarm-burst (shimmer inside the plume)',
  'ant-eclosed': 'cue eclosion',
  'antlion-flick': 'cue antlion-flick',
  'bird-landed': 'cue bird-strike (landing: whoosh + thud)',
  'bird-peck': 'cue bird-strike (peck)',
  'breach': 'the dig-bite cues that opened it',
  'collapse': 'cue collapse',
  'collapse-warning': 'cue collapse-rumble',
  'combat-hit': 'cue bite (the router reads this hit to tell a hit from a miss and the target\'s hardness)',
  'delivery': 'the drop cue of the delivering ant',
  'feed': 'cue trophallaxis of the feed action',
  'opening.egg-batch': 'the egg-laid event of each egg of the batch',
  'pellet-created': 'the dig-bite cue of the bite that made it',
  'recruit': 'cue antennate',
  'trophallaxis': 'cue trophallaxis',
} as const satisfies Partial<Record<SimEventType, string>>;

const NONE = 'no sound by design';
const BOOK = 'bookkeeping: no physical event at ant scale';
const ALERT = 'announced by an alert (alert tones)';
const UI = 'interface or journal change: the UI facade makes the sound';
const SLOW = 'happens over minutes or hours: nothing to hear at a moment';
const COVERED_BY_CUE = 'the physical sound is the sim\'s cue (or the ants\' action cues) emitted with it';

/** Deliberately silent, with the reason. */
const SILENT = {
  'action-cancelled': BOOK, 'action-failed': BOOK, 'action-started': BOOK,
  'aim.opened': UI, 'hint-trigger': UI, 'journal.entry': UI, 'diagnostic-changed': UI,
  'all-gardens-lost': ALERT, 'colony.orphaned': ALERT, 'colony.extinct': UI, 'epitaph.ready': UI, 'opening.failed': ALERT,
  'queen.died': ALERT, 'starvation-stage': ALERT, 'midden-blocked': ALERT, 'stores-full': ALERT,
  'ant-died': 'no death sound for ants (GDD 08 §13.5); the camera does not linger',
  'possessed-ant-died': UI, 'possession-started': NONE, 'possession-ended': NONE, 'possess-rejected': UI, 'speed-refused': UI,
  'ant-freed': COVERED_BY_CUE, 'ant-injured': COVERED_BY_CUE, 'ant-paralysed': 'venom is silent', 'ant-stuck': NONE, 'ant-unstuck': BOOK,
  'combat-unlock': COVERED_BY_CUE, 'toxin-delivered': NONE, 'toxin-deaths': NONE, 'thief-tunnel-breach': COVERED_BY_CUE, 'thief-tunnel-closed': BOOK,
  'rival-destroyed': ALERT, 'rival-founded': BOOK, 'rival-orphaned': ALERT, 'rival-queen-killed': ALERT, 'rival-raid-ended': ALERT, 'rival-relation-changed': BOOK,
  'aphid-culled': NONE, 'aphid-moved': NONE, 'creature-despawned': BOOK, 'creature-spawned': BOOK,
  'herd-claimed': BOOK, 'herd-collapsed': BOOK, 'herd-dormant': BOOK, 'herd-founded': BOOK, 'herd-hatched': BOOK, 'herd-lost': BOOK,
  'herd-predator-arrived': BOOK, 'herd-predator-left': BOOK, 'herd-predator-repelled': BOOK,
  'prey-escaped': COVERED_BY_CUE, 'prey-subdued': COVERED_BY_CUE, 'hitchhiker-mounted': NONE,
  'architect-proposal': UI, 'plan-complete': UI, 'plan-created': UI, 'plan-progress': UI, 'plan-rejected': UI, 'plan-status-changed': UI,
  'carve-chunks-dirty': BOOK, 'chamber-changed': BOOK, 'chamber-designated': UI, 'chamber-registered': BOOK, 'chamber-removed': BOOK,
  'entrance-closed': UI, 'entrance-opened': COVERED_BY_CUE, 'entrance-state-changed': BOOK, 'mound-changed': BOOK, 'natural-cavity-joined': BOOK,
  'foreign-cavity-contact': BOOK, 'nest-milestone': UI, 'founding-readiness': BOOK, 'founding-ready': UI, 'founding-reopened': COVERED_BY_CUE,
  'flood-ended': 'the trickle simply stops', 'brood-drowned': NONE, 'brood-died': NONE, 'brood-moved': BOOK, 'brood-shuttled': BOOK, 'brood-stage': BOOK,
  'cannibalism': NONE, 'carrion-stage-changed': SLOW,
  'caste-unlocked': UI, 'coop-transport': BOOK, 'entity-created': BOOK, 'entity-removed': BOOK, 'command-rejected': UI,
  'env.cold-coma': NONE, 'env.heat-stupor': NONE,
  'flight.eligible': UI, 'flight.ended': BOOK, 'flight.possessed-end': BOOK, 'flight.possessed-start': BOOK,
  'food-source-discovered': UI, 'food-source-exhausted': UI, 'food-source-removed': BOOK, 'food-source-spawned': BOOK,
  'forager-departed': BOOK, 'frass-pile-grew': BOOK, 'garden-infected': UI, 'garden-state': UI, 'granary-state': UI, 'leaf-cache-spoiled': UI,
  'human.casualties': UI, 'human.scheduled': BOOK, 'marker-response': BOOK, 'midden-plant': SLOW, 'midden-seedling': SLOW,
  'opening.phase': UI, 'opening.site-assessed': UI, 'overwinter.banner': UI, 'overwinter.beat': UI, 'overwinter.notice': UI, 'overwinter.report': UI,
  'plant-rejected': UI, 'queen-relocation': UI, 'queen.hazard': UI, 'route-learned': BOOK, 'satellite-state': BOOK, 'task-changed': BOOK,
  'time.auto-slow': ALERT, 'time.day': SLOW, 'time.hour': SLOW, 'time.season': SLOW, 'time.speed-changed': UI, 'time.speed-limited': UI, 'time.year': SLOW,
  'trail-established': BOOK, 'trail-lost': BOOK, 'trail-toggled': BOOK,
  'weather.dew': SLOW, 'weather.lightning': 'the flash is silent: its thunder follows (weather.thunder)',
  'wood-moisture-alert': ALERT,
  'world.dynprim-changed': BOOK, 'world.grass-mown': COVERED_BY_CUE, 'world.micro-discovered': UI, 'world.terrain-deformed': BOOK, 'world.zone-first-entry': UI,
  'worldgen.complete': BOOK, 'worldgen.progress': BOOK, 'worldgen.retry': BOOK,
} as const satisfies Partial<Record<SimEventType, string>>;

// Exhaustiveness: a SimEventType missing from all three lists (or listed twice) is a type error naming it.
type Listed = keyof typeof SOUND | keyof typeof COVERED | keyof typeof SILENT;
type Missing = Exclude<SimEventType, Listed>;
type Twice = (keyof typeof SOUND & keyof typeof COVERED) | (keyof typeof SOUND & keyof typeof SILENT) | (keyof typeof COVERED & keyof typeof SILENT);
export const EVENT_MAP_IS_EXHAUSTIVE: [Missing] extends [never] ? ([Twice] extends [never] ? true : Twice) : Missing = true;

/** The disposition of every event type. */
export const EVENT_DISPOSITION: Record<SimEventType, Disposition> = (() => {
  const out = {} as Record<SimEventType, Disposition>;
  for (const [t, note] of Object.entries(SILENT)) out[t as SimEventType] = { mode: 'silent', why: note };
  for (const [t, by] of Object.entries(COVERED)) out[t as SimEventType] = { mode: 'covered', by };
  for (const [t, note] of Object.entries(SOUND)) out[t as SimEventType] = { mode: 'sound', note };
  return out;
})();
