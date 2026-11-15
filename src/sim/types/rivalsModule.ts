// Bookkeeping of the rivals module (GDD 05 §3) that the frozen records (RivalAbstract, RivalRelation) do not hold.
// Lives in SimState.rivals.module, created by the rivals module on first use. Plain data. Additive (rivals).

/** Per rival colony: setup, fielding clocks, deliveries, territory size, discovery and life-cycle marks. */
export interface RivalColonyExt {
  colonyId: number;
  /** The real nest (carve, queens, display brood) was built on the first rivals tick. */
  setupDone: boolean;
  /** Real deliveries of returning agents in the current / the last clock hour, loads. */
  hourC: number;
  hourP: number;
  lastHourC: number;
  lastHourP: number;
  /** Claimed territory cells at the last hourly scan. */
  claimedCells: number;
  /** Next tick an agent may emerge (surface agents) / a defender may spawn in the deepest chamber. */
  emergeReadyTick: number;
  defenderReadyTick: number;
  /** Reinforcements still to send and the place to send them (GDD 05 §3.3), mm. */
  reinforceLeft: number;
  reinforceX: number;
  reinforceY: number;
  reinforceZ: number;
  /** Tick the reinforcement call started, -1 none. */
  reinforceTick: number;
  /** Year whose winter loss was applied (GDD 05 §3.2 winter rule), 0 none. */
  winterYear: number;
  /** Bitmask of territory slots whose colonies have discovered this colony (`rival-discovered` once each). */
  discoveredBy: number;
  /** Incipient colony: tick its first workers appear (12 abstract brood mature at once), -1 done. */
  firstWorkersTick: number;
  /** Tick the queen dies of abandonment (all workers and brood lost, GDD 05 §3.8), -1 none. */
  abandonTick: number;
  /** Tick this colony last suffered a brood raid, -1 never. */
  broodRaidedTick: number;
  /** Tick it was destroyed, -1 alive. */
  destroyedTick: number;
}

/** Per colony pair (a < b): escalation bookkeeping for war fronts and truce (GDD 05 §3.7). */
export interface RivalRelationExt {
  a: number;
  b: number;
  /** Contested cells between the pair at the last hourly scan. */
  contested: number;
  /** Claimed cells of a and b when the claim last changed. */
  claimA: number;
  claimB: number;
  /** Tick the claim balance between the pair last changed (war staleness), -1 never. */
  claimChangeTick: number;
}

/** A raid in progress (rival or player attacker; GDD 05 §3.7, §3.8). */
export interface RaidRecord {
  id: number;
  attacker: number;
  target: number;
  /** 'raid' (mature, war), 'brood' (incipient brood raid), 'predatory' (Formica), 'dig' (founding chamber). */
  kind: 'raid' | 'brood' | 'predatory' | 'dig';
  /** Nest attacked. */
  targetNestId: number;
  /** Agents still to send, and the ids sent. */
  toSend: number;
  partyIds: number[];
  /** Largest party size reached (end rule: party <= 30 % of it). */
  startSize: number;
  startTick: number;
  /** Brood items or corpses carried off so far. */
  loot: number;
  /** The party has gathered at the target entrance and goes in together. */
  gathered: boolean;
  /** Ending: agents are on their way home. */
  ending: boolean;
  /** Holds the threat director's major-threat slot (raids on the player). */
  majorThreat: boolean;
}

export interface RivalsModuleState {
  colonies: RivalColonyExt[];
  relations: RivalRelationExt[];
  raids: RaidRecord[];
  nextRaidId: number;
  /** Bitmask of territory slots whose nests the player colony knows (rivals keep theirs in RivalAbstract). */
  playerKnowsNest: number;
  /** 1 when it rained at the last territory update (rain-event start halves exposed marks once). */
  wasRaining: number;
  /** Brood ids already counted as stolen while a foreign carrier holds them (pruned once put down or gone). */
  stolenBrood: number[];
  /** Nest ids left by destroyed colonies (explorable; sites for new foundations). */
  abandonedNests: number[];
  /** Last default-year day the new-foundation roll ran, -1 never. */
  lastFoundingRollDay: number;
  /** `raid-seen` / `nest-attacked` (ants) alert bookkeeping: raised flags and the tick the condition last held. */
  raidSeenOn: number;
  raidSeenTick: number;
  nestAttackedOn: number;
  nestAttackedTick: number;
}
