// Sound-cue indicators: which events are information-bearing sounds, the pip direction, one pip per kind, expiry.
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@/sim/types';
import { pipPlace } from '@/ui/hud/SoundCuePips';
import { cueDirection, cueOf, SOUND_CUE_SHOW_S, SoundCueTracker, type CameraView } from './soundCues';

const v = (x: number, y: number, z: number) => ({ x, y, z });
// camera at the origin looking down -Z, up +Y: right is +X
const CAM: CameraView = { pos: v(0, 0, 0), forward: v(0, 0, -1), up: v(0, 1, 0), fovDeg: 60, aspect: 16 / 9 };

describe('cueOf', () => {
  it('maps the five information-bearing sounds, the player colony alarm only, rain onset only', () => {
    expect(cueOf({ type: 'alarm-raised', colonyId: 1, pos: v(1, 0, 0), strength: 1, source: 'x' } as SimEvent, 1)?.kind).toBe('alarm');
    expect(cueOf({ type: 'alarm-raised', colonyId: 2, pos: v(1, 0, 0), strength: 1, source: 'x' } as SimEvent, 1)).toBeNull();
    expect(cueOf({ type: 'drum', antId: 1, pos: v(0, 0, 0), wood: true } as SimEvent, 1)?.kind).toBe('drum');
    expect(cueOf({ type: 'collapse-warning', nestId: 1, center: v(0, 0, 0), radius: 1, volume: 1 } as SimEvent, 1)?.kind).toBe('crackle');
    expect(cueOf({ type: 'weather.changed', from: 'clear', to: 'rain', intensityClass: null, reason: '' } as SimEvent, 1)).toEqual({ kind: 'rain', pos: null });
    expect(cueOf({ type: 'weather.changed', from: 'rain', to: 'storm', intensityClass: null, reason: '' } as SimEvent, 1)).toBeNull();
    expect(cueOf({ type: 'time.day' } as unknown as SimEvent, 1)).toBeNull();
  });
});

describe('cueDirection', () => {
  it('right / up / behind-left; on screen only in the view', () => {
    expect(cueDirection(v(10, 0, -1), CAM).angleDeg).toBeCloseTo(0, 6);
    expect(cueDirection(v(0, 10, -1), CAM).angleDeg).toBeCloseTo(90, 6);
    expect(cueDirection(v(-10, 0, 5), CAM).angleDeg).toBeCloseTo(180, 6);
    expect(cueDirection(v(0, 0, -10), CAM).onScreen).toBe(true);
    expect(cueDirection(v(0, 0, 10), CAM).onScreen).toBe(false);
  });
});

describe('SoundCueTracker', () => {
  it('one pip per kind (the newest), dropped after SOUND_CUE_SHOW_S', () => {
    const t = new SoundCueTracker();
    const drum = (x: number) => ({ type: 'drum', antId: 1, pos: v(x, 0, -1), wood: true }) as SimEvent;
    t.note(drum(10), 1, 0);
    t.note(drum(-10), 1, 1);
    const l = t.list(1, CAM);
    expect(l.length).toBe(1);
    expect(Math.abs(l[0].angleDeg!)).toBeCloseTo(180, 0);
    expect(t.list(1 + SOUND_CUE_SHOW_S + 0.01, CAM)).toEqual([]);
  });
});

describe('pipPlace', () => {
  it('on the inset rectangle along the direction; rain at the top centre', () => {
    expect(pipPlace(0)).toEqual({ left: 94, top: 50 });
    expect(pipPlace(90).top).toBeCloseTo(6, 6);
    expect(pipPlace(null)).toEqual({ left: 50, top: 14 });
  });
});
