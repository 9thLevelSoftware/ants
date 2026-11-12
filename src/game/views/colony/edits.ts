// The player's edits of what the colony view selects (GDD 03 §14.2 rows "Edit" and "Chambers and entrances"): a
// plan's priority, pause / resume and cancel; a chamber's type (`designateChamber`); sealing or reopening an
// entrance. The inspect card (ui task) calls these through ViewsLayer; refusals are toasted with words.
import type { ChamberType, PlanPriority, Sim } from '@/sim/types';
import type { ToolHost } from './markerTool';
import { PendingCommands } from './pendingCommands';
import { DigPlanner, playerNest } from './digPlanner';

const REFUSAL_TEXT: Record<string, string> = {
  'unknown-plan': 'That plan no longer exists',
  'type-not-allowed': 'This chamber cannot take that use',
  'no-target': 'That entrance cannot be changed now',
};

export type PlanEdit = 'priority-normal' | 'priority-high' | 'pause' | 'resume' | 'toggle-pause' | 'cancel';

export class ColonyEdits {
  readonly pending = new PendingCommands();

  poll(sim: Sim): void {
    this.pending.poll(sim);
  }

  reset(): void {
    this.pending.clear();
  }

  /** Chamber types the player may give a chamber of this species. */
  static chamberTypes(sim: Sim): readonly ChamberType[] {
    return DigPlanner.chamberTypes(sim);
  }

  /** Applies a plan edit; false when the plan is not the player's or is finished. */
  plan(h: ToolHost, planId: number, edit: PlanEdit): boolean {
    const plan = playerNest(h.sim)?.digPlans.find((p) => p.id === planId);
    if (!plan || plan.status === 'complete' || plan.status === 'cancelled') return false;
    const pause = edit === 'pause' || (edit === 'toggle-pause' && plan.status !== 'paused');
    const resume = edit === 'resume' || (edit === 'toggle-pause' && plan.status === 'paused');
    if (edit === 'priority-normal' || edit === 'priority-high') {
      const priority: PlanPriority = edit === 'priority-high' ? 'high' : 'normal';
      this.send(h, { type: 'setPlanPriority', planId, priority });
    } else if (pause) this.send(h, { type: 'pausePlan', planId });
    else if (resume) this.send(h, { type: 'resumePlan', planId });
    else this.send(h, { type: 'cancelPlan', planId });
    return true;
  }

  /** Gives a chamber of the player's nest a new use (`designateChamber`). */
  designateChamber(h: ToolHost, chamberId: number, chamberType: ChamberType): boolean {
    if (!playerNest(h.sim)?.chambers.some((c) => c.id === chamberId)) return false;
    this.send(h, { type: 'designateChamber', chamberId, chamberType });
    return true;
  }

  /** Seals an open entrance, reopens a sealed one; null when it is not the player's or is changing already. */
  toggleEntrance(h: ToolHost, entranceId: number): 'seal' | 'reopen' | null {
    const e = playerNest(h.sim)?.entrances.find((x) => x.id === entranceId);
    if (!e) return null;
    if (e.status === 'open') { this.send(h, { type: 'sealEntrance', entranceId }); return 'seal'; }
    if (e.status === 'sealed') { this.send(h, { type: 'reopenEntrance', entranceId }); return 'reopen'; }
    return null;
  }

  private send(h: ToolHost, cmd: Parameters<ToolHost['command']>[0]): void {
    this.pending.send(h, cmd, (o) => { if (o.refused) h.toast(REFUSAL_TEXT[o.refused] ?? 'That change is not possible'); });
  }
}
