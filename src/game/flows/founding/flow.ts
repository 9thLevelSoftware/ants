// The opening's game-side driver (GDD 06 §5, GDD 08 §7.10, §9.2): intro card timing (the sim waits paused), the
// `opening-start` checkpoint for retry, time-lapse playback (watch or skip: the same ticks, only the rate differs),
// the camera in the cell during the lapse (slow orbit), the outcome card and the hand-over choice, the failure card.
// It reads the sim, issues commands through the Game, and publishes the screens' read-out (src/ui/screens/founding).
import { rngFloat } from '@/core/rng';
import type { Command, GameConfig, OpeningPhase, PossessRole, Sim, SpeedLevel } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save';
import { foundingView } from '@/sim/colony/founding';
import { OPEN_INTRO_S, TIMELAPSE_SKIP_CARD_S, TIMELAPSE_SPAN_GUESS_GD } from '@/sim/balance/founding';
import { TICKS_PER_DAY } from '@/sim/time';
import { foundingActions, publishFounding, type FoundingActions } from '@/ui/screens/founding/store';
import type { GameSession } from '../../session';
import type { GameMode } from '../../time/speedRules';
import { buildFoundingUi, type FlowFlags } from './flowView';
import { LapseRunner } from './lapseRunner';

/** Real-time budget of the lapse per frame while watching / skipping, ms (GDD 06 §4.3 SIM_FRAME_BUDGET_MS = 10). */
const WATCH_BUDGET_MS = 10;
const SKIP_BUDGET_MS = 30;
/** Camera orbit during the lapse, revolutions per real second (GDD 08 §7.10). */
const ORBIT_REV_PER_S = 0.02;
/** Camera at the start of the lapse: round to the front of the queen (deg) and pull back (factor) a little. */
const LAPSE_CAMERA_YAW_DEG = 150;
const LAPSE_CAMERA_ZOOM = 1.3;
/** UI refresh of the founding screens in real time, Hz. */
const PUBLISH_HZ = 15;
/** Synchronous skip in test mode: the most it will run (one tick per call, so it stops on the end tick). */
const TEST_SKIP_MAX_TICKS = 400_000;

/** What the flow needs from the Game (implemented by src/game/Game.ts). */
export interface FoundingHost {
  readonly session: GameSession | null;
  readonly realtime: boolean;
  readonly mode: GameMode;
  readonly opts: { testMode: boolean };
  readonly settings: { get(): { camera: { reducedMotion: boolean } } };
  command(cmd: Command): unknown;
  possess(target: number | PossessRole): unknown;
  cycle(dir: 1 | -1): void;
  setSpeed(level: SpeedLevel): void;
  afterStep(s: GameSession, ticks?: number): void;
  /** Continue in a restored simulation of the same world (retry from the checkpoint). */
  restartWith(sim: Sim): Promise<void>;
}

export class FoundingFlow implements FoundingActions {
  private session: GameSession | null = null;
  private lastPhase: OpeningPhase | null = null;
  private introS = 0;
  private outcomeS = 0;
  private publishS = 0;
  /** The flow paused the clock for the intro card (it starts it again when the card goes). */
  private pausedForIntro = false;
  /** The view the hand-over banner first showed over (null until it shows): changing it answers the banner. */
  private handoverView: string | null = null;
  private checkpoint: { attempt: number; bytes: Uint8Array; config: GameConfig } | null = null;
  private readonly runner = new LapseRunner();
  private readonly flags: FlowFlags = { skipping: false, outcomeOpen: false, handoverOpen: false, failureDismissed: false, reducedMotion: false };

  constructor(private readonly host: FoundingHost) {}

  /** A game started (or a retry continued): the flow follows this session. */
  attach(session: GameSession): void {
    this.session = session;
    this.lastPhase = null;
    this.introS = 0;
    this.outcomeS = 0;
    this.handoverView = null;
    this.runner.reset();
    Object.assign(this.flags, { skipping: false, outcomeOpen: false, handoverOpen: false, failureDismissed: false });
    const op = session.sim.state.player.opening;
    // GDD 06 §5.1: the simulation waits while the intro card shows (only real time would move it)
    this.pausedForIntro = false;
    if (op && op.phase === 'intro-card' && this.host.realtime) { this.host.setSpeed(0); this.pausedForIntro = true; }
    foundingActions.value = this;
    this.publish(true);
  }

