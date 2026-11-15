// Bookkeeping when a creature is gone, whoever removed it (this module, combat, a cheat): its territory is vacated
// (after the kind's respawn delay when it died), herds forget it, an ant it held is let go, an invasion it led ends.
// Runs from the `creature-died` / `creature-despawned` events (installed lazily with the other hooks).

import type { Sim } from '@/sim/types';
import { ANTLION_EMPTY_PIT_FILL_GD, RESPAWN_DELAY_GD, THREAT_CENTIPEDE } from '@/sim/balance/creatures';
import { TICKS_PER_DAY } from '@/sim/time';
import { endMajorThreat } from './threat';
import { clearCreatureAlerts } from './alerts';

export function onCreatureGone(sim: Sim, id: number, died: boolean): void {
  const terr = sim.state.ecology.director.territories;
  for (const t of terr) {
    if (t.occupantId !== id) continue;
    t.occupantId = -1;
    t.vacantUntilTick = sim.state.tick + (died ? Math.round((RESPAWN_DELAY_GD[t.kind] ?? 0) * TICKS_PER_DAY) : 0);
  }
  for (const h of sim.stores.herds.list) if (h.predators.includes(id)) h.predators = h.predators.filter((x) => x !== id);
  for (const a of sim.stores.ants.list) {
    if (a.combat && a.combat.seizedBy === id) { a.combat.seizedBy = -1; a.combat.escape = 0; }
  }
  clearCreatureAlerts(sim, id);
  reconcileInvasion(sim);
  abandonOrphanPits(sim);
}

/**
 * Pits whose antlion is gone (killed, despawned by a cheat; whoever removed it) stop working at once (no flicks, no
 * upslope slowdown, not a known hazard) and fill in over ANTLION_EMPTY_PIT_FILL_GD; expireHazards then removes
 * them. Antlion territories are never re-occupied. Also run by the director, so no removal path is missed.
 */
export function abandonOrphanPits(sim: Sim): void {
  for (const h of sim.state.ecology.hazards) {
    if (h.kind !== 'antlion-pit' || h.untilTick !== undefined) continue;
    let owned = false;
    for (const c of sim.stores.creatures.list) if (c.alive && c.kind === 'antlion' && c.bb.pit === h.id) { owned = true; break; }
    if (owned) continue;
    h.state = 'collapsed';
    h.untilTick = sim.state.tick + Math.round(ANTLION_EMPTY_PIT_FILL_GD * TICKS_PER_DAY);
  }
}

/** The centipede-invasion threat ends when no living centipede is invading the player nest. */
export function reconcileInvasion(sim: Sim): void {
  const td = sim.state.rivals.threatDirector;
  if (td.activeKind !== THREAT_CENTIPEDE) return;
  for (const c of sim.stores.creatures.list) if (c.alive && c.kind === 'centipede' && c.bb.invading === 1) return;
  endMajorThreat(sim, THREAT_CENTIPEDE);
}

const listening = new WeakSet<Sim>();

export function installLifecycleListeners(sim: Sim): void {
  if (listening.has(sim)) return;
  listening.add(sim);
  sim.events.on('creature-died', (e) => onCreatureGone(sim, e.id, true));
  sim.events.on('creature-despawned', (e) => onCreatureGone(sim, e.id, false));
}
