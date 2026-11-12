// The debug cue log (GDD 08 App. B `audio.cueLog()`: the last 50 cues with bus and gain), a fixed ring.
import { CUE_LOG_MAX } from '../tuning';

export interface CueLogEntry {
  /** Context time, s. */
  t: number;
  cue: string;
  bus: string;
  /** Voice gain at the listener, dB (-Infinity when not played). */
  gainDb: number;
  /** What sounded: `file:<id>`, `synth:<id>`, `file:<id>+synth:<id>`, or why not: culled / refused / silent / unknown / muted. */
  source: string;
  distBu: number;
}

export class CueLog {
  private ring: CueLogEntry[] = [];
  private unknown = new Set<string>();

  push(e: CueLogEntry): void {
    this.ring.push(e);
    if (this.ring.length > CUE_LOG_MAX) this.ring.shift();
  }

  /** True the first time an unknown cue id is seen (log it once, §14). */
  firstUnknown(id: string): boolean {
    if (this.unknown.has(id)) return false;
    this.unknown.add(id);
    return true;
  }

  list(): CueLogEntry[] { return this.ring.slice(); }
  clear(): void { this.ring = []; }
}
