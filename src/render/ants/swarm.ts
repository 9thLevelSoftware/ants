// Males at the lek (GDD 06 §11.6): during the player's possessed nuptial flight the sim keeps the males as an
// aggregate (they are booked and removed at take-off), so the renderer draws a swarm of winged males hovering over
// the lek centre while the gyne climbs to it and mates. Render-only, deterministic in the tick: nothing is written
// back. Their ids are negative so they never meet a sim id in the per-ant render state.
import type { Vec3 } from '@/core/math/vec3';
import { AntFlag, POSES } from '@/sim/types';
import type { AntView } from './simAdapter';
import { SWARM } from './tuning';

/** The flight fields the swarm needs (a structural subset of the sim's PossessedFlight). */
export interface SwarmFlight { phase: string; lek: Vec3; startTick: number; gyneId?: number }

const SHOWN = new Set(['ascend', 'lek', 'mate']);

/** First virtual id; male i is SWARM_ID0 - i. */
export const SWARM_ID0 = -1000;

function male(i: number, colony: number): AntView {
  const v = () => ({ x: 0, y: 0, z: 0 });
  return {
    id: SWARM_ID0 - i, alive: true, colony, caste: 'male', pos: v(), prevPos: v(), up: { x: 0, y: 1, z: 0 }, prevUp: { x: 0, y: 1, z: 0 },
    fwd: { x: 1, y: 0, z: 0 }, prevFwd: { x: 1, y: 0, z: 0 }, speed: 0, footOffset: 0, medium: 'air', lengthBu: SWARM.lengthBu,
    sizeClass: null, flags: AntFlag.WINGED, pose: POSES.indexOf('fly'), carry: { kind: 'none', id: -1 } as AntView['carry'], cropC: 0, cropP: 0,
    cropCap: 0, bornTick: 0, alarmLevel: 0,
  } as AntView;
}

/** Place of male i at time t (s): a slow loop around the lek centre with its own radius, height and phase. */
function place(i: number, t: number, lek: Vec3, buMm: number, out: Vec3): void {
  const g = (i * 0.618034) % 1; // golden-ratio spread of the loop parameters
  const r = (SWARM.radiusBu[0] + (SWARM.radiusBu[1] - SWARM.radiusBu[0]) * g) * buMm;
  const w = SWARM.loopRadS * (0.7 + 0.6 * ((i * 0.381966) % 1)) * (i % 2 ? 1 : -1);
  const a = i * 2.399963 + w * t;
  out.x = lek.x + Math.cos(a) * r;
  out.z = lek.z + Math.sin(a) * r;
  out.y = lek.y + (Math.sin(t * SWARM.bobRadS + i) * SWARM.bobBu + (g - 0.5) * SWARM.spreadYBu) * buMm;
}

/**
 * The swarm for this tick (and the tick before, for interpolation), written into `out` (reused objects), or an
 * empty list when no flight is at the lek. `tickS` is the sim's seconds per tick.
 */
export class Swarm {
  private males: AntView[] = [];

  /**
   * `gyne`: where the possessed gyne is. Once she is at the lek (phases lek / mate) the males crowd round her (they
   * chase the female), else they hover over the lek centre.
   */
  update(flight: SwarmFlight | null, tick: number, tickS: number, colony: number, buMm: number, gyne: Vec3 | null = null): readonly AntView[] {
    if (!flight || !SHOWN.has(flight.phase)) return [];
    const centre = gyne && flight.phase !== 'ascend' ? gyne : flight.lek;
    while (this.males.length < SWARM.count) this.males.push(male(this.males.length, colony));
    const t = (tick - flight.startTick) * tickS;
    for (let i = 0; i < SWARM.count; i++) {
      const m = this.males[i];
      m.colony = colony;
      place(i, t - tickS, centre, buMm, m.prevPos);
      place(i, t, centre, buMm, m.pos);
      // heading level (up stays +Y): the direction of travel in the XZ plane
      const dx = m.pos.x - m.prevPos.x, dz = m.pos.z - m.prevPos.z;
      const len = Math.hypot(dx, dz) || 1;
      m.prevFwd.x = m.fwd.x; m.prevFwd.y = 0; m.prevFwd.z = m.fwd.z;
      m.fwd.x = dx / len; m.fwd.y = 0; m.fwd.z = dz / len;
      m.speed = len / tickS;
    }
    return this.males;
  }
}
