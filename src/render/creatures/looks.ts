/**
 * The look table: for every creature kind (and variant, and comfort substitute) the geometry builder, the
 * animation uniforms and the material numbers. `lookKeyFor` picks the look of one creature; comfort mode swaps the
 * look only (GDD 05 §2.1: behaviour, hit volumes and sounds are the sim's and do not change).
 */
import type { CreatureKind } from '@/sim/types';
import { CREATURE_STATS, CATERPILLAR_MEDIUM } from '@/sim/balance/creatures';
import type { MotionUniforms } from './shader/materials';
import type { BuildFn } from './geometry/types';
import {
  buildAphid, buildFly, buildLacewingLarva, buildLadybird, buildLadybirdLarva, buildRoveBeetle, buildScaleInsect, buildSpringtail, FRUIT_FLY, PHORID_FLY,
} from './geometry/hexapods';
import { ANT_SPIDER, JUMPING_SPIDER, WOLF_SPIDER, buildMite, buildSpider } from './geometry/arachnids';
import { buildAntlion, buildCaterpillar, buildEarthworm, buildFlyLarva, buildSnail, snailAperture } from './geometry/softBodies';
import { buildCentipede, buildMillipede, buildWoodlouse } from './geometry/myriapods';
import { OVOID_SIZES, buildOvoid } from './geometry/comfortBodies';

export type ComfortLevel = 'off' | 'softened' | 'abstract' | 'marker';
export const COMFORT_LEVELS: readonly ComfortLevel[] = ['off', 'softened', 'abstract', 'marker'];

/** The settings store's accessibility fields this renderer reads (src/game/settings/model.ts, structurally). */
export interface ComfortSettingsLike { spiderComfort: ComfortLevel; comfortMites: boolean; comfortCentipedes: boolean }

export const SPIDER_KINDS: ReadonlySet<CreatureKind> = new Set(['jumping-spider', 'wolf-spider', 'ant-spider']);

/** Comfort level that applies to a kind: spiders always, mites and centipedes only when opted in (GDD 08 §12). */
export function comfortFor(kind: CreatureKind, s: ComfortSettingsLike): ComfortLevel {
  if (SPIDER_KINDS.has(kind)) return s.spiderComfort;
  if (kind === 'mite' && s.comfortMites) return s.spiderComfort;
  if (kind === 'centipede' && s.comfortCentipedes) return s.spiderComfort;
  return 'off';
}

export interface LookDef {
  /** Nominal length the geometry is built at (mm). */
  sizeMm: number;
  build: BuildFn;
  motion: MotionUniforms;
  roughness: number;
  /** mm travelled per gait / wave cycle. */
  strideMm: number;
  wingOpacity?: number;
  /** Drawn after the pit punch (antlion lies below the ground plane). */
  renderOrder?: number;
  /** Leg amplitude multiplier (comfort softened: 0.5). */
  legAmp?: number;
  /** Ring + label (abstract keeps a ring, GDD 08 §12). */
  ring?: boolean;
  /** Spider-like (for tests and stats: never drawn in abstract or marker comfort). */
  spiderLike?: boolean;
}

type M = MotionUniforms;
const motion = (leg: M['leg'], wave: M['wave'], body: M['body'], misc: M['misc'], retract: M['retract'] = [0, 0, 0, 0]): M => ({ leg, wave, body, misc, retract });
const NO_WAVE: M['wave'] = [0, 0, 0, 0];
const size = (k: CreatureKind) => CREATURE_STATS[k].sizeMm;

const SNAIL_RETRACT = snailAperture();

function spider(kind: CreatureKind, look: typeof JUMPING_SPIDER, softened: boolean, leg: M['leg'], stride: number, rough: number): LookDef {
  return {
    sizeMm: size(kind), build: buildSpider(look, softened), strideMm: stride, roughness: softened ? Math.max(0.5, rough - 0.2) : rough,
    motion: motion(leg, NO_WAVE, [size(kind), 1, 0, 0], [0, 0.25, 0.25, 0]), legAmp: softened ? 0.5 : 1, spiderLike: true,
  };
}

function ovoid(kind: CreatureKind): LookDef {
  const s = OVOID_SIZES[kind]!;
  return { sizeMm: s.length, build: buildOvoid(s), strideMm: 1, roughness: 0.6, motion: motion([0, 0, 0, 0], NO_WAVE, [s.length, s.halfHeight, 0, 0], [0, 0, 0, 0.35]), ring: true };
}

