// Step 1a: which zones a map has (GDD 04 §1.3). Mandatory zones always; optional zones rolled in listed order
// ("one of" groups: the first success of the group wins) until the map has 5 zone types. Natural fractions are
// fitted to sum to 1 inside their ranges where possible (else renormalised).

import type { RngState } from '@/core/rng';
import { rngFloat } from '@/core/rng';
import type { ZoneType, ZoneVariant } from '@/sim/types';
import { ARCHETYPE_DEFS, BUILT_ZONE, ZONE_TYPES_MAX, type ArchetypeDef, type BuiltKind, type NaturalZoneRule } from '../tuning/archetypes';
import type { ArchetypeId } from '@/sim/types';

export interface RolledNatural { rule: NaturalZoneRule; variant: ZoneVariant; frac: number }
export interface RolledZones { natural: RolledNatural[]; built: BuiltKind[]; def: ArchetypeDef }

function pickVariant(rng: RngState, rule: NaturalZoneRule): ZoneVariant {
  let total = 0;
  for (const v of rule.variants) total += v.w;
  let u = rngFloat(rng) * total;
  for (const v of rule.variants) { u -= v.w; if (u < 0) return v.v; }
  return rule.variants[rule.variants.length - 1].v;
}

function zoneTypes(nat: RolledNatural[], built: BuiltKind[]): Set<ZoneType> {
  const s = new Set<ZoneType>();
  for (const n of nat) s.add(n.rule.type);
  for (const b of built) s.add(BUILT_ZONE[b].type);
  return s;
}

export function rollZones(rng: RngState, archetype: ArchetypeId): RolledZones {
  const def = ARCHETYPE_DEFS[archetype];
  const natural: RolledNatural[] = def.natural.map((rule) => ({ rule, variant: pickVariant(rng, rule), frac: 0 }));
  const built: BuiltKind[] = [...def.built];
  const groupsDone = new Set<string>();
  for (const opt of def.optional) {
    const u = rngFloat(rng); // always drawn, so later rolls do not shift with earlier outcomes
    if (opt.group && groupsDone.has(opt.group)) continue;
    if (zoneTypes(natural, built).size >= ZONE_TYPES_MAX) continue;
    if (u >= opt.p) continue;
    if (opt.group) groupsDone.add(opt.group);
    if (opt.natural) {
      if (natural.some((n) => n.rule.type === opt.natural!.type)) continue;
      natural.push({ rule: opt.natural, variant: pickVariant(rng, opt.natural), frac: 0 });
    } else if (opt.built && !built.includes(opt.built)) built.push(opt.built);
  }
  fitFractions(rng, natural);
  return { natural, built, def };
}

/**
 * Draws each fraction in its range, then moves them inside their ranges until they sum to 1 (water-filling on
 * the remaining slack). If the ranges cannot reach 1, the drawn values are renormalised.
 */
export function fitFractions(rng: RngState, nat: RolledNatural[]): void {
  for (const n of nat) n.frac = n.rule.frac[0] + rngFloat(rng) * (n.rule.frac[1] - n.rule.frac[0]);
  let lo = 0, hi = 0;
  for (const n of nat) { lo += n.rule.frac[0]; hi += n.rule.frac[1]; }
  if (lo > 1 || hi < 1) {
    let s = 0;
    for (const n of nat) s += n.frac;
    for (const n of nat) n.frac /= s;
    return;
  }
  for (let iter = 0; iter < 8; iter++) {
    let s = 0;
    for (const n of nat) s += n.frac;
    const d = 1 - s;
    if (Math.abs(d) < 1e-12) break;
    let slack = 0;
    for (const n of nat) slack += d > 0 ? n.rule.frac[1] - n.frac : n.frac - n.rule.frac[0];
    if (slack <= 0) break;
    for (const n of nat) {
      const own = d > 0 ? n.rule.frac[1] - n.frac : n.frac - n.rule.frac[0];
      n.frac += (d * own) / slack;
    }
  }
}
