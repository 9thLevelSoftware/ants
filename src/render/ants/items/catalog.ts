/**
 * Brood/item mesh catalog (built lazily) and the mapping from sim brood and items to a mesh key plus a real size.
 * Keys: 'egg', 'eggs' (carried clump), 'larva', 'cocoon', 'pupa:<variant>', 'corpse:<variant>', 'droplet' and the
 * item kinds of things.ts.
 */
import type { AntVariant } from '../geometry/rig';
import { speciesMorphs, type MorphCaste } from '../morph/catalog';
import type { BroodLook, ItemLook } from '../simAdapter';
import { cocoon, corpse, eggClump, larva, nakedPupa, singleEgg } from './brood';
import { buildThings } from './things';
import type { ItemDef } from './itemDef';

/** Default sizes in BU of the owning species when Item.lengthMm is 0 (GDD 01/03 item scales, Lasius-tuned). */
const DEFAULT_BU: Record<string, number> = {
  'soil-pellet': 0.21, frass: 0.18, chaff: 0.25, pebble: 0.25, 'food-piece': 0.35, seed: 0.4, 'seed-paste': 0.2, 'leaf-fragment': 0.65,
  'leaf-pulp': 0.2, staphylae: 0.15, 'fungus-piece': 0.3, 'garden-waste': 0.25, waste: 0.25, carcass: 0.5, 'live-aphid': 0.4, droplet: 0.23,
};
const LIQUIDS = new Set(['honeydew', 'nectar', 'dew', 'sugar']);
/** Castes a corpse can be matched to by its length (alates rarely die in the nest; a dead gyne is drawn as a queen). */
const CORPSE_CASTES: readonly MorphCaste[] = ['worker', 'minor', 'small-media', 'media', 'major', 'queen'];

export interface VariantLookup {
  /** Variant for (species, sim caste, size class); built on demand. */
  variant(species: string, caste: string, sizeClass: string | null): AntVariant;
  /** true if the species' pupae spin cocoons (formicines). */
  cocoons(species: string): boolean;
  buMm(species: string): number;
}

/** A mesh key and the real length (mm) to draw it at. */
export interface ItemRef { key: string; sizeMm: number }

export class ItemCatalog {
  private defs = new Map<string, ItemDef>();
  /** species -> caste -> 'pupa:<variant>' / 'corpse:<variant>' (no string building per frame). */
  private pupaKeys = new Map<string, Map<string, string>>();
  private corpseKeys = new Map<string, Map<string, string>>();

  constructor(private readonly variants: VariantLookup) {
    for (const d of buildThings()) this.defs.set(d.kind, d);
  }

  get(key: string): ItemDef {
    let d = this.defs.get(key);
    if (d) return d;
    if (key === 'egg') d = singleEgg();
    else if (key === 'eggs') d = eggClump();
    else if (key === 'larva') d = larva();
    else if (key === 'cocoon') d = cocoon();
    else if (key.startsWith('pupa:') || key.startsWith('corpse:')) {
      const [, species, caste] = key.split(/[:|]/) as [string, string, string];
      const v = this.variants.variant(species, caste, caste === 'small-media' ? 'small-media' : null);
      d = key.startsWith('pupa:') ? nakedPupa(v) : corpse(v);
      d.kind = key;
    } else d = this.defs.get('waste')!;
    this.defs.set(key, d);
    return d;
  }

  /** Mesh key and length (mm) of a brood entity; `carried` selects the egg clump. */
  brood(b: BroodLook, species: string, carried: boolean, out: ItemRef = { key: '', sizeMm: 0 }): ItemRef {
    const bu = this.variants.buMm(species);
    const adult = Math.max(0.2, b.destinedLengthBu || 1) * bu;
    if (b.stage === 'egg') return set(out, carried ? 'eggs' : 'egg', 0.13 * bu);
    if (b.stage === 'larva') return set(out, 'larva', adult * (0.25 + 0.5 * Math.min(1, Math.max(0, b.progress))));
    if (this.variants.cocoons(species)) return set(out, 'cocoon', adult * 0.88);
    return set(out, this.variantKey(this.pupaKeys, 'pupa:', species, b.destined), adult * 0.97);
  }

  /** Mesh key and length (mm) of an item. */
  item(it: ItemLook, species: string, out: ItemRef = { key: '', sizeMm: 0 }): ItemRef {
    if (it.kind === 'corpse') {
      const caste = corpseCaste(species, it.lengthMm);
      const key = this.variantKey(this.corpseKeys, 'corpse:', species, caste);
      return set(out, key, it.lengthMm > 0 ? it.lengthMm : this.get(key).nominalMm);
    }
    let key: string = it.kind;
    if (it.kind === 'waste' && it.wasteKind === 'cocoon') key = 'cocoon';
    else if (it.kind === 'waste' && it.wasteKind === 'brood-corpse') key = 'larva';
    else if (it.foodKind && LIQUIDS.has(it.foodKind) && it.kind === 'food-piece') key = 'droplet';
    const def = DEFAULT_BU[key] ?? (key === 'cocoon' ? 0.85 : key === 'larva' ? 0.6 : 0.25);
    return set(out, key, it.lengthMm > 0 ? it.lengthMm : def * this.variants.buMm(species));
  }

  private variantKey(cache: Map<string, Map<string, string>>, prefix: string, species: string, caste: string): string {
    let bySpecies = cache.get(species);
    if (!bySpecies) { bySpecies = new Map(); cache.set(species, bySpecies); }
    let key = bySpecies.get(caste);
    if (key === undefined) {
      key = prefix + this.variants.variant(species, caste, caste === 'small-media' ? 'small-media' : null).key;
      bySpecies.set(caste, key);
    }
    return key;
  }
}

function set(out: ItemRef, key: string, sizeMm: number): ItemRef {
  out.key = key; out.sizeMm = sizeMm;
  return out;
}

/**
 * The sim's Item has no caste for a dead ant, only its length: pick the caste of the species whose body length is
 * closest (log scale), so a dead queen or major gets its own proportions. PROVISIONAL until the sim records it.
 */
export function corpseCaste(species: string, lengthMm: number): MorphCaste {
  const { morphs, scale } = speciesMorphs(species);
  if (!(lengthMm > 0)) return morphs.standard;
  let best: MorphCaste = morphs.standard, bestErr = Infinity;
  for (const c of CORPSE_CASTES) {
    const m = morphs.castes[c];
    if (!m) continue;
    const err = Math.abs(Math.log(lengthMm / (m.bodyLength * scale)));
    if (err < bestErr) { bestErr = err; best = c; }
  }
  return best;
}
