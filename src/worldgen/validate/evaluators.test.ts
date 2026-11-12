// The three validation evaluator defects handed over by worldgen-outdoor / worldgen-fixes, on a generated
// car-park-verge world (drain grilles over gully pots, asphalt cracks): (1) the rest check probes the whole
// underside of a prop's lowest primitive, so a prop lying across a joint rests on its two supports; (2) a mouth over
// an enclosed terrain hole reaches a sheltered void (drain grilles are useful); (3) asphalt cracks count only
// with >= 300 BU of slot (GDD 04 §6.2).
import { describe, expect, it, vi } from 'vitest';
import { PrimFlag } from '@/sim/types';
import { placeObject, type ObjectTemplate } from '../kit/template';
import { terrainAt } from '../kit/surface';
import { generated } from '../populate/testkit';
import { restViolations } from './checks';
import { evaluateMicro } from './micro';
import { MICRO } from '../tuning/pipeline';

vi.setConfig({ testTimeout: 180_000 });

const world = () => generated('car-park-verge', 1);

describe('rest-on-ground evaluator (v-rest)', () => {
  it('a plank bridging a 28 mm gap between two blocks rests; the same plank 5 mm higher floats', () => {
    const { ctx } = world();
    const g = ctx.world.queenStart.pos;
    const x = g.x + 120, z = g.z + 120, y0 = terrainAt(ctx, x, z) + 20;
    const block = (dx: number): ObjectTemplate => ({ id: 'test-block', tags: ['structure'], prims: [{ shape: 'box', pos: { x: dx, y: 6, z: 0 }, size: { x: 8, y: 6, z: 6 }, material: 'stone', flags: PrimFlag.CLIMBABLE }] });
    const plank = (lift: number): ObjectTemplate => ({ id: 'test-plank', tags: ['prop'], prims: [{ shape: 'box', pos: { x: 0, y: 1 + lift, z: 0 }, size: { x: 30, y: 1, z: 5 }, material: 'wood-sound', flags: PrimFlag.CLIMBABLE }] });
    const n0 = restViolations(ctx).length;
    expect(placeObject(ctx, block(-22), { x, z, y: y0, snap: false, tilt: false })).toBeGreaterThanOrEqual(0);
    expect(placeObject(ctx, block(22), { x, z, y: y0, snap: false, tilt: false })).toBeGreaterThanOrEqual(0);
    const resting = placeObject(ctx, plank(0), { x, z, y: y0 + 12, snap: false, tilt: false });
    expect(resting).toBeGreaterThanOrEqual(0);
    // the old evaluator probed only the centre of the plank's underside: 12 mm above the terrain in the gap
    expect(restViolations(ctx)).not.toContain(resting);
    const floating = placeObject(ctx, plank(5), { x: x + 200, z, y: y0 + 12, snap: false, tilt: false });
    expect(restViolations(ctx)).toContain(floating);
    expect(restViolations(ctx).length).toBe(n0 + 1);
  });
});

describe('micro-connection usefulness (v-micro)', () => {
  it('drain grilles reach the void of their enclosed gully pot (no pre-carved cavity needed)', () => {
    const { ctx } = world();
    const grilles = ctx.world.micro.filter((m) => m.kind === 'drain-grille' && m.minClearanceBu >= MICRO.passClearK);
    expect(grilles.length).toBeGreaterThan(0);
    const cavities = ctx.world.cavities;
    try {
      ctx.world.cavities = [];
      evaluateMicro(ctx);
      for (const m of grilles) expect(m.useful, `${m.id} ${m.reason}`).toBe(true);
    } finally {
      ctx.world.cavities = cavities;
      evaluateMicro(ctx);
    }
  });

  it('asphalt cracks with less than 300 BU of slot do not count; longer ones are judged on their gain', () => {
    const { ctx } = world();
    const base = ctx.world.micro.find((m) => m.kind !== 'asphalt-crack' && m.useful)!;
    const short = { ...base, id: 1e6, kind: 'asphalt-crack' as const, lengthBu: MICRO.crackMinSlotBu - 1, useful: true, reason: '' };
    const long = { ...base, id: 1e6 + 1, kind: 'asphalt-crack' as const, lengthBu: MICRO.crackMinSlotBu + 1, useful: false, reason: '' };
    ctx.world.micro.push(short, long);
    try {
      evaluateMicro(ctx);
      expect(short.useful).toBe(false);
      expect(short.reason).toBe('short crack');
      expect(long.reason).not.toBe('short crack');
      for (const m of ctx.world.micro.filter((x) => x.kind === 'asphalt-crack' && x.id < 1e6)) {
        if (m.lengthBu < MICRO.crackMinSlotBu) expect(m.useful).toBe(false);
      }
    } finally {
      ctx.world.micro = ctx.world.micro.filter((m) => m.id < 1e6);
      evaluateMicro(ctx);
    }
  });
});
