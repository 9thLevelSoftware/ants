// The Journal (GDD 08 7.2, screen id `journal`, key J): a book screen with a vertical tab rail (Aims, Milestones, Graphs,
// Event log). Opening it pauses the simulation and closing it restores the speed (the wiring does that).
import { BookScreen } from '../../components/Panel';
import { Button } from '../../components/Button';
import type { TabDef } from '../../components/Tabs';
import { journalSlice } from '../wiring/slices';
import { journalTab, openBook, type JournalTab } from '../wiring/state';
import { AimsTab } from './AimsTab';
import { GraphsTab } from './GraphsTab';
import { LogTab } from './LogTab';
import { MilestonesTab } from './MilestonesTab';

const TABS: readonly TabDef<JournalTab>[] = [
  { id: 'aims', label: 'Aims', icon: 'pin' },
  { id: 'milestones', label: 'Milestones', icon: 'journal' },
  { id: 'graphs', label: 'Graphs', icon: 'trend-up' },
  { id: 'log', label: 'Event log', icon: 'task-idle' },
];

export function JournalBook() {
  const j = journalSlice.value;
  const tab = journalTab.value;
  const close = (): void => { openBook.value = null; };
  return (
    <BookScreen
      title="Journal" tabs={TABS} tab={tab} onTab={(t) => { journalTab.value = t; }} onClose={close} idPrefix="journal" class="pn-book"
      railFooter={<Button variant="ghost" icon="back" onClick={close} data-testid="journal-close">Close</Button>}
    >
      {!j ? <p class="pn-empty">The journal is empty: there is no colony yet.</p> : (
        <div class="pn-book-scroll">
          {tab === 'aims' && <AimsTab j={j} />}
          {tab === 'milestones' && <MilestonesTab j={j} />}
          {tab === 'graphs' && <GraphsTab j={j} />}
          {tab === 'log' && <LogTab j={j} />}
        </div>
      )}
    </BookScreen>
  );
}
