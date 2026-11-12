// Persisted nursery job board of a colony (GDD 02 §10.4: "rebuilt every 2 s"). Owned by the in-nest behaviours
// (src/sim/ants/behaviours/nest/board.ts). It is state, not a derived cache, because a board built at the start of
// a 2 s window cannot be rebuilt from a later state: a game loaded in mid-window must see the same board as the
// uninterrupted run. Claims are not part of it (they live in the claimants' ant.bb). Additive (sim-fix-ants).

/** One job of the board. */
export interface NurseryJobState {
  /** Job kind index (board.ts `Job`). */
  kind: number;
  /** Brood id. */
  id: number;
  /** Destination chamber of carry jobs, -1 otherwise. */
  dest: number;
  /** Priority (GDD 02 §10.4 table). */
  prio: number;
  nestId: number;
  /** 1 = decided by a move-brood marker (reason `marker:move-brood`). */
  marker: number;
  /** 1 = a hungry larva carried first and fed at the destination. */
  feedAfter: number;
}

/** Brood sorting context of one nest at the board build (GDD 02 §10.4.1). */
export interface NurserySortState {
  nestId: number;
  /** The nest's chamber ids at the build, in nest order (a changed list makes the board stale). */
  chamberIds: number[];
  /** scores[group][i] for chamberIds[i]. */
  scores: number[][];
  /** Index into chamberIds of the best chamber per brood group, -1 none. */
  best: number[];
  /** Live move-brood marker of the colony for this nest at the build, -1 none. */
  markerId: number;
}

export interface NurseryBoardState {
  colonyId: number;
  /** Tick of the build; the board is rebuilt on the first read in a later 2 s window. */
  builtTick: number;
  jobs: NurseryJobState[];
  sort: NurserySortState[];
}
