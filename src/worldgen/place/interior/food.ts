// Which interior POIs carry which food (GDD 04 §8.1 interior row): an adapter for worldgen-life, which places
// the food anchors. The POI kinds alone (food-spot, water-spot, bin-gap) do not say crumb vs sugar vs pet food;
// the owning object's template does.

import type { FoodKind, Poi, WorldData } from '@/sim/types';

export interface InteriorFoodSpot {
  poiId: number;
  pos: Poi['pos'];
  /** Food kind the anchor should be (null for water). */
  food: FoodKind | null;
  /** Finer label: 'counter', 'bread-board', 'sugar', 'fruit-bowl', 'hob-grease', 'table-top', 'under-table', 'pet-food', 'bin-rim', 'water'. */
  label: string;
}

const BY_TEMPLATE: Record<string, (p: Poi, objY: number) => { food: FoodKind | null; label: string } | null> = {
  countertop: (p) => (p.kind === 'food-spot' ? { food: 'crumb', label: 'counter' } : null),
  'bread-board': (p) => (p.kind === 'food-spot' ? { food: 'crumb', label: 'bread-board' } : null),
  'sugar-bowl': (p) => (p.kind === 'food-spot' ? { food: 'sugar', label: 'sugar' } : null),
  'fruit-bowl': (p) => (p.kind === 'food-spot' ? { food: 'fruit', label: 'fruit-bowl' } : null),
  cooker: (p) => (p.kind === 'food-spot' ? { food: 'crumb', label: 'hob-grease' } : null),
  'kitchen-table': (p, y) => (p.kind === 'food-spot' ? (p.pos.y > y + 100 ? { food: 'crumb', label: 'table-top' } : { food: 'crumb', label: 'under-table' }) : null),
  'pet-bowl-pair': (p) => (p.kind === 'food-spot' ? { food: 'pet-food', label: 'pet-food' } : p.kind === 'water-spot' ? { food: null, label: 'water' } : null),
  'pedal-bin': (p) => (p.kind === 'bin-gap' ? { food: 'crumb', label: 'bin-rim' } : null),
  sink: (p) => (p.kind === 'water-spot' ? { food: null, label: 'water' } : null),
};

export function interiorFoodSpots(world: WorldData): InteriorFoodSpot[] {
  const objs = new Map(world.objects.map((o) => [o.id, o]));
  const out: InteriorFoodSpot[] = [];
  for (const p of world.pois) {
    const o = objs.get(p.objectId);
    const f = o ? BY_TEMPLATE[o.templateId] : undefined;
    const r = f ? f(p, o!.pos.y) : null;
    if (r) out.push({ poiId: p.id, pos: p.pos, ...r });
  }
  return out;
}
