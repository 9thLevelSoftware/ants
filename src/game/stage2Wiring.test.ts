// wire-stage2: game-side wiring of the Stage 2 renderers and debug read-outs. Comfort settings for the frame, the
// "never auto-frame softened spiders" rule (GDD 08 §12), the fx renderer as the UI's overlay host with the palette
// from Settings > Accessibility, dig-plan outlines in every view while the dig-plans overlay is on, and the debug
// queries (rivals, territory, plants, herds, humans, weather).
import { afterEach, describe, expect, it } from 'vitest';
import { FxRenderer } from '@/render/fx/overlays/FxRenderer';
import type { RenderRegistry } from '@/render';
import { makeTestSim } from '@/sim/testing';
import type { Command, Sim } from '@/sim/types';
import { collectRefusals } from '@/game/refusals';
import { setOverlay } from '@/ui/overlays/state';
import { clearOverlays, ComfortFeed, comfortOf, installOverlayHost, mayAutoFrame } from './stage2Wiring';
import { SettingsStore } from './settings/settings';
import { buildMarkerScene } from './views/colony/markerScene';
import { DigPlanner, playerNest } from './views/colony/digPlanner';
import { buildQueries } from './debug/query';
import { registerStage2Queries } from './debug/stage2Debug';

/** A registry holding a bare FxRenderer in the fx slot (nothing initialised: only its host side is used). */
function fakeRegistry(fx: FxRenderer): RenderRegistry {
  return { entries: [{ slot: 'fx', renderer: fx, debug: false }] } as unknown as RenderRegistry;
}

afterEach(() => clearOverlays());

describe('comfort settings in the frame', () => {
  it('carries the three comfort fields and is rebuilt only when the accessibility section changes', () => {
    const settings = new SettingsStore();
    const feed = new ComfortFeed();
    const a = feed.get(settings.get());
    expect(a).toEqual({ spiderComfort: 'off', comfortMites: false, comfortCentipedes: false });
    expect(feed.get(settings.get())).toBe(a);
    settings.set({ accessibility: { spiderComfort: 'softened', comfortMites: true } });
    const b = feed.get(settings.get());
    expect(b).not.toBe(a);
    expect(b).toEqual(comfortOf(settings.get()));
    expect(b.spiderComfort).toBe('softened');
  });

  it('a creature under spider comfort is never auto-framed; others are', () => {
    const soft = { spiderComfort: 'softened', comfortMites: false, comfortCentipedes: false } as const;
    expect(mayAutoFrame('wolf-spider', soft)).toBe(false);
    expect(mayAutoFrame('jumping-spider', { ...soft, spiderComfort: 'marker' })).toBe(false);
    expect(mayAutoFrame('wolf-spider', { ...soft, spiderComfort: 'off' })).toBe(true);
    expect(mayAutoFrame('mite', soft)).toBe(true); // mites only when opted in
    expect(mayAutoFrame('mite', { ...soft, comfortMites: true })).toBe(false);
  });
});

describe('fx renderer as the overlay host', () => {
  it('receives the UI overlay switches, follows the palette setting, and stops after the undo', () => {
    const fx = new FxRenderer();
    const settings = new SettingsStore();
    const palettes: string[] = [];
    const setPalette = fx.setPalette.bind(fx);
    fx.setPalette = (p) => { palettes.push(p); setPalette(p); };
    const undo = installOverlayHost(fakeRegistry(fx), settings);
    expect(palettes).toEqual(['okabe-ito']);
    setOverlay('dig-plans', true); // through the UI state, as the HUD buttons and hotkeys do
    expect(fx.digPlansOverlay).toBe(true);
    setOverlay('scent', true);
    expect(fx.overlayState).toEqual({ scent: true, other: 'dig-plans' });
    settings.set({ accessibility: { overlayPalette: 'high-contrast' } });
    expect(palettes.at(-1)).toBe('high-contrast');
    clearOverlays();
    expect(fx.overlayState).toEqual({ scent: false, other: null });
    undo();
    setOverlay('moisture', true);
    expect(fx.overlayState.other).toBeNull();
    settings.set({ accessibility: { overlayPalette: 'pattern-only' } });
    expect(palettes.at(-1)).toBe('high-contrast');
  });
});

describe('dig-plan outlines outside the colony view', () => {
  function simWithPlan(): Sim {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const ch = playerNest(sim)!.chambers.find((c) => c.type === 'nursery')!;
    const out = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 0, z: 0 };
    sim.field.project({ x: ch.center.x + ch.radii.x, y: ch.center.y, z: ch.center.z }, 0, out, n);
    const p = new DigPlanner();
    p.chamberType = 'nursery';
    p.hover(sim, { point: out, normal: n, kind: 'wall' });
    const host = {
      sim, toast() {}, possess() {},
      command(cmd: Command) { sim.enqueue(cmd); return { applied: true, rejected: collectRefusals(sim, () => { sim.applyPendingCommands(); sim.events.flush(); }) }; },
    };
    const r = p.confirm(host);
    if (r.outcome === 'confirm-warnings') p.confirm(host);
    return sim;
  }

  it('draws the plans in a non-colony view only while the dig-plans overlay asks for them', () => {
    const sim = simWithPlan();
    expect(playerNest(sim)!.digPlans.length).toBeGreaterThan(0);
    const base = { sim, selectedMarkerId: -1, selectedPlanId: -1, preview: null, tunnelStart: null, hover: null, selected: null };
    const colony = buildMarkerScene({ ...base, colony: true });
    const off = buildMarkerScene({ ...base, colony: false });
    const on = buildMarkerScene({ ...base, colony: false, plans: true });
    expect(off.lines.length).toBe(0);
    expect(on.lines.length).toBe(playerNest(sim)!.digPlans.length);
    expect(on.lines.length).toBeLessThanOrEqual(colony.lines.length);
    expect(on.version).not.toBe(off.version);
  });
});

describe('Stage 2 debug queries', () => {
  it('rivals, territory, plants, herds, humans and weather return plain data', () => {
    registerStage2Queries();
    const sim = makeTestSim({});
    const q = buildQueries(() => sim) as unknown as Record<string, (...a: unknown[]) => unknown>;
    expect(Array.isArray(q.rivals())).toBe(true);
    const claim = q.territory({ x: sim.world.size / 2, z: sim.world.size / 2 }) as { owner: number; contested: boolean };
    expect(typeof claim.owner).toBe('number');
    expect(q.territory()).toBeNull();
    expect(Array.isArray(q.plants())).toBe(true);
    expect(Array.isArray(q.herds())).toBe(true);
    expect(Array.isArray(q.humans())).toBe(true);
    expect(q.weather()).toMatchObject({ state: expect.any(String), rainRateMmH: expect.any(Number) });
    expect(Array.isArray(q.creatures())).toBe(true);
    expect(Array.isArray(q.humanSites())).toBe(true);
    expect(q.bird()).toBeNull();
  });
});
