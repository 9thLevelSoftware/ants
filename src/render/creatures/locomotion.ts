/**
 * Locomotion style and pose of a creature from what the simulation says about it (kind, FSM state, flags, speed,
 * last tick's displacement). Pure: no three, no state. The renderer turns the result into per-instance attributes.
 *
 * Styles: walk (N legs), crawl (undulating / peristaltic), hop (a re-placement drawn as an arc), hover (wings),
 * coiled (rolled, coiled, retracted), dead (subdued prey: legs drawn in, on its back once dead), buried (antlion).
 */
import type { CreatureKind } from '@/sim/types';
import { CreatureFlag } from '@/sim/ecology/creatures/common';
import { CREATURE_STATS } from '@/sim/balance/creatures';
import { HOP } from './tuning';

export type LocoStyle = 'walk' | 'crawl' | 'hop' | 'hover' | 'coiled' | 'dead' | 'buried' | 'still';

export interface CreaturePose {
  style: LocoStyle;
  /** speed / walk speed, 0..1.5 */
  moving: number;
  curl: number;
  fold: number;
  crouch: number;
  flap: number;
  /** Jaws open / soft body retracted, 0..1. */
  act: number;
  /** Turned on its back (dead). */
  flip: boolean;
  /** Height of the hop arc above the straight path at this alpha, mm. */
  arcMm: number;
}

export function newPose(): CreaturePose {
  return { style: 'still', moving: 0, curl: 0, fold: 0, crouch: 0, flap: 0, act: 0, flip: false, arcMm: 0 };
}

/** Kinds that move by body waves rather than legs. */
const CRAWLERS: ReadonlySet<CreatureKind> = new Set(['earthworm', 'fly-larva', 'caterpillar', 'snail']);
/** States that are a strike wind-up (GDD 05 §2.4 telegraphs). */
const WINDUP = new Set(['windup']);
/** States in which a predator holds or eats (jaws working, no walking). */
const HOLDING = new Set(['hold', 'feed', 'drag', 'collect', 'carry']);

export interface PoseInput {
  kind: CreatureKind;
  state: string;
  flags: number;
  speed: number;
  stepMm: number;
  hp: number;
  alpha: number;
  /** Real seconds (jaw rhythm). */
  time: number;
  seed: number;
}

// Module-local copies of the imported tables (Vite's SSR runner, used by tests and tools, reads every imported
// binding through a getter; the browser build is unaffected).
const STATS = CREATURE_STATS, FLAG = { ...CreatureFlag }, HOP_T = { ...HOP };

/** Fills `out` for one creature. */
export function creaturePose(i: PoseInput, out: CreaturePose): CreaturePose {
  const st = STATS[i.kind];
  const walk = Math.max(0.1, st.walkMmS);
  out.moving = Math.min(1.5, Math.max(0, i.speed / walk));
  out.curl = 0; out.fold = 0; out.crouch = 0; out.flap = 0; out.act = 0; out.flip = false; out.arcMm = 0;
  out.style = CRAWLERS.has(i.kind) ? 'crawl' : 'walk';
  const f = i.flags;

  if (i.kind === 'antlion') {
    out.style = 'buried';
    const busy = i.state === 'drag' || i.state === 'feed';
    // jaws held wide while waiting; snapping while dragging or feeding
    out.act = (f & FLAG.DORMANT) ? 0.3 : busy ? 0.5 + 0.5 * Math.sin(i.time * 9 + i.seed * 6) : 0.9;
    out.moving = 0;
    return out;
  }
  if (i.hp <= 0) { out.style = 'dead'; out.fold = 1; out.flip = true; out.moving = 0; return out; }
  if (f & FLAG.SUBDUED || i.state === 'subdued' || i.state === 'dying') {
    out.style = 'dead'; out.fold = i.state === 'dying' ? 0.4 : 0.85; out.moving = 0;
    if (CRAWLERS.has(i.kind)) { out.curl = 0.35; out.fold = 0; }
    return out;
  }
  if (f & FLAG.CURLED) {
    out.style = 'coiled'; out.moving = 0;
    if (i.kind === 'snail') out.act = 1; else out.curl = 1;
    out.fold = i.kind === 'snail' ? 0 : 0.6;
    return out;
  }
  if (f & FLAG.FLYING) { out.style = 'hover'; out.flap = 1; out.moving = 0; return out; }
  if (f & FLAG.ON_SILK) { out.style = 'still'; out.curl = 0.25; out.moving = 0; return out; }

  // a displacement much larger than walking allows is a hop / leap / flick: draw it as an arc
  const hopMin = HOP_T.minWalkTicks * st.walkMmS * 0.1 + HOP_T.minBodyLengths * st.sizeMm;
  if (i.stepMm > hopMin) {
    out.style = 'hop';
    const a = Math.min(1, Math.max(0, i.alpha));
    out.arcMm = HOP_T.heightPerMm * i.stepMm * 4 * a * (1 - a);
    out.fold = 0.5;
    return out;
  }
  if (WINDUP.has(i.state)) { out.crouch = 1; out.moving = 0; return out; }
  if (HOLDING.has(i.state)) { out.act = 0.5 + 0.5 * Math.sin(i.time * 5 + i.seed * 7); out.moving = Math.min(out.moving, 0.3); }
  if (i.kind === 'snail' && i.state === 'cover') out.act = 0.6;
  if (out.moving < 0.02 && out.style === 'walk') out.style = 'still';
  return out;
}
