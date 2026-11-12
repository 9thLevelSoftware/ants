// Pure merge, validation and trimming of the device profile. Merge-safe: merging never loses information, never
// moves a hint backwards, and is order-independent for what matters (union of ids, max of counters, "ended" wins).
import { HINT_IDS, type CodexUnlock, type DaughterRecord, type DeviceProfile, type FlightRecord, type LineageColonyRecord } from '@/sim/types';
import { DAUGHTER_STATES, HINT_STATES } from '@/sim/types';
import {
  emptyProfile, HINT_RANK, LIN_MAX_COLONIES, LIN_MAX_DAUGHTERS, LIN_MAX_DAUGHTERS_PER_FLIGHT, LIN_MAX_FLIGHTS, type StoredHint,
} from './model';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0): number => (isNum(v) ? v : d);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

// ---------------------------------------------------------------- sanitising

function cleanDate(v: unknown): { tick: number; doy: number; year: number } | null {
  return isObj(v) ? { tick: num(v.tick), doy: num(v.doy, 1), year: num(v.year, 1) } : null;
}

export function cleanHint(v: unknown): StoredHint | null {
  if (!isObj(v) || !(HINT_STATES as readonly unknown[]).includes(v.state)) return null;
  return { uses: Math.max(0, Math.floor(num(v.uses))), state: v.state as StoredHint['state'] };
}

export function cleanCodex(v: unknown): CodexUnlock | null {
  if (!isObj(v)) return null;
  return { tick: num(v.tick), doy: num(v.doy, 1), year: num(v.year, 1), species: str(v.species, 'lasius-niger') as CodexUnlock['species'], firstSeenIso: str(v.firstSeenIso) };
}

export function cleanColony(v: unknown): LineageColonyRecord | null {
  if (!isObj(v) || typeof v.id !== 'string' || v.id === '') return null;
  return {
    id: v.id, name: str(v.name), species: str(v.species, 'lasius-niger') as LineageColonyRecord['species'], worldSeed: num(v.worldSeed),
    archetype: str(v.archetype) as LineageColonyRecord['archetype'], sizeId: str(v.sizeId, 'standard') as LineageColonyRecord['sizeId'],
    generation: Math.max(1, Math.floor(num(v.generation, 1))), parentColonyId: str(v.parentColonyId), parentFlightId: str(v.parentFlightId),
    foundedDate: cleanDate(v.foundedDate) ?? { tick: 0, doy: 1, year: 1 }, endedDate: cleanDate(v.endedDate), endCause: str(v.endCause),
    peakWorkers: num(v.peakWorkers), gameYears: num(v.gameYears), winters: num(v.winters), alatesReared: num(v.alatesReared),
    flights: num(v.flights), daughtersFounded: num(v.daughtersFounded), rivalsDefeated: num(v.rivalsDefeated), milestones: strArr(v.milestones),
    difficultyHistory: Array.isArray(v.difficultyHistory)
      ? v.difficultyHistory.filter(isObj).map((d) => ({ tick: num(d.tick), preset: str(d.preset) }))
      : [],
  };
}

export function cleanFlight(v: unknown): FlightRecord | null {
  if (!isObj(v) || typeof v.id !== 'string' || v.id === '') return null;
  return {
    id: v.id, tick: num(v.tick), date: cleanDate(v.date) ?? { tick: 0, doy: 1, year: 1 }, weather: str(v.weather), nGynes: num(v.nGynes),
    nMales: num(v.nMales), nLaunched: num(v.nLaunched), nMated: num(v.nMated), flightDeaths: num(v.flightDeaths), nLanded: num(v.nLanded),
    nFounded: num(v.nFounded), landingZones: strArr(v.landingZones) as FlightRecord['landingZones'], possessed: v.possessed === true,
    daughterIds: strArr(v.daughterIds),
  };
}

