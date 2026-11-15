// Alert triggers owned by this module (GDD 05 App. C): `predator-near` - an ant predator stalking, in ambush or
// winding up within 15 BU of the possessed ant or of >= 3 foragers; cooldown 0.1 gd per creature. The
// `nest-attacked` alert of an invading centipede is raised in invasion.ts.

import type { Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { dist } from './common';
import { ports } from './ports';

const NEAR_BU = 15;
const MIN_FORAGERS = 3;
const COOLDOWN_GD = 0.1;
const LURKING = new Set(['stalk', 'ambush', 'windup', 'orient', 'freeze', 'approach']);
const _ids: number[] = [];

export function predatorNearAlerts(sim: Sim): void {
  const col = sim.state.colonies.find((c) => c.alive && c.isPlayer);
  if (!col) return;
  const r = NEAR_BU * sim.world.bu;
  const possessed = sim.stores.ants.get(sim.state.player.possessedAntId);
  for (const c of sim.stores.creatures.list) {
    if (!c.alive || !LURKING.has(c.state)) continue;
    if (sim.state.tick < (c.bb.alertTick ?? -1)) continue;
    let near = !!possessed && dist(possessed.pos, c.pos) <= r;
    if (!near) {
      let n = 0;
      sim.index.queryAnts(c.pos, r, _ids);
      for (const id of _ids) {
        const a = sim.stores.ants.get(id);
        if (a && a.colony === col.id && a.task === 'forage' && dist(a.pos, c.pos) <= r) n++;
      }
      near = n >= MIN_FORAGERS;
    }
    if (!near) continue;
    c.bb.alertTick = sim.state.tick + Math.round(COOLDOWN_GD * TICKS_PER_DAY);
    ports.raiseAlert(sim, {
      kind: 'predator-near', level: 'warning', subjectId: c.id, title: 'Predator near foragers', cause: c.kind,
      focus: { kind: 'creature', id: c.id, pos: { ...c.pos } }, diagnosticId: 'diag-threats',
    });
  }
}
