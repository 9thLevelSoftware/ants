// Dynamic resolution controller (pure): keeps the frame time near the target by stepping the render scale between
// bounds, with hysteresis so it does not oscillate. Frame times are real ms between rendered frames.
//
// The interval between requestAnimationFrame callbacks can never drop below the display's refresh period, so on a
// vsync-limited display running exactly at the target (60 fps on 60 Hz) the controller cannot see any headroom.
// Waiting for "clearly faster than the target" would then never scale back up after a hitch. Instead, a frame
// time at the target (within atTargetRatio) for probeFrames frames triggers one probing step up. If that step
// overloads the GPU, the normal down path takes it back within probeFailFrames and the next probe waits longer
// (exponential backoff up to probeBackoffMax), so a game that really is at its limit only probes rarely.

export interface DynResConfig {
  targetMs: number;
  minScale: number;
  maxScale: number;
  /** Scale change per adjustment. */
  step: number;
  /** Scale down when the smoothed frame time exceeds targetMs x downRatio ... */
  downRatio: number;
  /** ... scale up when it is below targetMs x upRatio (clear headroom). */
  upRatio: number;
  /** A smoothed frame time up to targetMs x atTargetRatio counts as "running at the target" (vsync-limited). */
  atTargetRatio: number;
  /** Consecutive frames over / under the thresholds before acting. */
  downFrames: number;
  upFrames: number;
  /** Consecutive frames at the target before one probing step up (multiplied by the current backoff). */
  probeFrames: number;
  /** A step down within this many frames of a probe means the probe failed: the backoff doubles. */
  probeFailFrames: number;
  /** Largest backoff multiplier for probeFrames. */
  probeBackoffMax: number;
  /** Frames to wait after a change before judging again (the new size must settle). */
  cooldownFrames: number;
  /** EMA smoothing factor per frame (0..1). */
  ema: number;
}

export const DYNRES_DEFAULTS: Omit<DynResConfig, 'targetMs' | 'minScale' | 'maxScale'> = {
  step: 0.05, downRatio: 1.12, upRatio: 0.8, atTargetRatio: 1.04, downFrames: 20, upFrames: 90,
  probeFrames: 180, probeFailFrames: 120, probeBackoffMax: 16, cooldownFrames: 30, ema: 0.1,
};

export function dynResConfig(targetFps: number, minScale: number, maxScale: number): DynResConfig {
  return { ...DYNRES_DEFAULTS, targetMs: 1000 / targetFps, minScale, maxScale };
}

export class DynamicResolution {
  scale: number;
  private smoothed = -1;
  private over = 0;
  private under = 0;
  private atTarget = 0;
  private cooldown = 0;
  /** Frames since the last probing step up, or -1 when no probe is being judged. */
  private sinceProbe = -1;
  private backoff = 1;

  constructor(public cfg: DynResConfig) {
    this.scale = cfg.maxScale;
  }

  reset(scale = this.cfg.maxScale): void {
    this.scale = Math.min(this.cfg.maxScale, Math.max(this.cfg.minScale, scale));
    this.smoothed = -1;
    this.over = this.under = this.atTarget = this.cooldown = 0;
    this.sinceProbe = -1;
    this.backoff = 1;
  }

  /** Feed one frame time; returns the (possibly new) scale. Ignores absurd samples (tab switches, stalls). */
  update(frameMs: number): number {
    const c = this.cfg;
    if (!(frameMs > 0) || frameMs > 1000) return this.scale;
    this.smoothed = this.smoothed < 0 ? frameMs : this.smoothed + (frameMs - this.smoothed) * c.ema;
    if (this.sinceProbe >= 0 && ++this.sinceProbe > c.probeFailFrames) {
      this.sinceProbe = -1; // the probe held: the next one may come at the normal pace
      this.backoff = 1;
    }
    if (this.cooldown > 0) { this.cooldown--; return this.scale; }
    const s = this.smoothed;
    if (s > c.targetMs * c.downRatio) { this.over++; this.under = this.atTarget = 0; }
    else if (s < c.targetMs * c.upRatio) { this.under++; this.over = this.atTarget = 0; }
    else if (s <= c.targetMs * c.atTargetRatio) { this.atTarget++; this.over = this.under = 0; }
    else { this.over = this.under = this.atTarget = 0; }
    if (this.over >= c.downFrames && this.scale > c.minScale) {
      if (this.sinceProbe >= 0) this.backoff = Math.min(c.probeBackoffMax, this.backoff * 2);
      this.sinceProbe = -1;
      this.change(-c.step);
    } else if (this.under >= c.upFrames && this.scale < c.maxScale) {
      this.change(c.step);
    } else if (this.atTarget >= c.probeFrames * this.backoff && this.scale < c.maxScale) {
      this.change(c.step);
      this.sinceProbe = 0;
    }
    return this.scale;
  }

  get smoothedMs(): number {
    return this.smoothed;
  }

  get atMinimum(): boolean {
    return this.scale <= this.cfg.minScale + 1e-9;
  }

  /** Current probe backoff multiplier (1 = normal pace). */
  get probeBackoff(): number {
    return this.backoff;
  }

  private change(d: number): void {
    this.scale = Math.round(Math.min(this.cfg.maxScale, Math.max(this.cfg.minScale, this.scale + d)) * 1000) / 1000;
    this.over = this.under = this.atTarget = 0;
    this.cooldown = this.cfg.cooldownFrames;
  }
}