export function cleanDaughter(v: unknown): DaughterRecord | null {
  if (!isObj(v) || typeof v.id !== 'string' || v.id === '') return null;
  return {
    id: v.id, motherColonyId: str(v.motherColonyId), flightId: str(v.flightId), species: str(v.species, 'lasius-niger') as DaughterRecord['species'],
    generation: Math.max(1, Math.floor(num(v.generation, 1))), seed: num(v.seed) >>> 0,
    archetypeHint: typeof v.archetypeHint === 'string' ? (v.archetypeHint as DaughterRecord['archetypeHint']) : null, witnessed: v.witnessed === true,
    landingZone: typeof v.landingZone === 'string' ? (v.landingZone as DaughterRecord['landingZone']) : null, doy: num(v.doy, 1),
    state: (DAUGHTER_STATES as readonly unknown[]).includes(v.state) ? (v.state as DaughterRecord['state']) : 'available',
  };
}

function cleanList<T extends { id: string }>(raw: unknown, clean: (v: unknown) => T | null): T[] {
  const out = new Map<string, T>();
  if (Array.isArray(raw)) for (const r of raw) { const c = clean(r); if (c) out.set(c.id, c); }
  return [...out.values()];
}

/** A complete valid profile from anything (stored JSON, an import). Unknown ids and malformed records are dropped. */
export function sanitizeProfile(raw: unknown): DeviceProfile {
  const out = emptyProfile();
  if (!isObj(raw)) return out;
  if (isObj(raw.hints)) {
    for (const id of HINT_IDS) { const h = cleanHint(raw.hints[id]); if (h) out.hints[id] = h; }
  }
  if (isObj(raw.codex)) {
    for (const [id, v] of Object.entries(raw.codex)) {
      if (!/^cx-[a-z0-9-]+$/.test(id)) continue;
      const c = cleanCodex(v);
      if (c) out.codex[id] = c;
    }
  }
  if (isObj(raw.lineage)) {
    const l = raw.lineage;
    out.lineage.colonies = cleanList(l.colonies, cleanColony);
    out.lineage.flights = cleanList(l.flights, cleanFlight);
    out.lineage.daughters = cleanList(l.daughters, cleanDaughter);
    if (isObj(l.settings)) {
      for (const [k, v] of Object.entries(l.settings)) if (typeof v === 'string' || typeof v === 'boolean' || isNum(v)) out.lineage.settings[k] = v;
    }
  }
  return trimLineage(out);
}

// ---------------------------------------------------------------- merging

export function mergeHint(a: StoredHint | undefined, b: StoredHint | undefined): StoredHint | undefined {
  if (!a) return b ? { ...b } : undefined;
  if (!b) return { ...a };
  const state = HINT_RANK[b.state] > HINT_RANK[a.state] ? b.state : a.state;
  return { uses: Math.max(a.uses, b.uses), state };
}

function mergeCodex(a: CodexUnlock | undefined, b: CodexUnlock): CodexUnlock {
  if (!a) return { ...b };
  // keep the earlier unlock (ISO text sorts chronologically; an empty text loses)
  if (a.firstSeenIso === '') return { ...b };
  if (b.firstSeenIso === '') return { ...a };
  return a.firstSeenIso <= b.firstSeenIso ? { ...a } : { ...b };
}

export function mergeColony(a: LineageColonyRecord, b: LineageColonyRecord): LineageColonyRecord {
  const ended = a.endedDate && b.endedDate ? (a.endedDate.tick >= b.endedDate.tick ? a : b) : a.endedDate ? a : b.endedDate ? b : null;
  const newer = b.milestones.length >= a.milestones.length ? b : a; // the record with more history leads the descriptive fields
  return {
    ...newer,
    endedDate: ended ? ended.endedDate : null,
    endCause: ended ? ended.endCause : newer.endCause,
    peakWorkers: Math.max(a.peakWorkers, b.peakWorkers),
    gameYears: Math.max(a.gameYears, b.gameYears),
    winters: Math.max(a.winters, b.winters),
    alatesReared: Math.max(a.alatesReared, b.alatesReared),
    flights: Math.max(a.flights, b.flights),
    daughtersFounded: Math.max(a.daughtersFounded, b.daughtersFounded),
    rivalsDefeated: Math.max(a.rivalsDefeated, b.rivalsDefeated),
    milestones: [...new Set([...a.milestones, ...b.milestones])],
    difficultyHistory: a.difficultyHistory.length >= b.difficultyHistory.length ? a.difficultyHistory : b.difficultyHistory,
  };
}