export const LOOKS: Record<string, LookDef> = {
  /** Herd member of a T3 scale herd (GDD 05 §1.1 `scale-herd`): drawn by the herd layer like aphids. */
  'scale-insect': { sizeMm: 2.2, build: buildScaleInsect, strideMm: 1, roughness: 0.5, motion: motion([0, 0, 0, 0], NO_WAVE, [2.2, 0.2, 0, 0], [0, 0, 0, 0]) },
  aphid: { sizeMm: 2, build: buildAphid, strideMm: 0.6, roughness: 0.45, motion: motion([0.15, 0.1, 0.06, 0], NO_WAVE, [2, 0.6, 0, 0], [0, 0, 0, 0]) },
  ladybird: { sizeMm: size('ladybird'), build: buildLadybird, strideMm: 1.6, roughness: 0.2, wingOpacity: 0.45, motion: motion([0.45, 0.25, 0.05, 0], NO_WAVE, [6.5, 1.2, 0, 0], [22, 0, 0, 0]) },
  'ladybird-larva': { sizeMm: size('ladybird-larva'), build: buildLadybirdLarva, strideMm: 2, roughness: 0.6, motion: motion([0.5, 0.4, 0.05, 0], [0.12, 0, 0, 8], [8, 0.9, 3, 1.2], [0, 0, 0, 0]) },
  'lacewing-larva': { sizeMm: size('lacewing-larva'), build: buildLacewingLarva, strideMm: 1.8, roughness: 0.65, motion: motion([0.5, 0.35, 0.05, 0], [0.1, 0, 0, 7], [7, 0.6, 3, 1.0], [0, 0.5, 0, 0]) },
  springtail: { sizeMm: size('springtail'), build: buildSpringtail, strideMm: 0.5, roughness: 0.6, motion: motion([0.5, 0.12, 0.08, 0], NO_WAVE, [1.5, 0.3, 0, 0], [0, 0, 0, 0]) },
  mite: { sizeMm: size('mite'), build: buildMite, strideMm: 0.15, roughness: 0.25, spiderLike: true, motion: motion([0.6, 0.06, 0.1, 0], NO_WAVE, [0.5, 0.17, 0, 0], [0, 0, 0, 0]) },
  'fly-larva': { sizeMm: size('fly-larva'), build: buildFlyLarva, strideMm: 3, roughness: 0.4, motion: motion([0, 0, 0, 0], [0.3, 0.12, 0, -4], [8, 1.0, 3, 1.4], [0, 0, 0, 0]) },
  caterpillar: { sizeMm: size('caterpillar'), build: buildCaterpillar(false), strideMm: 2.5, roughness: 0.55, motion: motion([0.3, 0.1, 0.03, 0], [0.05, 0.05, 0.6, 4.5], [9.4, 0.95, 3, 2.2], [0, 0, 0, 0]) },
  'caterpillar-hairy': { sizeMm: size('caterpillar'), build: buildCaterpillar(true), strideMm: 2.5, roughness: 0.75, motion: motion([0.3, 0.1, 0.03, 0], [0.05, 0.05, 0.6, 4.5], [9.4, 0.95, 3, 2.2], [0, 0, 0, 0]) },
  'fruit-fly': { sizeMm: size('fruit-fly'), build: buildFly(FRUIT_FLY), strideMm: 0.7, roughness: 0.4, wingOpacity: 0.3, motion: motion([0.5, 0.12, 0.05, 0], NO_WAVE, [2.5, 0.7, 0, 0], [28, 0, 0, 0]) },
  'phorid-fly': { sizeMm: size('phorid-fly'), build: buildFly(PHORID_FLY), strideMm: 0.7, roughness: 0.4, wingOpacity: 0.3, motion: motion([0.5, 0.12, 0.05, 0], NO_WAVE, [2.5, 0.7, 0, 0], [30, 0, 0, 0]) },
  woodlouse: { sizeMm: size('woodlouse'), build: buildWoodlouse, strideMm: 2, roughness: 0.55, motion: motion([0.55, 0.25, 0.05, 0], NO_WAVE, [10, 0.9, 1, Math.PI * 2 * 0.92], [0, 0, 0, 0]) },
  earthworm: { sizeMm: size('earthworm'), build: buildEarthworm, strideMm: 12, roughness: 0.3, motion: motion([0, 0, 0, 0], [1.2, 0.12, 0, -18], [100, 1.9, 3, 1.6], [0, 0, 0, 0]) },
  snail: { sizeMm: size('snail'), build: buildSnail, strideMm: 6, roughness: 0.35, motion: motion([0, 0, 0, 0], [0, 0.03, 0, 6], [28, 1.5, 0, 0], [0, 0, 0, 0], [SNAIL_RETRACT[0], SNAIL_RETRACT[1], SNAIL_RETRACT[2], 0]) },
  millipede: { sizeMm: size('millipede'), build: buildMillipede, strideMm: 1, roughness: 0.28, motion: motion([0.4, 0.15, 0.05, 0], [0.25, 0, 0, 12], [30, 1.55, 2, 0], [0, 0, 0, 0], [0, 0, 0, 2.9]) },
  'jumping-spider': spider('jumping-spider', JUMPING_SPIDER, false, [0.45, 0.45, 0.06, 0], 2.2, 0.75),
  'wolf-spider': spider('wolf-spider', WOLF_SPIDER, false, [0.45, 0.8, 0.04, 0], 5, 0.8),
  'ant-spider': spider('ant-spider', ANT_SPIDER, false, [0.5, 0.25, 0.06, 0], 1.2, 0.35),
  'jumping-spider-softened': spider('jumping-spider', JUMPING_SPIDER, true, [0.45, 0.45, 0.06, 0], 2.2, 0.75),
  'wolf-spider-softened': spider('wolf-spider', WOLF_SPIDER, true, [0.45, 0.8, 0.04, 0], 5, 0.8),
  'ant-spider-softened': spider('ant-spider', ANT_SPIDER, true, [0.5, 0.25, 0.06, 0], 1.2, 0.35),
  antlion: { sizeMm: size('antlion'), build: buildAntlion, strideMm: 1, roughness: 0.85, renderOrder: 3, motion: motion([0.2, 0.1, 0.03, 0], NO_WAVE, [10, 1.4, 0, 0], [0, 0.9, 0, 0]) },
  centipede: { sizeMm: size('centipede'), build: buildCentipede, strideMm: 2.5, roughness: 0.4, motion: motion([0.5, 0.35, 0.04, 0], [0.5, 0, 0, 10], [20, 0.75, 3, 1.5], [0, 0.35, 0.15, 0]) },
  'rove-beetle': { sizeMm: size('rove-beetle'), build: buildRoveBeetle, strideMm: 1.5, roughness: 0.25, motion: motion([0.5, 0.3, 0.05, 0], NO_WAVE, [5, 0.5, 0, 0], [0, 0.4, 0.1, 0]) },
  'jumping-spider-abstract': ovoid('jumping-spider'),
  'wolf-spider-abstract': ovoid('wolf-spider'),
  'ant-spider-abstract': ovoid('ant-spider'),
  'mite-abstract': ovoid('mite'),
  'centipede-abstract': ovoid('centipede'),
  'mite-softened': { sizeMm: size('mite'), build: buildMite, strideMm: 0.15, roughness: 0.4, legAmp: 0.5, motion: motion([0.6, 0.06, 0.1, 0], NO_WAVE, [0.5, 0.17, 0, 0], [0, 0, 0, 0]) },
  'centipede-softened': { sizeMm: size('centipede'), build: buildCentipede, strideMm: 2.5, roughness: 0.5, legAmp: 0.5, motion: motion([0.5, 0.35, 0.04, 0], [0.25, 0, 0, 10], [20, 0.75, 3, 1.5], [0, 0.35, 0.15, 0]) },
};

