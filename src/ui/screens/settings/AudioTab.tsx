// Settings > Audio (GDD 08 7.4): the status line (what the sound is really doing, with a button when a click can help),
// the six bus levels each with a Test button, music mode, mute when the tab is hidden, mono. Master and the mute switch
// live in the game's settings; the other levels are read and written through the same settings object (styles/prefs),
// so every change reaches the audio at once.
import { useEffect, useState } from 'preact/hooks';
import { audioEnable, audioStatusDetail, audioTest, ENABLE_BUTTON_LABEL, statusLine, type AudioStatusDetail, type TestBus } from '@/audio';
import { Button, Field, SegmentedControl, Slider, Toggle } from '../../components';
import { uiPrefs, type MusicMode } from '../../styles/prefs';
import { useGameSettings } from './useSettings';

const pct = (v: number) => `${Math.round(v)} %`;
/** A slider with its Test button beside it. */
const ROW = { display: 'flex', alignItems: 'center', gap: '12px', width: '100%' } as const;
const GROW = { flex: '1 1 auto', minWidth: 0 } as const;
const STATUS_POLL_MS = 400;

/** The audio status, re-read while the tab is open (it changes by itself: a gesture, a refusal, the tab hiding). */
function useAudioStatus(): AudioStatusDetail {
  const [detail, setDetail] = useState<AudioStatusDetail>(() => audioStatusDetail());
  useEffect(() => {
    const read = () => setDetail(audioStatusDetail());
    const id = setInterval(read, STATUS_POLL_MS);
    return () => clearInterval(id);
  }, []);
  return detail;
}

function StatusLine() {
  const detail = useAudioStatus();
  const line = statusLine(detail);
  const [, setTick] = useState(0);
  return (
    <div class={`ui-notice${line.tone === 'ok' || line.tone === 'neutral' ? '' : ' is-warn'}`} role="status" data-testid="audio-status" data-status={detail}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
      <span>{line.text}</span>
      {line.needsClick && (
        <Button variant="primary" data-testid="audio-enable" onClick={() => { audioEnable(); setTimeout(() => setTick((n) => n + 1), 1200); }}>
          {ENABLE_BUTTON_LABEL}
        </Button>
      )}
    </div>
  );
}

export function AudioTab() {
  const [settings, setSettings] = useGameSettings();
  const a = uiPrefs.prefs.value.audio;
  const set = (p: Partial<typeof a>) => uiPrefs.set({ audio: p });
  if (!settings) return <p class="ui-notice">Settings are not available yet.</p>;
  const test = (bus: TestBus) => (
    <Button variant="ghost" data-testid={`audio-test-${bus}`} aria-label={`Test ${bus} sound`} onClick={() => audioTest(bus)}>Test</Button>
  );
  const bus = (label: string, key: 'ambience' | 'effects' | 'giants' | 'interface' | 'music', testId: TestBus) => (
    <Field label={label}>
      <div style={ROW}><div style={GROW}><Slider value={Math.round(a[key] * 100)} min={0} max={100} step={5} format={pct} onChange={(v) => set({ [key]: v / 100 })} /></div>{test(testId)}</div>
    </Field>
  );
  // the alarm shimmer switch exists once the game's settings carry it (GDD 08 §13.5 "Settings can disable")
  const shimmer = settings.audio.alarmShimmer;
  return (
    <div class="ui-fieldset">
      <StatusLine />
      <Field label="Master volume">
        <div style={ROW}>
          <div style={GROW}><Slider value={Math.round(settings.audio.master * 100)} min={0} max={100} step={5} format={pct} onChange={(v) => setSettings({ audio: { master: v / 100 } })} /></div>
          {test('master')}
        </div>
      </Field>
      <Field label="Mute everything"><Toggle checked={settings.audio.muted} onChange={(v) => setSettings({ audio: { muted: v } })} /></Field>
      {bus('Ambience', 'ambience', 'ambience')}
      {bus('Effects', 'effects', 'effects')}
      {bus('Giant sounds', 'giants', 'giants')}
      {bus('Interface', 'interface', 'ui')}
      {bus('Music volume', 'music', 'music')}
      <Field label="Music">
        <SegmentedControl value={a.musicMode} onChange={(v: MusicMode) => set({ musicMode: v })} options={[{ value: 'off', label: 'Off' }, { value: 'sparse', label: 'Sparse' }, { value: 'frequent', label: 'Frequent' }]} />
      </Field>
      {shimmer !== undefined && (
        <Field label="Alarm shimmer" help="A short rising tone when the ant you control is inside an alarm cloud.">
          <Toggle checked={shimmer} onChange={(v) => setSettings({ audio: { alarmShimmer: v } })} />
        </Field>
      )}
      <Field label="Mute when the tab is hidden"><Toggle checked={a.muteWhenHidden} onChange={(v) => set({ muteWhenHidden: v })} /></Field>
      <Field label="Mono" help="Plays the left and right channels as one."><Toggle checked={a.mono} onChange={(v) => set({ mono: v })} /></Field>
    </div>
  );
}
