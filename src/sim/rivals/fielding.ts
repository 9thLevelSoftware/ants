// Fielding (GDD 05 §3.3): how many agents each rival wants per job, the global agent budget shared by priority
// (defenders > raid > war > guards > foragers / patrols; proportional to targets within a priority), emergence
// at the entrances (one per 2 s), defenders from the deepest chamber (one per 1.5 s), recall of surplus agents,
// and the hard cap that keeps player + rival ants <= 2500 at every tick (I7).

import type { Ant, Sim } from '@/sim/types';
import {
  ANT_TOTAL_CAP, DEFENDER_EVERY_S, EMERGE_EVERY_S, GUARD_MIN_N, GUARDS_PER_ENTRANCE, INCIPIENT_FIELD_CAP,
  ORPHAN_FIELD_MULT, PATROL_SHARE, QUEEN_ESCORTS, REINFORCE_EVERY_S, REINFORCE_MAX, RIVAL_BUDGET_MARGIN,
  RIVAL_BUDGET_MAX,
} from '@/sim/balance/rivals';
import { rivalProfile } from '@/sim/species/rivals/profiles';
import { secondsToTicks } from '@/sim/time';
import { absorbAgent, agentsOf, countedJob, spawnAgent } from './agents';
import { activityOf, clockOf, type Clock } from './env';
import { goHome, queenHiding } from './behaviours/jobs';
import { warOf, worstRelation } from './relations';
import { homeNest } from './setup';
import { colExt, JOB, priorityOf, rivalColonies, rmod, type JobCode, type RivalColony } from './state';

/** Jobs in priority order (fielding fills them in this order). */
const FIELD_JOBS: readonly JobCode[] = [JOB.defend, JOB.escort, JOB.dig, JOB.raid, JOB.brood, JOB.war, JOB.guard, JOB.patrol, JOB.forage];
const JOB_SLOTS = 13;

/** Total living ants and those of the player colony this tick. */
export function antCounts(sim: Sim): { total: number; player: number } {
  const pid = sim.state.colonies[0]?.id ?? -1;
  let total = 0, player = 0;
  const list = sim.stores.ants.list;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive) continue;
    total++;
    if (a.colony === pid) player++;
  }
  return { total, player };
}

/** RIVAL_AGENT_BUDGET = min(900, 2500 - playerAnts - 50), never negative. */
export function rivalAgentBudget(playerAnts: number): number {
  return Math.max(0, Math.min(RIVAL_BUDGET_MAX, ANT_TOTAL_CAP - playerAnts - RIVAL_BUDGET_MARGIN));
}

/** Hostile ants inside the colony's nest. */
function intruders(sim: Sim, col: RivalColony, nestId: number): number {
  let n = 0;
  for (const a of sim.stores.ants.list) if (a.alive && a.nestId === nestId && a.colony !== col.id) n++;
  return n;
}

/** Wanted agents per job of one colony (index = job code). */
export function fieldTargets(sim: Sim, col: RivalColony, clock: Clock): number[] {
  const want = new Array<number>(JOB_SLOTS).fill(0);
  const ext = colExt(sim.state, col.id);
  const nest = homeNest(sim, col);
  if (!ext.setupDone || !nest || nest.entrances.length === 0 || ext.destroyedTick >= 0) return want;
  const r = col.rival, p = rivalProfile(col.species);
  const a = activityOf(sim, col, clock);
  const n = Math.max(0, Math.floor(r.n));
  // defenders: one per intruder in the nest and a reinforcement call; escorts while the queen hides (a colony
  // large enough to spare them: N >= GUARD_MIN_N)
  const inside = intruders(sim, col, nest.id);
  want[JOB.defend] = Math.min(n, Math.min(REINFORCE_MAX, inside) + ext.reinforceLeft);
  if (n >= GUARD_MIN_N && queenHiding(sim, sim.stores.ants.get(col.queenId))) want[JOB.escort] = Math.min(n, QUEEN_ESCORTS);
  // raid parties (raids.ts sets toSend); diggers are spawned directly by founding.ts
  for (const rd of rmod(sim.state).raids) {
    if (rd.attacker !== col.id || rd.ending) continue;
    const j = rd.kind === 'brood' ? JOB.brood : JOB.raid;
    want[j] += rd.toSend + rd.partyIds.filter((id) => sim.stores.ants.get(id)?.alive).length;
  }
  if (a <= 0) return want;
  const orphan = r.orphaned ? ORPHAN_FIELD_MULT : 1;
  const capNormal = r.incipient ? INCIPIENT_FIELD_CAP : p.fieldCap.normal;
  if (warOf(sim.state, col.id) && n >= GUARD_MIN_N) want[JOB.war] = Math.floor(Math.max(0, p.fieldCap.war - p.fieldCap.normal) * a * orphan);
  if (n >= GUARD_MIN_N) want[JOB.guard] = GUARDS_PER_ENTRANCE * nest.entrances.length;
  const base = Math.floor(Math.min(capNormal, Math.ceil(n * p.fieldShare * a)) * orphan);
  const patrol = Math.round(base * (PATROL_SHARE[worstRelation(sim.state, col.id)] ?? 0));
  want[JOB.patrol] = patrol;
  want[JOB.forage] = base - patrol;
  return want;
}

