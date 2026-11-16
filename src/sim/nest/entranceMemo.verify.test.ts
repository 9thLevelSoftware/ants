// Independent review of nest-fix3 item 6: the entrance-check memo (entrances.ts evalSignature) "keys on every input"
// (task: "runtime memos key on every input; save/restore must agree"). It keys terrain edits on the NUMBER of
// height-delta tiles only; human events (footprints, children's sand play, GDD 04 §15) edit an existing tile in
// place, which changes the ground over an opening without changing that number. Before nest-fix3 the memo keyed on
// the field's geometry version.
//
// RED test (left for the fixer): ground heaped over an open entrance inside an already existing delta tile. The
// uninterrupted game keeps the memoised `open`; a restored game (empty memo) evaluates the same state as `sealed`.
import { describe, expect, it } from 'vitest';
import { addWithin, deformDisc, HEIGHT_TILE, syncHeightOverlays } from '@/sim/environment/human/effects/terrain';
import { restore, snapshot } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { evaluateEntrance } from './entrances';
import { nestSim, playerNest } from './nestTestKit';

describe('review nest-fix3 item 6: entrance memo and in-place terrain edits', () => {
  it('ground heaped over an opening inside an existing delta tile: the game and its restored copy agree', () => {
    const sim = nestSim({ nest: 'small', seed: 1 });
    const bu = sim.world.bu, cell = sim.world.terrain.cell;
    const nest = playerNest(sim), e = nest.entrances[0];
    evaluateEntrance(sim, nest, e);
    expect(e.status).toBe('open');
    // a small dent in the entrance's own delta tile, far from the throat: creates the tile (count 0 -> 1)
    const ci = Math.round(e.pos.x / cell), ck = Math.round(e.pos.z / cell);
    const ti = Math.floor(ci / HEIGHT_TILE) * HEIGHT_TILE, tk = Math.floor(ck / HEIGHT_TILE) * HEIGHT_TILE;
    const far = (c: number, t0: number) => (c - t0 > HEIGHT_TILE / 2 ? t0 + 2 : t0 + HEIGHT_TILE - 3);
    const px = far(ci, ti) * cell, pz = far(ck, tk) * cell;
    expect(Math.hypot(px - e.pos.x, pz - e.pos.z)).toBeGreaterThan(20 * bu);
    deformDisc(sim, px, pz, cell * 1.5, () => -0.5, 'test', addWithin(1e4));
    expect(sim.state.worldDelta.heightDeltas.length).toBe(1);
    evaluateEntrance(sim, nest, e);
    expect(e.status).toBe('open');
    // ground heaped 4 BU over the opening, same tile (the tile count does not change)
    deformDisc(sim, e.pos.x, e.pos.z, e.radius + 4 * bu, () => 4 * bu, 'test', addWithin(1e4));
    expect(sim.state.worldDelta.heightDeltas.length).toBe(1);
    expect(sim.field.height(e.pos.x, e.pos.z) - e.pos.y).toBeGreaterThan(3 * bu);
    evaluateEntrance(sim, nest, e);
    const uninterrupted = e.status;
    // the same state in a restored game (fresh runtime memo)
    const b = createSim(restore(snapshot(sim)).state, sim.world);
    syncHeightOverlays(b);
    const nb = b.stores.nests.get(nest.id)!, eb = nb.entrances.find((x) => x.id === e.id)!;
    evaluateEntrance(b, nb, eb);
    const restored = eb.status;
    expect(restored).not.toBe('open'); // the fresh evaluation sees the buried opening (test sanity)
    expect(uninterrupted).toBe(restored); // RED: 'open' (stale memo) vs 'sealed'
  });
});
