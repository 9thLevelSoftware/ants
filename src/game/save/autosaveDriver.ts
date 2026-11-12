// Connects the autosave policy (when), the manager (how) and the running game (what): a once-per-interval frame call
// for the interval timer, and sim-event triggers for the named checkpoints (GDD 06 §15). No DOM, no timers of its
// own: install.ts feeds it real-time deltas, tests feed it whatever they like.
import type { Sim } from '@/sim/types';
import { blockReason, possessedInCombat } from './blocks';
import { AutosavePolicy, isCheckpointLabel } from './autosavePolicy';
import { AUTOSAVE_DEFER_MAX_S } from './constants';
import type { SaveHost, SaveManager } from './manager';
import type { AutosaveLabel } from './types';

export interface DriverHost extends SaveHost {
  /** The page is visible (document.visibilityState). */
  visible(): boolean;
}

/**
 * Named triggers that wait while the possessed ant fights (GDD 08 §7.6). The checkpoints (`pre-winter`, `pre-flight`...)
 * capture a moment that is about to pass and `quit` / `hidden` are about to lose the game, so they write at once.
 */
const COMBAT_DEFERRABLE: readonly AutosaveLabel[] = ['season'];

const DISABLED_NOTICE = 'Autosave was switched off for this session because saving failed twice. Use Export to keep your colony.';

export class AutosaveDriver {
  private sim: Sim | null = null;
  private unsubs: (() => void)[] = [];
  private thumbPrimed = false;
  private suppressQuit = 0;
  /** A named trigger waiting for the possessed ant's fight to end (at most AUTOSAVE_DEFER_MAX_S real seconds). */
  private deferred: { label: AutosaveLabel; waitedS: number } | null = null;
  /** Labels written this page life (debug, tests). */
  readonly written: { label: string; tick: number; ok: boolean }[] = [];

  /**
   * `extraSubscriptions` lets the composition root hang more per-sim listeners (the profile's) on the same attach /
   * detach cycle; it returns their unsubscribers.
   */
  constructor(
    readonly manager: SaveManager, readonly policy: AutosavePolicy, private readonly host: DriverHost,
    private readonly extraSubscriptions: (sim: Sim) => (() => void)[] = () => [],
  ) {}

  /** Real-time step (seconds): advances the policy, counts play time, writes an interval autosave when due. */
  frame(dtS: number): void {
    const sim = this.host.getSim();
    const ctx = this.host.context();
    const paused = !!sim && sim.state.env.time.paused;
    const playing = !!sim && ctx.mode === 'playing' && !paused;
    const visible = this.host.visible();
    this.policy.advance({ dtS, playing, visible });
    if (playing && visible) this.manager.playTimeS += Math.max(0, dtS);
    if (!sim || !this.usable()) return;
    if (this.deferred) this.pollDeferred(sim, dtS);
    if (this.policy.wantsThumbnail() && !this.thumbPrimed) {
      this.thumbPrimed = true;
      this.manager.captureThumbnail();
    }
    const state = sim.state;
    const label = this.policy.poll({ block: blockReason(state, ctx, 'autosave'), combat: possessedInCombat(state), tick: state.tick });
    if (label) this.write(label, state.tick);
  }

  /** Storage is known and persistent: autosave to the volatile fallback is skipped (GDD 08 §7.6). */
  private usable(): boolean {
    const s = this.manager.status();
    return s.availability === 'ok';
  }

  /** A named trigger (season, checkpoint, quit, page hidden). Returns true when a write was started. */
  trigger(label: AutosaveLabel, afterDeferral = false): boolean {
    if (label === 'quit' && this.suppressQuit > 0) return false;
    const sim = this.host.getSim();
    if (!sim || !this.usable()) return false;
    if (!afterDeferral && COMBAT_DEFERRABLE.includes(label) && possessedInCombat(sim.state)) {
      this.deferred = { label, waitedS: 0 };
      return false;
    }
    const block = blockReason(sim.state, this.host.context(), 'autosave', { checkpoint: isCheckpointLabel(label) });
    if (!this.policy.allow(label, { block, combat: false, tick: sim.state.tick })) return false;
    this.write(label, sim.state.tick);
    return true;
  }

  private pollDeferred(sim: Sim, dtS: number): void {
    const d = this.deferred;
    if (!d) return;
    d.waitedS += Math.max(0, dtS);
    if (possessedInCombat(sim.state) && d.waitedS < AUTOSAVE_DEFER_MAX_S) return;
    this.deferred = null;
    this.trigger(d.label, true);
  }

  /** The hidden `opening-start` checkpoint (does not touch the ring or the interval timer). */
  checkpointOpening(): void {
    const sim = this.host.getSim();
    if (!sim || !this.usable() || !this.policy.enabled || this.policy.disabled) return;
    const tick = sim.state.tick;
    void this.manager.checkpointOpening().then((r) => this.written.push({ label: 'opening-start', tick, ok: r.ok }));
  }

  private write(label: AutosaveLabel, tick: number): void {
    this.thumbPrimed = false;
    void this.manager.autosave(label).then((r) => {
      this.written.push({ label, tick, ok: r.ok });
      if (r.code === 'blocked' || r.code === 'busy') { this.policy.noteNotAttempted(); return; } // not attempted: not a failure, stays due
      if (this.policy.noteResult(r.ok, tick) === 'disabled') this.manager.noteAutosaveDisabled(DISABLED_NOTICE);
    });
  }

  /** Runs `fn` with the `quit` trigger muted (a load replaces the game: the old one must not be autosaved). */
  withoutQuitSave<T>(fn: () => T): T {
    this.suppressQuit++;
    try { return fn(); } finally { this.suppressQuit--; }
  }

  /** Subscribes to the sim events that write named autosaves; pass null when the game ends. */
  attachSim(sim: Sim | null): void {
    for (const u of this.unsubs.splice(0)) u();
    this.sim = sim;
    this.thumbPrimed = false;
    this.deferred = null;
    if (!sim) return;
    const on = sim.events.on.bind(sim.events);
    this.unsubs.push(
      on('time.season', () => this.trigger('season')),
      on('opening.phase', (e) => {
        if (e.to === 'search') this.checkpointOpening();
        else if (e.to === 'lay') this.trigger('opening-sealed');
        else if (e.to === 'timelapse') this.trigger('pre-timelapse');
        else if (e.to === 'handover') this.trigger('opening-complete');
      }),
      on('overwinter.banner', () => this.trigger('pre-winter')),
      on('overwinter.end', () => this.trigger('post-winter')),
      // GDD 06 §15: the hidden opening checkpoint is kept until the first winter report
      on('overwinter.report', () => { void this.manager.delete('opening-start'); }),
      on('flight.launched', () => this.trigger('pre-flight')),
      on('colony.extinct', () => this.trigger('final')),
      ...this.extraSubscriptions(sim),
    );
  }

  get attachedSim(): Sim | null {
    return this.sim;
  }

  dispose(): void {
    this.attachSim(null);
  }
}