/**
 * Share of a budget by priority. Within a priority each target gets its proportional share (floor); the slots
 * lost to rounding go to the largest fractions of the same priority (ties: colony, then job order) before a lower
 * priority sees any.
 */
export function allocateBudget(targets: number[][], budget: number): number[][] {
  const out = targets.map(() => new Array<number>(JOB_SLOTS).fill(0));
  let left = Math.max(0, Math.floor(budget));
  for (let prio = 0; prio <= 4 && left > 0; prio++) {
    const jobs = FIELD_JOBS.filter((j) => priorityOf(j) === prio);
    let want = 0;
    for (const t of targets) for (const j of jobs) want += t[j];
    if (want <= 0) continue;
    const give = Math.min(left, want);
    const f = give / want;
    const rest: { c: number; j: number; frac: number }[] = [];
    let given = 0;
    for (let c = 0; c < targets.length; c++) {
      for (const j of jobs) {
        const exact = targets[c][j] * f;
        const g = Math.floor(exact);
        out[c][j] = g;
        given += g;
        if (exact - g > 1e-9) rest.push({ c, j, frac: exact - g });
      }
    }
    rest.sort((x, y) => y.frac - x.frac);
    for (let i = 0; i < rest.length && given < give; i++, given++) out[rest[i].c][rest[i].j]++;
    left -= given;
  }
  return out;
}

