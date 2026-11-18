// Review of look-pass-3 S13 (ragged mound foot). The mound mesh draws the same pile heightfield the walkers stand on
// (src/sim/world/field.ts adds mound overlays to the terrain height: seed 4 "collision == visuals"). The fragment
// shader now discards every fragment whose pile is below MOUND_MIN_PILE_MM + MOUND_RIM_RAG_MM x noise (noise 0..1),
// so where it discards, the visible ground is the bare terrain while the ants still walk on top of the pile.
import { describe, expect, it } from 'vitest';
import { FOOT_OFFSET_BU } from '@/sim/balance/ants';
import { SPECIES_BU_MM } from '@/worldgen/tuning/pipeline';
import { MOUND_MIN_PILE_MM, MOUND_RIM_RAG_MM } from './moundRenderer';

describe('mound foot: the hidden pile under a walking ant (look-pass-3 S13)', () => {
  it('never hides more pile than the walker foot offset of the smallest species (ants would stand on invisible soil)', () => {
    const smallestBu = Math.min(...Object.values(SPECIES_BU_MM));
    const footMm = FOOT_OFFSET_BU * smallestBu; // 0.1 BU x 4 mm = 0.4 mm for Lasius
    const maxHiddenPileMm = MOUND_MIN_PILE_MM + MOUND_RIM_RAG_MM; // the shader's cut-off at noise 1
    expect(maxHiddenPileMm, `up to ${maxHiddenPileMm} mm of pile is discarded; a Lasius foot offset is ${footMm} mm`).toBeLessThanOrEqual(footMm);
  });
});
