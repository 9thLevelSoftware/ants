// Settings > Graphics (GDD 08 7.4): quality preset incl. Auto (device detection), resolution scale, dynamic
// resolution and its target, depth of field, haze, shadows, grass and litter density, field-of-view offset,
// fullscreen. Choosing a preset clears the individual overrides so the preset's own values apply; the controls
// show the values in effect (override, else the preset's).
import { useState } from 'preact/hooks';
import type { GraphicsOverrides, QualitySetting } from '@/render/app/quality';
import { Button, Field, SegmentedControl, Slider, Toggle } from '../../components';
import { effectiveGraphics } from './graphicsModel';
import { useGameSettings } from './useSettings';

const QUALITY_OPTIONS = [
  { value: 'auto', label: 'Auto' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'ultra', label: 'Ultra' },
] as const;

export function GraphicsTab() {
  const [settings, setSettings] = useGameSettings();
  const [fsNote, setFsNote] = useState('');
  if (!settings) return <p class="ui-notice">Settings are not available yet.</p>;
  const g = settings.graphics;
  const e = effectiveGraphics(g.quality, g.overrides);
  const setOverride = (o: GraphicsOverrides) => setSettings({ graphics: { overrides: { ...g.overrides, ...o } } });
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setFsNote('');
    } catch {
      setFsNote('Not allowed here');
    }
  };
  return (
    <div class="ui-fieldset">
      <Field label="Quality preset" help={g.quality === 'auto' ? 'Auto picks a preset for your device when the game starts.' : 'Choosing a preset resets the individual settings below.'} layout="stack">
        <SegmentedControl
          value={g.quality === ('test' as string) ? 'low' : g.quality} options={QUALITY_OPTIONS}
          onChange={(q) => setSettings({ graphics: { quality: q as QualitySetting, overrides: {} } })}
        />
      </Field>
      <Field label="Resolution scale" help="Renders fewer pixels and scales up. Lower it if the game stutters.">
        <Slider value={Math.round(e.resolutionScale * 100)} min={50} max={100} step={5} format={(v) => `${v} %`} onChange={(v) => setOverride({ resolutionScale: v / 100 })} />
      </Field>
      <Field label="Dynamic resolution" help="Lowers the resolution briefly when the frame rate drops.">
        <Toggle checked={e.dynamicResolution} onChange={(v) => setOverride({ dynamicResolution: v })} />
      </Field>
      <Field label="Target frame rate">
        <SegmentedControl value={e.targetFps} options={[{ value: 60, label: '60 fps' }, { value: 30, label: '30 fps' }]} onChange={(v) => setOverride({ targetFps: v })} disabled={!e.dynamicResolution} />
      </Field>
      <Field label="Depth of field">
        <SegmentedControl value={e.depthOfField} options={[{ value: 'off', label: 'Off' }, { value: 'subtle', label: 'Subtle' }, { value: 'full', label: 'Full' }]} onChange={(v) => setOverride({ depthOfField: v })} />
      </Field>
      <Field label="Haze" help="Distance haze that gives the scene its sense of scale.">
        <Toggle checked={e.haze} onChange={(v) => setOverride({ haze: v })} />
      </Field>
      <Field label="Shadows">
        <SegmentedControl value={e.shadows} options={[{ value: 'off', label: 'Off' }, { value: 'low', label: 'Low' }, { value: 'high', label: 'High' }]} onChange={(v) => setOverride({ shadows: v })} />
      </Field>
      <Field label="Grass and litter density">
        <Slider value={Math.round(e.density * 100)} min={25} max={100} step={5} format={(v) => `${v} %`} onChange={(v) => setOverride({ density: v / 100 })} />
      </Field>
      <Field label="Field of view offset" help="Degrees added to the camera's field of view while you control an ant.">
        <Slider value={settings.camera.fovOffset} min={-10} max={20} step={1} format={(v) => `${v > 0 ? '+' : ''}${v}°`} onChange={(v) => setSettings({ camera: { fovOffset: v } })} />
      </Field>
      <Field label="Fullscreen">
        <div class="ui-inline">
          <Button icon="fullscreen" onClick={() => void fullscreen()} data-testid="fullscreen">{document.fullscreenElement ? 'Leave fullscreen' : 'Enter fullscreen'}</Button>
          {fsNote && <span class="ui-note-inline" role="status">{fsNote}</span>}
        </div>
      </Field>
    </div>
  );
}