  detach(): void {
    this.session = null;
    publishFounding(null);
    foundingActions.value = null;
  }

  private get sim(): Sim | null { return this.session?.sim ?? null; }

  private phase(): OpeningPhase | null {
    return this.sim?.state.player.opening?.phase ?? null;
  }

  private running(): boolean {
    const s = this.session;
    return !!s && this.host.realtime && this.host.mode === 'playing' && !s.driver.paused && s.view !== 'photo';
  }

  /** Called once per real frame before the game's own sim step; true when the lapse ran ticks this frame. */
  frame(session: GameSession, dt: number): boolean {
    if (session !== this.session) this.attach(session);
    const sim = session.sim;
    const op = sim.state.player.opening;
    if (!op) return false;
    const phase = op.phase;
    // the card went another way (a command, the debug path): start the clock again
    if (this.pausedForIntro && phase !== 'intro-card') { this.pausedForIntro = false; this.host.setSpeed(1); }
    let changed = phase !== this.lastPhase;
    if (changed) this.onPhase(this.lastPhase, phase);
    this.lastPhase = phase;
    let ran = 0;
    if (phase === 'intro-card' && this.host.realtime) {
      this.introS += dt;
      if (this.introS >= OPEN_INTRO_S) this.skipIntro();
    } else if (phase === 'timelapse' && this.running()) {
      const tl = sim.state.player.timelapse;
      const span = tl && tl.endTick > tl.startTick ? (tl.endTick - tl.startTick) / TICKS_PER_DAY : TIMELAPSE_SPAN_GUESS_GD;
      const skipping = this.flags.skipping || !!op.lapse?.skipped;
      ran = this.runner.frame(session.driver, dt, {
        spanGd: span, skipping, budgetMs: skipping ? SKIP_BUDGET_MS : WATCH_BUDGET_MS, now: () => performance.now(),
        running: () => this.phase() === 'timelapse',
      });
      if (ran > 0) this.host.afterStep(session, ran);
      if (!this.flags.reducedMotion && session.view === 'possess') session.views.nudge(ORBIT_REV_PER_S * 360 * dt, 0);
    } else if (this.flags.outcomeOpen && this.flags.skipping && this.host.realtime) {
      this.outcomeS += dt;
      if (this.outcomeS >= TIMELAPSE_SKIP_CARD_S) this.closeOutcome();
    }
    // the player chose by themselves (Tab, a click on an ant): the hand-over banner has done its job
    if (this.flags.handoverOpen && !this.flags.outcomeOpen && session.possessedId >= 0) {
      const a = sim.stores.ants.get(session.possessedId);
      if (a && a.caste !== 'queen') this.flags.handoverOpen = false;
    }
    // ... or changed the view (left the queen for the observer or the colony view, or took her back): the banner no
    // longer sits over the scene for hours (gate-close-app play-through, playSeed1/x1-m02-observer.png: still up 5
    // game hours later)
    if (this.flags.handoverOpen && !this.flags.outcomeOpen) {
      if (this.handoverView === null) this.handoverView = session.view; // the view the banner first showed over
      else if (session.view !== this.handoverView) { this.flags.handoverOpen = false; changed = true; }
    }
    this.publishS += dt;
    this.publish(changed || !this.host.realtime || this.publishS >= 1 / PUBLISH_HZ || ran > 0);
    return ran > 0;
  }

