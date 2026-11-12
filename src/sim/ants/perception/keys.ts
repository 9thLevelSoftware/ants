// The percept of an ant (GDD 02 §7), kept in ant.bb under these keys so it is plain persisted data: a save
// taken between two perception passes restores the same percept, and behaviours stay deterministic.
//
// Values are ids (-1 = none), distances in mm, pheromone in ph, counts, and the tick of the pass.

export const PC = {
  /** Tick of the last perception pass (-1 never). */
  tick: 'pc.t',
  /** Source in contact (antennae / mandibles on its footprint), -1 none. */
  touch: 'pc.touch',
  /** Strongest food odour in smell range: source id, -1 none; and its distance, mm. */
  smell: 'pc.smell',
  smellD: 'pc.smellD',
  /** Antennal contacts this pass: nestmates and non-nestmates within CONTACT_DIST in the front cone. */
  mates: 'pc.mates',
  aliens: 'pc.aliens',
  /** Own colony trail (max of the two antenna samples), home at the body, shared alarm at the body, ph. */
  trail: 'pc.trail',
  home: 'pc.home',
  alarm: 'pc.alarm',
  /** Own forage marker containing the ant, -1 none; nearest own avoid marker within its radius + lookahead, -1 none. */
  forageMarker: 'pc.fmk',
  avoidMarker: 'pc.amk',
  /** Threat: THREAT code, and the point the danger comes from (x, z, mm). */
  threat: 'pc.threat',
  threatX: 'pc.tx',
  threatZ: 'pc.tz',
  /** Human event: unit direction (x, z) the pass approaches along, from its earlier cue to this one; 0, 0 unknown. */
  threatDx: 'pc.tdx',
  threatDz: 'pc.tdz',
  /** Nearest open entrance of the ant's colony, -1 none; and its distance, mm. */
  entrance: 'pc.ent',
  entranceD: 'pc.entD',
} as const;

/** Threat codes stored in PC.threat. */
export const THREAT = { none: 0, alarm: 1, human: 2, creature: 3 } as const;
export type ThreatCode = (typeof THREAT)[keyof typeof THREAT];