/** One fielding pass (every FIELD_EVERY_TICKS): targets, budget, recall of surplus, emergence of new agents. */
export function fieldingPass(sim: Sim): void {
  const cols = rivalColonies(sim);
  if (cols.length === 0) return;
  const clock = clockOf(sim);
  const counts = antCounts(sim);
  const agentLists = cols.map((c) => agentsOf(sim, c));
  const fielded = agentLists.reduce((s, l) => s + l.length, 0);
  const others = counts.total - counts.player - fielded; // queens and any other rival ant
  const budget = Math.max(0, Math.min(rivalAgentBudget(counts.player), ANT_TOTAL_CAP - counts.player - others - RIVAL_BUDGET_MARGIN));
  const targets = cols.map((c) => fieldTargets(sim, c, clock));
  const allowed = allocateBudget(targets, budget);
  const now = sim.state.tick;
  for (let c = 0; c < cols.length; c++) {
    const col = cols[c], ext = colExt(sim.state, col.id);
    const have = new Array<number>(JOB_SLOTS).fill(0);
    for (const a of agentLists[c]) { const j = countedJob(a); if (j >= 0) have[j]++; }
    // recall surplus (newest first): they walk home and are absorbed there
    for (const j of FIELD_JOBS) {
      let extra = have[j] - allowed[c][j];
      if (extra <= 0 || j === JOB.raid || j === JOB.brood || j === JOB.dig) continue;
      for (let i = agentLists[c].length - 1; i >= 0 && extra > 0; i--) {
        const a = agentLists[c][i];
        if (countedJob(a) !== j) continue;
        goHome(sim, a);
        extra--;
      }
    }
    // emergence: the highest-priority deficit first
    for (const j of FIELD_JOBS) {
      if (have[j] >= allowed[c][j] || Math.floor(col.rival.n) <= agentLists[c].length) continue;
      const deep = j === JOB.defend || j === JOB.escort;
      if (deep && now < ext.defenderReadyTick) continue;
      if (!deep && now < ext.emergeReadyTick) continue;
      const raid = j === JOB.raid || j === JOB.brood ? takeRaidSlot(sim, col.id, j) : -1;
      if ((j === JOB.raid || j === JOB.brood) && raid < 0) continue;
      const ant = spawnAgent(sim, col, j, deep, raid);
      if (!ant) continue;
      if (raid >= 0) noteRaider(sim, raid, ant.id);
      if (j === JOB.defend && ext.reinforceLeft > 0) {
        ext.reinforceLeft--;
        ant.bb['rv.rx'] = ext.reinforceX; ant.bb['rv.ry'] = ext.reinforceY; ant.bb['rv.rz'] = ext.reinforceZ;
      }
      if (deep) ext.defenderReadyTick = now + secondsToTicks(j === JOB.defend && ext.reinforceLeft > 0 ? REINFORCE_EVERY_S : DEFENDER_EVERY_S);
      else {
        const nest = homeNest(sim, col);
        ext.emergeReadyTick = now + Math.ceil(secondsToTicks(EMERGE_EVERY_S) / Math.max(1, nest?.entrances.length ?? 1));
      }
      break; // one spawn per colony per pass and kind keeps emergence rates honest
    }
  }
}

function takeRaidSlot(sim: Sim, attacker: number, job: JobCode): number {
  for (const rd of rmod(sim.state).raids) {
    if (rd.attacker !== attacker || rd.ending || rd.toSend <= 0) continue;
    if ((rd.kind === 'brood') !== (job === JOB.brood)) continue;
    return rd.id;
  }
  return -1;
}

function noteRaider(sim: Sim, raidId: number, antId: number): void {
  const rd = rmod(sim.state).raids.find((r) => r.id === raidId);
  if (!rd) return;
  rd.toSend = Math.max(0, rd.toSend - 1);
  rd.partyIds.push(antId);
  rd.startSize = Math.max(rd.startSize, rd.partyIds.length);
}

/**
 * Room under the 2500 cap for ants the cap cannot take back (player workers, rival queens): the cap minus every
 * living ant that is not a fielded agent (enforceCap absorbs agents to make room).
 */
export function capRoom(sim: Sim): number {
  let agents = 0;
  for (const c of rivalColonies(sim)) agents += agentsOf(sim, c).length;
  return Math.max(0, ANT_TOTAL_CAP - (antCounts(sim).total - agents));
}

/**
 * Hard cap (end of the per-tick and of the hourly pass): while player + rival ants exceed 2500, or the agents exceed
 * the budget, the lowest-priority agents are absorbed at once. Player ants and rival queens are never removed, so
 * the other spawners keep them within capRoom; I7 then holds whenever player ants + rival queens <= 2500.
 */
export function enforceCap(sim: Sim): void {
  const counts = antCounts(sim);
  const cols = rivalColonies(sim);
  let fielded = 0;
  for (const c of cols) fielded += c.rival.fieldedIds.length;
  const over = Math.max(counts.total - ANT_TOTAL_CAP, fielded - rivalAgentBudget(counts.player));
  if (over <= 0) return;
  const pool: Ant[] = [];
  for (const c of cols) for (const a of agentsOf(sim, c)) pool.push(a);
  // lowest priority first (foragers, patrols, guards, war, raid, defenders), newest first within a priority
  pool.sort((x, y) => priorityOf(countedJobOrRet(y)) - priorityOf(countedJobOrRet(x)) || y.id - x.id);
  let n = over;
  for (const a of pool) {
    if (n <= 0) break;
    if (absorbAgent(sim, a)) n--;
  }
}

function countedJobOrRet(a: Ant): JobCode {
  const j = countedJob(a);
  return j === -1 ? JOB.forage : j;
}
