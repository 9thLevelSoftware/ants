/**
 * The look numbers the per-creature loop needs, as typed arrays indexed by look id (looks.ts LOOK_KEYS order), so
 * the loop does no string work and no object lookups. Cull bounds and the mid-detail triangle count come from the
 * built mid-detail geometry, computed the first time a look is seen.
 */
import type { CreatureKind } from '@/sim/types';
import { cullBoundsOf, type CullBounds } from './cullBounds';
import { LOOK_KEYS, LOOKS, lookIdFor, type ComfortLevel } from './looks';

export class LookTable {
  readonly count = LOOK_KEYS.length;
  /** Nominal length the geometry is built at, mm. */
  readonly size = new Float32Array(this.count);
  /** mm per gait / wave cycle at nominal size (cullBounds.ts; set with the bounds on first use). */
  readonly stride = new Float32Array(this.count);
  readonly legAmp = new Float32Array(this.count);
  /** Body axis height (motion.body[1]), mm: how far a dead animal on its back is raised. */
  readonly bodyAxisY = new Float32Array(this.count);
  readonly ring = new Uint8Array(this.count);
  readonly spiderLike = new Uint8Array(this.count);
  /** Mid-detail triangles (0 until the look's bounds are computed). */
  readonly tris1 = new Float32Array(this.count);
  private readonly cull: (CullBounds | undefined)[] = [];

  constructor() {
    LOOK_KEYS.forEach((k, i) => {
      const d = LOOKS[k]!;
      this.size[i] = d.sizeMm; this.stride[i] = d.strideMm; this.legAmp[i] = d.legAmp ?? 1; this.bodyAxisY[i] = d.motion.body[1];
      this.ring[i] = d.ring ? 1 : 0; this.spiderLike[i] = d.spiderLike ? 1 : 0;
    });
  }

  lookFor(kind: CreatureKind, variant: string | null, flags: number, level: ComfortLevel): number {
    return lookIdFor(kind, variant, flags, level);
  }

  /** Cull sphere of look `id` in its body frame at nominal size (see cullBounds.ts). */
  bounds(id: number): CullBounds {
    let b = this.cull[id];
    if (!b) {
      b = cullBoundsOf(LOOKS[LOOK_KEYS[id]!]!);
      this.cull[id] = b;
      this.tris1[id] = b.midTris;
      this.stride[id] = b.stride;
    }
    return b;
  }
}
