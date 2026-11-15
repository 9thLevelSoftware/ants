// Mock facade and panels bridge of the panels demo (task ui-panels): the HUD demo's facade (settings, directives, speed,
// roster) plus the panels' seam, recording what the panels asked of the game so a script can check it.
import { MARKER_RADIUS_RANGE_BU } from '@/sim/balance/colony';
import type { UiFocus, UiSnapshot } from '@/ui/api';
import type { PanelsBridge, PlanTemplateId, UiToolState } from '@/ui/panels/wiring/bridgeTypes';
import { setSnapshot, snapshot } from '@/ui/store';
import { HudMockFacade } from '../hud-demo/mock';

export class PanelsMockFacade extends HudMockFacade {
  setView(view?: 'possess' | 'observer' | 'colony' | 'photo'): void {
    if (!view) return;
    this.calls.push(`setView ${view}`);
    setSnapshot({ ...snapshot.value, view, rev: snapshot.value.rev + 1 });
  }
}

export class MockPanelsBridge implements PanelsBridge {
  readonly calls: string[] = [];
  readonly state: UiToolState = {
    tool: null, radiusBu: { forage: 30, avoid: 30, rally: 15 }, radiusRange: { forage: [10, 80], avoid: [10, 80], rally: [8, 32] }, rallyMode: 'defend', markerPriority: 'normal',
    planner: { template: 'chamber', chamberType: 'nursery', chamberTypes: ['royal', 'nursery', 'food', 'midden', 'rest', 'general'], size: 'm', priority: 'normal' }, message: null,
  };
  private snap: UiSnapshot | null = null;

  tool(): UiToolState { return { ...this.state, radiusBu: { ...this.state.radiusBu }, planner: { ...this.state.planner } }; }
  selectTool(tool: UiToolState['tool']): void {
    this.calls.push(`selectTool ${tool}`);
    this.state.tool = tool;
    if (tool && snapshot.value.view !== 'colony') setSnapshot({ ...snapshot.value, view: 'colony', rev: snapshot.value.rev + 1 });
  }
  setRadius(kind: string, bu: number): void {
    this.calls.push(`setRadius ${kind} ${bu}`);
    const r = MARKER_RADIUS_RANGE_BU[kind as 'forage'];
    this.state.radiusBu[kind] = r ? Math.max(r[0], Math.min(r[1], bu)) : bu;
  }
  setRallyMode(mode: 'defend' | 'attack'): void { this.calls.push(`setRallyMode ${mode}`); this.state.rallyMode = mode; }
  setMarkerPriority(p: 'normal' | 'high'): void { this.calls.push(`setMarkerPriority ${p}`); this.state.markerPriority = p; }
  setPlanner(o: Partial<{ template: PlanTemplateId; chamberType: string; size: 's' | 'm' | 'l'; priority: 'normal' | 'high' }>): void {
    this.calls.push(`setPlanner ${JSON.stringify(o)}`);
    Object.assign(this.state.planner, o);
  }
  jumpToChamber(chamberId: number): void { this.calls.push(`jumpToChamber ${chamberId}`); setSnapshot({ ...snapshot.value, view: 'colony', rev: snapshot.value.rev + 1 }); }
  jumpTo(focus: UiFocus): void { this.calls.push(`jumpTo ${focus.kind} ${focus.id}`); }
  designateChamber(chamberId: number, type: string): boolean {
    this.calls.push(`designateChamber ${chamberId} ${type}`);
    const n = snapshot.value.nest;
    if (!n) return false;
    setSnapshot({ ...snapshot.value, nest: { ...n, chambers: n.chambers.map((c) => (c.id === chamberId ? { ...c, type, designatedBy: 'player' } : c)) }, rev: snapshot.value.rev + 1 });
    return true;
  }
  toggleEntrance(entranceId: number): 'seal' | 'reopen' | null {
    const n = snapshot.value.nest;
    const e = n?.entrances.find((x) => x.id === entranceId);
    if (!n || !e) return null;
    const next = e.status === 'open' ? 'sealed' : 'open';
    this.calls.push(`toggleEntrance ${entranceId} ${next}`);
    setSnapshot({ ...snapshot.value, nest: { ...n, entrances: n.entrances.map((x) => (x.id === entranceId ? { ...x, status: next } : x)) }, rev: snapshot.value.rev + 1 });
    return e.status === 'open' ? 'seal' : 'reopen';
  }
  codexDevice(): Record<string, { label: string }> { return {}; }
  unused(): UiSnapshot | null { return this.snap; }
}
