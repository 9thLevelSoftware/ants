// Directives (GDD 02 §12.1; one `setDirectives` command, keys of 00-index D2.16) and player marker placement
// rules (§12.2 caps and radius ranges). Directives only change targets and stimuli; they never move ants (D10).

import { clamp } from '@/core/math/scalar';
import type { CommandOf, Colony, Directives, DirectiveExtra, GroupShares, Sim } from '@/sim/types';
import { ALATE_POLICIES, ALLOCATION_GROUPS, DIRECTIVE_EXTRAS, isOneOf, STANCES, STOCK_TARGETS } from '@/sim/types';
import {
  DIET_RANGE, GYNE_SHARE_RANGE, MARKER_CAP, MARKER_DEFAULT_RADIUS_BU, MARKER_RADIUS_RANGE_BU, RALLY_EXPIRY_GD,
  STAY_IN_DAYS,
} from '@/sim/balance';
import { placeMarker } from '@/sim/entities';
import { daysToTicks } from '@/sim/time';
import { chamberById } from './census';

function reject(sim: Sim, commandType: string, reason: string, detail?: string): void {
  sim.emit({ type: 'command-rejected', commandType, reason, detail });
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Normalises player shares to percentages summing to 100; null if unusable. */
export function normaliseShares(v: unknown): GroupShares | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const raw = ALLOCATION_GROUPS.map((g) => Math.max(0, num(o[g]) ?? 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return null;
  const out = {} as GroupShares;
  ALLOCATION_GROUPS.forEach((g, i) => { out[g] = (raw[i] * 100) / sum; });
  return out;
}

/** Applies a setDirectives command (validated; unknown or out-of-range values are rejected per key). */
export function applyDirectives(sim: Sim, col: Colony, cmd: CommandOf<'setDirectives'>): void {
  const d: Directives = col.directives;
  const c = cmd as unknown as Record<string, unknown>;
  const def = sim.getSpecies(col.species);
  if (c.allocation !== undefined) {
    if (c.allocation === 'auto') d.allocation = 'auto';
    else {
      const s = normaliseShares(c.allocation);
      if (s) d.allocation = s;
      else reject(sim, 'setDirectives', 'invalid', 'allocation');
    }
  }
  if (c.taskShares !== undefined && typeof c.taskShares === 'object' && c.taskShares !== null) {
    const ts: Directives['taskShares'] = {};
    const allowed = def?.directiveTasks ?? [];
    for (const [k, v] of Object.entries(c.taskShares as Record<string, unknown>)) {
      const n = num(v);
      if (n !== null && (allowed as readonly string[]).includes(k)) (ts as Record<string, number>)[k] = clamp(n, 0, 1);
    }
    d.taskShares = ts;
  }
  if (c.diet !== undefined) {
    if (c.diet === 'auto') d.diet = 'auto';
    else if (num(c.diet) !== null) d.diet = clamp(num(c.diet)!, -DIET_RANGE, DIET_RANGE);
    else reject(sim, 'setDirectives', 'invalid', 'diet');
  }
  if (num(c.alateInvestment) !== null) d.alateInvestment = clamp(num(c.alateInvestment)!, 0, 1);
  if (num(c.gyneShare) !== null) d.gyneShare = clamp(num(c.gyneShare)!, GYNE_SHARE_RANGE[0], GYNE_SHARE_RANGE[1]);
  if (typeof c.alatePolicy === 'string' && isOneOf(ALATE_POLICIES, c.alatePolicy)) d.alatePolicy = c.alatePolicy;
  if (typeof c.stockTarget === 'string' && isOneOf(STOCK_TARGETS, c.stockTarget)) d.stockTarget = c.stockTarget;
  if (typeof c.stance === 'string' && isOneOf(STANCES, c.stance)) d.stance = c.stance;
  if (typeof c.sealInCold === 'boolean') d.sealInCold = c.sealInCold;
  if (typeof c.stayIn === 'boolean') {
    d.stayIn = c.stayIn;
    d.stayInUntil = c.stayIn ? sim.state.tick + daysToTicks(STAY_IN_DAYS) : -1;
  }
  // Species extras: only those the species lists (GDD 07 §3.14).
  const extras = def?.directiveExtras ?? [];
  const rec = d as unknown as Record<string, unknown>;
  for (const k of DIRECTIVE_EXTRAS) {
    const v = c[k];
    if (v === undefined) continue;
    if (!extras.includes(k as DirectiveExtra)) { reject(sim, 'setDirectives', 'species', k); continue; }
    if (typeof rec[k] === 'boolean' && typeof v === 'boolean') rec[k] = v;
    else if (typeof rec[k] === 'number' && num(v) !== null) rec[k] = k === 'casteEmphasis' ? clamp(num(v)!, -1, 1) : clamp(num(v)!, 0, 1);
  }
}

/** Clears an expired stayIn (auto-clears after STAY_IN_DAYS). */
export function expireDirectives(sim: Sim, col: Colony): void {
  const d = col.directives;
  if (d.stayIn && d.stayInUntil >= 0 && sim.state.tick >= d.stayInUntil) {
    d.stayIn = false;
    d.stayInUntil = -1;
  }
}

const BROOD_CHAMBERS = new Set(['nursery', 'royal', 'founding', 'general', 'rest']);

/** Places a player marker with the GDD 02 §12.2 caps and radius ranges; returns the marker id or -1. */
export function placePlayerMarker(sim: Sim, col: Colony, cmd: CommandOf<'placeMarker'>): number {
  const live = sim.stores.markers.list.filter((m) => m.alive && m.colony === col.id && m.kind === cmd.kind).length;
  if (live >= MARKER_CAP[cmd.kind]) { reject(sim, 'placeMarker', 'limit', cmd.kind); return -1; }
  const bu = sim.world.bu;
  let radius = num(cmd.radius) ?? MARKER_DEFAULT_RADIUS_BU[cmd.kind] * bu;
  const range = MARKER_RADIUS_RANGE_BU[cmd.kind];
  if (range) radius = clamp(radius, range[0] * bu, range[1] * bu);
  const ids = cmd.chamberIds ?? [];
  const targetChamberId = ids.length > 0 ? ids[0] : -1;
  if (cmd.kind === 'move-brood' || cmd.kind === 'move-queen') {
    const ch = chamberById(sim, targetChamberId);
    if (!ch || (cmd.kind === 'move-brood' && !BROOD_CHAMBERS.has(ch.type))) { reject(sim, 'placeMarker', 'invalid', 'chamber'); return -1; }
  }
  const m = placeMarker(sim, {
    kind: cmd.kind, colony: col.id, pos: cmd.pos, radius, targetChamberId, sourceChamberId: ids.length > 1 ? ids[1] : -1,
    expiresTick: cmd.kind === 'rally' ? sim.state.tick + daysToTicks(RALLY_EXPIRY_GD) : -1,
    params: { mode: cmd.params?.mode ?? null, priority: cmd.params?.priority ?? null, chamberType: cmd.params?.chamberType ?? null },
  });
  return m.id;
}
