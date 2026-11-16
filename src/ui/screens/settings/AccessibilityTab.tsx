// Settings > Accessibility (GDD 08 7.4, 12): UI scale 80-150 %, text size, font, high contrast, reduced motion
// (System / On / Off), camera horizon, spider comfort ladder, overlay palette, sound-cue indicators, flash
// reduction. UI-only options live in the UI preference store and apply to the document at once.
import { Field, SegmentedControl, Slider, Toggle } from '../../components';
import { uiPrefs, type FontChoice, type MotionChoice, type OverlayPalette, type SpiderComfort } from '../../styles/prefs';
import { effectiveReducedMotion } from '../../styles';
import { useGameSettings } from './useSettings';

export function AccessibilityTab() {
  const [settings, setSettings] = useGameSettings();
  const a = uiPrefs.prefs.value.accessibility;
  const set = (p: Partial<typeof a>) => uiPrefs.set({ accessibility: p });
  const setMotion = (m: MotionChoice) => {
    set({ reducedMotion: m });
    // the camera follows: no sway or bob when reduced motion is in effect (GDD 08 2.4)
    setSettings({ camera: { reducedMotion: effectiveReducedMotion(m) } });
  };
  return (
    <div class="ui-fieldset">
      <Field label="UI scale" help="Scales every panel and label. Large scales switch to the compact layout.">
        <Slider value={Math.round(a.uiScale * 100)} min={80} max={150} step={10} format={(v) => `${v} %`} onChange={(v) => set({ uiScale: v / 100 })} />
      </Field>
      <Field label="Text size">
        <SegmentedControl value={a.textScale} onChange={(v) => set({ textScale: v })} options={[{ value: 1, label: '100 %' }, { value: 1.15, label: '115 %' }, { value: 1.3, label: '130 %' }]} />
      </Field>
      <Field label="Font">
        <SegmentedControl value={a.font} onChange={(v: FontChoice) => set({ font: v })} options={[{ value: 'standard', label: 'Standard' }, { value: 'hyperlegible', label: 'Hyperlegible' }]} />
      </Field>
      <Field label="High contrast" help="Black panels, white text and a thicker focus ring."><Toggle checked={a.highContrast} onChange={(v) => set({ highContrast: v })} /></Field>
      <Field label="Reduced motion" help="System follows your device setting. Reduced motion replaces transitions with short fades and stops camera sway.">
        <SegmentedControl value={a.reducedMotion} onChange={setMotion} options={[{ value: 'system', label: 'System' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
      </Field>
      {settings && (
        <Field label="Camera shake and sway" help={effectiveReducedMotion(a.reducedMotion) ? 'Reduced motion is on, so the camera does not shake.' : 'How strongly the camera shakes when a footstep lands nearby.'}>
          <Slider
            value={effectiveReducedMotion(a.reducedMotion) ? 0 : settings.accessibility.shake} min={0} max={100} step={5} format={(v) => `${v} %`}
            disabled={effectiveReducedMotion(a.reducedMotion)} onChange={(v) => setSettings({ accessibility: { shake: v } })} data-testid="shake-slider"
          />
        </Field>
      )}
      {settings && (
        <Field label="Camera horizon">
          <SegmentedControl value={settings.camera.worldUpLock ? 'level' : 'follow'} onChange={(v) => setSettings({ camera: { worldUpLock: v === 'level' } })} options={[{ value: 'follow', label: 'Follow surface' }, { value: 'level', label: 'Keep level' }]} />
        </Field>
      )}
      <Field label="Spider comfort" help="Changes how spiders are drawn. Their behaviour and sound stay the same.">
        <SegmentedControl value={a.spiderComfort} onChange={(v: SpiderComfort) => set({ spiderComfort: v })} options={[{ value: 'off', label: 'Off' }, { value: 'softened', label: 'Softened' }, { value: 'abstract', label: 'Abstract' }, { value: 'marker', label: 'Marker only' }]} />
      </Field>
      <Field label="Also apply to mites and centipedes"><Toggle checked={a.comfortMitesCentipedes} onChange={(v) => set({ comfortMitesCentipedes: v })} /></Field>
      <Field label="Overlay palette" help="Okabe-Ito colours are safe for every kind of colour blindness. High contrast and Pattern only also drop the colours of status marks, which always carry a shape and a word.">
        <SegmentedControl value={a.overlayPalette} onChange={(v: OverlayPalette) => set({ overlayPalette: v })} options={[{ value: 'okabe-ito', label: 'Okabe-Ito' }, { value: 'high-contrast', label: 'High contrast' }, { value: 'pattern-only', label: 'Pattern only' }]} />
      </Field>
      <Field label="Sound-cue indicators" help="Shows an edge marker for sounds that carry information."><Toggle checked={a.soundCueIndicators} onChange={(v) => set({ soundCueIndicators: v })} /></Field>
      <Field label="Flash reduction"><Toggle checked={a.flashReduction} onChange={(v) => set({ flashReduction: v })} /></Field>
    </div>
  );
}
