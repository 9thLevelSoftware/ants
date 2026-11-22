// Colony-life round 9, LD1 (sweep 8 playground-park #1: six foragers lost at the foot of an undercut root, 82 BU from
// home, with no stuck report): while a stuck episode runs, progress must beat what the walker had reached before the
// episode began, not the fresh baseline each rung's replan sets. A walker that only jitters by the progress margin
// climbs the ladder to the rungs that move it; real progress still resets it, and on another leg any progress counts.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '@/sim/time';
import { placeOnSurface } from './index';
import { rt } from './runtime';
import { NO_PROGRESS, scratchOf } from './scratch';
import { checkStuck, trackProgress } from './stuck';
import { locoSim, v3 } from './testkit';

describe('the stuck ladder is not reset by jitter around a fresh baseline (LD1)', () => {
  it('jitter of the progress margin after a replan does not reset the rung; beating the pre-episode best does', () => {
    const sim = locoSim({ sizeBu: 128 });
    const bu = sim.world.bu, ant = sim.state.ants[0], r = rt(sim), P = r.P;
    expect(placeOnSurface(sim, ant, v3(64 * bu, 0, 64 * bu))).toBe(true);
    const s = scratchOf(ant);
    s.req = 'goto'; s.ladder = 0; s.ladderUntil = 0; s.episodes = 0; s.relocations = 0; s.reqTick = sim.state.tick;
    ant.nav.mode = 'path'; s.flowKey = 'nest:1'; s.legField = ''; s.legNest = -1;
    const target = v3(70 * bu, 0, 64 * bu);
    const window = Math.ceil(P.stuckWindowS * TICKS_PER_SECOND) + 1;
    // the walker reached metric 100 BU, then stood: one window later the episode begins (rung 1, replan)
    s.best = 100 * bu; s.bestTick = sim.state.tick; s.anchor.y = ant.pos.y;
    sim.state.tick += window;
    expect(checkStuck(sim, ant, s, r, ant.id, target)).toBe('replan');
    expect(s.ladder).toBe(1);
    // the replan set a fresh baseline at 100.4; a step of the margin and a bit below it is not below 100 - margin
    trackProgress(s, 100.4 * bu, false, sim.state.tick, r, ant);
    const t0 = sim.state.tick;
    sim.state.tick += 5;
    trackProgress(s, 100.4 * bu - P.stuckProgress - 0.05 * bu, false, sim.state.tick, r, ant);
    expect(s.ladder).toBe(1);
    expect(s.bestTick).toBe(t0); // unchanged: the rung's own tick
    // so the next window climbs the ladder (before LD1 the rung went back to 0 here, every time)
    sim.state.tick = s.bestTick + window;
    expect(checkStuck(sim, ant, s, r, ant.id, target)).toBe('none');
    expect(s.ladder).toBe(2);
    // real progress: below the pre-episode best by the margin resets the ladder
    s.ladderUntil = 0;
    trackProgress(s, 100.4 * bu, false, sim.state.tick, r, ant); // the baseline after the rung
    trackProgress(s, 100 * bu - P.stuckProgress - 0.05 * bu, false, sim.state.tick, r, ant);
    expect(s.ladder).toBe(0);
    expect(s.bestTick).toBe(sim.state.tick);
  });

  it('on another leg (the replan changed the way) any progress from the new baseline counts', () => {
    const sim = locoSim({ sizeBu: 128 });
    const bu = sim.world.bu, ant = sim.state.ants[0], r = rt(sim), P = r.P;
    expect(placeOnSurface(sim, ant, v3(64 * bu, 0, 64 * bu))).toBe(true);
    const s = scratchOf(ant);
    s.req = 'goto'; s.ladder = 0; s.ladderUntil = 0; s.episodes = 0; s.relocations = 0; s.reqTick = sim.state.tick;
    ant.nav.mode = 'path'; s.flowKey = 'nest:1'; s.legField = ''; s.legNest = -1;
    s.best = 100 * bu; s.bestTick = sim.state.tick;
    sim.state.tick += Math.ceil(P.stuckWindowS * TICKS_PER_SECOND) + 1;
    checkStuck(sim, ant, s, r, ant.id, v3(70 * bu, 0, 64 * bu));
    expect(s.ladder).toBe(1);
    // the replan chose a seek leg toward a detour point: a different metric
    ant.nav.mode = 'seek'; s.flowKey = '';
    s.best = NO_PROGRESS;
    trackProgress(s, 150 * bu, false, sim.state.tick, r, ant);
    sim.state.tick += 5;
    trackProgress(s, 150 * bu - P.stuckProgress - 0.05 * bu, false, sim.state.tick, r, ant);
    expect(s.ladder).toBe(0);
    expect(s.bestTick).toBe(sim.state.tick);
  });
});
