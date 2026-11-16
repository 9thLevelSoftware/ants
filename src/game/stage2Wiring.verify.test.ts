// Independent review of wire-stage2 (adversarial checks on the game side). Tests that pass stay as regressions.
import { afterEach, describe, expect, it } from 'vitest';
import { FxRenderer } from '@/render/fx/overlays/FxRenderer';
import type { RenderRegistry } from '@/render';
import { DebugFxRenderer } from '@/render/debug';
import { makeTestSim } from '@/sim/testing';
import type { Command, Sim } from '@/sim/types';
import { collectRefusals } from '@/game/refusals';
import { overlays, setOverlay } from '@/ui/overlays/state';
import { clearOverlays, ComfortFeed, creatureLookOf, installOverlayHost, mayAutoFrame } from './stage2Wiring';
import { SettingsStore } from './settings/settings';
import { buildMarkerScene } from './views/colony/markerScene';
import { DigPlanner, playerNest } from './views/colony/digPlanner';
import { buildQueries } from './debug/query';
import { registerStage2Queries } from './debug/stage2Debug';

const registryWith = (slot: string, renderer: unknown) =>
  ({ entries: [{ slot, renderer, debug: false }] }) as unknown as RenderRegistry;

afterEach(() => clearOverlays());

describe('wire-stage2 review: overlay host', () => {
  it('a debug fx slot (?render=debug) installs nothing and the UI overlay switches still work', () => {
    const undo = installOverlayHost(registryWith('fx', new DebugFxRenderer()), new SettingsStore());
    expect(() => setOverlay('moisture', true)).not.toThrow();
    expect(overlays.peek().other).toBe('moisture');
    undo();
  });

  it('an overlay switched on before the host is installed reaches the renderer', () => {
    setOverlay('threats', true);
    setOverlay('scent', true);
    const fx = new FxRenderer();
    const undo = installOverlayHost(registryWith('fx', fx), new SettingsStore());
    expect(fx.overlayState).toEqual({ scent: true, other: 'threats' });
    undo();
  });

  it('the palette is re-applied only for accessibility changes', () => {
    const fx = new FxRenderer();
    const settings = new SettingsStore();
    let calls = 0;
    const setPalette = fx.setPalette.bind(fx);
    fx.setPalette = (p) => { calls++; setPalette(p); };
    const undo = installOverlayHost(registryWith('fx', fx), settings);
    expect(calls).toBe(1);
    settings.set({ audio: { master: 0.3 } });
    expect(calls).toBe(1);
    settings.set({ accessibility: { overlayPalette: 'pattern-only' } });
    expect(calls).toBe(2);
    undo();
  });
});

describe('wire-stage2 review: comfort', () => {
  it('the comfort feed keeps one object per accessibility section (no per-frame allocation) and follows changes', () => {
    const settings = new SettingsStore();
    const feed = new ComfortFeed();
    const a = feed.get(settings.get());
    settings.set({ audio: { master: 0.4 } });
    const b = feed.get(settings.get());
    expect(b).toEqual(a);
    settings.set({ accessibility: { spiderComfort: 'marker', comfortCentipedes: true } });
    expect(feed.get(settings.get())).toEqual({ spiderComfort: 'marker', comfortMites: false, comfortCentipedes: true });
  });

  it('auto-framing: every spider kind under any comfort level is excluded, opt-in substitutes only when opted in', () => {
    const c = (spiderComfort: 'off' | 'softened' | 'abstract' | 'marker', comfortCentipedes = false) =>
      ({ spiderComfort, comfortMites: false, comfortCentipedes });
    for (const k of ['wolf-spider', 'jumping-spider', 'ant-spider'] as const) {
      expect(mayAutoFrame(k, c('off'))).toBe(true);
      for (const l of ['softened', 'abstract', 'marker'] as const) expect(mayAutoFrame(k, c(l))).toBe(false);
    }
    expect(mayAutoFrame('centipede', c('softened'))).toBe(true);
    expect(mayAutoFrame('centipede', c('softened', true))).toBe(false);
    expect(mayAutoFrame('ladybird', c('marker', true))).toBe(true);
  });

  it('look read-out is null without a real creature slot', () => {
    expect(creatureLookOf(null, 1)).toBeNull();
    expect(creatureLookOf(registryWith('creatures', { name: 'debug', update() {} }), 1)).toBeNull();
  });
});

