// Access to the rivals module's plain-data state: SimState.rivals.module (created on first use), per-colony and
// per-pair records, territory slots, and the ant.bb keys of rival agents. Light: imports types and balance only.

import type {
  Ant, Colony, RivalAbstract, RivalColonyExt, RivalRelationExt, RivalsModuleState, SimState, SimStores,
} from '@/sim/types';

/** What these helpers need: a Sim or an entity context. */
export interface StateCtx { state: SimState; stores: SimStores }

export function rmod(state: SimState): RivalsModuleState {
  const r = state.rivals;
  if (!r.module) {
    r.module = {
      colonies: [], relations: [], raids: [], nextRaidId: 1, playerKnowsNest: 0, wasRaining: 0, stolenBrood: [], abandonedNests: [],
      lastFoundingRollDay: -1, raidSeenOn: 0, raidSeenTick: -1, nestAttackedOn: 0, nestAttackedTick: -1,
    };
  }
  return r.module;
}

export function newColonyExt(colonyId: number): RivalColonyExt {
  return {
    colonyId, setupDone: false, hourC: 0, hourP: 0, lastHourC: 0, lastHourP: 0, claimedCells: 0, emergeReadyTick: 0,
    defenderReadyTick: 0, reinforceLeft: 0, reinforceX: 0, reinforceY: 0, reinforceZ: 0, reinforceTick: -1, winterYear: 0,
    discoveredBy: 0, firstWorkersTick: -1, abandonTick: -1, broodRaidedTick: -1, destroyedTick: -1,
  };
}

/** The colony's record (created when missing). */
export function colExt(state: SimState, colonyId: number): RivalColonyExt {
  const m = rmod(state);
  let e = m.colonies.find((c) => c.colonyId === colonyId);
  if (!e) { e = newColonyExt(colonyId); m.colonies.push(e); }
  return e;
}

/** Unordered pair key order. */
export function pairOf(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

export function relExt(state: SimState, a: number, b: number): RivalRelationExt {
  const [x, y] = pairOf(a, b);
  const m = rmod(state);
  let e = m.relations.find((r) => r.a === x && r.b === y);
  if (!e) { e = { a: x, b: y, contested: 0, claimA: 0, claimB: 0, claimChangeTick: -1 }; m.relations.push(e); }
  return e;
}

// ---- territory slots (slot 0 = player) ----

export function slotOf(state: SimState, colonyId: number): number {
  return state.rivals.territory.slotColony.indexOf(colonyId);
}

/** Gives the colony a territory slot (a free one, else the one of a dead colony); -1 when all are taken. */
export function assignSlot(ctx: StateCtx, colonyId: number): number {
  const t = ctx.state.rivals.territory;
  const have = t.slotColony.indexOf(colonyId);
  if (have >= 0) return have;
  let s = t.slotColony.findIndex((c, i) => i > 0 && c < 0);
  if (s < 0) s = t.slotColony.findIndex((c, i) => i > 0 && !ctx.stores.colonies.get(c));
  if (s < 0) return -1;
  t.slotColony[s] = colonyId;
  if (t.marks.length === t.w * t.h * t.slots) for (let c = 0; c < t.w * t.h; c++) t.marks[c * t.slots + s] = 0;
  return s;
}

/** Whether assignSlot would find a slot for a new colony. */
export function hasFreeSlot(ctx: StateCtx): boolean {
  return ctx.state.rivals.territory.slotColony.some((c, i) => i > 0 && (c < 0 || !ctx.stores.colonies.get(c)));
}

/** Bit of a colony's territory slot (0 when it has none). */
export function slotBit(state: SimState, colonyId: number): number {
  const s = slotOf(state, colonyId);
  return s >= 0 ? 1 << s : 0;
}

// ---- colonies ----

/** A living rival colony with its abstract model. */
export type RivalColony = Colony & { rival: RivalAbstract };

export function isRival(c: Colony | undefined): c is RivalColony {
  return !!c && c.alive && c.rival !== null;
}

/** Living rival colonies in state order. */
export function rivalColonies(ctx: StateCtx): RivalColony[] {
  const out: RivalColony[] = [];
  for (const c of ctx.stores.colonies.list) if (isRival(c)) out.push(c);
  return out;
}

/** The player colony (colonies[0]) when alive. */
export function playerColonyOf(ctx: StateCtx): Colony | undefined {
  const c = ctx.state.colonies[0];
  return c && c.alive ? c : undefined;
}

// ---- rival agents: ant.bb keys and jobs (task `raid`) ----

export const BB = {
  job: 'rv.job',
  /** Tick the job started. */
  t0: 'rv.t0',
  /** Job target point, mm. */
  tx: 'rv.tx', ty: 'rv.ty', tz: 'rv.tz',
  /** Job target entity id (raid record, chamber, ant). */
  tid: 'rv.tid',
  /** Raid record id, -1 none. */
  raid: 'rv.raid',
  /** Sub-step of the job. */
  step: 'rv.st',
  /** 1 once the current leg was requested from locomotion. */
  go: 'rv.go',
  /** Virtual load carried home (forage), loads. */
  loadC: 'rv.lc', loadP: 'rv.lp',
  /** Display ritual ends at this tick; the encounter partner. */
  displayUntil: 'rv.dsp', displayWith: 'rv.dw',
  /** Tick the agent last entered a fight (escalation counting). */
  fightTick: 'rv.ft',
  /** Aftermath: dies at this tick. */
  dieTick: 'rv.die',
  /** Last tick the agent made progress toward home (lost-agent absorb). */
  homeTick: 'rv.ht',
  /** Prefix of per-partner recognition marks: `rvs.<antId>` = tick (own prefix: pruned by age). */
  seen: 'rvs.',
} as const;

export const JOB = {
  emerge: 0, forage: 1, patrol: 2, guard: 3, defend: 4, raid: 5, ret: 6, war: 7, queen: 8, wander: 9, brood: 10, escort: 11, dig: 12,
} as const;
export type JobCode = (typeof JOB)[keyof typeof JOB];
export const JOB_NAMES: readonly string[] = ['emerge', 'forage', 'patrol', 'guard', 'defend', 'raid', 'return', 'war', 'queen', 'wander', 'brood', 'escort', 'dig'];

export function jobOf(ant: Ant): JobCode {
  return (ant.bb[BB.job] ?? JOB.emerge) as JobCode;
}

/** Fielding priority of a job: 0 defenders > 1 raid > 2 war > 3 guards > 4 foragers / patrols; queens -1. */
export function priorityOf(job: JobCode): number {
  switch (job) {
    case JOB.defend: case JOB.escort: case JOB.dig: return 0;
    case JOB.raid: case JOB.brood: return 1;
    case JOB.war: return 2;
    case JOB.guard: return 3;
    case JOB.queen: return -1;
    default: return 4;
  }
}
