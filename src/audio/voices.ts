// Voice limiting (GDD 08 §13.3), pure: at most AUDIO_MAX_VOICES positional voices, per-cue caps, priorities
// (possessed ant > giant events > creatures near the listener > others). When full, the quietest voice of the
// lowest priority not above the newcomer's is stolen; a newcomer quieter than every candidate is refused.

export interface VoiceSlot {
  id: number;
  key: string;
  priority: number;
  /** Estimated audible gain (linear, after distance and occlusion) used for "quietest-farthest". */
  gain: number;
  /** Real (context) time at which the voice ends; Infinity = until released. */
  endTime: number;
}

export interface Admission {
  ok: boolean;
  /** Voice to stop to make room (-1 none). */
  steal: number;
}

export class VoiceTable {
  private slots: VoiceSlot[] = [];
  private nextId = 1;
  /** Counters for the debug read-out. */
  stats = { admitted: 0, refused: 0, stolen: 0 };

  constructor(readonly maxVoices: number) {}

  get active(): number { return this.slots.length; }

  count(key: string): number {
    let n = 0;
    for (const s of this.slots) if (s.key === key) n++;
    return n;
  }

  /** Drops voices that ended by `now`. */
  purge(now: number): void {
    let w = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.endTime > now) this.slots[w++] = s;
    }
    this.slots.length = w;
  }

  /** Decide whether a new voice may play. Does not add it: call add() after a successful start. */
  admit(key: string, priority: number, gain: number, cap: number, now: number, out: Admission = { ok: false, steal: -1 }): Admission {
    this.purge(now);
    out.ok = false;
    out.steal = -1;
    // per-cue cap: replace the quietest voice of the same cue if the newcomer is louder
    if (this.count(key) >= cap) {
      const v = this.pick((s) => s.key === key && (s.priority < priority || (s.priority === priority && s.gain < gain)));
      if (!v) { this.stats.refused++; return out; }
      out.ok = true;
      out.steal = v.id;
      return out;
    }
    if (this.slots.length < this.maxVoices) { out.ok = true; return out; }
    const v = this.pick((s) => s.priority < priority || (s.priority === priority && s.gain < gain));
    if (!v) { this.stats.refused++; return out; }
    out.ok = true;
    out.steal = v.id;
    return out;
  }

  /** Lowest priority first, then quietest. */
  private pick(ok: (s: VoiceSlot) => boolean): VoiceSlot | null {
    let best: VoiceSlot | null = null;
    for (const s of this.slots) {
      if (!ok(s)) continue;
      if (!best || s.priority < best.priority || (s.priority === best.priority && s.gain < best.gain)) best = s;
    }
    return best;
  }

  add(key: string, priority: number, gain: number, endTime: number): number {
    const id = this.nextId++;
    this.slots.push({ id, key, priority, gain, endTime });
    this.stats.admitted++;
    return id;
  }

  remove(id: number, stolen = false): void {
    const i = this.slots.findIndex((s) => s.id === id);
    if (i >= 0) { this.slots.splice(i, 1); if (stolen) this.stats.stolen++; }
  }

  setGain(id: number, gain: number): void {
    const s = this.slots.find((v) => v.id === id);
    if (s) s.gain = gain;
  }

  clear(): void { this.slots.length = 0; }
}

/**
 * Crowd meter: counts requests of one cue in a sliding window. Above `singleMax` per second the extra requests
 * feed a granular texture (many footsteps become a patter) instead of single voices.
 */
export class CrowdMeter {
  private times: number[] = [];
  constructor(readonly windowS: number, readonly singleMax: number) {}

  /** Records a request at `now`; true if it may still play as a single voice. */
  note(now: number): boolean {
    const t = this.times;
    while (t.length && t[0] <= now - this.windowS) t.shift();
    t.push(now);
    return this.rate(now) <= this.singleMax;
  }

  /** Requests per second over the window. */
  rate(now: number): number {
    const t = this.times;
    while (t.length && t[0] <= now - this.windowS) t.shift();
    return t.length / this.windowS;
  }
}
