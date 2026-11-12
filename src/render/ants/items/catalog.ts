/**
 * Brood/item mesh catalog (built lazily) and the mapping from sim brood and items to a mesh key plus a real size.
 * Keys: 'egg', 'eggs' (carried clump), 'larva', 'cocoon', 'pupa:<variant>', 'corpse:<variant>', 'droplet' and the
 * item kinds of things.ts.
 */
import type { AntVariant } from '../geometry/rig';
import type { BroodView, ItemView } from '../simAdapter';
import { cocoon, corpse, eggClump, larva, nakedPupa, singleEgg } from './brood';
import { buildThings } from './things';
import type { ItemDef } from './itemDef';

/** Default sizes in BU of the owning species when Item.lengthMm is 0 (GDD 01/03 item scales, Lasius-tuned). */
const DEFAULT_BU: Record<string, number> = {
  'soil-pellet': 0.21, frass: 0.18, chaff: 0.25, pebble: 0.25, 'food-piece': 0.35, seed: 0.4, 'seed-paste': 0.2, 'leaf-fragment': 0.65,
  'leaf-pulp': 0.2, staphylae: 0.15, 'fungus-piece': 0.3, 'garden-waste': 0.25, waste: 0.25, carcass: 0.5, 'live-aphid': 0.4, droplet: 0.23,
};
const LIQUIDS = new Set(['honeydew', 'nectar', 'dew', 'sugar']);

export interface VariantLookup {
  /** Variant for (species, sim caste, size class); built on demand. */
  variant(species: string, caste: string, sizeClass: string | null): AntVariant;
  /** true if the species' pupae spin cocoons (formicines). */
  cocoons(species: string): boolean;
  buMm(species: string): number;
}

export class ItemCatalog {
  private defs = new Map<string, ItemDef>();

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
  brood(b: BroodView, species: string, carried: boolean): { key: string; sizeMm: number } {
    const adult = Math.max(0.2, b.destinedLengthBu || 1) * this.variants.buMm(species);
    if (b.stage === 'egg') return { key: carried ? 'eggs' : 'egg', sizeMm: 0.13 * this.variants.buMm(species) };
    if (b.stage === 'larva') return { key: 'larva', sizeMm: adult * (0.25 + 0.5 * Math.min(1, Math.max(0, b.progress))) };
    if (this.variants.cocoons(species)) return { key: 'cocoon', sizeMm: adult * 0.88 };
    const v = this.variants.variant(species, b.destined, null);
    return { key: `pupa:${v.key}`, sizeMm: adult * 0.97 };
  }

  /** Mesh key and length (mm) of an item. */
  item(it: ItemView, species: string): { key: string; sizeMm: number } {
    const bu = this.variants.buMm(species);
    if (it.kind === 'corpse') {
      const v = this.variants.variant(species, 'worker', null);
      return { key: `corpse:${v.key}`, sizeMm: it.lengthMm > 0 ? it.lengthMm : v.morph.bodyLength };
    }
    let key: string = it.kind;
    if (it.kind === 'waste' && it.wasteKind === 'cocoon') key = 'cocoon';
    else if (it.kind === 'waste' && it.wasteKind === 'brood-corpse') key = 'larva';
    else if (it.foodKind && LIQUIDS.has(it.foodKind) && it.kind === 'food-piece') key = 'droplet';
    const def = DEFAULT_BU[key] ?? (key === 'cocoon' ? 0.85 : key === 'larva' ? 0.6 : 0.25);
    return { key, sizeMm: it.lengthMm > 0 ? it.lengthMm : def * bu };
  }
}
