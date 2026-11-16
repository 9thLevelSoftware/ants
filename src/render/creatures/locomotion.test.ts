// Locomotion style from sim state (deliverable 2): walk, crawl, hop, hover, coiled, dead, buried, wind-up.
import { describe, expect, it } from 'vitest';
import { CreatureFlag } from '@/sim/ecology/creatures/common';
import type { CreatureKind } from '@/sim/types';
import { creaturePose, newPose, type CreaturePose } from './locomotion';

const pose = (kind: CreatureKind, o: Partial<{ state: string; flags: number; speed: number; stepMm: number; hp: number; alpha: number }> = {}): CreaturePose =>
  creaturePose({ kind, state: o.state ?? 'wander', flags: o.flags ?? 0, speed: o.speed ?? 0, stepMm: o.stepMm ?? 0, hp: o.hp ?? 10, alpha: o.alpha ?? 0.5, time: 0, seed: 0.3 }, newPose());

describe('creaturePose', () => {
  it('legged animals walk with a speed ratio; standing still is still', () => {
    const p = pose('wolf-spider', { speed: 10, stepMm: 1 });
    expect(p.style).toBe('walk'); expect(p.moving).toBeCloseTo(0.5, 5);
    expect(pose('wolf-spider').style).toBe('still');
  });
  it('worms, larvae, caterpillars and snails crawl', () => {
    for (const k of ['earthworm', 'fly-larva', 'caterpillar', 'snail'] as const) expect(pose(k, { speed: 1, stepMm: 0.1 }).style).toBe('crawl');
  });
  it('a re-placement much longer than a walking step is drawn as a hop arc peaking mid-tick', () => {
    const p = pose('springtail', { stepMm: 60, alpha: 0.5 });
    expect(p.style).toBe('hop'); expect(p.arcMm).toBeCloseTo(0.25 * 60, 5);
    expect(pose('springtail', { stepMm: 60, alpha: 0 }).arcMm).toBe(0);
    expect(pose('springtail', { stepMm: 0.4, speed: 4 }).style).toBe('walk');
  });
  it('flying animals hover with wings beating', () => {
    const p = pose('ladybird', { flags: CreatureFlag.FLYING });
    expect(p.style).toBe('hover'); expect(p.flap).toBe(1);
  });
  it('curled animals coil, roll or retract', () => {
    expect(pose('millipede', { flags: CreatureFlag.CURLED }).curl).toBe(1);
    expect(pose('woodlouse', { flags: CreatureFlag.CURLED }).style).toBe('coiled');
    const s = pose('snail', { flags: CreatureFlag.CURLED });
    expect(s.act).toBe(1); expect(s.curl).toBe(0);
  });
  it('subdued prey draws its legs in; dead animals lie on their back', () => {
    const s = pose('caterpillar', { flags: CreatureFlag.SUBDUED });
    expect(s.style).toBe('dead'); expect(s.flip).toBe(false);
    const d = pose('rove-beetle', { hp: 0 });
    expect(d.style).toBe('dead'); expect(d.flip).toBe(true); expect(d.fold).toBe(1);
  });
  it('strike wind-up crouches (telegraph pose); the antlion is buried with its jaws open', () => {
    expect(pose('jumping-spider', { state: 'windup' }).crouch).toBe(1);
    const a = pose('antlion', { state: 'wait' });
    expect(a.style).toBe('buried'); expect(a.act).toBeGreaterThan(0.5);
  });
});
