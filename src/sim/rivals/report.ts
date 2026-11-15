// What the player hears about rivals (GDD 05 App. C, App. D): the `raid-seen` warning (>= 3 rival agents within
// 40 BU of a player entrance, or a raid party agent within 80 BU), `nest-attacked` for >= 3 hostile ants inside the
// player nest (cleared 30 s after the condition ends), and the `diag-rivals` diagnostic.

import type { Sim } from '@/sim/types';
import {
  ALERT_CLEAR_S, DIAG_RAID_RISK_R, DIAG_RAID_RISK_WEIGHT, NEST_ATTACKED_ANTS, RAID_PARTY_SEEN_BU, RAID_SEEN_AGENTS, RAID_SEEN_BU,
} from '@/sim/balance/rivals';
import { clearAlert, publishDiagnostic, raiseAlert } from '@/sim/progression';
import { secondsToTicks } from '@/sim/time';
import { isAgent } from './agents';
import { knowsNest, strengthOf } from './raids';
import { findRelation } from './relations';
import { homeNest } from './setup';
import { BB, playerColonyOf, relExt, rivalColonies, rmod } from './state';
import { d3 } from './behaviours/move';

const ids: number[] = [];

/** Every pass: the two ant alerts of the player colony. */
export function updateAlerts(sim: Sim): void {
  const col = playerColonyOf(sim);
  const nest = col ? homeNest(sim, col) : undefined;
  if (!col || !nest) return;
  const m = rmod(sim.state);
  const now = sim.state.tick, bu = sim.world.bu;
  // raid-seen
  let seen = false, focusId = -1;
  for (const e of nest.entrances) {
    sim.index.queryAnts(e.pos, RAID_PARTY_SEEN_BU * bu, ids);
    let near = 0;
    for (const id of ids) {
      const a = sim.stores.ants.get(id);
      if (!a || !a.alive || a.colony === col.id || !isAgent(a)) continue;
      const d = d3(a.pos, e.pos);
      if (d <= RAID_SEEN_BU * bu) near++;
      if ((a.bb[BB.raid] ?? -1) >= 0) { seen = true; focusId = a.id; }
      if (focusId < 0) focusId = a.id;
    }
    if (near >= RAID_SEEN_AGENTS) seen = true;
  }
  if (seen) {
    m.raidSeenTick = now;
    if (!m.raidSeenOn) {
      const a = sim.stores.ants.get(focusId);
      raiseAlert(sim, {
        kind: 'raid-seen', level: 'warning', subjectId: nest.id, title: 'Raiders approaching', cause: 'rival workers are gathering at the nest',
        focus: a ? { kind: 'ant', id: a.id, pos: { ...a.pos } } : null, diagnosticId: 'diag-rivals',
      });
      m.raidSeenOn = 1;
    }
  } else if (m.raidSeenOn && now - m.raidSeenTick > secondsToTicks(ALERT_CLEAR_S)) {
    clearAlert(sim, 'raid-seen', nest.id);
    m.raidSeenOn = 0;
  }
  // nest-attacked (ants); a centipede's card shares the subject (creatures module)
  let inside = 0, first = -1;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony === col.id || a.nestId !== nest.id) continue;
    inside++;
    if (first < 0) first = a.id;
  }
  if (inside >= NEST_ATTACKED_ANTS) {
    m.nestAttackedTick = now;
    if (!m.nestAttackedOn) {
      const a = sim.stores.ants.get(first);
      raiseAlert(sim, {
        kind: 'nest-attacked', level: 'critical', subjectId: nest.id, title: 'Nest under attack', cause: `${inside} rival ants are in the nest`,
        focus: a ? { kind: 'ant', id: a.id, pos: { ...a.pos } } : null, diagnosticId: 'diag-rivals',
      });
      m.nestAttackedOn = 1;
    }
  } else if (m.nestAttackedOn && now - m.nestAttackedTick > secondsToTicks(ALERT_CLEAR_S)) {
    if ((sim.state.ecology.director.nestAttackedNest ?? -1) !== nest.id) clearAlert(sim, 'nest-attacked', nest.id);
    m.nestAttackedOn = 0;
  }
}

/** Hourly: `diag-rivals` for the player colony (per rival: relation, R, contested cells, last raid, raid risk). */
export function publishRivalDiagnostic(sim: Sim): void {
  const col = playerColonyOf(sim);
  if (!col) return;
  const sP = Math.max(1e-6, strengthOf(sim, col));
  const rows: { cause: string; w: number; detail: string }[] = [];
  let risk = 0, conflict = 0, contestedAll = 0;
  for (const r of rivalColonies(sim)) {
    const rel = findRelation(sim.state, col.id, r.id);
    const R = strengthOf(sim, r) / sP;
    const contested = relExt(sim.state, col.id, r.id).contested;
    contestedAll += contested;
    const state = rel?.state ?? 'peace';
    const raidRisk = state === 'war' && R >= DIAG_RAID_RISK_R && knowsNest(sim, r, col);
    if (raidRisk) risk++;
    if (state === 'skirmish' || state === 'war') conflict++;
    const last = r.rival.lastRaidTick >= 0 ? `last raid at tick ${r.rival.lastRaidTick}` : 'no raid yet';
    rows.push({
      cause: `rival-${r.id}`, w: contested + (raidRisk ? DIAG_RAID_RISK_WEIGHT : 0) + R,
      detail: `${r.species}: ${state}, strength ratio ${R.toFixed(2)}, ${contested} contested cells, ${last}${raidRisk ? ', raid risk' : ''}`,
    });
  }
  const status = risk > 0 ? 'bad' : conflict > 0 ? 'warn' : 'ok';
  const sum = rows.reduce((t, x) => t + x.w, 0);
  publishDiagnostic(sim, {
    id: 'diag-rivals', system: 'rivals', status,
    label: `${rows.length} rival colonies; ${contestedAll} contested cells; ${risk} raid risks`,
    value: risk,
    factors: rows.sort((a, b) => b.w - a.w).slice(0, 6).map((x) => ({ cause: x.cause, weight: sum > 0 ? x.w / sum : 0, detail: x.detail, diagId: null })),
    remedies: status === 'ok' ? [] : ['remedy.stance.cautious', 'remedy.marker.rally'],
    sinceTick: -1, focus: null,
  });
}
