// Settings > Audio (GDD 08 7.4): the six bus levels, music mode, mute when the tab is hidden, mono. Master and the
// mute switch live in the game's settings; the other buses are UI preferences until the audio task reads them.
import { Field, SegmentedControl, Slider, Toggle } from '../../components';
import { uiPrefs, type MusicMode } from '../../styles/prefs';
import { useGameSettings } from './useSettings';

const pct = (v: number) => `${Math.round(v)} %`;

export function AudioTab() {
  const [settings, setSettings] = useGameSettings();
  const a = uiPrefs.prefs.value.audio;
  const set = (p: Partial<typeof a>) => uiPrefs.set({ audio: p });
  if (!settings) return <p class="ui-notice">Settings are not available yet.</p>;
  const bus = (label: string, key: 'ambience' | 'effects' | 'giants' | 'interface' | 'music') => (
    <Field label={label}><Slider value={Math.round(a[key] * 100)} min={0} max={100} step={5} format={pct} onChange={(v) => set({ [key]: v / 100 })} /></Field>
  );
  return (
    <div class="ui-fieldset">
      <Field label="Master volume">
        <Slider value={Math.round(settings.audio.master * 100)} min={0} max={100} step={5} format={pct} onChange={(v) => setSettings({ audio: { master: v / 100 } })} />
      </Field>
      <Field label="Mute everything"><Toggle checked={settings.audio.muted} onChange={(v) => setSettings({ audio: { muted: v } })} /></Field>
      {bus('Ambience', 'ambience')}
      {bus('Effects', 'effects')}
      {bus('Giant sounds', 'giants')}
      {bus('Interface', 'interface')}
      {bus('Music', 'music')}
      <Field label="Music">
        <SegmentedControl value={a.musicMode} onChange={(v: MusicMode) => set({ musicMode: v })} options={[{ value: 'off', label: 'Off' }, { value: 'sparse', label: 'Sparse' }, { value: 'frequent', label: 'Frequent' }]} />
      </Field>
      <Field label="Mute when the tab is hidden"><Toggle checked={a.muteWhenHidden} onChange={(v) => set({ muteWhenHidden: v })} /></Field>
      <Field label="Mono" help="Plays the left and right channels as one."><Toggle checked={a.mono} onChange={(v) => set({ mono: v })} /></Field>
    </div>
  );
}
