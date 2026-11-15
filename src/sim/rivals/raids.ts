// Raids (GDD 05 §3.7, §3.8): launching (hourly), progress and end rules (every fielding pass), the player's raids
// from a rally `attack` marker at a known foreign entrance, brood raids among incipient conspecific colonies in
// both directions, Formica predatory raids, and what a brood raid leaves behind (abandonment, workers joining).

import { rngChance, rngRange } from '@/core/rng';
import type { Ant, Colony, RaidRecord, Sim } from '@/sim/types';
import {
  ABANDON_QUEEN_GD, BROOD_RAID_COOLDOWN_GD, BROOD_RAID_RATIO, BROOD_RAID_SHARE, E_GAIN, INCIPIENT_MAX, JOIN_LAST_WORKERS,
  JOIN_P, PLAYER_RAID_MAX, PLAYER_RAID_SHARE, PREDATORY_RATIO, RAID_END_LOOT_SHARE, RAID_END_PARTY_SHARE, RAID_MAX_GD,
  RAID_GATHER_BU, RAID_GATHER_MAX_S, RAID_GATHER_SHARE, RAID_P, RAID_PARTY_SHARE, RAID_PLAYER_MIN_WORKERS, RAID_RATIO, RALLY_ATTACK_BU, RIVAL_LEVERS,
} from '@/sim/balance/rivals';
import { activeRally, canFight } from '@/sim/combat';
import { endMajorThreat, requestMajorThreat } from '@/sim/ecology';
import { switchTask } from '@/sim/colony/allocation';
import { rivalProfile } from '@/sim/species/rivals/profiles';
import { secondsToTicks, TICKS_PER_DAY } from '@/sim/time';
import { setJob } from './agents';
import { playerStrength, rivalStrength } from './model';
import { addEscalation, findRelation } from './relations';
import { homeNest, placeOnFloor } from './setup';
import { spawnAnt } from '@/sim/entities';
import { BB, colExt, isRival, JOB, playerColonyOf, rivalColonies, rmod, slotBit, type RivalColony } from './state';
import { d2 } from './move';
import { antCounts, rivalAgentBudget } from './fielding';

const THREAT_KIND = 'raid';

/** Workers (worker castes) of a full-fidelity colony. */
export function workersOf(sim: Sim, col: Colony): Ant[] {
  const out: Ant[] = [];
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && canFight(a)) out.push(a);
  return out;
}

/** Strength S of any colony (GDD 05 §3.2): rivals from the abstract model, the player from its workers. */
export function strengthOf(sim: Sim, col: Colony): number {
  if (col.rival) return rivalStrength(col.rival.n, rivalProfile(col.species).cp, col.rival.agg);
  return playerStrength(workersOf(sim, col).length, rivalProfile(col.species).cp);
}

/** Workers of a colony for the incipient test (abstract N or simulated workers). */
export function workerCount(sim: Sim, col: Colony): number {
  return col.rival ? col.rival.n : workersOf(sim, col).length;
}

export function isIncipient(sim: Sim, col: Colony): boolean {
  return col.rival ? col.rival.incipient || col.rival.n <= INCIPIENT_MAX : workersOf(sim, col).length <= INCIPIENT_MAX;
}

/** Does colony `a` know where colony `b`'s nest is? */
export function knowsNest(sim: Sim, a: Colony, b: Colony): boolean {
  const bit = slotBit(sim.state, b.id);
  if (bit === 0) return false;
  if (a.rival) return (a.rival.knowsNest & bit) !== 0;
  return a.isPlayer && (rmod(sim.state).playerKnowsNest & bit) !== 0;
}

export function activeRaidOf(sim: Sim, attacker: number): RaidRecord | undefined {
  return rmod(sim.state).raids.find((r) => r.attacker === attacker);
}

function raidOnPlayer(sim: Sim): RaidRecord | undefined {
  const pid = sim.state.colonies[0]?.id;
  return rmod(sim.state).raids.find((r) => r.target === pid && r.kind !== 'dig');
}

