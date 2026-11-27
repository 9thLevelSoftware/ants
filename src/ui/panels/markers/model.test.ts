// Marker palette model: tool order, counts against caps, the options each tool offers (task ui-panels, GDD 08 4.3).
import { describe, expect, it } from 'vitest';
import { COLONY_TOOLS, type UiToolState } from '../wiring/bridgeTypes';
import { atCap, countText, optionsFor, paletteTools, TOOL_INFO } from './model';

const state = (o: Partial<UiToolState> = {}): UiToolState => ({
  tool: null, radiusBu: { forage: 30, avoid: 30, rally: 15 }, radiusRange: { forage: [10, 80], avoid: [10, 80], rally: [8, 32] }, rallyMode: 'defend',
  markerPriority: 'normal', planner: { template: 'chamber', chamberType: 'nursery', chamberTypes: ['nursery', 'food', 'rest'], size: 'm', priority: 'normal' }, message: null, ...o,
});

describe('palette', () => {
  it('lists the seven tools in the order of GDD 08 4.3 with Shift+1..7', () => {
    expect(paletteTools().map((t) => [t.info.id, t.key])).toEqual([['dig', 1], ['forage', 2], ['avoid', 3], ['rally', 4], ['entrance', 5], ['move-brood', 6], ['move-queen', 7]]);
    for (const id of COLONY_TOOLS) { expect(TOOL_INFO[id].icon).toBe(`marker-${id}`); expect(TOOL_INFO[id].hint.length).toBeGreaterThan(10); }
  });
  it("the Dig hint tells that the soil beside a room works too (app-seams-4: the planner snaps a click up to 8 BU from a room to its wall)", () => {
    expect(TOOL_INFO.dig.hint).toMatch(/soil/);
    expect(TOOL_INFO.dig.hint).toMatch(/nest wall/);
  });
  it('counts read n/cap and flag the cap', () => {
    expect(countText({ n: 3, cap: 8 })).toBe('3/8');
    expect(countText(undefined)).toBe('');
    expect(atCap({ n: 8, cap: 8 })).toBe(true);
    expect(atCap({ n: 7, cap: 8 })).toBe(false);
    expect(atCap(undefined)).toBe(false);
  });
});

describe('tool options', () => {
  it('forage: radius in 10-80 BU and priority', () => {
    const o = optionsFor('forage', state());
    expect(o[0]).toEqual({ kind: 'radius', marker: 'forage', min: 10, max: 80, value: 30 });
    expect(o[1]).toEqual({ kind: 'priority-marker', value: 'normal' });
  });
  it('rally: radius in 8-32 BU and the defend / attack mode', () => {
    const o = optionsFor('rally', state({ rallyMode: 'attack' }));
    expect(o[0]).toMatchObject({ kind: 'radius', min: 8, max: 32, value: 15 });
    expect(o[1]).toEqual({ kind: 'rally-mode', value: 'attack' });
  });
  it('dig: template, chamber type and size, priority; a tunnel has no type or size', () => {
    expect(optionsFor('dig', state()).map((o) => o.kind)).toEqual(['template', 'chamber-type', 'size', 'priority-plan']);
    const t = state(); t.planner.template = 'tunnel';
    expect(optionsFor('dig', t).map((o) => o.kind)).toEqual(['template', 'priority-plan']);
  });
  it('avoid, entrance and the chamber tools stay simple; the pointer has none', () => {
    expect(optionsFor('avoid', state()).map((o) => o.kind)).toEqual(['radius']);
    expect(optionsFor('entrance', state()).map((o) => o.kind)).toEqual(['priority-plan']);
    expect(optionsFor('move-brood', state())).toEqual([]);
    expect(optionsFor(null, state())).toEqual([]);
  });
});
