// colony-life round 10: a liquid trip is worth what the source will hold when the forager gets there (its pool,
// less the crops of the trips already on their way, plus its refill during the walk), not a full crop. A drunk-dry
// flower was valued at a full crop of nectar; with R35's full carbohydrate weight for a colony short of sugar,
// woodland-edge #1's foragers walked to empty flowers instead of hunting the prey patch they could take.
import { describe, expect, it } from 'vitest';
import type { Ant } from '@/sim/types';
import { TASKS } from '@/sim/types';
import { sourceScore } from './choice';
import { K, PHASE } from './keys';
import { announce, forageScenario } from './testkit';

function heading(ant: Ant, sourceId: number): void {
  ant.task = 'forage';
  ant.bb['run.task'] = TASKS.indexOf('forage');
  ant.thinkTick = Number.MAX_SAFE_INTEGER;
  ant.bb[K.src] = sourceId;
  ant.bb[K.phase] = PHASE.outbound;
}

describe('liquid trips valued on arrival', () => {
  it('a nearly drunk-dry flower scores a small share of a full one', () => {
    const { sim, col, sources } = forageScenario({
      workers: 4, sources: [{ kind: 'nectar', variant: 'flower', distBu: 60, bearingDeg: 0, units: 1.5 }],
    });
    const s = sources[0];
    announce(sim, col, s);
    const ant = sim.state.ants.find((x) => x.caste === 'worker')!;
    expect(s.units).toBeGreaterThanOrEqual(ant.cropCap); // a full crop waits there
    const full = sourceScore(sim, ant, s);
    expect(full).toBeGreaterThan(0);
    s.units = 0.05; // a twentieth of a crop left (a flower holds 1.5 crops and refills 4 a day)
    const empty = sourceScore(sim, ant, s);
    expect(empty).toBeGreaterThan(0); // the sip and the refill during the walk are worth something
    expect(empty).toBeLessThan(0.3 * full); // valued at a full crop before this rule
  });

  it('a pool the trips on their way will drink scores less for the next one', () => {
    const { sim, col, sources } = forageScenario({
      workers: 4, sources: [{ kind: 'nectar', variant: 'flower', distBu: 60, bearingDeg: 0, units: 1.5 }],
    });
    const s = sources[0];
    announce(sim, col, s);
    const [a, b] = sim.state.ants.filter((x) => x.caste === 'worker');
    s.units = b.cropCap; // one crop left
    const alone = sourceScore(sim, b, s);
    heading(a, s.id);
    sim.tick(); // claims are cached per tick
    expect(sourceScore(sim, b, s)).toBeLessThan(0.5 * alone);
  });
});