/** Starts a raid record; rival parties are fielded by the fielding pass, player parties are taken here. */
export function startRaid(sim: Sim, attacker: Colony, target: Colony, kind: RaidRecord['kind'], party: number, majorThreat: boolean): RaidRecord | null {
  const nest = homeNest(sim, target);
  if (!nest || party <= 0) return null;
  const m = rmod(sim.state);
  const r: RaidRecord = {
    id: m.nextRaidId++, attacker: attacker.id, target: target.id, kind, targetNestId: nest.id, toSend: attacker.rival ? party : 0,
    partyIds: [], startSize: 0, startTick: sim.state.tick, loot: 0, gathered: false, ending: false, majorThreat,
  };
  m.raids.push(r);
  if (attacker.rival) attacker.rival.raid = { targetColony: target.id, partyIds: r.partyIds, startTick: r.startTick, startSize: party };
  else sendPlayerParty(sim, attacker, r, party);
  if (kind !== 'dig') addEscalation(sim, attacker.id, target.id, E_GAIN.raid);
  sim.emit({ type: 'rival-raid-started', attacker: attacker.id, target: target.id, partySize: attacker.rival ? party : r.partyIds.length });
  return r;
}

/** Player party: foragers and guards first (then any free worker for brood raids), switched to task `raid`. */
function sendPlayerParty(sim: Sim, col: Colony, r: RaidRecord, party: number): void {
  const pool = workersOf(sim, col).filter((a) => a.carry.kind === 'none' && a.task !== 'fight' && a.task !== 'flee' && a.task !== 'raid');
  const front = (a: Ant): number => (a.task === 'forage' || a.task === 'guard' || a.task === 'scout' || a.task === 'patrol' ? 0 : 1);
  pool.sort((x, y) => front(x) - front(y) || x.id - y.id);
  for (const a of pool) {
    if (r.partyIds.length >= party) break;
    if (r.kind === 'raid' && front(a) > 0) break; // war raids take foragers and guards only
    switchTask(sim, col, a, 'raid', 'marker:rally');
    a.bb[BB.raid] = r.id;
    setJob(sim, a, r.kind === 'brood' ? JOB.brood : JOB.raid);
    r.partyIds.push(a.id);
  }
  r.startSize = r.partyIds.length;
}

// ---- launching (hourly) ----

function cooldownOk(sim: Sim, attacker: Colony, target: Colony): boolean {
  const last = attacker.rival ? attacker.rival.lastRaidTick : -1;
  if (last < 0) return true;
  void target; // GDD 05 §5 gives one cooldown lever (raids on the player); rival-on-rival raids use it too
  return sim.state.tick - last >= sim.state.config.difficulty.params.raidCooldownGd * TICKS_PER_DAY;
}

/** Raids on the player before 50 workers follow the difficulty lever (never / incipient brood raids / allowed). */
function playerRaidAllowed(sim: Sim, target: Colony, kind: RaidRecord['kind']): boolean {
  if (!target.isPlayer) return true;
  const lever = RIVAL_LEVERS[sim.state.config.difficulty.preset]?.earlyRaids ?? 'incipient';
  if (workersOf(sim, target).length >= RAID_PLAYER_MIN_WORKERS) return true;
  return lever === 'allowed' || (lever === 'incipient' && kind === 'brood');
}

/** Hourly: mature raids in war (R >= 2, nest known, cooldown, director, p 0.25) and Formica predatory raids. */
export function launchRaids(sim: Sim, activity: (c: RivalColony) => number): void {
  const rng = sim.stream('rng.rivals');
  const counts = antCounts(sim);
  for (const att of rivalColonies(sim)) {
    if (activeRaidOf(sim, att.id) || att.rival.orphaned || att.rival.incipient || activity(att) <= 0) continue;
    const sA = strengthOf(sim, att);
    const p = rivalProfile(att.species);
    for (const def of sim.stores.colonies.list) {
      if (!def.alive || def.id === att.id) continue;
      const rel = findRelation(sim.state, att.id, def.id);
      const predatory = p.predatoryRaids && strengthOf(sim, def) <= PREDATORY_RATIO * sA;
      if (!predatory && rel?.state !== 'war') continue;
      if (!knowsNest(sim, att, def) || !cooldownOk(sim, att, def)) continue;
      if (!predatory && sA / Math.max(1e-6, strengthOf(sim, def)) < RAID_RATIO) continue;
      const kind = predatory ? 'predatory' : 'raid';
      if (!playerRaidAllowed(sim, def, kind)) continue;
      if (def.isPlayer && raidOnPlayer(sim)) continue; // one raid on the player at a time (I9)
      if (!rngChance(rng, RAID_P)) continue;
      if (def.isPlayer && !requestMajorThreat(sim, THREAT_KIND)) continue; // deferred to the next hourly check
      const party = Math.floor(Math.min(p.fieldCap.war, RAID_PARTY_SHARE * att.rival.n, rivalAgentBudget(counts.player)));
      if (startRaid(sim, att, def, kind, party, def.isPlayer)) break;
      if (def.isPlayer) endMajorThreat(sim, THREAT_KIND);
    }
  }
}

