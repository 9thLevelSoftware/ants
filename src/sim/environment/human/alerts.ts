// The `human-event-warning` card (GDD 04 §15.3, GDD 08 §6.5, invariant I11). The telegraph cues belong to the
// event and always play (cues.ts); the card is a message to the player and is raised only while it can matter: an
// impact is due within the look-ahead and one of the player's ants on the surface is in its path. It clears
// HUMAN_ALERT_IDLE_S after the ants were last in the path (impact passed, ants gone) or after HUMAN_ALERT_MAX_S,
// and when its event ends. One card per site (key `human-event-warning:<siteId>`): the alert engine's warning
// cooldown keeps a busy site from raising it again within a game hour, and the journal keeps every raise and clear,
// and one 'alert.cooldown' line per event and site for a card the cooldown refused.
// State: the engine's own marks (alerts.ts touchAlert), saved with the game.

import type { HumanEventInst, Sim } from '@/sim/types';
import { alertRefusal, clearAlert, expireAlert, raiseAlert, touchAlert } from '@/sim/progression/alerts';
import { memGet, memSet } from '@/sim/progression/engine';
import {
  HUMAN_ALERT_EVERY, HUMAN_ALERT_IDLE_S, HUMAN_ALERT_LOOKAHEAD_S, HUMAN_ALERT_MARGIN_MM, HUMAN_ALERT_MAX_IMPACTS, HUMAN_ALERT_MAX_S,
} from '@/sim/balance/human';
import { TICKS_PER_SECOND } from '@/sim/time';
import { footprintRadius, type HumanPlan, type Impact } from './plan';
import { firstImpactAtOrAfter } from './plans';
import { humanTelegraphMult } from './rules';
import { siteById } from './sites';

const KIND = 'human-event-warning' as const;
const LIFE = { idleTicks: HUMAN_ALERT_IDLE_S * TICKS_PER_SECOND, maxTicks: HUMAN_ALERT_MAX_S * TICKS_PER_SECOND };
const ids: number[] = [];

/** Contacts that cannot hurt or stun an ant: no reason to warn about them. */
const HARMLESS = new Set(['none', 'bait']);

/** The first impact due within the look-ahead that has one of the player's surface ants in its path, or null. */
function impactAhead(sim: Sim, inst: HumanEventInst, plan: HumanPlan): Impact | null {
  const t = sim.state.tick - inst.startTick;
  const until = t + Math.ceil(HUMAN_ALERT_LOOKAHEAD_S * humanTelegraphMult(sim) * TICKS_PER_SECOND);
  const player = sim.state.colonies[0]?.id ?? -1;
  const first = firstImpactAtOrAfter(plan, t);
  for (let i = first; i < plan.impacts.length && i < first + HUMAN_ALERT_MAX_IMPACTS; i++) {
    const imp = plan.impacts[i];
    if (imp.t > until) break;
    if (HARMLESS.has(imp.contact)) continue;
    sim.index.queryAnts({ x: imp.fp.x, y: imp.fp.y, z: imp.fp.z }, footprintRadius(imp.fp) + HUMAN_ALERT_MARGIN_MM, ids);
    for (const id of ids) {
      const a = sim.stores.ants.get(id);
      if (a && a.alive && a.colony === player && a.nestId < 0) return imp;
    }
  }
  return null;
}

/** One run's check: keeps its site's card alive while ants are in the path, raises it when they first are. */
export function checkHumanAlert(sim: Sim, inst: HumanEventInst, plan: HumanPlan): void {
  if (sim.state.tick % HUMAN_ALERT_EVERY !== 0) return;
  const imp = impactAhead(sim, inst, plan);
  if (!imp) return;
  const active = sim.state.progression.alerts.some((a) => a.kind === KIND && a.subjectId === plan.siteId);
  if (active) { touchAlert(sim, KIND, plan.siteId); return; }
  const req = {
    kind: KIND, level: 'warning' as const, subjectId: plan.siteId, title: '', cause: '',
    focus: { kind: 'point' as const, id: -1, pos: { x: imp.fp.x, y: imp.fp.y, z: imp.fp.z } },
    diagnosticId: 'diag-human-pressure', tokens: { area: siteById(sim.world, plan.siteId)?.area ?? 'garden', event: inst.kind },
  };
  const refused = alertRefusal(sim, req);
  if (refused === null) {
    if (raiseAlert(sim, req) >= 0) touchAlert(sim, KIND, plan.siteId);
    return;
  }
  // refused (cooldown, full list): raiseAlert puts it in the event log, but only once per event and site, not every check
  const mark = `hrefused:${plan.siteId}`;
  if (memGet(sim, mark, -1) !== inst.id) {
    memSet(sim, mark, inst.id);
    raiseAlert(sim, req);
  }
}

/** Every tick (cheap): clears the cards whose lifetime is over. */
export function expireHumanAlerts(sim: Sim): void {
  const list = sim.state.progression.alerts;
  // backwards: expireAlert removes the card it clears from the list
  for (let i = list.length - 1; i >= 0; i--) if (list[i].kind === KIND) expireAlert(sim, KIND, list[i].subjectId, LIFE);
}

/** An event ended: its site's card goes unless another running event on the site still holds it. */
export function endHumanAlert(sim: Sim, siteId: number, instId: number): void {
  const others = sim.state.env.human.active.some((r) => r.inst && r.inst.id !== instId && humanSiteOf(r.inst) === siteId);
  if (!others) clearAlert(sim, KIND, siteId);
}

const humanSiteOf = (inst: HumanEventInst): number => inst.regionId;
