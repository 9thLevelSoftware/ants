// Turns simulation events about possession and time into game-level reactions (GDD 01 §1.3, §3.7, §5.8): view
// changes, the death hold, toasts. The sim decides; the game follows. Reactions are queued while events are
// delivered (inside sim.tick) and applied by Game between frames.
import type { Sim, SimEvent } from '@/sim/types';

export type GameReaction =
  | { kind: 'possessed'; antId: number }
  | { kind: 'released'; antId: number; reason: string }
  | { kind: 'possessed-died'; antId: number }
  | { kind: 'toast'; text: string };

/** Player words for the sim's possession refusal reasons (codex-content wording table). */
const POSSESS_REJECTED: Record<string, string> = {
  dead: 'That ant is dead', 'not-colony': 'That ant belongs to another colony', view: 'Not available in this view',
};

/** Player-facing texts for refusals (GDD 01 §5.8, GDD 06 §4.2). */
export const TOASTS = {
  speedPossession: '8x is available only while observing',
  speedOpening: 'The queen is in danger: time is limited to 2x',
  possessRejected: (reason: string) => POSSESS_REJECTED[reason] ?? 'That ant cannot be taken',
  steppedDown: (from: number, to: number) => `The game could not keep up at ${from}x and now runs at ${to}x`,
  noRole: (role: string) => `No ant is ${role === 'forager' ? 'foraging' : role === 'digger' ? 'digging' : role === 'nurse' ? 'nursing' : 'available'} now`,
  autoPaused: 'Paused while the window is in the background',
  padConnected: 'Controller connected',
  padDisconnected: 'Controller disconnected',
  pointerLockRefused: 'Mouse capture is not available here: drag with the right button to look',
} as const;

/** Recent sim events kept for the debug API (`__game.events()`), newest last. */
export const EVENT_LOG_SIZE = 200;
/** Death positions remembered (only the possessed ant's is ever needed, a few seconds later). */
const DEATH_MEMORY = 64;

export interface LoggedEvent {
  /** Position in the stream of all events since attach (1, 2, ...); unlike the index it survives the cap. */
  seq: number;
  tick: number;
  type: string;
  event: SimEvent;
}

export class PossessionEvents {
  readonly reactions: GameReaction[] = [];
  /** The last EVENT_LOG_SIZE events. Find the events of an action with since(seq), never by array index. */
  readonly log: LoggedEvent[] = [];
  /** seq of the newest event (0 before the first). */
  seq = 0;
  /** Where recent ants died (ant-died events), for the camera after a possessed ant's death; oldest dropped. */
  private readonly deaths = new Map<number, { x: number; y: number; z: number }>();
  private off: (() => void) | null = null;

  attach(sim: Sim): void {
    this.detach();
    this.off = sim.events.onAny((type, payload) => {
      const ev = payload as SimEvent;
      this.log.push({ seq: ++this.seq, tick: sim.state.tick, type: String(type), event: ev });
      if (this.log.length > EVENT_LOG_SIZE) this.log.shift();
      this.react(ev);
    });
  }

  /** Logged events newer than `seq` (take `seq` before the action). Older than EVENT_LOG_SIZE events are gone. */
  since(seq: number): LoggedEvent[] {
    const log = this.log;
    let i = log.length;
    while (i > 0 && log[i - 1].seq > seq) i--;
    return log.slice(i);
  }

  /** Position of a recent death (undefined when unknown or long ago). */
  deathPos(antId: number): { x: number; y: number; z: number } | undefined {
    return this.deaths.get(antId);
  }

  private react(ev: SimEvent): void {
    switch (ev.type) {
      case 'ant-died':
        this.deaths.set(ev.antId, { x: ev.pos.x, y: ev.pos.y, z: ev.pos.z });
        if (this.deaths.size > DEATH_MEMORY) this.deaths.delete(this.deaths.keys().next().value as number);
        break;
      case 'possession-started': this.reactions.push({ kind: 'possessed', antId: ev.antId }); break;
      case 'possession-ended':
        if (ev.reason !== 'death' && ev.reason !== 'switch') this.reactions.push({ kind: 'released', antId: ev.antId, reason: ev.reason });
        break;
      case 'possessed-ant-died': this.reactions.push({ kind: 'possessed-died', antId: ev.antId }); break;
      case 'possess-rejected': this.reactions.push({ kind: 'toast', text: TOASTS.possessRejected(ev.reason) }); break;
      case 'speed-refused':
        this.reactions.push({ kind: 'toast', text: ev.reason === 'possession' ? TOASTS.speedPossession : TOASTS.speedOpening });
        break;
      default: break;
    }
  }

  take(): GameReaction[] {
    return this.reactions.splice(0, this.reactions.length);
  }

  detach(): void {
    this.off?.();
    this.off = null;
    this.reactions.length = 0;
    this.log.length = 0;
    this.deaths.clear();
  }
}
