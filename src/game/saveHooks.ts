// Save / load hook points (GDD 01 §1, task spec: "autosave hook points (no storage yet)"). The `save` task
// replaces the bodies and listens to autosave points; until then every call reports 'unavailable'.
import type { SaveResult, SaveSlotInfo } from '@/ui/api';

const UNAVAILABLE: SaveResult = { ok: false, status: 'unavailable', message: 'Saving and loading are not available yet' };

export class SaveHooks {
  /** Called at autosave moments ('day' when the game day changes, 'quit' before leaving a game). */
  onAutosavePoint: ((reason: 'day' | 'quit') => void) | null = null;
  private lastDay = -1;

  async save(_slot: string): Promise<SaveResult> { return UNAVAILABLE; }
  async load(_slot: string): Promise<SaveResult> { return UNAVAILABLE; }
  async listSaves(): Promise<SaveSlotInfo[]> { return []; }

  /** Feed the current game day each frame; fires the 'day' autosave point when it changes. */
  noteDay(day: number): void {
    if (this.lastDay >= 0 && day !== this.lastDay) this.onAutosavePoint?.('day');
    this.lastDay = day;
  }

  quitting(): void {
    if (this.lastDay >= 0) this.onAutosavePoint?.('quit');
    this.lastDay = -1;
  }
}
