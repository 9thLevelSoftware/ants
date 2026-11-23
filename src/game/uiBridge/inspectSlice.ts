// Inspect card data (GDD 08 10.2, GDD 01 10): the simulation's own `inspect` read-out for the target the player points
// at or has pinned. Words and numbers come from the simulation; this file only attaches the header and the buttons.
import type { Vec3 } from '@/core/math/vec3';
import { inspectTarget } from '@/sim/ants/player';
import type { Ant, Sim, TargetRef } from '@/sim/types';
import type { UiInspect } from '@/ui/api';
import type { InspectRequest } from './requests';
import { antName, stateWord } from './words';

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

function targetOf(sim: Sim, r: InspectRequest): TargetRef | null {
  switch (r.kind) {
    case 'ant': { const e = sim.stores.ants.get(r.id); return e ? { kind: 'ant', id: r.id, pos: e.pos } : null; }
    case 'brood': { const e = sim.stores.brood.get(r.id); return e ? { kind: 'brood', id: r.id, pos: e.pos } : null; }
    case 'item': { const e = sim.stores.items.get(r.id); return e ? { kind: 'item', id: r.id, pos: e.pos } : null; }
    case 'source': { const e = sim.stores.sources.get(r.id); return e ? { kind: 'source', id: r.id, pos: e.pos } : null; }
    case 'creature': { const e = sim.stores.creatures.get(r.id); return e ? { kind: 'creature', id: r.id, pos: e.pos } : null; }
    case 'chamber': return { kind: 'chamber', id: r.id, pos: ZERO };
    case 'entrance': return { kind: 'entrance', id: r.id, pos: ZERO };
    default: return null;
  }
}

const cap = (s: string): string => (s.length ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The simulation writes some unit strings with raw floats ("/ 14.774999999999999" for a chamber's adult capacity): the card shows
 * every number in a unit to one decimal at most (look pass 5, item 6).
 */
export function tidyUnit(unit: string): string {
  if (!unit) return unit;
  return unit.replace(/\d+\.\d{2,}/g, (m) => String(Number(Number(m).toFixed(1))));
}

/** A queen's physiological age stays at 0 in the simulation (the card read "callow (0 game days)" after days): the row is left off her card. */
function queenAge(sim: Sim, id: number): boolean { return sim.stores.ants.get(id)?.caste === 'queen'; }

/** The card for `req`, or null when there is none (no request, or the target is gone). */
export function inspectOf(sim: Sim, req: InspectRequest | null): UiInspect | null {
  if (!req) return null;
  const t = targetOf(sim, req);
  if (!t) return null;
  const viewer = sim.stores.ants.get(sim.state.player.possessedAntId) ?? null;
  const card = inspectTarget(sim, viewer, t);
  if (!card) return null;
  let header = cap(card.title);
  let ours = false;
  let ant: Ant | undefined;
  if (req.kind === 'ant') {
    ant = sim.stores.ants.get(req.id);
    ours = !!ant && card.kind === 'ant';
    if (ant && ours) header = antName(ant.caste, ant.id);
  }
  const possessed = !!ant && ant.id === sim.state.player.possessedAntId;
  return {
    kind: card.kind, targetKind: req.kind, targetId: req.id, title: card.title, header,
    senses: card.senses.filter((r) => !(r.key === 'age' && req.kind === 'ant' && queenAge(sim, req.id))).map((r) => ({ key: r.key, word: r.word, value: r.value, unit: tidyUnit(r.unit) })),
    colony: card.colony.map((r) => ({ key: r.key, word: r.key === 'state' ? stateWord(r.word, card.colony.find((x) => x.key === 'task')?.word ?? '') : r.word, value: r.value, unit: tidyUnit(r.unit) })),
    canPossess: ours && !possessed, canFollow: ours,
    colonyOrders: ours && card.colony.some((r) => r.key === 'colony-orders'),
  };
}
