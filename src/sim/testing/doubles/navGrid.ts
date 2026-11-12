// TEST DOUBLE NavGrid: every cell open, cost 1, straight-line paths. Also the production stub until loco lands
// src/sim/world/navGrid.ts (createNavGrid in src/sim/world/index.ts).

import type { NavGrid, WorldData } from '@/sim/types';
import { NAV_CELL_BU } from '@/sim/balance';

export function fakeNavGrid(world: WorldData): NavGrid {
  const cell = NAV_CELL_BU * world.bu;
  const n = Math.max(1, Math.ceil(world.size / cell));
  return {
    cell, w: n, h: n,
    classAt: () => 'open',
    costAt: () => 1,
    blocked: () => false,
    findPath(_from, to, out) {
      out.length = 0;
      out.push({ x: to.x, y: to.y, z: to.z });
      return true;
    },
    setCostMult: () => {},
  };
}
