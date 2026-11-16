// Causes of death (GDD 06 §9.3): every adult death of the player colony is counted by cause and by season and kept
// in a ring of the last DEATH_RING_CAP; bursts of deaths write a `loss` journal entry; very few ants left raise the
// critical `last-ants` alert (GDD 06 §13.4).

import type { Sim, SimEventOf } from '@/sim/types';
import { SEASONS } from '@/sim/types';
import { DEATH_RING_CAP, LAST_ANTS_N, LOSS_DEATHS, LOSS_WINDOW_GD } from '@/sim/balance';
import { currentSeason, daysToTicks } from '@/sim/time';
import { zoneAt } from '@/sim/world';
import { clearAlert, raiseAlert } from './alerts';
import { engineOf, isPlayerColonyId, memGet, memSet, type Census } from './engine';
import { addJournal } from './journal';
import { accumulate } from './stats';

export function recordDeath(sim: Sim, e: SimEventOf<'ant-died'>): void {
  if (!isPlayerColonyId(sim, e.colonyId)) return;
  const d = sim.state.progression.deaths;
  d.byCause[e.cause] = (d.byCause[e.cause] ?? 0) + 1;
  d.bySeason[SEASONS.indexOf(currentSeason(sim.state))]++;
  const underground = sim.field.isUnderground(e.pos);
  d.recent.push({ tick: sim.state.tick, cause: e.cause, caste: e.caste, role: e.task, zone: underground ? null : zoneAt(sim.world, e.pos.x, e.pos.z) });
  if (d.recent.length > DEATH_RING_CAP) d.recent.splice(0, d.recent.length - DEATH_RING_CAP);
  accumulate(sim, `deaths-by-cause:${e.cause}`, 1);
  checkLoss(sim);
}

/** Most frequent cause among the last n deaths ('unknown' when none). */
export function topRecentCause(sim: Sim, n: number): string {
  const counts: Record<string, number> = {};
  for (const r of sim.state.progression.deaths.recent.slice(-n)) counts[r.cause] = (counts[r.cause] ?? 0) + 1;
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))[0] ?? 'unknown';
}

function checkLoss(sim: Sim): void {
  const eng = engineOf(sim);
  const now = sim.state.tick;
  const span = daysToTicks(LOSS_WINDOW_GD);
  eng.recentDeathTicks.push(now);
  eng.recentDeathTicks = eng.recentDeathTicks.filter((t) => now - t <= span);
  if (eng.recentDeathTicks.length < LOSS_DEATHS || now - memGet(sim, 'lossTick', -span - 1) <= span) return;
  const n = eng.recentDeathTicks.length;
  const last = sim.state.progression.deaths.recent.slice(-n);
  const underground = last.filter((r) => r.zone === null).length * 2 > last.length;
  memSet(sim, 'lossTick', now);
  // `where` is an id the interface words: 'nest' (underground) or the zone most deaths happened in
  addJournal(sim, 'loss', 'loss', { n, cause: topRecentCause(sim, n), where: underground ? 'nest' : (last[last.length - 1].zone ?? 'nest') });
}

/** `last-ants` (critical) while 1..LAST_ANTS_N ants of the colony live; cleared above it. */
export function checkLastAnts(sim: Sim, census: Census): void {
  if (sim.state.progression.gameOver) return;
  // not for the founding queen alone while the opening runs: she is alone by design (founding-close request 2; the
  // opening test is the founding module's foundingInProgress, read from state so progression does not import it).
  // Title and cause stay empty on purpose: the interface fills them from the alert text table with these tokens
  // (content/text alertText; the simulation does not import interface text).
  const op = sim.state.player.opening;
  const opening = !!op && !op.done && op.phase !== 'failed' && op.phase !== 'done';
  if (opening && census.living <= 1) { clearAlert(sim, 'last-ants', -1); return; } // the founding queen alone
  if (census.living > 0 && census.living <= LAST_ANTS_N) {
    const cur = sim.state.progression.alerts.find((a) => a.kind === 'last-ants');
    if (cur && cur.tokens?.n === census.living) return;
    raiseAlert(sim, {
      kind: 'last-ants', level: 'critical', subjectId: -1, title: '', cause: '', focus: null, diagnosticId: null,
      tokens: { n: census.living, cause: topRecentCause(sim, 10) },
    });
  } else if (census.living > LAST_ANTS_N) {
    clearAlert(sim, 'last-ants', -1);
  }
}
