// ant.bb keys and sub-states of the herd branch of `tend` (numbers only, persisted with the ant).

export const TH = {
  /** Herd sub-state (HS value); -1 = the outdoor engine runs the ant (return, deliver, wait, flee, T1 films). */
  st: 'th.st',
  /** Tick the sub-state began, and the tick this herd trip left the nest. */
  st0: 'th.st0',
  trip0: 'th.t0',
  /** Herd the ant works (kept across trips), -1 none. */
  herd: 'th.herd',
  /** Failed trips to the herd in a row; a herd given up and until when (tick). */
  tries: 'th.tries',
  bad: 'th.bad',
  badUntil: 'th.badU',
  /** Next stroke allowed at (tick): a stroke and its drink take 6 s. */
  next: 'th.next',
  /** Tick the pool was first found empty while soliciting (-1 not empty). */
  empty0: 'th.e0',
  /** 1 while on a guard shift (GDD 02 tend.guard-herd roster), and the tick the shift began. */
  shift: 'th.sh',
  shift0: 'th.sh0',
  /** 1 once the guard released alarm for the current predator. */
  alarm: 'th.al',
  /** Relay: receiver ant id (-1 none) and the donor's crop when the give began. */
  rcv: 'th.rcv',
  c0: 'th.c0',
  /** Relay give progress (GIVE value). */
  give: 'th.give',
  /** 1 after a herd trip was handed to the engine's return: the delivery ends a task cycle. */
  cycle: 'th.cyc',
} as const;

/** Relay give progress: none, a give began (not reported yet), the relay was reported. Values are persisted. */
export const GIVE = { none: 0, started: 1, reported: 2 } as const;

/** Herd sub-states. Values are persisted; append only. */
export const HS = { off: -1, travel: 0, solicit: 1, wait: 2, guard: 3, full: 4 } as const;
export type HerdState = (typeof HS)[keyof typeof HS];

/** State names (GDD 02 §10.3 `tend.*`, GDD 07 §6.1.4 tender states). */
export const HS_NAMES: Record<number, string> = {
  [HS.travel]: 'tend.outbound',
  [HS.solicit]: 'tend.solicit',
  [HS.wait]: 'tend.wait',
  [HS.guard]: 'tend.guard-herd',
  [HS.full]: 'tend.full',
};
