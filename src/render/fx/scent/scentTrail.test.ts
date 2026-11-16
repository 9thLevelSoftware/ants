// Scent view over a REAL foraging trail: a new game on the test world (fx demo scenario), the colony's own foragers
// find a sugar spill on top of a wall and lay the trail. The view's glyphs must hug the surfaces (ground and the
// wall face), run from the nest entrance to the food, and show the home range around the nest.
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core';
import { fxScenario, runTicks } from '../../../../spikes/fx-demo/scenario';
import { ScentCache } from './ScentCache';
import { fieldSnapper, FOOD_LAYER_KEY, foodPlumes, scentLayers } from './layers';
import { RIVAL_FLAG, STYLE } from './tuning';

const ALL = { chunks: Infinity, visits: Infinity, minRefreshS: 0 };
const TICKS = 6000;

describe('scent view over a real trail', () => {
  it('ribbon from the nest to the food, up the wall; home range; glyphs on the surfaces', () => {
    const sc = fxScenario(1);
    const { sim, wall, entrance, wallFood } = sc;
    runTicks(sim, TICKS);
    const bu = sim.world.bu;
    const cache = new ScentCache(20_000, sim.state.phero.cell);
    cache.converge = true;
    cache.setLayers(scentLayers(sim));
    cache.refresh(sim.phero, sim.state.phero, ALL, 0);
    cache.setPoints(FOOD_LAYER_KEY, foodPlumes(sim, []));
    cache.processSnaps(fieldSnapper(sim), Infinity);
    cache.processAxes(Infinity);
    cache.ease(0, Infinity);

    const n: Vec3 = { x: 0, y: 0, z: 0 };
    let trail = 0, onWall = 0, home = 0, food = 0, nearNest = 0, nearFood = 0, off = 0;
    cache.forEachLive((s, x, y, z, _v, style) => {
      const f = sim.field.sampleXYZ(x, y, z);
      if (Math.abs(f) > 0.5) off++;
      const base = style % RIVAL_FLAG;
      if (base === STYLE.home) home++;
      if (base === STYLE.food) food++;
      if (base !== STYLE.trail) return;
      trail++;
      cache.normalOf(s, n);
      const faceX = Math.abs(Math.abs(x - wall.x) - wall.halfThick) < 2 && Math.abs(z - wall.z) < wall.halfLength;
      if (faceX && Math.abs(n.y) < 0.5 && y > 3 * bu) onWall++;
      if (Math.hypot(x - entrance.pos.x, z - entrance.pos.z) < 12 * bu) nearNest++;
      if (Math.hypot(x - wallFood.pos.x, y - wallFood.pos.y, z - wallFood.pos.z) < 10 * bu) nearFood++;
    });
    console.log(`[scent trail] tick ${sim.state.tick}: trail ${trail} (wall face ${onWall}, near nest ${nearNest}, near food ${nearFood}), home ${home}, food plumes ${food}, off-surface ${off}`);
    expect(trail).toBeGreaterThan(40);
    expect(onWall).toBeGreaterThanOrEqual(3);
    expect(nearNest).toBeGreaterThan(0);
    expect(nearFood).toBeGreaterThan(0);
    expect(home).toBeGreaterThan(100);
    expect(food).toBeGreaterThanOrEqual(1);
    expect(off).toBe(0);
  }, 60_000);
});
