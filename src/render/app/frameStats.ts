// Frame statistics: fps and frame ms over a rolling window, p95, and per-frame draw calls / triangles. The render
// app sets renderer.info.autoReset = false and resets once per frame, so the counts cover every pass (shadow,
// scene, post), as tech-stack section 7 advises.

export interface FrameStatsSnapshot {
  fps: number;
  /** Mean interval between rendered frames (ms). */
  frameMs: number;
  p95Ms: number;
  /** CPU time spent inside render() (ms, mean); the GPU may still be working afterwards. */
  cpuMs: number;
  drawCalls: number;
  triangles: number;
  frames: number;
  resolutionScale: number;
  width: number;
  height: number;
}

export class FrameStats {
  private intervals: number[] = [];
  private cpu: number[] = [];
  private last = -1;
  frames = 0;
  drawCalls = 0;
  triangles = 0;
  resolutionScale = 1;
  width = 0;
  height = 0;

  constructor(readonly window = 60) {}

  /** Call once per rendered frame with its start time, the time render() took, and renderer.info.render. */
  record(startMs: number, cpuMs: number, info: { calls: number; triangles: number }): void {
    if (this.last >= 0) {
      this.intervals.push(startMs - this.last);
      if (this.intervals.length > this.window) this.intervals.shift();
    }
    this.cpu.push(cpuMs);
    if (this.cpu.length > this.window) this.cpu.shift();
    this.last = startMs;
    this.frames++;
    this.drawCalls = info.calls;
    this.triangles = info.triangles;
  }

  /** Forget the interval history (after a pause or a context loss) so stalls do not pollute the numbers. */
  resetTiming(): void {
    this.last = -1;
    this.intervals = [];
  }

  /** Most recent interval (ms) or NaN. */
  get lastIntervalMs(): number {
    return this.intervals.length ? this.intervals[this.intervals.length - 1] : NaN;
  }

  snapshot(): FrameStatsSnapshot {
    const n = this.intervals.length;
    const mean = n ? this.intervals.reduce((a, b) => a + b, 0) / n : NaN;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const p95 = n ? sorted[Math.min(n - 1, Math.floor(n * 0.95))] : NaN;
    const cpu = this.cpu.length ? this.cpu.reduce((a, b) => a + b, 0) / this.cpu.length : NaN;
    return {
      fps: n ? 1000 / mean : NaN, frameMs: mean, p95Ms: p95, cpuMs: cpu, drawCalls: this.drawCalls, triangles: this.triangles,
      frames: this.frames, resolutionScale: this.resolutionScale, width: this.width, height: this.height,
    };
  }
}
