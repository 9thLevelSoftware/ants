// The overwintering's game-side driver (GDD 06 §6.2-§6.5): the banner (Begin / Delay one day; the sim begins on its
// own when nobody answers), the time-lapse playback of the computed winter (OVERWINTER_TARGET_S real seconds, or
// Skip: the result is the same, the simulation is already in spring), then the Winter Report until it is closed
// (the sim resumes 1x). Reads the sim, sends commands through the host, publishes the screens' read-out.
import type { Sim, WinterRecord } from '@/sim/types';
import { OVERWINTER_DELAY_MAX_DAYS, OVERWINTER_TARGET_S } from '@/sim/balance/lifecycle';
import { TICKS_PER_SECOND } from '@/sim/time';
import { bannerAutoTicks } from '@/sim/colony/overwinter';
import { publishWinter, winterActions, type WinterActions, type WinterUi } from '@/ui/screens/overwinter/store';
import type { GameSession } from '../../session';
import type { LifecycleHost } from '../epitaph/host';
import { winterLapseView } from './lapseView';

export class WinterFlow implements WinterActions {
  private session: GameSession | null = null;
  /** The record being shown, its playback progress and whether the report card is up. */
  private rec: WinterRecord | null = null;
  private progress = 0;
  private skipping = false;
  private shownCount = 0;

  constructor(private readonly host: LifecycleHost) {}

  attach(session: GameSession): void {
    this.session = session;
    this.rec = null;
    this.progress = 0;
    this.skipping = false;
    this.shownCount = winters(session.sim).length;
    winterActions.value = this;
    this.publish();
  }

  detach(): void {
    this.session = null;
    this.rec = null;
    publishWinter(null);
    winterActions.value = null;
  }

  /** Per real frame (dt 0 after a debug step): starts and advances the lapse playback. */
  frame(session: GameSession, dt: number): void {
    if (session !== this.session) this.attach(session);
    const sim = session.sim;
    const list = winters(sim);
    if (sim.state.env.winter.phase === 'lapse' && list.length > this.shownCount) {
      this.shownCount = list.length;
      this.rec = list[list.length - 1];
      this.progress = 0;
      this.skipping = false;
    }
    if (this.rec && this.progress < 1) {
      const rate = this.skipping ? Infinity : 1 / OVERWINTER_TARGET_S;
      this.progress = Math.min(1, this.progress + rate * Math.max(0, dt));
    }
    if (sim.state.env.winter.phase !== 'lapse' && sim.state.env.winter.phase !== 'report') this.rec = null;
    this.publish();
  }

  private publish(): void {
    const sim = this.session?.sim;
    publishWinter(sim ? this.view(sim) : null);
  }

  private view(sim: Sim): WinterUi | null {
    const w = sim.state.env.winter;
    const species = sim.state.config.species;
    if (w.phase === 'banner') {
      const life = sim.state.colonies[0]?.lifecycle;
      const left = life && life.bannerTick >= 0 ? (bannerAutoTicks(sim) - (sim.state.tick - life.bannerTick)) / (TICKS_PER_SECOND * Math.max(1, sim.state.env.time.speed)) : 0;
      return { phase: 'banner', species, banner: { delaysLeft: OVERWINTER_DELAY_MAX_DAYS - w.delaysUsed, secondsLeft: Math.max(0, left) }, lapse: null, report: null };
    }
    if (!this.rec) return null;
    const reduced = this.host.settings.get().camera.reducedMotion;
    if (this.progress < 1) return { phase: 'lapse', species, banner: null, lapse: winterLapseView(this.rec, this.progress, reduced, this.skipping), report: null };
    return { phase: 'report', species, banner: null, lapse: null, report: this.rec };
  }

  // ---- actions ----
  begin(): void { this.host.command({ type: 'overwinterChoice', choice: 'begin' }); this.afterCommand(); }
  delay(): void { this.host.command({ type: 'overwinterChoice', choice: 'delay' }); this.afterCommand(); }
  skip(): void { if (this.rec) { this.skipping = true; this.progress = 1; } this.publish(); }
  close(): void {
    this.host.command({ type: 'overwinterChoice', choice: 'close-report' });
    this.rec = null;
    this.afterCommand();
  }
  /** Debug: show the lapse at a given progress (scripted screenshots; the manual clock never advances it). */
  setProgress(p: number): void { if (this.rec) this.progress = Math.min(1, Math.max(0, p)); this.publish(); }

  private afterCommand(): void {
    const s = this.session;
    if (s) this.frame(s, 0);
    this.host.refreshUi();
  }
}

function winters(sim: Sim): WinterRecord[] {
  return sim.state.colonies[0]?.lifecycle?.winters ?? [];
}
