// The nuptial flight's game-side driver (GDD 06 §11.5-§11.6, §12): the `ask` release prompt, the take-off prompt
// (fly as a young queen / watch / continue), the possessed flight's read-out, the end card with the daughter offer,
// and the Lineage writes (flights and daughters into the device profile) when a flight ends.
import type { Sim } from '@/sim/types';
import { activeFlight } from '@/sim/colony/reproduction';
import { TICKS_PER_SECOND } from '@/sim/time';
import { flightActions, publishFlight, type FlightActions, type FlightUi } from '@/ui/screens/flight/store';
import type { GameSession } from '../../session';
import type { LifecycleHost } from '../epitaph/host';
import type { LineageKeeper } from '../epitaph/lineage';

export class FlightFlow implements FlightActions {
  private session: GameSession | null = null;
  private unsub: (() => void)[] = [];
  private ended: FlightUi['ended'] = null;
  /** The take-off prompt was answered (watch / continue) for this flight id. */
  private dismissedFor = '';
  private askDismissed = -1;

  constructor(private readonly host: LifecycleHost, private readonly lineage: LineageKeeper, private readonly openLineageFn: () => void) {}

  attach(session: GameSession): void {
    this.detach();
    this.session = session;
    const sim = session.sim;
    this.unsub = [
      sim.events.on('flight.ended', () => this.onEnded(sim)),
    ];
    flightActions.value = this;
    this.publish();
  }

  detach(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.session = null;
    this.ended = null;
    publishFlight(null);
    flightActions.value = null;
  }

  frame(session: GameSession): void {
    if (session !== this.session) this.attach(session);
    this.publish();
  }

  private onEnded(sim: Sim): void {
    const life = sim.state.colonies[0]?.lifecycle;
    const rec = life?.flights[life.flights.length - 1];
    if (!life || !rec) return;
    this.lineage.writeFlights(sim);
    const f = life.flight && life.flight.flightId === rec.id ? life.flight : null;
    const own = rec.daughterIds.length > 0 && f?.founded ? rec.daughterIds[0] : null;
    this.ended = {
      outcome: f ? f.outcome : 'watched', possessed: rec.possessed, founded: !!f?.founded, launched: rec.nLaunched,
      mated: rec.nMated, daughters: rec.nFounded, witnessedDaughterId: own,
    };
  }

  private publish(): void {
    const sim = this.session?.sim;
    publishFlight(sim ? this.view(sim) : null);
  }

  private view(sim: Sim): FlightUi | null {
    const col = sim.state.colonies[0];
    const life = col?.lifecycle;
    if (!col || !life) return this.ended ? { ask: null, launch: null, flying: null, ended: this.ended } : null;
    const book = life.repro;
    const ask = book.askTick >= 0 && book.openFlightId === '' && this.askDismissed !== book.askTick ? { p: book.lastP } : null;
    let launch: FlightUi['launch'] = null;
    if (book.openFlightId && book.assemblyUntil > sim.state.tick && this.dismissedFor !== book.openFlightId && !activeFlight(sim)) {
      const rec = life.flights[life.flights.length - 1];
      launch = { gynes: rec?.nGynes ?? 0, males: rec?.nMales ?? 0, secondsLeft: (book.assemblyUntil - sim.state.tick) / TICKS_PER_SECOND };
    }
    let flying: FlightUi['flying'] = null;
    const af = activeFlight(sim);
    if (af) {
      const g = sim.stores.ants.get(af.f.gyneId);
      const bu = sim.world.bu;
      flying = {
        phase: af.f.phase, energy: af.f.energy, mating: af.f.mating, mated: af.f.mated, seconds: af.f.seconds,
        heightBu: g ? (g.pos.y - sim.field.height(g.pos.x, g.pos.z)) / bu : 0,
        lekDistBu: g ? Math.hypot(g.pos.x - af.f.lek.x, g.pos.z - af.f.lek.z) / bu : 0, windMs: sim.state.env.weather.wind2m,
      };
    }
    if (!ask && !launch && !flying && !this.ended) return null;
    return { ask, launch, flying, ended: this.ended };
  }

  // ---- actions ----
  release(): void { this.host.command({ type: 'flightRelease' }); this.refresh(); }
  wait(): void {
    const b = this.session?.sim.state.colonies[0]?.lifecycle?.repro;
    if (b) this.askDismissed = b.askTick;
    this.refresh();
  }
  flyAsQueen(): void {
    const sim = this.session?.sim;
    if (!sim) return;
    const g = sim.state.ants.find((a) => a.alive && a.caste === 'gyne' && a.colony === sim.state.player.colonyId && a.alate?.state === 'assembling');
    if (g) this.host.command({ type: 'flightPossess', gyneId: g.id });
    this.refresh();
  }
  watch(): void {
    const b = this.session?.sim.state.colonies[0]?.lifecycle?.repro;
    if (b) this.dismissedFor = b.openFlightId;
    this.refresh();
  }
  landNow(): void { this.host.command({ type: 'flightLand', point: { x: 0, y: 0, z: 0 } }); this.refresh(); }
  closeEnded(): void { this.ended = null; this.refresh(); }
  openLineage(): void { this.ended = null; this.openLineageFn(); this.refresh(); }

  private refresh(): void {
    this.publish();
    this.host.refreshUi();
  }
}
