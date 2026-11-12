// fSpecial per species (GDD 04 §12.1): Camponotus decayed-wood volume within 50 BU; Messor open sky x seed anchors
// within 300 BU; Atta leaf biomass within 600 BU x no paving within 100 BU. T3 species: coarse, area-based.

import type { SpeciesId } from '@/sim/types';
import type { GenContext } from '../kit/context';
import { mapState } from './state';
import { SUIT } from '../tuning/maps';

/** Volume of a primitive's bounding solid, mm^3 (box/ellipsoid/cylinder/capsule formulas). */
function primVolume(s: { x: number; y: number; z: number }, shape: string): number {
  switch (shape) {
    case 'box': return 8 * s.x * s.y * s.z;
    case 'ellipsoid': return (4 / 3) * 3.141592653589793 * s.x * s.y * s.z;
    case 'cylinder': return 3.141592653589793 * s.x * s.x * 2 * s.y;
    default: return 3.141592653589793 * s.x * s.x * (2 * s.y + (4 / 3) * s.x);
  }
}

/** Per-nav-cell fSpecial of a species (0..1). */
export function specialFactor(ctx: GenContext, species: SpeciesId): (c: number) => number {
  const { navN, navCell, bu } = ctx.dims;
  const w = ctx.world;
  const centre = (c: number) => ({ x: ((c % navN) + 0.5) * navCell, z: (Math.floor(c / navN) + 0.5) * navCell });
  if (species === 'camponotus-pennsylvanicus') {
    const wood = w.prims.filter((p) => p.material === 'wood-decayed');
    const r = SUIT.woodRadiusBu * bu, need = SUIT.woodVolumeBu3 * bu * bu * bu;
    return (c) => {
      if (wood.length === 0) return 0;
      const p = centre(c);
      let v = 0;
      for (const q of wood) if ((q.pos.x - p.x) ** 2 + (q.pos.z - p.z) ** 2 <= r * r) v += primVolume(q.size, q.shape);
      return Math.min(1, v / need);
    };
  }
  if (species === 'messor-barbarus') {
    const shade = mapState(ctx).shade.mean;
    const seeds = w.placements.foodAnchors.filter((a) => a.kind === 'seed');
    const r = SUIT.seedRadiusBu * bu;
    return (c) => {
      if (shade[c] >= SUIT.seedOpenShade) return 0;
      const p = centre(c);
      let n = 0;
      for (const a of seeds) if ((a.pos.x - p.x) ** 2 + (a.pos.z - p.z) ** 2 <= r * r) n++;
      return Math.min(1, n * SUIT.seedEach);
    };
  }
  if (species === 'atta-texana') {
    const plants = w.prims.filter((p) => p.material === 'plant');
    const r = SUIT.leafRadiusBu * bu, clear = SUIT.pavingClearBu * bu;
    const lay = ctx.layout;
    return (c) => {
      const p = centre(c);
      const ci = c % navN, ck = Math.floor(c / navN), cr = Math.ceil(clear / navCell);
      for (let k = Math.max(0, ck - cr); k <= Math.min(navN - 1, ck + cr); k++)
        for (let i = Math.max(0, ci - cr); i <= Math.min(navN - 1, ci + cr); i++)
          if (lay.zones[lay.nav[k * navN + i]].type === 'pavement') return 0;
      let n = 0;
      for (const q of plants) if ((q.pos.x - p.x) ** 2 + (q.pos.z - p.z) ** 2 <= r * r) n++;
      return Math.min(1, n / SUIT.leafPrimsFull);
    };
  }
  return () => 0;
}
