// Short player-facing notices (refusals, auto-pause, step-down). Real-time lifetime; de-duplicated by text.
import type { UiToast } from '@/ui/api';

export const TOAST_LIFETIME_S = 4;

export class Toasts {
  private items: (UiToast & { ttl: number })[] = [];
  private seq = 0;

  /** Adds a toast unless the same text is already showing. Returns true when added. */
  push(text: string): boolean {
    if (this.items.some((t) => t.text === text)) return false;
    this.items.push({ id: ++this.seq, text, ttl: TOAST_LIFETIME_S });
    return true;
  }

  dismiss(id: number): void {
    this.items = this.items.filter((t) => t.id !== id);
  }

  /** Ages the toasts; returns true when one expired. */
  tick(dt: number): boolean {
    if (this.items.length === 0) return false;
    const before = this.items.length;
    for (const t of this.items) t.ttl -= dt;
    this.items = this.items.filter((t) => t.ttl > 0);
    return this.items.length !== before;
  }

  get list(): readonly UiToast[] {
    return this.items;
  }
}
