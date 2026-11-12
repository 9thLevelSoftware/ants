// Pause menu (GDD 08 3.5): a centred card with Resume, Save, Load, Settings, Codex, Controls and Return to title,
// the date line and when the game was last saved. Focus starts on Resume. Esc is handled by the game (it resumes);
// this screen does not bind it. Returning to the title asks first when the last save is older than 60 s.
import { useRef, useState } from 'preact/hooks';
import { Button, ConfirmDialog, useFocusScope } from '../components';
import { facade, snapshot } from '../store';
import { UI_BALANCE } from '../styles/tokens';
import { updateNav, type OverlayId } from './nav';
import { agoText } from './saves/describe';

export function Pause({ inert }: { inert?: boolean }) {
  const f = facade.value;
  const snap = snapshot.value;
  const root = useRef<HTMLDivElement>(null);
  const [leave, setLeave] = useState(false);
  const [problem, setProblem] = useState('');
  useFocusScope(root, { trap: true, initial: '[data-testid=pause-resume]', restore: false });
  const open = (id: OverlayId, tab?: { settingsTab?: 'controls'; saveTab?: 'save' | 'load' }) =>
    updateNav((n) => ({ ...n, stack: [...n.stack, id], ...tab }));
  const last = snap.lastSave;
  const unsaved = last === null || (last !== undefined && last.agoS > UI_BALANCE.unsavedWarnRealS);
  const savedLine = last ? `Saved ${agoText(last.agoS)} (${last.kind === 'auto' ? 'autosave' : last.kind === 'quick' ? 'quick save' : 'manual save'})` : last === null ? 'Not saved yet' : '';

  const saveAndLeave = async () => {
    if (!f) return;
    const r = await f.save('quick');
    if (!r.ok) { setProblem(r.message ?? 'The colony could not be saved.'); return; }
    setLeave(false);
    f.quitToTitle();
  };

  return (
    <div class="ui-screen ui-pause" inert={inert} data-screen="pause">
      <div ref={root} class="ui-pausecard ui-surface is-elevated" role="dialog" aria-label="Paused">
        <h1 class="ui-pause-title">Paused</h1>
        {snap.time && <p class="ui-pause-date">{snap.time.label}</p>}
        <ul class="ui-menu is-card">
          <li><Button variant="primary" block class="ui-menuitem" onClick={() => f?.closePauseMenu()} data-testid="pause-resume">Resume</Button></li>
          <li><Button variant="ghost" block class="ui-menuitem" onClick={() => open('save-load', { saveTab: 'save' })} data-testid="pause-save">Save</Button></li>
          <li><Button variant="ghost" block class="ui-menuitem" onClick={() => open('save-load', { saveTab: 'load' })} data-testid="pause-load">Load</Button></li>
          <li><Button variant="ghost" block class="ui-menuitem" onClick={() => open('settings')} data-testid="pause-settings">Settings</Button></li>
          <li><Button variant="ghost" block class="ui-menuitem" onClick={() => open('codex')} data-testid="pause-codex">Codex</Button></li>
          <li><Button variant="ghost" block class="ui-menuitem" onClick={() => open('settings', { settingsTab: 'controls' })} data-testid="pause-controls">Controls</Button></li>
          <li><Button variant="ghost" block class="ui-menuitem" onClick={() => (unsaved ? setLeave(true) : f?.quitToTitle())} data-testid="pause-title">Return to title</Button></li>
        </ul>
        {savedLine && <p class="ui-pause-saved">{savedLine}</p>}
      </div>
      {leave && (
        <ConfirmDialog
          title="Leave without saving?" confirmLabel="Leave" danger
          message={problem || `Progress ${last?.timeLabel ? `since ${last.timeLabel} ` : 'since your last save '}will be lost.`}
          alternate={{ label: 'Save and leave', onClick: () => void saveAndLeave() }}
          onCancel={() => { setLeave(false); setProblem(''); }} onConfirm={() => { setLeave(false); f?.quitToTitle(); }}
        />
      )}
    </div>
  );
}
