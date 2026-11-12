// Which alert events make a sound (GDD 08 §6.1, §6.3, §13.8), pure. Sounds only on a new raise or an escalation of
// an active `kind:subjectId` key; never for `info`; with the HUD hidden only `critical`; per-key real-time
// cooldown and a rate cap (critical exempt); a game-hour cooldown after a key clears.
import type { AlertLevel } from '@/sim/types/ids/progression';
import { ALERT_SOUND } from './tuning';

const RANK: Record<AlertLevel, number> = { info: 0, notice: 1, warning: 2, critical: 3 };
const TICKS_PER_GAME_H = 250;

export interface AlertSoundInput {
  op: 'raise' | 'update' | 'clear';
  kind: string;
  subjectId: number;
  level: AlertLevel;
}

export class AlertSoundGate {
  private active = new Map<string, AlertLevel>();
  private lastSoundAt = new Map<string, number>();
  private clearedAtTick = new Map<string, number>();
  private recent: number[] = [];

  /** Level to sound now, or null. `nowS` real seconds, `tick` sim tick. */
  decide(e: AlertSoundInput, nowS: number, tick: number, hudHidden: boolean): AlertLevel | null {
    const key = `${e.kind}:${e.subjectId}`;
    if (e.op === 'clear') {
      this.active.delete(key);
      this.clearedAtTick.set(key, tick);
      return null;
    }
    const prev = this.active.get(key);
    const escalation = prev !== undefined && RANK[e.level] > RANK[prev];
    if (prev === undefined || escalation) this.active.set(key, e.level);
    if (prev !== undefined && !escalation) return null; // a repeat updates the card silently
    if (e.level === 'info') return null;
    if (hudHidden && e.level !== 'critical') return null;
    if (e.level !== 'critical') {
      const cleared = this.clearedAtTick.get(key);
      if (!escalation && cleared !== undefined && tick - cleared < ALERT_SOUND.cooldownGameH[e.level] * TICKS_PER_GAME_H) return null;
      const last = this.lastSoundAt.get(key);
      if (last !== undefined && nowS - last < ALERT_SOUND.cooldownRealS) return null;
      this.recent = this.recent.filter((t) => nowS - t < ALERT_SOUND.rateWindowS);
      if (this.recent.length >= ALERT_SOUND.rateMax) return null;
      this.recent.push(nowS);
    }
    this.lastSoundAt.set(key, nowS);
    return e.level;
  }

  reset(): void {
    this.active.clear();
    this.lastSoundAt.clear();
    this.clearedAtTick.clear();
    this.recent = [];
  }
}
