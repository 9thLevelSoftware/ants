/**
 * Render pose targets for the sim's `pose.*` ids (GDD 01 §7.3; Ant.pose is an index into POSES). The renderer
 * blends each ant's current values toward its target over ~110 ms (GDD 08 §11.9) and layers the gait on top.
 * Unknown ids fall back to `walk`.
 */
export interface PoseTarget {
  /** Head raised (carrying, giving food) 0..1. */
  raise: number;
  /** Gaster -1 curled under (spray, sting, lay) .. +1 raised (alarm display). */
  gaster: number;
  /** Mandible gape 0..1. */
  gape: number;
  /** Extra head pitch, rad (+ down: digging, feeding). */
  pitch: number;
  /** Forced foreleg grooming 0..1. */
  groom: number;
  /** Rhythmic mandible work (digging, tearing, milling) 0..1. */
  chew: number;
  /** Legs splayed (falling) 0..1. */
  spread: number;
  /** Antenna activity: 0 calm, 1 normal, 2 fast (searching, antennating, alarm). */
  antenna: number;
}

export const POSE_FIELDS = ['raise', 'gaster', 'gape', 'pitch', 'groom', 'chew', 'spread', 'antenna'] as const;
export const NEUTRAL_POSE: Readonly<PoseTarget> = { raise: 0, gaster: 0, gape: 0, pitch: 0, groom: 0, chew: 0, spread: 0, antenna: 1 };

const P = (o: Partial<PoseTarget>): PoseTarget => ({ ...NEUTRAL_POSE, ...o });

/** Keyed by the POSES ids of src/sim/types/ids/ants.ts. */
export const POSE_TARGETS: Record<string, PoseTarget> = {
  walk: P({}), hurry: P({ antenna: 1.5 }), fall: P({ spread: 1, antenna: 1.6 }), grip: P({ pitch: 0.12 }),
  pick: P({ pitch: 0.35, gape: 0.5 }), place: P({ pitch: 0.3, gape: 0.5 }), release: P({ gape: 0.6 }),
  dig: P({ pitch: 0.45, chew: 1, gape: 0.35 }), tamp: P({ pitch: 0.35, chew: 0.5 }), lay: P({ gaster: -0.7, antenna: 0.5 }),
  feed: P({ pitch: 0.3, gape: 0.5 }), 'troph-give': P({ raise: 0.5, gape: 0.6, antenna: 0.7 }),
  'troph-beg': P({ pitch: 0.1, gape: 0.3, antenna: 2 }), 'groom-self': P({ groom: 1, pitch: 0.2, antenna: 0.4 }),
  'groom-other': P({ pitch: 0.3, chew: 0.3, antenna: 0.6 }), antennate: P({ pitch: 0.1, antenna: 2 }),
  sniff: P({ pitch: 0.2, antenna: 1.8 }), 'trail-dab': P({ gaster: -0.25 }), drink: P({ pitch: 0.35, gape: 0.3, antenna: 0.5 }),
  tear: P({ pitch: 0.3, chew: 1, gape: 0.7 }), stroke: P({ pitch: 0.15, antenna: 2 }), bite: P({ pitch: 0.2, gape: 1 }),
  hold: P({ pitch: 0.15, gape: 0.25 }), spray: P({ gaster: -1, raise: 0.2, gape: 0.8, antenna: 1.8 }),
  sting: P({ gaster: -0.8, gape: 0.8, antenna: 1.8 }), alarm: P({ gaster: 1, raise: 0.45, gape: 1, antenna: 2 }),
  drag: P({ pitch: 0.3, gape: 0.3 }), fly: P({ spread: 0.6, antenna: 1.2 }), dealate: P({ groom: 1, gaster: -0.2 }), mate: P({}),
  cut: P({ pitch: 0.25, chew: 1, gape: 0.6 }), stridulate: P({ gaster: 0.3, antenna: 1.5 }), mill: P({ pitch: 0.1, chew: 1, gape: 0.5 }),
  gnaw: P({ pitch: 0.4, chew: 1 }), 'tend-fungus': P({ pitch: 0.35, chew: 0.4 }), flick: P({ gaster: -0.3 }),
  block: P({ pitch: 0.5 }), ride: P({ raise: 0.3, antenna: 0.6 }),
};

/** Target for a pose id (unknown -> walk). */
export function poseTarget(id: string | undefined): PoseTarget {
  return (id !== undefined && POSE_TARGETS[id]) || POSE_TARGETS.walk!;
}

export function copyPose(src: PoseTarget, out: PoseTarget): PoseTarget {
  out.raise = src.raise; out.gaster = src.gaster; out.gape = src.gape; out.pitch = src.pitch;
  out.groom = src.groom; out.chew = src.chew; out.spread = src.spread; out.antenna = src.antenna;
  return out;
}

/** Carry adds its own head raise and gape (from the carried item's definition); takes the larger of each. */
export function withCarry(base: PoseTarget, raise: number, gape: number, out: PoseTarget): PoseTarget {
  copyPose(base, out);
  out.raise = Math.max(base.raise, raise);
  out.gape = Math.max(base.gape, gape);
  return out;
}

/** Alarm display blended over any pose (formicines raise the gaster; myrmicines do too in display). */
export function withAlarm(p: PoseTarget, level: number): PoseTarget {
  const a = Math.min(1, Math.max(0, level));
  if (a <= 0) return p;
  const al = POSE_TARGETS.alarm!;
  if (p.gaster >= 0) p.gaster = p.gaster + (al.gaster - p.gaster) * a;
  p.gape = Math.max(p.gape, al.gape * a);
  p.antenna = Math.max(p.antenna, 1 + a);
  return p;
}
