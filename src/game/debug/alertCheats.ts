// `__game.cheat.raiseAlert / clearAlert`: scripts show a feed without waiting for its condition. There is no
// `cheat.*` command for alerts in the sim's command set (reported to the simulation half), so these call
// progression's own publisher (dedupe, cooldown, cap, `alert` events) between ticks — under the same rule as every
// other cheat: refused unless config.cheats is on (always on with ?test=1, never in a normal game).
import type { AlertKind, AlertLevel, Sim } from '@/sim/types';
import { clearAlert, raiseAlert } from '@/sim/progression';

export interface CheatAlert {
  kind: AlertKind; level: AlertLevel; title?: string; cause?: string; subjectId?: number; tokens?: Record<string, string | number>;
}

/** The new alert's id; -1 when refused (cheats off, or the publisher's own dedupe / cooldown). */
export function cheatRaiseAlert(sim: Sim, a: CheatAlert): number {
  if (!sim.state.config.cheats) return -1;
  return raiseAlert(sim, {
    kind: a.kind, level: a.level, title: a.title ?? '', cause: a.cause ?? '', subjectId: a.subjectId ?? -1, focus: null, diagnosticId: null,
    ...(a.tokens ? { tokens: a.tokens } : {}),
  });
}

/** False when refused (cheats off). */
export function cheatClearAlert(sim: Sim, kind: AlertKind, subjectId = -1): boolean {
  if (!sim.state.config.cheats) return false;
  clearAlert(sim, kind, subjectId);
  return true;
}
