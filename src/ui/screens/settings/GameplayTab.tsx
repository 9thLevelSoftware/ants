// Settings > Gameplay (GDD 08 7.4): autosave interval, prompts, hints and aims with "Reset hints", minimap, focus
// line, milestone notices, plus the game-level switches of GameSettings.gameplay and the camera follow mode.
import { useState } from 'preact/hooks';
import { Button, ConfirmDialog, Field, SegmentedControl, Select, Toggle } from '../../components';
import { facade } from '../../store';
import { uiPrefs, type AutosaveMinutes, type FocusLineMode, type MilestoneNotices, type PromptsMode } from '../../styles/prefs';
import { useGameSettings } from './useSettings';

export function GameplayTab() {
  const [settings, setSettings] = useGameSettings();
  const g = uiPrefs.prefs.value.gameplay;
  const set = (p: Partial<typeof g>) => uiPrefs.set({ gameplay: p });
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const f = facade.value;
  return (
    <div class="ui-fieldset">
      <Field label="Autosave" help="Real play time between autosaves. Autosaves also happen when the season changes.">
        <SegmentedControl value={g.autosaveMinutes} onChange={(v: AutosaveMinutes) => set({ autosaveMinutes: v })} options={[{ value: 0, label: 'Off' }, { value: 2, label: '2 min' }, { value: 5, label: '5 min' }, { value: 10, label: '10 min' }]} />
      </Field>
      <Field label="Prompts" help="The key hints that appear beside things you can do.">
        <Select value={g.prompts} onChange={(v: PromptsMode) => set({ prompts: v })} options={[{ value: 'always', label: 'Always' }, { value: 'learning', label: 'While learning' }, { value: 'never', label: 'Never' }]} />
      </Field>
      <Field label="Hints and aims" help="Quiet suggestions during your first days.">
        <div class="ui-inline">
          <Toggle checked={g.hints} onChange={(v) => set({ hints: v })} />
          <Button variant="ghost" onClick={() => setConfirm(true)} disabled={!f?.resetHints} disabledReason="Not available yet" data-testid="reset-hints">Reset hints</Button>
          {done && <span class="ui-note-inline" role="status">Hints reset.</span>}
        </div>
      </Field>
      <Field label="Minimap"><Toggle checked={g.minimap} onChange={(v) => set({ minimap: v })} /></Field>
      <Field label="Focus line" help="The current aim, shown at the top left.">
        <SegmentedControl value={g.focusLine} onChange={(v: FocusLineMode) => set({ focusLine: v })} options={[{ value: 'auto', label: 'Auto' }, { value: 'always', label: 'Always' }, { value: 'never', label: 'Never' }]} />
      </Field>
      <Field label="Milestone notices" help="The journal always records every milestone.">
        <SegmentedControl value={g.milestoneNotices} onChange={(v: MilestoneNotices) => set({ milestoneNotices: v })} options={[{ value: 'full', label: 'Full' }, { value: 'quiet', label: 'Quiet' }, { value: 'off', label: 'Off' }]} />
      </Field>
      {settings && (
        <>
          <Field label="Return to 1x when taking control" help="Possessing an ant sets the speed to 1x. Off keeps up to 4x.">
            <Toggle checked={settings.gameplay.dropTo1xOnPossess} onChange={(v) => setSettings({ gameplay: { dropTo1xOnPossess: v } })} />
          </Field>
          <Field label="Take over a nestmate when your ant dies"><Toggle checked={settings.gameplay.autoRepossessOnDeath} onChange={(v) => setSettings({ gameplay: { autoRepossessOnDeath: v } })} /></Field>
          <Field label="Pause when the window loses focus"><Toggle checked={settings.gameplay.pauseOnBlur} onChange={(v) => setSettings({ gameplay: { pauseOnBlur: v } })} /></Field>
          <Field label="Pause after loading"><Toggle checked={settings.gameplay.pauseOnLoad} onChange={(v) => setSettings({ gameplay: { pauseOnLoad: v } })} /></Field>
          <Field label="Pause while a panel is open"><Toggle checked={settings.gameplay.pauseWhenPanelOpen} onChange={(v) => setSettings({ gameplay: { pauseWhenPanelOpen: v } })} /></Field>
          <Field label="Camera follow">
            <SegmentedControl value={settings.camera.autoFollow} onChange={(v) => setSettings({ camera: { autoFollow: v } })} options={[{ value: 'off', label: 'Off' }, { value: 'gentle', label: 'Gentle' }, { value: 'strong', label: 'Strong' }]} />
          </Field>
        </>
      )}
      {confirm && (
        <ConfirmDialog
          title="Reset hints?" message="Hints you have already learned will appear again in your next colony." confirmLabel="Reset hints"
          onCancel={() => setConfirm(false)} onConfirm={() => { f?.resetHints?.(); setConfirm(false); setDone(true); }}
        />
      )}
    </div>
  );
}
