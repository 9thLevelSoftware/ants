// The marker palette and tool options of the colony view (GDD 08 4.3): seven tool buttons and Select at the top of the screen
// (360, 16, 560 x 48 dp), each with its icon, its name and the count of active markers against the cap; under it the
// options of the active tool (radius, rally mode, plan template, chamber type, size, priority). It drives the views layer
// through the panels bridge; placing, ghosts and plans stay there.
import { Icon } from '../../icons';
import { Slider } from '../../components/Slider';
import { SegmentedControl } from '../../components/SegmentedControl';
import { Select } from '../../components/Select';
import { cx } from '../../components/cx';
import { markersSlice } from '../wiring/slices';
import { panelsBridge } from '../wiring/state';
import { chamberWord } from '../nest/model';
import type { ColonyToolId } from '../wiring/bridgeTypes';
import { atCap, countText, optionsFor, paletteTools, POINTER_HINT, TOOL_INFO, type ToolOption } from './model';
import { refreshToolState, toolState } from './toolState';

/** A pointer click on a tool never takes the keyboard focus from the game (Tab still reaches the tools). */
const noFocus = (e: MouseEvent): void => e.preventDefault();

function Option({ o }: { o: ToolOption }) {
  const bridge = panelsBridge.value;
  const after = (): void => refreshToolState();
  switch (o.kind) {
    case 'radius':
      return (
        <label class="pn-opt"><span>Radius</span>
          <Slider min={o.min} max={o.max} step={1} value={o.value} format={(v) => `${v} BU`} aria-label={`${TOOL_INFO[o.marker].word} radius`} onChange={(v) => { bridge?.setRadius(o.marker, v); after(); }} />
        </label>
      );
    case 'priority-marker':
    case 'priority-plan':
      return (
        <div class="pn-opt"><span>Priority</span>
          <SegmentedControl aria-label="Priority" value={o.value} fill={false} options={[{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]}
            onChange={(v: 'normal' | 'high') => { if (o.kind === 'priority-marker') bridge?.setMarkerPriority(v); else bridge?.setPlanner({ priority: v }); after(); }} />
        </div>
      );
    case 'rally-mode':
      return (
        <div class="pn-opt"><span>Mode</span>
          <SegmentedControl aria-label="Rally mode" value={o.value} fill={false} options={[{ value: 'defend', label: 'Defend' }, { value: 'attack', label: 'Attack' }]}
            onChange={(v: 'defend' | 'attack') => { bridge?.setRallyMode(v); after(); }} />
        </div>
      );
    case 'template':
      return (
        <div class="pn-opt"><span>Template</span>
          <SegmentedControl aria-label="Dig template" value={o.value} fill={false} options={[{ value: 'chamber', label: 'Chamber' }, { value: 'tunnel', label: 'Tunnel' }, { value: 'shaft', label: 'Shaft' }]}
            onChange={(v: 'chamber' | 'tunnel' | 'shaft') => { bridge?.setPlanner({ template: v }); after(); }} />
        </div>
      );
    case 'chamber-type':
      return (
        <label class="pn-opt"><span>Type</span>
          <Select aria-label="Chamber type" value={o.value} options={o.types.map((t) => ({ value: t, label: chamberWord(t) }))} onChange={(v: string) => { bridge?.setPlanner({ chamberType: v }); after(); }} />
        </label>
      );
    case 'size':
      return (
        <div class="pn-opt"><span>Size</span>
          <SegmentedControl aria-label="Chamber size" value={o.value} fill={false} options={[{ value: 's', label: 'Small' }, { value: 'm', label: 'Medium' }, { value: 'l', label: 'Large' }]}
            onChange={(v: 's' | 'm' | 'l') => { bridge?.setPlanner({ size: v }); after(); }} />
        </div>
      );
  }
}

export function MarkerPalette() {
  const bridge = panelsBridge.value;
  const ts = toolState.value;
  const counts = markersSlice.value?.counts ?? {};
  const active = ts?.tool ?? null;
  const select = (t: ColonyToolId | null): void => { bridge?.selectTool(t); refreshToolState(); };
  const opts = ts ? optionsFor(active, ts) : [];
  return (
    <>
      <div class="pn-palette pn-panel" role="toolbar" aria-label="Markers and dig plans" data-testid="marker-palette" data-active={active ?? 'select'}>
        {paletteTools().map(({ info, key }) => {
          const c = counts[info.id];
          const full = atCap(c);
          return (
            <button
              key={info.id} type="button" class={cx('pn-tool', active === info.id && 'is-active', full && 'is-full')} data-tool={info.id}
              aria-pressed={active === info.id ? 'true' : 'false'} aria-label={`${info.word}${c ? `, ${c.n} of ${c.cap} placed` : ''}${full ? ', limit reached' : ''}`}
              title={`${info.word} (Shift+${key})`} onMouseDown={noFocus} onClick={() => select(active === info.id ? null : info.id)}
            >
              <Icon name={info.icon} size={20} decorative />
              <span class="pn-tool-count" aria-hidden="true">{countText(c)}</span>
              <span class="pn-tool-key" aria-hidden="true">{key}</span>
            </button>
          );
        })}
        <span class="pn-palette-sep" aria-hidden="true" />
        <button type="button" class={cx('pn-tool', active === null && 'is-active')} data-tool="select" aria-pressed={active === null ? 'true' : 'false'} aria-label="Select" title="Select" onMouseDown={noFocus} onClick={() => select(null)}>
          <Icon name="follow" size={20} decorative />
          <span class="pn-tool-count" aria-hidden="true">Select</span>
        </button>
      </div>
      <div class="pn-tool-options pn-panel" data-testid="marker-options" aria-label="Tool options" role="group">
        {opts.map((o, i) => <Option key={`${o.kind}${i}`} o={o} />)}
        <p class="pn-tool-hint">
          {active ? TOOL_INFO[active].hint : POINTER_HINT}
          {active && atCap(counts[active]) && ` Limit reached (${counts[active].cap}). Remove a marker first.`}
        </p>
        {ts?.message && <p class="pn-tool-msg" role="status">{ts.message}</p>}
      </div>
    </>
  );
}

