// Settings (GDD 08 7.4): a book screen with tabs Graphics, Audio, Controls, Accessibility, Gameplay. Every change
// applies immediately. Closing is refused while a required action (move, interact, release) has no key.
import { useState } from 'preact/hooks';
import { actionDef, unboundRequired } from '@/input';
import { actionLabel } from './captureBinding';
import { Button, Modal, ScrollArea, BookScreen, type TabDef } from '../../components';
import { uiPrefs } from '../../styles/prefs';
import { updateNav, type SettingsTabId } from '../nav';
import { AccessibilityTab } from './AccessibilityTab';
import { AudioTab } from './AudioTab';
import { ControlsTab, readBindings } from './ControlsTab';
import { GameplayTab } from './GameplayTab';
import { GraphicsTab } from './GraphicsTab';

const TABS: TabDef<SettingsTabId>[] = [
  { id: 'graphics', label: 'Graphics' }, { id: 'audio', label: 'Audio' }, { id: 'controls', label: 'Controls' },
  { id: 'accessibility', label: 'Accessibility' }, { id: 'gameplay', label: 'Gameplay' },
];

export function Settings({ tab, onTab, onClose }: { tab: SettingsTabId; onTab: (t: SettingsTabId) => void; onClose: () => void }) {
  const [blocked, setBlocked] = useState<string[] | null>(null);
  const notice = uiPrefs.notice.value;
  const tryClose = () => {
    const missing = unboundRequired(readBindings());
    if (missing.length) { setBlocked(missing.map((id) => { const d = actionDef(id); return d ? actionLabel(d) : id; })); updateNav((n) => ({ ...n, settingsTab: 'controls' })); return; }
    onClose();
  };
  return (
    <BookScreen
      title="Settings" tabs={TABS} tab={tab} onTab={(t) => { onTab(t); updateNav((n) => ({ ...n, settingsTab: t })); }} onClose={tryClose}
      railFooter={<Button variant="ghost" icon="back" onClick={tryClose} block data-testid="settings-back">Back</Button>} idPrefix="settings"
    >
      {notice && <p class="ui-notice is-warn" role="status" data-testid="settings-notice">{notice}</p>}
      <ScrollArea label={`${TABS.find((t) => t.id === tab)?.label ?? ''} settings`} class="ui-page-scroll">
        {tab === 'graphics' && <GraphicsTab />}
        {tab === 'audio' && <AudioTab />}
        {tab === 'controls' && <ControlsTab />}
        {tab === 'accessibility' && <AccessibilityTab />}
        {tab === 'gameplay' && <GameplayTab />}
      </ScrollArea>
      {blocked && (
        <Modal title="A required key is not set" role="alertdialog" onClose={() => setBlocked(null)} actions={<Button variant="primary" onClick={() => setBlocked(null)}>Back to controls</Button>}>
          <p>These actions must have a key before you leave Settings: {blocked.join(', ')}.</p>
        </Modal>
      )}
    </BookScreen>
  );
}