function mergeFlight(a: FlightRecord, b: FlightRecord): FlightRecord {
  return { ...b, daughterIds: [...new Set([...a.daughterIds, ...b.daughterIds])], nFounded: Math.max(a.nFounded, b.nFounded) };
}

const DAUGHTER_RANK = { available: 0, lost: 1, founded: 2 } as const;
function mergeDaughter(a: DaughterRecord, b: DaughterRecord): DaughterRecord {
  // a daughter founded or lost never becomes available again
  return { ...b, state: DAUGHTER_RANK[b.state] >= DAUGHTER_RANK[a.state] ? b.state : a.state, witnessed: a.witnessed || b.witnessed };
}

function mergeById<T extends { id: string }>(a: T[], b: T[], merge: (x: T, y: T) => T): T[] {
  const map = new Map<string, T>();
  for (const r of a) map.set(r.id, r);
  for (const r of b) { const cur = map.get(r.id); map.set(r.id, cur ? merge(cur, r) : r); }
  return [...map.values()];
}

/** Merges `incoming` into `base` (neither is modified) and trims to the caps. */
export function mergeProfiles(base: DeviceProfile, incoming: DeviceProfile): DeviceProfile {
  const out = emptyProfile();
  for (const id of HINT_IDS) {
    const m = mergeHint(base.hints[id], incoming.hints[id]);
    if (m) out.hints[id] = m;
  }
  for (const [id, v] of Object.entries(base.codex)) out.codex[id] = { ...v };
  for (const [id, v] of Object.entries(incoming.codex)) out.codex[id] = mergeCodex(out.codex[id], v);
  out.lineage.colonies = mergeById(base.lineage.colonies, incoming.lineage.colonies, mergeColony);
  out.lineage.flights = mergeById(base.lineage.flights, incoming.lineage.flights, mergeFlight);
  out.lineage.daughters = mergeById(base.lineage.daughters, incoming.lineage.daughters, mergeDaughter);
  out.lineage.settings = { ...incoming.lineage.settings, ...base.lineage.settings }; // the in-memory (newer) choice wins
  return trimLineage(out);
}

// ---------------------------------------------------------------- caps

/** Applies the lineage caps: per-flight daughter cap, then oldest ended colonies / oldest flights / used daughters first. */
export function trimLineage(p: DeviceProfile): DeviceProfile {
  const l = p.lineage;
  // per flight: keep available daughters first, then the rest, at most LIN_MAX_DAUGHTERS_PER_FLIGHT
  const byFlight = new Map<string, DaughterRecord[]>();
  for (const d of l.daughters) { const k = d.flightId; const arr = byFlight.get(k) ?? []; arr.push(d); byFlight.set(k, arr); }
  let daughters: DaughterRecord[] = [];
  for (const arr of byFlight.values()) {
    arr.sort((a, b) => DAUGHTER_RANK[a.state] - DAUGHTER_RANK[b.state]);
    daughters.push(...arr.slice(0, LIN_MAX_DAUGHTERS_PER_FLIGHT));
  }
  if (daughters.length > LIN_MAX_DAUGHTERS) {
    // available ones survive; among equals the newest stay (stable sort keeps insertion order, so cut from the front)
    const order = daughters.map((d, i) => ({ d, i })).sort((a, b) => DAUGHTER_RANK[b.d.state] - DAUGHTER_RANK[a.d.state] || a.i - b.i);
    const dropped = new Set(order.slice(0, daughters.length - LIN_MAX_DAUGHTERS).map((o) => o.d.id));
    daughters = daughters.filter((d) => !dropped.has(d.id));
  }
  l.daughters = daughters;
  // Records are kept in the order they were added (oldest first); ticks of different games are not comparable.
  if (l.flights.length > LIN_MAX_FLIGHTS) l.flights = l.flights.slice(l.flights.length - LIN_MAX_FLIGHTS);
  let excess = l.colonies.length - LIN_MAX_COLONIES;
  if (excess > 0) {
    // the oldest ENDED colonies go first; living ones stay
    l.colonies = l.colonies.filter((c) => {
      if (excess > 0 && c.endedDate !== null) { excess--; return false; }
      return true;
    });
  }
  return p;
}