/** Hourly: brood raids among incipient conspecific colonies (GDD 05 §3.8), rival and player attackers. */
export function launchBroodRaids(sim: Sim): void {
  const player = playerColonyOf(sim);
  const lever = RIVAL_LEVERS[sim.state.config.difficulty.preset];
  const cols: Colony[] = [...rivalColonies(sim)];
  if (player) cols.unshift(player);
  for (const att of cols) {
    if (activeRaidOf(sim, att.id) || !isIncipient(sim, att)) continue;
    if (att.rival && (att.rival.orphaned || att.rival.n < 1)) continue;
    for (const def of cols) {
      if (def === att || def.species !== att.species || !isIncipient(sim, def) || !knowsNest(sim, att, def)) continue;
      if (att.isPlayer && !playerMayBroodRaid(sim, att, def)) continue;
      if (def.isPlayer && (!lever?.incipientRaidsPlayer || workersOf(sim, def).length === 0 || raidOnPlayer(sim))) continue;
      const ext = colExt(sim.state, def.id);
      if (ext.broodRaidedTick >= 0 && sim.state.tick - ext.broodRaidedTick < BROOD_RAID_COOLDOWN_GD * TICKS_PER_DAY) continue;
      if (strengthOf(sim, att) < BROOD_RAID_RATIO * strengthOf(sim, def)) continue;
      const party = Math.round(BROOD_RAID_SHARE * workerCount(sim, att));
      if (def.isPlayer && !requestMajorThreat(sim, THREAT_KIND)) continue;
      const r = startRaid(sim, att, def, 'brood', party, def.isPlayer);
      if (r) { ext.broodRaidedTick = sim.state.tick; break; }
      if (def.isPlayer) endMajorThreat(sim, THREAT_KIND);
    }
  }
}

/** The player's AI brood-raids only with stance aggressive or a rally `attack` marker at the victim's nest. */
function playerMayBroodRaid(sim: Sim, player: Colony, def: Colony): boolean {
  if (player.directives.stance === 'aggressive') return true;
  const m = activeRally(sim, player.id);
  const nest = homeNest(sim, def);
  return !!m && m.params.mode === 'attack' && !!nest && nest.entrances.some((e) => d2(e.pos, m.pos) <= RALLY_ATTACK_BU * sim.world.bu);
}

/** Every fielding pass: a rally `attack` marker within 30 BU of a known foreign entrance launches the player raid. */
export function playerRallyRaid(sim: Sim): void {
  const player = playerColonyOf(sim);
  if (!player || activeRaidOf(sim, player.id)) return;
  const m = activeRally(sim, player.id);
  if (!m || m.params.mode !== 'attack') return;
  for (const def of rivalColonies(sim)) {
    const nest = homeNest(sim, def);
    if (!nest || !knowsNest(sim, player, def)) continue;
    if (!nest.entrances.some((e) => d2(e.pos, m.pos) <= RALLY_ATTACK_BU * sim.world.bu)) continue;
    const fronts = workersOf(sim, player).filter((a) => a.task === 'forage' || a.task === 'guard' || a.task === 'scout' || a.task === 'patrol');
    const brood = isIncipient(sim, player) && isIncipient(sim, def) && def.species === player.species;
    const party = brood
      ? Math.round(BROOD_RAID_SHARE * workersOf(sim, player).length)
      : Math.min(PLAYER_RAID_MAX, Math.max(1, Math.round(PLAYER_RAID_SHARE * fronts.length)));
    startRaid(sim, player, def, brood ? 'brood' : 'raid', party, false);
    return;
  }
}

// ---- progress and end ----

function carriesLoot(sim: Sim, a: Ant): boolean {
  return a.carry.kind !== 'none';
}

