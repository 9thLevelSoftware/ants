// The lifecycle flows together (task overwinter-repro): winter, nuptial flight, epitaph and the Lineage screen.
// Created by src/game/Game.ts; it calls attach / detach / frame / afterStep and asks `epitaphDue(sessionEmpty)`.
import { lineageActions, publishLineage, type LineageActions } from '@/ui/screens/lineage/store';
import type { GameSession } from '../../session';
import { FlightFlow } from '../flight/flightFlow';
import { WinterFlow } from '../overwinter/winterFlow';
import { EpitaphFlow } from './epitaphFlow';
import type { LifecycleHost } from './host';
import { daughterGameOptions, LineageKeeper, lineageProfile } from './lineage';
import { openingOver } from '@/sim/colony/succession/lifecycleState';

export class LifecycleFlows implements LineageActions {
  readonly lineage = new LineageKeeper();
  readonly winter: WinterFlow;
  readonly flight: FlightFlow;
  readonly epitaph: EpitaphFlow;
  private session: GameSession | null = null;
  private unsubProfile: (() => void) | null = null;

  constructor(private readonly host: LifecycleHost) {
    this.winter = new WinterFlow(host);
    this.flight = new FlightFlow(host, this.lineage, () => this.openLineage());
    this.epitaph = new EpitaphFlow(host, this.lineage, () => {}, () => this.openLineage());
    lineageActions.value = this;
  }

  attach(session: GameSession): void {
    this.session = session;
    this.lineage.attach(session.sim, Date.now());
    this.winter.attach(session);
    this.flight.attach(session);
    this.epitaph.attach(session);
    this.closeLineage();
  }

  detach(): void {
    this.session = null;
    this.winter.detach();
    this.flight.detach();
    this.epitaph.detach();
  }

  /** Per real frame of play. */
  frame(session: GameSession, dt: number): void {
    if (session !== this.session) this.attach(session);
    this.winter.frame(session, dt);
    this.flight.frame(session);
  }

  /** After a synchronous debug step (manual clock). */
  afterStep(session: GameSession): void {
    this.frame(session, 0);
  }

  /**
   * The game should enter its epitaph mode. Once the colony's own life runs (after the opening) only the sim decides:
   * `epitaph.ready` follows `colony.extinct` after the extinction grace, with the cause chain and the final autosave,
   * and never comes under the custom rule extinctionEndsGame = false. The session's own rule (`sessionEmpty`: no ant
   * for a few real seconds) still ends a failed opening, which the succession system leaves to the founding flow.
   */
  epitaphDue(sessionEmpty = false): boolean {
    if (this.epitaph.due) return true;
    const sim = this.session?.sim;
    if (sim && sim.state.colonies[0]?.lifecycle?.succession.extinct) return true; // e.g. a save made at the end
    if (sim && openingOver(sim)) return false;
    return sessionEmpty;
  }

  /** The game entered the epitaph mode. */
  onEpitaph(): void {
    this.epitaph.show();
  }

  // ---- the Lineage screen ----
  openLineage(): void {
    const p = lineageProfile();
    publishLineage(p.get().lineage);
    this.unsubProfile?.();
    this.unsubProfile = p.subscribe((prof, part) => { if (part === 'lineage') publishLineage(prof.lineage); });
    this.host.refreshUi();
  }

  closeLineage(): void {
    this.unsubProfile?.();
    this.unsubProfile = null;
    publishLineage(null);
  }

  close(): void { this.closeLineage(); this.host.refreshUi(); }

  foundDaughter(daughterId: string): void {
    const d = this.lineage.choose(daughterId);
    if (!d) return;
    this.closeLineage();
    void this.host.newGame(daughterGameOptions(d));
  }

  exportJson(): string {
    return lineageProfile().exportLineageJson();
  }

  /** Current session (debug). */
  get current(): GameSession | null { return this.session; }
}
