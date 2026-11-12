// The result of __game.possess(): ok only when the requested ant (or, for a role, some ant) is now possessed and
// the sim raised no refusal. An ant that was possessed before the call does not make a refused call look fine.
import type { PossessRole } from '@/sim/types';
import type { PossessOutcome } from '../Game';

export interface PossessResult {
  ok: boolean;
  /** Possessed ant after the call (-1 none). */
  id: number;
  reason?: string;
  /** Real-time ticking: the command applies at the next tick, so the outcome is not known yet. */
  pending?: boolean;
}

export function possessResult(target: number | PossessRole, r: PossessOutcome, possessedId: number): PossessResult {
  const id = possessedId;
  if (r.refused) return { ok: false, id, reason: r.refused };
  if (!r.applied) return { ok: false, id, pending: true, reason: 'pending' };
  const rej = r.rejected[0];
  if (rej) return { ok: false, id, reason: rej.type === 'possess-rejected' ? rej.reason : `${rej.commandType}: ${rej.reason}` };
  const ok = typeof target === 'number' ? id === target : id !== -1;
  return ok ? { ok, id } : { ok, id, reason: 'not-possessed' };
}
