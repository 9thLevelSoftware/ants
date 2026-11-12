// Is the camera underground (GDD 01 6.1: the exposure / fog switch)? Decided from the camera position against the
// substrate surface (carved space ignored), with the nest look's hysteresis band so the look does not flicker
// while the camera rides along an entrance rim. The renderers ease the transition themselves.
import { NEST_LOOK } from '@/render/nest/params';

export class UndergroundSwitch {
  underground = false;

  /**
   * `substrate`: the camera's distance to the substrate surface, mm (> 0 above ground; NaN counts as above).
   * `snap` re-decides without hysteresis (a cut to another place, a new game).
   */
  update(substrate: number, bu: number, snap = false): boolean {
    const depth = Number.isFinite(substrate) ? -substrate : -Infinity;
    if (snap) this.underground = depth > 0.5 * (NEST_LOOK.enterDepthBU + NEST_LOOK.exitDepthBU) * bu;
    else if (!this.underground && depth > NEST_LOOK.enterDepthBU * bu) this.underground = true;
    else if (this.underground && depth < NEST_LOOK.exitDepthBU * bu) this.underground = false;
    return this.underground;
  }
}
