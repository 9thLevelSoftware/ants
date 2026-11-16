// How sim events teach: each rule turns an event into a counted use of a verb, a per-game flag, or fight time. The
// engine knows no event by name; this table is the only place that does. Events are the sim's (src/sim/types/events*),
// read-only here. A possessed ant is the player's ant, so "the possessed ant did X" is "the player did X".
import type { EngineEvent, EventContext, UseKey } from './types';

/** What a rule may do. */
export interface RuleActions {
  ctx: EventContext;
  use(key: UseKey, n?: number): void;
  flag(name: string): void;
  fight(): void;
}

export interface EventRule {
  type: string;
  run(e: EngineEvent, a: RuleActions): void;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : NaN);
const mine = (e: EngineEvent, a: RuleActions, field = 'antId'): boolean => num(e[field]) === a.ctx.possessedId && a.ctx.possessedId >= 0;

/** Events that start a fight for the player's attention (GDD 05 combat, raids, predators). */
const FIGHT_EVENTS = ['combat-hit', 'combat-lock', 'combat-pin', 'ant-seized', 'predator-strike', 'rival-raid-started', 'ant-injured'];

export const EVENT_RULES: readonly EventRule[] = [
  // ---- the opening (GDD 06 §5): site assessment, dig depth, readiness, seal, first clutch, time-lapse
  { type: 'opening.site-assessed', run: (_e, a) => a.use('antennate') },
  { type: 'action-started', run: (e, a) => { if (mine(e, a) && (e.action === 'antennate' || e.action === 'sniff')) a.use('antennate'); } },
  { type: 'founding-readiness', run: (e, a) => { const p = e.parts as { depth?: number } | undefined; if ((p?.depth ?? 0) >= 1) a.use('dig'); } },
  { type: 'founding-ready', run: (_e, a) => { a.use('dig'); a.use('readiness'); } },
  { type: 'founding-sealed', run: (_e, a) => { a.use('dig'); a.use('readiness'); a.use('seal'); } },
  { type: 'opening.egg-batch', run: (_e, a) => a.use('lay') },
  { type: 'opening.timelapse', run: (e, a) => { if (e.kind === 'end') a.use('timelapse'); } },
  { type: 'opening.handover', run: (_e, a) => { a.use('timelapse'); } },

  // ---- possession: Tab cycles, X releases
  { type: 'possession-started', run: (e, a) => { if (e.via === 'cycle') a.use('cycle'); } },
  { type: 'possession-ended', run: (e, a) => { if (e.reason === 'player') a.use('observer'); } },

  // ---- the colony's work the player does as an ant
  { type: 'action-completed', run: (e, a) => { if (mine(e, a) && e.action === 'pick-up') a.use('pickup'); } },
  { type: 'trophallaxis', run: (e, a) => { if (mine(e, a, 'donorId') && e.ambient !== true) a.use('share'); } },
  { type: 'trail-toggled', run: (e, a) => { if (mine(e, a) && e.on === true) a.use('trail'); } },

  // ---- time
  { type: 'time.speed-changed', run: (e, a) => { if (e.reason === 'command') a.use('speed'); } },

  // ---- flags that open later hints
  { type: 'delivery', run: (e, a) => { if (num(e.colonyId) === a.ctx.colonyId) a.flag('firstDelivery'); } },
  { type: 'trail-established', run: (e, a) => { if (num(e.colonyId) === a.ctx.colonyId) a.flag('trailExists'); } },
  { type: 'diagnostic-changed', run: (e, a) => { if (e.status === 'warn' || e.status === 'bad') a.flag('diagWarn'); } },

  // ---- fights: no teaching prompt while one is on
  ...FIGHT_EVENTS.map((type): EventRule => ({ type, run: (_e, a) => a.fight() })),
];
