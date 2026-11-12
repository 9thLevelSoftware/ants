// The speed control's rules (GDD 08 5.1): which buttons work, which is selected, and why one is locked.
import type { SpeedLevel } from '@/sim/types';
import type { UiSpeed } from '../api';

export type SpeedButtonId = 'pause' | 1 | 2 | 4 | 8 | 'next';

/** Why a button is unavailable, or null when it works. */
export function speedRefusal(b: SpeedButtonId, s: UiSpeed): string | null {
  if (b === 'pause') return null;
  if (b === 'next') return s.allowed.includes(8) ? 'Arrives with the full sandbox' : 'Only while observing';
  if (s.allowed.includes(b as SpeedLevel)) return null;
  if (b === 8) return '8x only while observing';
  return 'Not while time is held';
}

export function isSelected(b: SpeedButtonId, s: UiSpeed): boolean {
  if (b === 'pause') return s.paused;
  if (b === 'next') return false;
  return !s.paused && s.requested === b;
}
