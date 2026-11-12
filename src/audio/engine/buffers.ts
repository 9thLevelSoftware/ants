// Decoded audio buffers (GDD 08 §13.1). Bytes come only from the asset loader (architecture §8: no fetch, no
// new Audio(url)). Effects are decoded once and kept; ambience beds are kept at most AUDIO_BEDS_RESIDENT at a time
// (least recently used beds not playing are dropped). A failed fetch or decode marks the id missing: its users
// fall back to synthesis. Loading never blocks the caller.
import { AUDIO_BEDS_RESIDENT } from '../tuning';

/** What the bank needs from the asset loader (AssetLoader satisfies it). */
export interface AudioBytesSource {
  audioData(id: string): Promise<ArrayBuffer>;
}

export class BufferBank {
  private ready = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  private missing = new Set<string>();
  private bedUse = new Map<string, number>();
  private clock = 0;

  constructor(private readonly ctx: BaseAudioContext, private readonly src: AudioBytesSource | null, private readonly isBed: (id: string) => boolean) {}

  get(id: string): AudioBuffer | null {
    const b = this.ready.get(id) ?? null;
    if (b && this.isBed(id)) this.bedUse.set(id, ++this.clock);
    return b;
  }

  isMissing(id: string): boolean { return this.missing.has(id); }
  get missingIds(): string[] { return [...this.missing]; }
  get loadedIds(): string[] { return [...this.ready.keys()]; }

  /** Decoded buffer, or null when missing. Requests are shared. */
  load(id: string): Promise<AudioBuffer | null> {
    const have = this.ready.get(id);
    if (have) return Promise.resolve(have);
    if (this.missing.has(id) || !this.src) { this.missing.add(id); return Promise.resolve(null); }
    let p = this.pending.get(id);
    if (!p) {
      p = this.src.audioData(id)
        .then((bytes) => this.ctx.decodeAudioData(bytes))
        .then((buf) => {
          this.ready.set(id, buf);
          if (this.isBed(id)) this.bedUse.set(id, ++this.clock);
          return buf;
        })
        .catch(() => { this.missing.add(id); return null; })
        .finally(() => this.pending.delete(id));
      this.pending.set(id, p);
    }
    return p;
  }

  preload(ids: readonly string[]): Promise<void> {
    return Promise.all(ids.map((id) => this.load(id))).then(() => undefined);
  }

  /** Drops least recently used beds beyond the resident limit, never one in `inUse`. */
  trimBeds(inUse: ReadonlySet<string>): void {
    const beds = [...this.bedUse.entries()].filter(([id]) => this.ready.has(id)).sort((a, b) => a[1] - b[1]);
    let excess = beds.length - AUDIO_BEDS_RESIDENT;
    for (const [id] of beds) {
      if (excess <= 0) break;
      if (inUse.has(id)) continue;
      this.ready.delete(id);
      this.bedUse.delete(id);
      excess--;
    }
  }

  /** Register an externally decoded buffer (tests, the demo's synthetic files). */
  put(id: string, buf: AudioBuffer): void {
    this.ready.set(id, buf);
    this.missing.delete(id);
  }

  markMissing(id: string): void { this.missing.add(id); this.ready.delete(id); }
}
