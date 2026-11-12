// Player-control scratch values on the possessed ant (ant.bb, numbers only, persisted with the ant).

import type { Ant } from '@/sim/types';

/** ant.bb keys owned by player control. */
export const CTL = {
  /** Bit mask (HOLD_ACTIONS order) of hold inputs seen last tick, for press / release edges. */
  held: 'ctl.held',
  /** Real seconds of running sim without input (AFK release). */
  idleS: 'ctl.idleS',
  /** Game seconds the movement input has been above ACTION_MOVE_CANCEL_MAG. */
  moveS: 'ctl.moveS',
  /** Prompt selection: TARGET_KINDS index and id of the current target, and of a challenger since a tick. */
  promptKind: 'ctl.pKind',
  promptId: 'ctl.pId',
  challKind: 'ctl.cKind',
  challId: 'ctl.cId',
  challSince: 'ctl.cSince',
} as const;

export function resetControlState(ant: Ant): void {
  ant.bb[CTL.held] = 0;
  ant.bb[CTL.idleS] = 0;
  ant.bb[CTL.moveS] = 0;
  ant.bb[CTL.promptKind] = -1;
  ant.bb[CTL.promptId] = -1;
  ant.bb[CTL.challKind] = -1;
  ant.bb[CTL.challId] = -1;
  ant.bb[CTL.challSince] = -1;
}
