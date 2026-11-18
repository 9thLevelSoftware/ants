// The house facade keeps part of its colour through the haze (app-seams-2 item 12, far wall blocks): only its vertices carry the flag.
import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { EDGE_FOG_FRAGMENT } from './edgeHaze';
import { MeshBuilder } from './meshBuilder';
import { BACKDROP_KEEP_HAZE } from './tuning';

describe('facade haze exemption', () => {
  it('a mesh builder flags the vertices appended while `keepNow` is set, and no others', () => {
    const mb = new MeshBuilder();
    mb.box(0, 0, 0, 1, 1, 1, 0, new Color('#888888'));
    mb.keepNow = 1;
    mb.box(5, 0, 0, 1, 1, 1, 0, new Color('#888888'));
    mb.keepNow = 0;
    mb.box(10, 0, 0, 1, 1, 1, 0, new Color('#888888'));
    expect(mb.keep.length).toBe(mb.vertexCount);
    const per = mb.vertexCount / 3;
    expect(mb.keep.slice(0, per).every((k) => k === 0)).toBe(true);
    expect(mb.keep.slice(per, 2 * per).every((k) => k === 1)).toBe(true);
    expect(mb.keep.slice(2 * per).every((k) => k === 0)).toBe(true);
  });
  it('the fog and the edge haze both give way by the keep share', () => {
    expect(EDGE_FOG_FRAGMENT).toContain('float bdKeep = vBdKeep * uBdKeepHaze;');
    expect(EDGE_FOG_FRAGMENT).toContain('bdFog * (1.0 - bdKeep)');
    expect(EDGE_FOG_FRAGMENT).toContain('* (1.0 - bdKeep);');
    expect(BACKDROP_KEEP_HAZE).toBeGreaterThan(0);
    expect(BACKDROP_KEEP_HAZE).toBeLessThan(1);
  });
});
