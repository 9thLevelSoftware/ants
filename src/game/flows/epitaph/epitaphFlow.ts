// The end of a colony on the game side (GDD 06 §13.4-§13.6, §12.3): when the sim reports `epitaph.ready` (or the
// game enters its epitaph mode with the colony gone) the colony's record is built, written to the Lineage as ended,
// and published to the Epitaph screen; its actions start the next game (found again, as a daughter, new) or leave.
import type { Sim } from '@/sim/types';
import { buildEpitaph } from '@/sim/colony/succession/epitaph';
import { openingOver } from '@/sim/colony/succession/lifecycleState';
import { epitaphActions, publishEpitaph, type EpitaphActions } from '@/ui/screens/epitaph/store';
import type { GameSession } from '../../session';
import type { LifecycleHost } from './host';
import { daughterGameOptions, type LineageKeeper } from './lineage';

export class EpitaphFlow implements EpitaphActions {
  private session: GameSession | null = null;
  private unsub: (() => void)[] = [];
  /** The sim said the colony ended: the game should show the epitaph. */
  due = false;

  constructor(
    private readonly host: LifecycleHost, private readonly lineage: LineageKeeper,
    private readonly openNewGame: () => void, private readonly openLineageFn: () => void,
  ) {}

  attach(session: GameSession): void {
    this.detach();
    this.session = session;
    this.due = false;
    this.unsub = [session.sim.events.on('epitaph.ready', () => { this.due = true; })];
    epitaphActions.value = this;
  }

  detach(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.session = null;
    this.due = false;
    publishEpitaph(null);
    epitaphActions.value = null;
  }

  /** The game shows the epitaph: build, record and publish (not for a failed founding: its own card shows). */
  show(): void {
    const sim = this.session?.sim;
    if (!sim) return;
    if (!openingOver(sim)) return;
    this.lineage.writeFlights(sim);
    this.lineage.writeColony(sim, true);
    this.publishFor(sim);
  }

  private publishFor(sim: Sim): void {
    const data = buildEpitaph(sim);
    const mine = new Set(data.daughters.map((d) => d.id));
    const available = this.lineage.available().filter((d) => mine.has(d.id)).length;
    publishEpitaph({ data, available, canLoad: true });
  }

  // ---- actions ----
  foundAgain(): void {
    const sim = this.session?.sim;
    if (!sim) return;
    const c = sim.state.config;
    void this.host.newGame({ seed: c.world.seed >>> 0, species: c.species, archetype: c.world.archetype, size: c.world.sizeClass, difficulty: c.difficulty.preset });
  }

  foundDaughter(daughterId: string | null): void {
    const sim = this.session?.sim;
    const mine = sim?.state.colonies[0]?.lifecycle?.daughters ?? [];
    const id = daughterId ?? this.lineage.available().find((d) => mine.some((m) => m.id === d.id))?.id ?? this.lineage.available()[0]?.id;
    const d = id ? this.lineage.choose(id) : null;
    if (d) void this.host.newGame(daughterGameOptions(d));
  }

  loadLast(): void { void this.host.load('auto'); }
  newGame(): void { this.openNewGame(); }
  title(): void { this.host.quitToTitle(); }
  openLineage(): void { this.openLineageFn(); }

  /** "Copy record as text": the plain facts of the record (the screen also copies to the clipboard). */
  copyRecord(): string {
    const sim = this.session?.sim;
    if (!sim) return '';
    const e = buildEpitaph(sim);
    return [
      `${e.name} (${e.species}), ${e.archetype}, seed ${e.seedText}`,
      `Founded year ${e.founded.year} day ${e.founded.doy}; ended year ${e.ended.year} day ${e.ended.doy}; ${e.spanYears.toFixed(1)} years`,
      `Ended: ${e.cause}${e.queenCause ? `; queen died of ${e.queenCause}` : ''}`,
      `Peak ${e.figures.peakWorkers} workers; winters ${e.figures.winters}; flights ${e.figures.flights}; daughters ${e.figures.daughters}`,
      `Causes of death: ${e.causes.map((c) => `${c.cause} ${c.n}`).join(', ')}`,
    ].join('\n');
  }
}
