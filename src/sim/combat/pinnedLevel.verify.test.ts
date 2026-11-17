// Ruling R15 (GDD 08 §6.5): every `possessed-danger` card is critical, the combat "pinned" one included.
// Cross-edit by gate-close-app (logged in test-output/gate-close/cross-edits.md).
import { describe, expect, it } from 'vitest';
import { ant, arena, faceToFace, step } from './testkit';
import { beginGrapple } from './index';

describe('possessed-danger "pinned" level (R15)', () => {
  it('is raised as critical', () => {
    const a = arena({ manual: true, flags: { noRng: true, noRetreat: true } });
    const sim = a.sim;
    const [p, q] = faceToFace(a);
    sim.enqueue({ type: 'possess', antId: p.id });
    step(sim, 1);
    p.hp = 1e4;
    q.alive = false; q.hp = 0; sim.stores.ants.markDead(q.id);
    const r1 = ant(sim, a.rival, 40.9, 40, 'worker', { x: -1, y: 0, z: 0 });
    const r2 = ant(sim, a.rival, 40, 40.9, 'worker', { x: 0, y: 0, z: -1 });
    sim.index.refresh();
    expect(beginGrapple(sim, r1.id, 'ant', p.id)).toBe(true);
    expect(beginGrapple(sim, r2.id, 'ant', p.id)).toBe(true);
    step(sim, 60);
    const card = sim.state.progression.alerts.find((x) => x.kind === 'possessed-danger' && x.subjectId === p.id);
    expect(card?.cause).toBe('pinned');
    expect(card?.level).toBe('critical');
  });
});
