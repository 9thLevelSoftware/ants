// Per-primitive look (pure, tested): which finish a primitive is drawn with, its colour and finish parameters,
// from the world object it belongs to (catalogue template id and tags), its MaterialId and its shape. Render-only:
// nothing here is written back to the world (generation fingerprint and collision are untouched).
//
// The look vector is iLook = (finish, a, b, c):
//   colour / metal / clearcoat / cabin / tyre / glass: a = wear 0..1 (rust on edges / scuffs), b = roughness
//     (0 = the material's), c = texture detail kept 0..1;
//   rust: a = 1;
//   organic finishes (leaf, flowers, stem, cutWood, fungus): a = style, b = translucency 0..1, c = seed 0..1.
import type { Primitive, WorldObject } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { FINISH, LEAF_STYLE, type LeafStyle } from './finishes';
import { PALETTE, type Rgb } from './palette';

export interface PrimLook {
  /** Linear albedo multiplier; null = the default per-primitive brightness variation. */
  color: Rgb | null;
  look: [number, number, number, number];
}

/** What a primitive's look depends on besides the primitive itself. */
export interface LookObject {
  id: number;
  templateId: string;
  tags: readonly string[];
}

const NATURAL: PrimLook = { color: null, look: [0, 0, 0, 0] };

/** Deterministic 0..1 from an object id and a salt (palette picks never depend on draw order). */
export function hash01(id: number, salt: number): number {
  let h = Math.imul((id | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function pick<T>(list: readonly T[], id: number, salt = 0): T {
  return list[Math.min(list.length - 1, Math.floor(hash01(id, salt) * list.length))];
}

const colour = (c: Rgb, rough: number, wear = 0, detail = 0.35): PrimLook => ({ color: c, look: [FINISH.colour, wear, rough, detail] });
const metal = (c: Rgb, rough: number, wear = 0, detail = 0.25): PrimLook => ({ color: c, look: [FINISH.metal, wear, rough, detail] });
const paint = (c: Rgb, wear = 0.06): PrimLook => ({ color: c, look: [FINISH.clearcoat, wear, 0.32, 0.12] });
const glass = (c: Rgb = PALETTE.darkGlass): PrimLook => ({ color: c, look: [FINISH.glass, 0, 0.04, 0.1] });
const moulded = (c: Rgb, rough: number, wear = 0.05, detail = 0.3): PrimLook => ({ color: c, look: [FINISH.moulded, wear, rough, detail] });
const appliance = (c: Rgb): PrimLook => ({ color: c, look: [FINISH.appliance, 0.02, 0.2, 0.1] });
const organic = (finish: number, c: Rgb, style: number, transl: number, seed: number): PrimLook => ({ color: c, look: [finish, style, transl, seed] });

/** Thin in its local Y compared to the other two axes (leaves, lids, mats). */
function isFlat(p: Primitive): boolean {
  if (p.shape === 'cylinder' || p.shape === 'capsule') return false;
  return p.size.y < 0.3 * Math.min(p.size.x, p.size.z);
}

function leaf(style: LeafStyle, c: Rgb, p: Primitive, transl = 1): PrimLook {
  return organic(FINISH.leaf, c, LEAF_STYLE[style], transl, hash01(p.id, 7));
}

/** Plant parts by shape: flat = leaf, capsule = stem, round = flower head. */
function plantLook(t: string, p: Primitive, o: LookObject): PrimLook {
  const seed = hash01(p.id, 3);
  if (t === 'nut') return colour(PALETTE.nut, 0.45, 0, 0.6);
  if (t === 'fungus-cap' && p.shape !== 'ellipsoid') return colour(PALETTE.fungusStem, 0.7, 0, 0.5);
  if (isFlat(p)) {
    if (t === 'dandelion') return leaf('toothed', PALETTE.dandelionLeaf, p);
    if (t === 'daisy') return leaf('spatulate', pick(PALETTE.leaf, o.id), p);
    if (t === 'clover-patch') return leaf('obovate', PALETTE.leaf[2], p);
    if (t === 'moss-cushion') return colour(PALETTE.moss, 0.9, 0, 1);
    return leaf(t === 'herb-plant' ? 'lanceolate' : 'ovate', pick(PALETTE.leaf, o.id, p.id), p);
  }
  if (p.shape === 'capsule' || p.shape === 'cylinder') {
    return organic(FINISH.stem, t === 'dandelion' ? PALETTE.dandelionStem : PALETTE.stem, t === 'dandelion' ? 0 : 1, 0.6, seed);
  }
  if (t === 'moss-cushion') return colour(PALETTE.moss, 0.9, 0, 1);
  if (t === 'fungus-cap') return organic(FINISH.fungus, pick(PALETTE.fungusCap, o.id), 0, 0.2, seed);
  // a round plant part is a flower head (the plant grower's only ellipsoid besides leaves)
  if (t === 'dandelion') return hash01(o.id, 11) < 0.35 ? organic(FINISH.seedClock, PALETTE.seedClock, 0, 0.8, seed) : organic(FINISH.dandelion, PALETTE.dandelionFlower, 0, 0.5, seed);
  if (t === 'daisy') return organic(FINISH.daisy, PALETTE.daisyPetal, 0, 0.6, seed);
  if (t === 'clover-patch') return organic(FINISH.cloverHead, PALETTE.cloverHead, 0, 0.4, seed);
  return organic(FINISH.umbel, pick(PALETTE.umbel, o.id), 0, 0.4, seed);
}

/** Looks by template: the everyday objects the catalogue builds (GDD 04 §5). */
function templateLook(o: LookObject, p: Primitive): PrimLook | null {
  const t = o.templateId, m = p.material, id = o.id;
  const box = p.shape === 'box';
  switch (t) {
    case 'parked-car': {
      const body = pick(PALETTE.carPaint, id);
      if (m === 'rubber') return { color: PALETTE.rubber, look: [FINISH.tyre, 0, 0.7, 1] };
      if (p.flags & PrimFlag.VISUAL_ONLY) return { color: body, look: [FINISH.cabin, 0, 0.3, 0.1] };
      return { color: body, look: [FINISH.carBody, 0.05, 0.32, 0.12] };
    }
    case 'drink-can': return paint(pick(PALETTE.canPaint, id), 0.12);
    case 'bottle-cap': return paint(pick(PALETTE.capPaint, id), 0.2);
    case 'bollard': case 'lamp-post': return colour(id % 2 ? PALETTE.blackPaint : PALETTE.greyPaint, 0.5, 0.25);
    case 'gully-grate': case 'manhole-cover': return m === 'metal' ? metal(PALETTE.castIron, 0.75, 0.35, 0.8) : null;
    case 'linear-drain': return m === 'metal' ? metal(PALETTE.galvanised, 0.55, 0.1, 0.6) : null;
    case 'bench': case 'picnic-table': case 'swing-frame': return m === 'metal' ? colour(PALETTE.blackPaint, 0.45, 0.2) : null;
    case 'litter-bin': return m === 'plastic' ? moulded(PALETTE.greenPaint, 0.5, 0.1) : m === 'metal' ? metal(PALETTE.galvanised, 0.55, 0.1, 0.6) : null;
    case 'slide': case 'spring-rider': return m === 'metal' ? metal(PALETTE.stainless, 0.2, 0, 0.15) : m === 'plastic' ? colour(pick(PALETTE.toyPlastic, id), 0.35) : null;
    case 'fridge': case 'washer': case 'washing-machine': return m === 'metal' ? (box ? appliance(PALETTE.enamel) : colour(PALETTE.enamel, 0.2, 0.02, 0.1)) : colour(PALETTE.pipeBlack, 0.5);
    case 'cooker':
      if (m !== 'metal') return colour(PALETTE.pipeBlack, 0.5);
      return p.flags & PrimFlag.SLIPPERY ? glass(PALETTE.hobGlass) : box ? appliance(PALETTE.enamel) : colour(PALETTE.enamel, 0.22, 0.03, 0.1);
    case 'sink': return m === 'metal' ? metal(PALETTE.stainless, 0.22, 0, 0.3) : null;
    case 'chair': return m === 'metal' ? (box ? colour(pick(PALETTE.chairPaint, id), 0.4, 0.05) : metal(PALETTE.chrome, 0.1, 0, 0.1)) : null;
    case 'pedal-bin': return m === 'metal' ? metal(PALETTE.stainless, 0.28, 0, 0.4) : m === 'plastic' ? moulded(pick(PALETTE.binLid, id), 0.35) : null;
    case 'pet-bowl-pair': return m === 'metal' ? metal(PALETTE.stainless, 0.12, 0, 0.15) : m === 'rubber' ? colour(pick(PALETTE.mat, id), 0.8, 0, 0.8) : null;
    case 'toy-bucket': return m === 'plastic' ? moulded(pick(PALETTE.toyPlastic, id, p.id % 2), 0.32, 0.05, 0.2) : null;
    case 'toy-spade': case 'lost-ball': return m === 'plastic' || m === 'rubber' ? colour(pick(PALETTE.toyPlastic, id, p.id % 2), 0.32, 0.05, 0.2) : null;
    case 'plant-pot': case 'houseplant': return m === 'plastic' ? moulded(pick(PALETTE.potPlastic, id), 0.5, 0.05) : null;
    case 'water-butt': case 'compost-bin': return m === 'plastic' ? moulded(PALETTE.butGreen, 0.55, 0.05) : null;
    case 'downpipe': return m === 'plastic' ? colour(PALETTE.pipeBlack, 0.35) : null;
    case 'service-pipe': return m === 'plastic' ? colour(PALETTE.pipeGrey, 0.4) : null;
    case 'countertop': return m === 'plastic' ? colour(PALETTE.laminate, 0.3, 0, 0.5) : null;
    case 'base-cabinet-run': return m === 'plastic' ? colour(PALETTE.pipeBlack, 0.5) : null;
    case 'sprinkler-head': return m === 'plastic' ? colour(PALETTE.bucketGreen, 0.4) : null;
    case 'house-wall': return m === 'plastic' ? colour(PALETTE.upvc, 0.35) : null;
    case 'window': return m === 'glass' ? glass() : null;
    case 'garden-hose': return m === 'rubber' ? colour(PALETTE.hoseGreen, 0.45, 0.05, 0.5) : null;
    case 'wheel-stop': return m === 'rubber' ? colour(PALETTE.rubber, 0.8, 0.1, 1) : null;
    case 'cigarette-butt': return colour(PALETTE.filter, 0.8, 0, 0.6);
    // the bark scan planar-mapped on a chip's top read as an orange plank: darker, keep the fibre detail
    case 'mulch-chip': return m === 'bark' ? colour(PALETTE.mulch, 0.9, 0, 1) : null;
    case 'doormat-inside': return m === 'fabric' ? colour(pick(PALETTE.mat, id), 0.95, 0, 1) : null;
    case 'curled-leaf': return leaf('ovate', pick(PALETTE.deadLeaf, id), p, 0.35);
    case 'log': case 'stump':
      return (m === 'wood-sound' || m === 'wood-decayed' || m === 'bark') && p.shape === 'cylinder' ? organic(FINISH.cutWood, [1, 1, 1], m === 'wood-decayed' ? 1 : 0, 0, hash01(p.id, 5)) : null;
    default: return null;
  }
}

/** Looks of materials no template rule covered (dynamic primitives, new templates). */
function materialLook(p: Primitive): PrimLook {
  switch (p.material) {
    // a painted grey sheet with light edge wear: never the rust scan unless a template asks for it
    case 'metal': return colour(PALETTE.greyPaint, 0.45, 0.12, 0.2);
    case 'plastic': return colour(PALETTE.laminate, 0.4, 0, 0.4);
    case 'glass': return glass();
    case 'rubber': return colour(PALETTE.rubber, 0.75, 0.05, 1);
    default: return NATURAL;
  }
}

/** Look of one primitive; `o` = its world object (null for dynamic primitives without one). */
export function primLook(p: Primitive, o: LookObject | null): PrimLook {
  if (o && (o.tags.includes('rust') || o.tags.includes('rusty')) && p.material === 'metal') return { color: null, look: [FINISH.rust, 1, 0, 1] };
  if (o && p.material === 'plant') return plantLook(o.templateId, p, o);
  if (o && p.material === 'leaf') return templateLook(o, p) ?? leaf('ovate', pick(PALETTE.leaf, o.id), p);
  const t = o ? templateLook(o, p) : null;
  return t ?? materialLook(p);
}

/** A look function over a world's objects (prim.objectId -> object), for the primitive renderer. */
export function lookTable(objects: readonly WorldObject[]): (p: Primitive) => PrimLook {
  const byId = new Map<number, LookObject>();
  for (const o of objects) byId.set(o.id, o);
  return (p) => primLook(p, p.objectId >= 0 ? byId.get(p.objectId) ?? null : null);
}