/** Caterpillar flag bit for the hairy variant (CreatureFlag.HAIRY in the sim). */
export const HAIRY_FLAG = 1 << 6;

/** Every look key, in a fixed order: a look's id is its index here (per-frame code works on ids, not strings). */
export const LOOK_KEYS: readonly string[] = Object.keys(LOOKS);
const LOOK_IDS = new Map(LOOK_KEYS.map((k, i) => [k, i]));
/** Look id of a key, -1 for null or an unknown key. */
export function lookIdOf(key: string | null): number { return key === null ? -1 : LOOK_IDS.get(key) ?? -1; }

const LEVEL_INDEX: Record<ComfortLevel, number> = { off: 0, softened: 1, abstract: 2, marker: 3 };

/** Per kind: look id by (comfort level index x 2 + hairy); built on first use. */
const ID_TABLE = new Map<CreatureKind, Int16Array>();

/** Look id of one creature (lookKeyFor as an id, through a small per-kind table), -1 when it draws no body. */
export function lookIdFor(kind: CreatureKind, variant: string | null, flags: number, level: ComfortLevel): number {
  let t = ID_TABLE.get(kind);
  if (!t) {
    t = new Int16Array(COMFORT_LEVELS.length * 2);
    COMFORT_LEVELS.forEach((lv, li) => {
      t![li * 2] = lookIdOf(lookKeyFor(kind, null, 0, lv));
      t![li * 2 + 1] = lookIdOf(lookKeyFor(kind, 'hairy', HAIRY_FLAG, lv));
    });
    ID_TABLE.set(kind, t);
  }
  const hairy = variant === 'hairy' || (flags & HAIRY_FLAG) !== 0 ? 1 : 0;
  return t[LEVEL_INDEX[level] * 2 + hairy]!;
}

/** Scale of the drawn mesh relative to the look's nominal size (the medium caterpillar is the small one x 2.2). */
export function lookScale(kind: CreatureKind, variant: string | null): number {
  if (kind === 'caterpillar' && variant === 'medium') return CATERPILLAR_MEDIUM.sizeMm / CREATURE_STATS.caterpillar.sizeMm;
  return 1;
}

/**
 * Look key of one creature, or null when it draws no body (comfort `marker`; the bird event and aphids are drawn
 * elsewhere).
 */
export function lookKeyFor(kind: CreatureKind, variant: string | null, flags: number, level: ComfortLevel): string | null {
  if (kind === 'bird' || kind === 'aphid') return null;
  if (level === 'marker') return null;
  if (level === 'abstract' && LOOKS[`${kind}-abstract`]) return `${kind}-abstract`;
  if (level === 'softened' && LOOKS[`${kind}-softened`]) return `${kind}-softened`;
  if (kind === 'caterpillar' && (variant === 'hairy' || (flags & HAIRY_FLAG))) return 'caterpillar-hairy';
  return LOOKS[kind] ? kind : null;
}
