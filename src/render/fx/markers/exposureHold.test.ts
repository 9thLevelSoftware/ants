// Marker outlines and labels are divided by the renderer's exposure before each draw (gate-close-app: a bright
// metered colony slice blew the label plates and outlines out to white).
import { describe, expect, it } from 'vitest';
import { LineBasicMaterial, LineSegments, Scene } from 'three';
import { MarkerRenderer } from './MarkerRenderer';

describe('marker exposure hold', () => {
  it('a line keeps its authored colour whatever the exposure', () => {
    const scene = new Scene();
    const r = new MarkerRenderer(scene);
    r.update({ version: '1', lines: [{ positions: [0, 0, 0, 1, 0, 0], color: '#808080', style: 'solid' }], labels: [], volumes: [] });
    const seg = scene.getObjectByName('fx:markers')!.children.find((c) => c instanceof LineSegments) as LineSegments;
    const m = seg.material as LineBasicMaterial;
    const base = m.color.r;
    const call = (e: number) => (seg.onBeforeRender as unknown as (r: { toneMappingExposure: number }) => void)({ toneMappingExposure: e });
    call(4);
    expect(m.color.r * 4).toBeCloseTo(base, 6);
    call(1);
    expect(m.color.r).toBeCloseTo(base, 6);
  });
});
