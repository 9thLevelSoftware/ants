// Text tables of the game keyed by the ids of the design index (task codex-content). Pure data and lookups.
// Nothing here changes an id; the UI and the sim read words through these functions, so wording can be revised
// without touching code that owns the ids.
import type { AimId, AlertKind, HintId, HumanEventKind, MilestoneId, SpeciesId, WeatherState } from '@/sim/types';
import { ALERT_TEXT, HUMAN_EVENT_WARNING, WEATHER_CHANGE_TITLE } from './alerts';
import type { AlertText } from './alerts';
import { formatText } from './format';
import type { TextTokens } from './format';
import { AIM_TEXT, AIM_TEXT_BY_SPECIES, HINT_TEXT } from './hints';
import type { AimText, HintText } from './hints';
import { MILESTONE_TEXT } from './milestones';
import type { MilestoneText } from './milestones';

export { formatText, templateTokens } from './format';
export type { TextTokens } from './format';
export { ALERT_TEXT, HUMAN_EVENT_WARNING, WEATHER_CHANGE_TITLE } from './alerts';
export type { AlertText } from './alerts';
export { AIM_OUT_OF_SEASON, AIM_TEXT, AIM_TEXT_BY_SPECIES, HINT_TEXT } from './hints';
export type { AimText, HintText } from './hints';
export { MILESTONE_TEXT } from './milestones';
export type { MilestoneText } from './milestones';
export * from './words';
export * from './journal';
export {
  CONTROLS_TABLE_END, CONTROLS_TABLE_START, buildControlsReference, controlsMarkdown, describeBinding, groupOf,
} from './controls';
export type { ControlGroup, ControlGroupId, ControlRow } from './controls';

/** Title and filled journal line of a milestone. `species` filters nothing: callers pass only ids that fired. */
export function milestoneText(id: MilestoneId, tokens: TextTokens = {}): { title: string; text: string } {
  const m: MilestoneText = MILESTONE_TEXT[id];
  return { title: formatText(m.title, tokens), text: formatText(m.text, tokens) };
}

/** Title and cause of an alert kind, filled from the tokens; the level is the default of GDD 08 §6.5. */
export function alertText(kind: AlertKind, tokens: TextTokens = {}): { level: AlertText['level']; title: string; cause: string } {
  const a = ALERT_TEXT[kind];
  return { level: a.level, title: formatText(a.title, tokens), cause: formatText(a.cause, tokens) };
}

/** Title and cause of a `weather-change` alert for the weather that is coming. */
export function weatherChangeText(state: WeatherState, hours: number): { title: string; cause: string } {
  return { title: WEATHER_CHANGE_TITLE[state], cause: formatText(ALERT_TEXT['weather-change'].cause, { h: hours }) };
}

/** Title and cause of a `human-event-warning` alert for a human event kind; `area` is the zone's plain words. */
export function humanEventWarningText(kind: HumanEventKind, area: string): { title: string; cause: string } {
  const w = HUMAN_EVENT_WARNING[kind];
  return { title: w.title, cause: formatText(w.cause, { area }) };
}

/** The hint's verb phrase and the input it teaches. */
export function hintText(id: HintId): HintText {
  return HINT_TEXT[id];
}

/** The aim's question, with the species variant when the species has one. */
export function aimText(id: AimId, species?: SpeciesId): AimText {
  const variant = species ? AIM_TEXT_BY_SPECIES[id]?.[species] : undefined;
  const base = AIM_TEXT[id];
  return variant ? { ...base, text: variant } : base;
}
