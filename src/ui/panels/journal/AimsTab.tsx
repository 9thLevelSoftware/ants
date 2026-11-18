// Journal > Aims (GDD 08 7.2): "Current focus" with up to 3 open aims, each a one-line hint with an "Open codex" link, and
// below them the completed aims with their dates.
import { Icon } from '../../icons';
import type { UiJournal } from '../../api';
import { codexSelection, openBook } from '../wiring/state';
import { AIM_CODEX, aimLine, dateLine } from './timeline';
import { getCodexEntry } from '@/content/codex';

export function openCodexAt(id: string): void {
  codexSelection.value = id;
  openBook.value = 'codex';
}

export function AimsTab({ j }: { j: UiJournal }) {
  return (
    <div class="pn-aims" data-testid="journal-aims">
      <h2 class="pn-h2">Current focus</h2>
      {j.aims.current.length === 0 ? (
        <p class="pn-empty" data-testid="aims-none">Nothing is asked of you right now. New aims appear as the colony grows.</p>
      ) : (
        <ul class="pn-aim-list">
          {j.aims.current.map((a) => {
            const cx = AIM_CODEX[a.id];
            return (
              <li key={a.id} class="pn-aim" data-aim={a.id}>
                <Icon name="pin" size={20} decorative />
                <div>
                  <p class="pn-aim-text">{aimLine(a.id, j.species)}</p>
                  <p class="pn-muted pn-small">
                    Since {dateLine(j, a.openedTick, a.openedCal)}{a.hint === 'out-of-season' ? ' · this has to wait for the right season' : ''}
                    {cx && getCodexEntry(cx) && <> · <button type="button" class="pn-link" onClick={() => openCodexAt(cx)} data-testid="aim-codex">Open codex</button></>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <h2 class="pn-h2">Done</h2>
      {j.aims.done.length === 0 ? <p class="pn-muted">No aim has been completed yet.</p> : (
        <ul class="pn-aim-list is-done">
          {[...j.aims.done].sort((a, b) => b.doneTick - a.doneTick).map((a) => (
            <li key={a.id} class="pn-aim is-done" data-aim={a.id}>
              <Icon name="check" size={20} decorative />
              <div><p class="pn-aim-text">{aimLine(a.id, j.species)}</p><p class="pn-muted pn-small">{dateLine(j, a.doneTick, a.doneCal)}</p></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