describe('wire-stage2 review: dig-plan outlines outside the colony view', () => {
  function simWithPlanAndMarker(): Sim {
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
    const q = sim.stores.ants.get(sim.state.colonies[0]!.queenId)!;
    host.command({ type: 'placeMarker', kind: 'forage', pos: { x: q.pos.x + 200, y: 0, z: q.pos.z }, radius: 30 * sim.world.bu });
    return sim;
  }

  it('the overlay brings plan outlines only: markers stay a colony-view thing', () => {
    const sim = simWithPlanAndMarker();
    expect(sim.state.markers.filter((m) => m.alive).length).toBe(1);
    const base = { sim, selectedMarkerId: -1, selectedPlanId: -1, preview: null, tunnelStart: null, hover: null, selected: null };
    const plans = playerNest(sim)!.digPlans.length;
    expect(plans).toBeGreaterThan(0);
    const colony = buildMarkerScene({ ...base, colony: true });
    const outside = buildMarkerScene({ ...base, colony: false, plans: true });
    expect(colony.lines.length).toBe(plans + 1);
    expect(outside.lines.length).toBe(plans);
    // the same plans in both, so the colony view with the overlay on draws nothing twice
    expect(buildMarkerScene({ ...base, colony: true, plans: true }).lines.length).toBe(colony.lines.length);
  });
});

describe('wire-stage2 review: debug queries', () => {
  it('weather(near) returns the nearest puddle cell with its depth in mm (0.05 mm units)', () => {
    registerStage2Queries();
    const sim = makeTestSim({});
    const q = buildQueries(() => sim) as unknown as Record<string, (...a: unknown[]) => unknown>;
    const m = sim.state.env.moisture;
    m.puddle.fill(0);
    expect((q.weather({ x: 0, z: 0 }) as { puddle: unknown }).puddle).toBeNull();
    const far = 0, near = m.nx * 3 + 4;
    m.puddle[far] = 40; m.puddle[near] = 100;
    const target = { x: (4 + 0.5) * m.cell + 1, z: (3 + 0.5) * m.cell - 1 };
    const w = q.weather(target) as { puddle: { x: number; z: number; depthMm: number; cells: number } };
    expect(w.puddle.cells).toBe(2);
    expect(w.puddle.x).toBeCloseTo((4 + 0.5) * m.cell, 9);
    expect(w.puddle.z).toBeCloseTo((3 + 0.5) * m.cell, 9);
    expect(w.puddle.depthMm).toBeCloseTo(5, 9);
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });

  it('territory accepts numeric strings; creatures lists only living ones', () => {
    registerStage2Queries();
    const sim = makeTestSim({});
    const q = buildQueries(() => sim) as unknown as Record<string, (...a: unknown[]) => unknown>;
    const s = String(sim.world.size / 2);
    expect(q.territory({ x: s, z: s })).toEqual(q.territory({ x: sim.world.size / 2, z: sim.world.size / 2 }));
    const qa = sim.stores.ants.get(sim.state.colonies[0]!.queenId)!;
    sim.enqueue({ type: 'cheat.spawnCreature', kind: 'woodlouse', variant: null, pos: { ...qa.pos, x: qa.pos.x + 30 }, state: null });
    sim.tick();
    const before = (q.creatures() as { id: number }[]).length;
    expect(before).toBeGreaterThan(0);
    sim.state.creatures.forEach((c) => { c.alive = false; });
    expect(q.creatures()).toEqual([]);
  });
});
