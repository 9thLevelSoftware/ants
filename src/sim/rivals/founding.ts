// Rivals and the player's founding queen (GDD 05 §3.10). On the surface she meets rival agents under the
// encounter rules (combat's attack roll: x1.5 against a founding queen; never on gentle through protectedQueen).
// Sealed in her chamber before the first workers, a rival digs in only if the chamber lies in a cell claimed by a
// rival: p per gd = 0.1 x min(1, m_c / 100) x foundingRivalMult, then 3-6 rival workers break through (one real
// fight in the chamber), as a major threat of the threat director.

import { rngChance, rngInt } from '@/core/rng';
import type { Ant, Colony, Sim } from '@/sim/types';
import { DIG_MC_REF, DIG_P, DIG_PARTY, RIVAL_LEVERS } from '@/sim/balance/rivals';
import { protectedQueen } from '@/sim/combat';
import { endMajorThreat, requestMajorThreat } from '@/sim/ecology';
import { quietShare, quietTracker } from '@/sim/ecology/creatures';
import { TICKS_PER_DAY } from '@/sim/time';
import { spawnAnt } from '@/sim/entities';
import { AntFlag } from '@/sim/types';
import { setJob } from './agents';
import { claimAt } from './territory';
import { placeOnFloor } from './setup';
import { BB, isRival, JOB, playerColonyOf, rmod, type RivalColony } from './state';

const THREAT_KIND = 'rival-dig';

/** The founding queen sealed in her chamber without workers yet, or null. */
export function sealedFoundress(sim: Sim): { col: Colony; queen: Ant } | null {
  const col = playerColonyOf(sim);
  if (!col) return null;
  const op = sim.state.player.opening;
  if (!op || !op.sealed || op.done) return null;
  const q = sim.stores.ants.get(col.queenId);
  if (!q || !q.alive || q.nestId < 0) return null;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && a.caste !== 'queen') return null;
  return { col, queen: q };
}

/**
 * Digging-in chance per gd for the sealed founding queen (0 outside rival-claimed cells, on gentle and for a
 * protected queen), and the rival that would dig.
 */
export function foundingDigChance(sim: Sim): { p: number; rival: RivalColony | null } {
  const f = sealedFoundress(sim);
  if (!f || protectedQueen(sim, f.queen)) return { p: 0, rival: null };
  const claim = claimAt(sim, f.queen.pos);
  const owner = claim.owner >= 0 ? sim.stores.colonies.get(claim.owner) : undefined;
  if (!isRival(owner) || owner.rival.n < DIG_PARTY[0]) return { p: 0, rival: null };
  const mult = RIVAL_LEVERS[sim.state.config.difficulty.preset]?.foundingRivalMult ?? 1;
  return { p: DIG_P * Math.min(1, claim.mark / DIG_MC_REF) * mult, rival: owner };
}

/** Hourly roll (p per gd spread over 24 hourly rolls); `force` skips the roll (tests, cheats). */
export function foundingThreatHour(sim: Sim, dtGd: number, force = false): boolean {
  const { p, rival } = foundingDigChance(sim);
  if (!rival || p <= 0) return false;
  if (rmod(sim.state).raids.some((r) => r.kind === 'dig')) return false;
  const pHour = 1 - Math.pow(1 - Math.min(1, p), dtGd);
  if (!force && !rngChance(sim.stream('rng.rivals'), pHour)) return false;
  return digIn(sim, rival);
}

/**
 * The threat director's slot for the dig-in. Adapter: the director refuses every major threat while no daytime
 * hour has been counted for the quiet share (I11 excludes the founding stage), which would make this founding-stage
 * threat impossible; with nothing counted yet only "one at a time" and THREAT_MIN_QUIET_GD apply (reported seam).
 */
function startMajorThreat(sim: Sim, kind: string): boolean {
  if (requestMajorThreat(sim, kind)) return true;
  if (quietShare(sim) !== null) return false;
  const td = sim.state.rivals.threatDirector;
  if (td.activeKind !== null) return false;
  const minGd = sim.state.config.difficulty.params.threatMinQuietGd;
  if (td.lastEndTick >= 0 && sim.state.tick - td.lastEndTick < minGd * TICKS_PER_DAY) return false;
  td.activeKind = kind;
  td.activeSinceTick = sim.state.tick;
  const q = quietTracker(sim);
  q.threats++;
  q.curThreat = 1;
  return true;
}

/** 3-6 workers of the rival break into the founding chamber next to the queen. */
export function digIn(sim: Sim, rival: RivalColony): boolean {
  const f = sealedFoundress(sim);
  if (!f) return false;
  if (!startMajorThreat(sim, THREAT_KIND)) return false;
  const m = rmod(sim.state);
  const n = Math.min(Math.floor(rival.rival.n), rngInt(sim.stream('rng.rivals'), DIG_PARTY[0], DIG_PARTY[1]));
  const r = {
    id: m.nextRaidId++, attacker: rival.id, target: f.col.id, kind: 'dig' as const, targetNestId: f.queen.nestId, toSend: 0,
    partyIds: [] as number[], startSize: 0, startTick: sim.state.tick, loot: 0, gathered: true, ending: false, majorThreat: true,
  };
  const bu = sim.world.bu;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = { x: f.queen.pos.x + Math.cos(a) * 1.2 * bu, y: f.queen.pos.y + 0.5 * bu, z: f.queen.pos.z + Math.sin(a) * 1.2 * bu };
    const ant = spawnAnt(sim, { colony: rival.id, caste: 'worker', pos: p, task: 'raid', flags: AntFlag.FIELDED, ageGd: 10, nestId: f.queen.nestId });
    if (!placeOnFloor(sim, ant, { x: p.x, y: f.queen.pos.y, z: p.z })) placeOnFloor(sim, ant, f.queen.pos);
    ant.bb[BB.raid] = r.id;
    ant.bb['run.task'] = -1;
    setJob(sim, ant, JOB.dig);
    rival.rival.fieldedIds.push(ant.id);
    r.partyIds.push(ant.id);
  }
  r.startSize = r.partyIds.length;
  if (r.startSize === 0) { endMajorThreat(sim, THREAT_KIND); return false; }
  m.raids.push(r);
  sim.emit({ type: 'rival-raid-started', attacker: rival.id, target: f.col.id, partySize: r.startSize });
  return true;
}
