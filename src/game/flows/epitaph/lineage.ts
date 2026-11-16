// The Lineage keeper (GDD 06 §12): writes this game's colony, its flights and daughters into the device profile
// (`foundress.profile.v1` through the profile store; never into a save), names the colony (§12.4) and starts a game
// as a daughter queen (a new game with the daughter's seed, the species and the archetype hint, carrying the link).
import type { DaughterRecord, LineageColonyRecord, Sim } from '@/sim/types';
import { currentDayOfYear, currentYear, ticksPerYear } from '@/sim/time';
import { buildEpitaph } from '@/sim/colony/succession/epitaph';
import { ProfileStore } from '../../profile/profile';
import { createLocalKv } from '../../save/localKv';
import { placeName } from '../founding/placeName';

let registered: ProfileStore | null = null;
let own: ProfileStore | null = null;

/** The persistence layer's profile store (one line in src/game/save/install.ts; requested of its owner). */
export function registerLineageProfile(p: ProfileStore | null): void {
  registered = p;
}

/** The profile to write to: the registered one, the test-mode exposed one, or an own merge-safe store. */
export function lineageProfile(): ProfileStore {
  if (registered) return registered;
  const w = typeof window !== 'undefined' ? (window as unknown as { __persistence?: { profile?: ProfileStore } }) : null;
  const exposed = w?.__persistence?.profile;
  if (exposed) return exposed;
  if (!own) {
    own = new ProfileStore({ kv: createLocalKv() });
    void own.load();
  }
  return own;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** `{place token} {2-digit number}` and the roman generation from the second generation on (GDD 06 §12.4). */
export function colonyName(seed: number, generation: number): string {
  const n = String((seed >>> 0) % 100).padStart(2, '0');
  const g = generation >= 2 ? ` ${ROMAN[generation] ?? String(generation)}` : '';
  return `${placeName(seed)} ${n}${g}`;
}

/** A daughter chosen for the next game, waiting for its sim to exist. */
export interface PendingDaughter {
  daughter: DaughterRecord;
  motherName: string;
}

export class LineageKeeper {
  private pending: PendingDaughter | null = null;

  constructor(private readonly profile: () => ProfileStore = lineageProfile) {}

  /** A game started: link it to the Lineage (a pending daughter's link first) and record the colony. */
  attach(sim: Sim, nowMs: number): void {
    const link = sim.state.progression.lineage;
    const p = this.pending;
    if (p && p.daughter.seed >>> 0 === sim.state.config.world.seed >>> 0) {
      link.generation = p.daughter.generation;
      link.parentColonyId = p.daughter.motherColonyId;
      link.parentFlightId = p.daughter.flightId;
      this.profile().setDaughterState(p.daughter.id, 'founded');
    }
    this.pending = null;
    if (!link.colonyRecordId) link.colonyRecordId = `c${(sim.state.config.world.seed >>> 0).toString(36)}-${Math.floor(nowMs).toString(36)}`;
    if (!link.name) link.name = colonyName(sim.state.config.world.seed, link.generation);
    this.writeColony(sim, false);
  }

  /** Flights and daughters of this game into the profile (the daughters carry this colony's record id). */
  writeFlights(sim: Sim): void {
    const life = sim.state.colonies[0]?.lifecycle;
    if (!life) return;
    const id = sim.state.progression.lineage.colonyRecordId;
    for (const f of life.flights) this.profile().upsertFlight({ ...f });
    const ds = life.daughters.map((d) => ({ ...d, motherColonyId: d.motherColonyId || id }));
    if (ds.length > 0) this.profile().upsertDaughters(ds);
    this.writeColony(sim, false);
  }

  /** The colony's Lineage record (ended: with the end date and cause). */
  writeColony(sim: Sim, ended: boolean): void {
    const s = sim.state;
    const link = s.progression.lineage;
    if (!link.colonyRecordId) return;
    const e = buildEpitaph(sim);
    const life = s.colonies[0]?.lifecycle;
    const rec: LineageColonyRecord = {
      id: link.colonyRecordId, name: link.name, species: s.config.species, worldSeed: s.config.world.seed >>> 0,
      archetype: s.config.world.archetype, sizeId: s.config.world.sizeClass, generation: link.generation,
      parentColonyId: link.parentColonyId, parentFlightId: link.parentFlightId,
      foundedDate: life?.founded ?? { tick: 0, doy: currentDayOfYear(s), year: currentYear(s) },
      endedDate: ended ? { tick: s.tick, doy: currentDayOfYear(s), year: currentYear(s) } : null,
      endCause: ended ? e.cause : '', peakWorkers: e.figures.peakWorkers,
      gameYears: Math.floor(s.tick / ticksPerYear(s.config)), winters: e.figures.winters, alatesReared: e.figures.alatesReared,
      flights: e.figures.flights, daughtersFounded: e.figures.daughters, rivalsDefeated: e.figures.rivals,
      milestones: Object.keys(s.progression.milestones), difficultyHistory: s.progression.difficultyHistory.map((d) => ({ ...d })),
    };
    this.profile().upsertColony(rec);
  }

  /** Daughters still available (all mothers), newest first. */
  available(): DaughterRecord[] {
    return this.profile().get().lineage.daughters.filter((d) => d.state === 'available').reverse();
  }

  /** Remembers the daughter; the caller starts the new game with `daughterGameOptions`. */
  choose(daughterId: string): DaughterRecord | null {
    const d = this.profile().get().lineage.daughters.find((x) => x.id === daughterId && x.state === 'available');
    if (!d) return null;
    const mother = this.profile().get().lineage.colonies.find((c) => c.id === d.motherColonyId);
    this.pending = { daughter: d, motherName: mother?.name ?? '' };
    return d;
  }
}

/** New-game options of a daughter queen: her seed (fresh locality), the species, the archetype hint. */
export function daughterGameOptions(d: DaughterRecord): { seed: number; species: DaughterRecord['species']; archetype?: NonNullable<DaughterRecord['archetypeHint']> } {
  return { seed: d.seed >>> 0, species: d.species, ...(d.archetypeHint ? { archetype: d.archetypeHint } : {}) };
}
