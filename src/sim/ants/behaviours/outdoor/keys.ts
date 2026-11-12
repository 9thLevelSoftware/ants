// ant.bb keys of the outdoor behaviours (numbers only, so save -> load -> continue equals an uninterrupted run).
// One engine (engine.ts) runs scout, forage and tend; its phase is stored here and named per task (flavours.ts).

export const K = {
  /** Current PHASE and the tick it began. */
  phase: 'fo.ph',
  phase0: 'fo.ph0',
  /** Phase to resume after a flee (PHASE value, -1 none). */
  resume: 'fo.res',
  /** Source of this trip, -1 none; trip destination (lead / source / marker position), mm. */
  src: 'fo.src',
  dx: 'fo.dx', dy: 'fo.dy', dz: 'fo.dz',
  /** Forage marker this trip responds to, -1 none. */
  marker: 'fo.mk',
  /** Outbound navigation mode (NAV) and when it was set. */
  nav: 'fo.nav',
  nav0: 'fo.nav0',
  /** Next learned-route waypoint index. */
  wp: 'fo.wp',
  /** Homing mode (HOME). */
  home: 'fo.home',
  /** Tick the ant left the nest (-1 inside). */
  trip0: 'fo.trip0',
  /** 1 when the trip's load counts as successful. */
  success: 'fo.ok',
  /** Food kind index (FOOD_KINDS) of the load. */
  kind: 'fo.kind',
  /** Crop / item nutrients when unloading began, loads; and the tick unloading began. */
  c0: 'fo.c0', p0: 'fo.p0', unload0: 'fo.u0',
  /** Unload step: UNLOAD value. */
  unload: 'fo.ul',
  /** Receiver ant id while unloading (or the donor while begging the ration, or the item put down), -1 none. */
  receiver: 'fo.rcv',
  /** Crop when the current trophallaxis began, loads; and the tick the current receiver was chosen. */
  giveCrop: 'fo.g0',
  /** Tick the departure ration began; 1 when the load being unloaded was a solid item. */
  pick0: 'fo.pk0',
  solid: 'fo.solid',
  /** Tick the current receiver was chosen. */
  rcv0: 'fo.rcv0',
  /** The last receiver that could not be reached (skipped by the next search), -1 none. */
  badRcv: 'fo.badRcv',
  /** Tick the ant first found the stores full this unload (-1 not yet). */
  full0: 'fo.full0',
  /** Queue start tick (-1 none) and 1 if it waited long in a full queue (crowding feedback). */
  queue0: 'fo.q0',
  queuedLong: 'fo.qlong',
  /** Search centre (x, z mm), radius (mm) and spiral angle (rad). */
  sx: 'fo.sx', sz: 'fo.sz', sr: 'fo.sr', sa: 'fo.sa',
  /** Locomotion failures in the current window and the window start tick. */
  stuckN: 'fo.stN', stuck0: 'fo.st0',
  /** 1 while homing because the allocator moved the ant to an in-nest task outside (deliver first). */
  recall: 'fo.recall',
  /** Ration step: 0 not tried, 1 begging, 2 done. */
  ration: 'fo.rat',
  /** 1 once a departure ration was received this bout. */
  rationed: 'fo.ratd',
  /** Route slot holding this trip's candidate route (-1 none) and the visits it gets on a successful delivery. */
  slot: 'fo.slot',
  pendVisits: 'fo.pv',
  /** Flee: cycles done, and the tick the threat was last perceived. */
  fleeN: 'fo.fN',
  fleeSeen: 'fo.fSeen',
  /** Scout: leg heading (rad, 0 = +x) and the tick the explore bout began. */
  heading: 'fo.hd',
  explore0: 'fo.ex0',
  /** Avoid marker the ant is walking out of (GDD 02 §12.2), -1 none. */
  avoidExit: 'fo.avx',
  /** Avoid detours walked on this trip leg. */
  avoidDone: 'fo.avd',
  /** 1 when this trip responds to a trail (outbound dab). */
  onTrail: 'fo.tr',
} as const;

/** Behaviour phases of the outdoor engine. Values are persisted; append only. */
export const PHASE = {
  wait: 0, outbound: 1, search: 2, queue: 3, collect: 4, return: 5, deliver: 6, rest: 7,
  fleeRun: 8, fleeFreeze: 9, depart: 10, explore: 11, investigate: 12, assess: 13,
} as const;
export type Phase = (typeof PHASE)[keyof typeof PHASE];

/** Outbound navigation modes. */
export const NAV = { exit: 0, route: 1, trail: 2, plan: 3, approach: 4 } as const;

/** Homing modes (GDD 02 §9.2: learned route -> breadcrumbs with shortcuts -> planner). */
export const HOME = { route: 0, crumbs: 1, planner: 2, inside: 3 } as const;

/** Unloading steps. */
export const UNLOAD = { toChamber: 0, find: 1, approach: 2, give: 3, put: 4 } as const;
