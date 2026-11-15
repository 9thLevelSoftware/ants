// Adversarial checks of the overlay state seam (task ui-panels review, GDD 08 10.1): the host sees exactly one exclusive
// overlay at a time, a late host is brought up to date, and an unregistered host is never called again.
import { beforeEach, describe, expect, it } from 'vitest';
import type { OverlayId } from './catalogue';
import { legendFor, OVERLAY_IDS } from './catalogue';
import { clearOverlays, cycleOtherOverlay, overlays, registerOverlayHost, setOverlay, toggleOverlay } from './state';

function recordingHost() {
  const on = new Set<OverlayId>();
  const calls: string[] = [];
  return { on, calls, host: { setOverlay(id: OverlayId, v: boolean) { calls.push(`${id}:${v}`); if (v) on.add(id); else on.delete(id); } } };
}

beforeEach(() => { overlays.value = { scent: false, other: null }; });

describe('host seam', () => {
  it('cycling through every exclusive overlay leaves the host with at most one of them on', () => {
    const r = recordingHost();
    const stop = registerOverlayHost(r.host);
    setOverlay('scent', true);
    for (let i = 0; i < 6; i++) {
      cycleOtherOverlay();
      const exclusive = [...r.on].filter((id) => id !== 'scent');
      expect(exclusive.length).toBeLessThanOrEqual(1);
      expect(exclusive[0] ?? null).toBe(overlays.peek().other);
      expect(r.on.has('scent')).toBe(true);
    }
    stop();
  });

  it('a host registered late is told what is already on', () => {
    toggleOverlay('scent');
    setOverlay('moisture', true);
    const r = recordingHost();
    const stop = registerOverlayHost(r.host);
    expect([...r.on].sort()).toEqual(['moisture', 'scent']);
    stop();
  });

  it('after unregistering, the host is not called', () => {
    const r = recordingHost();
    registerOverlayHost(r.host)();
    setOverlay('threats', true);
    clearOverlays();
    expect(r.calls).toEqual([]);
  });

  it('switching one exclusive overlay directly to another turns the first off at the host', () => {
    const r = recordingHost();
    const stop = registerOverlayHost(r.host);
    setOverlay('temperature', true);
    setOverlay('threats', true);
    expect([...r.on]).toEqual(['threats']);
    stop();
  });
});

describe('legends', () => {
  it('every overlay has a titled legend with a footnote', () => {
    for (const id of OVERLAY_IDS) {
      const L = legendFor(id, { lo: 22, hi: 27 });
      expect(L.title.length).toBeGreaterThan(0);
      expect(L.footnote.length).toBeGreaterThan(0);
    }
  });

});
