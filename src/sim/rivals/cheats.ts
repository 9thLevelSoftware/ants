// Debug commands of the rivals module (GDD 05 App. B): setRival, setRelation, triggerRaid.

import type { CommandHandlerMap, RelationState, Sim } from '@/sim/types';
import { RELATION_STATES } from '@/sim/types';
import { endMajorThreat, requestMajorThreat } from '@/sim/ecology';
import { rivalAgentBudget, antCounts } from './fielding';
import { rivalProfile } from '@/sim/species/rivals/profiles';
import { RAID_PARTY_SHARE } from '@/sim/balance/rivals';
import { ensureRelation } from './relations';
import { activeRaidOf, isIncipient, startRaid, workerCount } from './raids';
import { isRival } from './state';

/** Keys accepted by cheat.setRival (GDD names and field names). */
const RIVAL_KEYS: Record<string, 'n' | 'b' | 'cS' | 'pS' | 'agg'> = {
  N: 'n', n: 'n', B: 'b', b: 'b', C_s: 'cS', cS: 'cS', P_s: 'pS', pS: 'pS', agg: 'agg',
};

function setRival(sim: Sim, colonyId: number, values: Record<string, number>): void {
  const col = sim.stores.colonies.get(colonyId);
  if (!isRival(col)) return;
  for (const [k, v] of Object.entries(values)) {
    const f = RIVAL_KEYS[k];
    if (f && Number.isFinite(v)) col.rival[f] = Math.max(0, f === 'agg' ? Math.min(1, v) : v);
    if (k === 'incipient') col.rival.incipient = v !== 0;
  }
}

function setRelation(sim: Sim, a: number, b: number, e: number, state: RelationState | null): void {
  if (a === b || !sim.stores.colonies.get(a) || !sim.stores.colonies.get(b)) return;
  const r = ensureRelation(sim.state, a, b);
  if (Number.isFinite(e)) r.e = Math.max(0, e);
  if (state && (RELATION_STATES as readonly string[]).includes(state) && r.state !== state) {
    const from = r.state;
    r.state = state;
    r.stateSinceTick = sim.state.tick;
    sim.emit({ type: 'rival-relation-changed', a: r.a, b: r.b, from, to: state, e: r.e });
  }
}

/** Starts a raid now (bypassing relation, ratio and nest knowledge; the threat director too with `force`). */
export function triggerRaid(sim: Sim, attacker: number, target: number, force: boolean): boolean {
  const att = sim.stores.colonies.get(attacker), def = sim.stores.colonies.get(target);
  if (!att || !def || att === def || activeRaidOf(sim, att.id)) return false;
  const brood = isIncipient(sim, att) && isIncipient(sim, def) && att.species === def.species;
  const major = def.isPlayer && !force;
  if (major && !requestMajorThreat(sim, 'raid')) return false;
  const p = rivalProfile(att.species);
  const n = workerCount(sim, att);
  const party = att.rival
    ? Math.floor(Math.min(p.fieldCap.war, Math.max(1, brood ? 0.6 * n : RAID_PARTY_SHARE * n), rivalAgentBudget(antCounts(sim).player)))
    : Math.max(1, Math.round((brood ? 0.6 : 0.3) * n));
  const r = startRaid(sim, att, def, brood ? 'brood' : 'raid', party, major);
  if (!r && major) endMajorThreat(sim, 'raid');
  return !!r;
}

export const rivalCheats: Partial<CommandHandlerMap> = {
  'cheat.setRival': (sim, c) => setRival(sim, c.colonyId, c.values),
  'cheat.setRelation': (sim, c) => setRelation(sim, c.a, c.b, c.e, c.state),
  'cheat.triggerRaid': (sim, c) => { triggerRaid(sim, c.attacker, c.target, c.force); },
};