/** Every fielding pass: end rules (party <= 30 % of its peak once sent, 0.3 gd, >= 50 % carrying loot). */
export function raidProgress(sim: Sim): void {
  const m = rmod(sim.state);
  for (const r of m.raids) {
    const alive = r.partyIds.map((id) => sim.stores.ants.get(id)).filter((a): a is Ant => !!a && a.alive);
    const attacker = sim.stores.colonies.get(r.attacker), target = sim.stores.colonies.get(r.target);
    if (!r.gathered) r.gathered = partyGathered(sim, r, alive);
    if (!r.ending) {
      const sent = r.toSend <= 0;
      const loot = alive.filter((a) => carriesLoot(sim, a)).length;
      const tooFew = sent && alive.length <= RAID_END_PARTY_SHARE * r.startSize;
      const late = sim.state.tick - r.startTick >= RAID_MAX_GD * TICKS_PER_DAY;
      const looted = sent && alive.length > 0 && loot >= RAID_END_LOOT_SHARE * alive.length;
      const gone = !attacker || !target || (r.kind === 'brood' && targetEmpty(sim, r));
      const playerOff = attacker?.isPlayer && r.kind === 'raid' && !activeRally(sim, attacker.id);
      if (tooFew || late || looted || gone || playerOff || (sent && r.startSize === 0)) endRaid(sim, r);
    }
    if (r.ending) {
      for (const a of alive) if ((a.bb[BB.job] ?? -1) === JOB.raid || (a.bb[BB.job] ?? -1) === JOB.brood) setJob(sim, a, JOB.ret);
    }
  }
  m.raids = m.raids.filter((r) => !r.ending || r.partyIds.some((id) => sim.stores.ants.get(id)?.alive && sim.stores.ants.get(id)?.task === 'raid'));
}

/** The party is at the target entrance (or inside), or has waited long enough: it goes in together. */
function partyGathered(sim: Sim, r: RaidRecord, alive: Ant[]): boolean {
  if (sim.state.tick - r.startTick >= secondsToTicks(RAID_GATHER_MAX_S)) return true;
  if (r.toSend > 0 || alive.length === 0) return false;
  const nest = sim.stores.nests.get(r.targetNestId);
  if (!nest) return true;
  const near = alive.filter((a) => a.nestId === nest.id || nest.entrances.some((e) => d2(e.pos, a.pos) <= e.radius + RAID_GATHER_BU * sim.world.bu)).length;
  return near >= RAID_GATHER_SHARE * alive.length;
}

function targetEmpty(sim: Sim, r: RaidRecord): boolean {
  for (const b of sim.stores.brood.list) if (b.alive && b.colony === r.target && b.carriedBy < 0 && b.nestId === r.targetNestId && b.stage !== 'egg') return false;
  return true;
}

export function endRaid(sim: Sim, r: RaidRecord): void {
  if (r.ending) return;
  r.ending = true;
  r.toSend = 0;
  const attacker = sim.stores.colonies.get(r.attacker);
  if (attacker?.rival) { attacker.rival.raid = null; attacker.rival.lastRaidTick = sim.state.tick; }
  if (r.majorThreat) endMajorThreat(sim, r.kind === 'dig' ? 'rival-dig' : THREAT_KIND);
  sim.emit({ type: 'rival-raid-ended', attacker: r.attacker, target: r.target, partySize: r.startSize, loot: r.loot });
  if (r.kind === 'brood') afterBroodRaid(sim, r);
}

/** GDD 05 §3.8: a victim left without workers and brood loses its queen within 1 gd; its last workers may join. */
function afterBroodRaid(sim: Sim, r: RaidRecord): void {
  const def = sim.stores.colonies.get(r.target), att = sim.stores.colonies.get(r.attacker);
  if (!isRival(def) || !att) return;
  const rng = sim.stream('rng.rivals');
  if (def.rival.n <= JOIN_LAST_WORKERS && targetEmpty(sim, r)) {
    let joined = 0;
    for (let i = 0; i < Math.floor(def.rival.n); i++) if (rngChance(rng, JOIN_P)) joined++;
    def.rival.n -= joined;
    if (att.rival) att.rival.n += joined;
    else joinPlayer(sim, att, joined);
    def.rival.b = 0;
  }
  if (def.rival.n < 1 && def.rival.b <= 0) {
    const ext = colExt(sim.state, def.id);
    if (ext.abandonTick < 0) ext.abandonTick = sim.state.tick + Math.round(rngRange(rng, 0.25, 1) * ABANDON_QUEEN_GD * TICKS_PER_DAY);
  }
}

/** Workers of a raided incipient that join the player's colony appear at its entrance. */
function joinPlayer(sim: Sim, player: Colony, n: number): void {
  const nest = homeNest(sim, player);
  const e = nest?.entrances[0];
  if (!e) return;
  for (let i = 0; i < n; i++) {
    const p = { x: e.pos.x + (i - n / 2) * sim.world.bu, y: e.pos.y + sim.world.bu, z: e.pos.z + 2 * sim.world.bu };
    const a = spawnAnt(sim, { colony: player.id, caste: 'worker', pos: p, ageGd: 5, task: 'idle' });
    placeOnFloor(sim, a, p);
  }
}
