// Tool commands and their outcome, whether the Game applied them at once (paused, manual clock) or queued them for
// the next tick (real time: `applied` false, no refusals yet). A queued command is resolved once a tick has run
// after it was sent: its refusal (a `command-rejected` event of its type) or its success. The tools then act on the
// outcome exactly as they do for an immediate one (select the new marker, put a refused move back, report a refused
// plan), so the colony view behaves the same at any speed. A refused `planDig` raises `plan-rejected {codes}` (GDD
// 03 §14.2) rather than `command-rejected`: its first code (or warning) is the refusal reason here.
import type { Command, Sim, SimEvent } from '@/sim/types';

type Rejected = Extract<SimEvent, { type: 'command-rejected' | 'plan-rejected' }>;

/** The command type a refusal event belongs to, and its reason. */
function refusalOf(e: Rejected): { type: string; reason: string } {
  if (e.type === 'plan-rejected') return { type: 'planDig', reason: e.codes[0] ?? e.warnings[0] ?? 'invalid' };
  return { type: e.commandType, reason: e.reason || 'invalid' };
}

export interface CommandHost {
  readonly sim: Sim;
  /** Enqueue a command (applied at once while the clock is manual / paused); the sim's refusals come back. */
  command(cmd: Command): { applied: boolean; rejected: readonly { reason?: string }[] };
}

export interface CommandOutcome {
  /** The sim's refusal reason, null when accepted. */
  refused: string | null;
  /** state.nextId before the command: entities it created have ids >= this. */
  firstNewId: number;
  /** Resolved after a tick (the command was queued), not at once. */
  late: boolean;
}

interface Pending {
  type: string;
  tick: number;
  firstNewId: number;
  refused: string | null;
  done: (o: CommandOutcome) => void;
}

export class PendingCommands {
  private list: Pending[] = [];
  private sim: Sim | null = null;
  private offs: (() => void)[] = [];

  /** Sends `cmd`; `done` runs now when it was applied at once, else from poll() after the next tick. */
  send(h: CommandHost, cmd: Command, done: (o: CommandOutcome) => void): void {
    const firstNewId = h.sim.state.nextId;
    let heard: string | null = null;
    const hear = (e: Rejected) => { const x = refusalOf(e); if (x.type === cmd.type && heard === null) heard = x.reason; };
    const offs = [h.sim.events.on('command-rejected', hear), h.sim.events.on('plan-rejected', hear)];
    let r: ReturnType<CommandHost['command']>;
    try { r = h.command(cmd); } finally { for (const off of offs) off(); }
    if (r.applied) { done({ refused: heard ?? (r.rejected[0] ? r.rejected[0].reason ?? 'invalid' : null), firstNewId, late: false }); return; }
    this.listen(h.sim);
    this.list.push({ type: cmd.type, tick: h.sim.state.tick, firstNewId, refused: null, done });
  }

  get size(): number {
    return this.list.length;
  }

  /** Resolves every queued command a tick has applied since it was sent (call once per frame). */
  poll(sim: Sim): void {
    if (this.sim && sim !== this.sim) { this.clear(); return; } // a new game: the old commands died with it
    while (this.list.length > 0 && sim.state.tick > this.list[0].tick) {
      const p = this.list.shift()!;
      p.done({ refused: p.refused, firstNewId: p.firstNewId, late: true });
    }
    if (this.list.length === 0) this.unlisten();
  }

  /** Forget queued commands (new game, reset). Their callbacks never run. */
  clear(): void {
    this.list = [];
    this.unlisten();
  }

  private listen(sim: Sim): void {
    if (this.sim === sim && this.offs.length > 0) return;
    this.unlisten();
    this.sim = sim;
    // refusals arrive in command order: each goes to the oldest unresolved command of that type
    const hear = (e: Rejected) => {
      const x = refusalOf(e);
      const p = this.list.find((q) => q.type === x.type && q.refused === null);
      if (p) p.refused = x.reason;
    };
    this.offs = [sim.events.on('command-rejected', hear), sim.events.on('plan-rejected', hear)];
  }

  private unlisten(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.sim = null;
  }
}