  private onPhase(from: OpeningPhase | null, to: OpeningPhase): void {
    const sim = this.sim;
    if (!sim) return;
    if (to === 'search' && (!this.checkpoint || this.checkpoint.attempt !== sim.state.player.opening!.attempt)) {
      // the hidden `opening-start` checkpoint (GDD 06 §5.1, §5.14): retry returns here
      this.checkpoint = { attempt: sim.state.player.opening!.attempt, bytes: snapshot(sim), config: sim.state.config };
    }
    if (to === 'timelapse' && from !== null) {
      this.flags.skipping = false;
      this.runner.reset();
      // the brood in view: from in front of the queen, a little further back than the possession boom keeps her
      this.session?.views.nudge(LAPSE_CAMERA_YAW_DEG, 0, Math.log(LAPSE_CAMERA_ZOOM));
    }
    if (from === 'timelapse' && to === 'handover') {
      this.flags.outcomeOpen = true;
      this.flags.handoverOpen = true;
      this.handoverView = null;
      this.outcomeS = 0;
    }
    if (to === 'failed') this.flags.failureDismissed = false;
  }

  private publish(force: boolean): void {
    const sim = this.sim;
    if (!force) return;
    this.publishS = 0;
    this.flags.reducedMotion = this.host.settings.get().camera.reducedMotion;
    publishFounding(sim ? buildFoundingUi(sim, this.flags) : null);
  }

  // ---- actions (the founding screens, keys, the debug hook) ----

  skipIntro(): void {
    if (this.phase() !== 'intro-card') return;
    this.host.command({ type: 'openingSkipIntro' });
    if (this.pausedForIntro) { this.pausedForIntro = false; this.host.setSpeed(1); }
    this.publish(true);
  }

  beginLapse(): void {
    if (this.phase() !== 'lay') return;
    this.host.command({ type: 'openingBeginTimelapse' });
    this.publish(true);
  }

  /**
   * Skip (GDD 01 `tl-skip`): the same simulation continues at full rate to the same end tick. A playback choice
   * only, so no command reaches the sim (watching and skipping end in the same stateHash). On the manual clock
   * (?test=1) the rest of the lapse runs at once.
   */
  skipLapse(): void {
    const s = this.session;
    if (!s || this.phase() !== 'timelapse') return;
    this.flags.skipping = true;
    if (!this.host.realtime) {
      let ran = 0;
      while (this.phase() === 'timelapse' && ran < TEST_SKIP_MAX_TICKS) ran += s.driver.step(1);
      this.host.afterStep(s, ran);
      const to = this.phase();
      if (to && to !== this.lastPhase) { this.onPhase(this.lastPhase, to); this.lastPhase = to; }
    }
    this.publish(true);
  }

  closeOutcome(): void {
    this.flags.outcomeOpen = false;
    this.publish(true);
  }

  /** Hand-over: stay with the queen (she stays possessed). */
  stayWithQueen(): void {
    const s = this.session;
    this.flags.outcomeOpen = false;
    this.flags.handoverOpen = false;
    if (s && s.possessedId < 0) this.host.possess('queen');
    this.publish(true);
  }

  /** Hand-over: take the nearest worker (Tab). */
  takeWorker(): void {
    const s = this.session;
    this.flags.outcomeOpen = false;
    this.flags.handoverOpen = false;
    if (s) {
      const w = s.sim.state.ants.find((a) => a.alive && a.colony === s.sim.state.player.colonyId && a.caste === 'worker');
      if (w) this.host.possess(w.id);
      else this.host.cycle(1);
    }
    this.publish(true);
  }

  /** "Undo founding: try another site": the same world and queen at the `opening-start` checkpoint, RNG advanced. */
  retry(): void {
    const sim = this.sim;
    const v = sim ? foundingView(sim) : null;
    if (!sim || !this.checkpoint || !v || !v.canUndo) return;
    const { state } = restore(this.checkpoint.bytes);
    const op = state.player.opening!;
    const now = sim.state.player.opening!;
    op.attempt = now.attempt + 1;
    op.retriesUsed = now.retriesUsed + 1;
    const next = createSim(state, sim.world);
    // a different weather and threat draw on every attempt (GDD 06 §5.14)
    for (let i = 0; i < op.attempt * 7; i++) { rngFloat(next.stream('rng.weather')); rngFloat(next.stream('rng.opening')); }
    this.checkpoint = null;
    void this.host.restartWith(next);
  }

  acceptFailure(): void {
    this.flags.failureDismissed = true;
    this.publish(true);
  }
}
