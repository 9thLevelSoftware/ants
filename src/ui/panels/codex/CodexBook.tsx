// The Codex (GDD 08 7.3, screen id `codex`, key K): a book screen whose rail lists the nine categories, with a search box,
// the entry list and the entry page (plate, title, binomial, "Observed" line, field note, source line, "In this colony",
// related entries and, for the manual, the current key bindings). Locked entries show their title and a silhouette.
// Used over the HUD (the game pauses) and from the title and the pause menu (the shell routes it).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { codexCategories, codexInGameLine, getCodexEntry, relatedEntries, type CodexCategory, type CodexEntryView } from '@/content/codex';
import { controlsForEntry } from '@/content';
import { BookScreen } from '../../components/Panel';
import { Button } from '../../components/Button';
import { currentBindings } from '../../components/KeyHint';
import type { TabDef } from '../../components/Tabs';
import { TextField } from '../../components/TextField';
import { Icon } from '../../icons';
import { uiPrefs } from '../../styles/prefs';
import { codexSlice } from '../wiring/slices';
import { codexSelection, panelsBridge } from '../wiring/state';
import { categoryCounts, codexRows, fieldNote, isUnlocked, NO_UNLOCKS, observedLine, SPIDER_ENTRIES, type CodexUnlocks } from './model';
import { Plate } from './Plate';

export interface CodexBookProps {
  onClose: () => void;
  /** Unlocks to show; default: the ones of the running game from the snapshot. */
  unlocks?: CodexUnlocks;
}

function useUnlocks(override?: CodexUnlocks): CodexUnlocks {
  const s = codexSlice.value;
  const bridge = panelsBridge.value;
  return useMemo(() => {
    if (override) return override;
    const device = bridge?.codexDevice?.() ?? s?.device;
    return { seen: s?.seen ?? {}, device } as CodexUnlocks;
  }, [override, s, bridge]);
}

function EntryPage({ entry, u, onOpen }: { entry: CodexEntryView; u: CodexUnlocks; onOpen: (id: string) => void }) {
  const open = isUnlocked(entry, u);
  const comfort = uiPrefs.prefs.value.accessibility.spiderComfort;
  const ring = SPIDER_ENTRIES.has(entry.id) && comfort !== 'off';
  const bindings = currentBindings.value;
  const inGame = open ? codexInGameLine(entry.id, bindings) : undefined;
  const related = open ? relatedEntries(entry.id) : [];
  const controls = open && entry.controlActions ? controlsForEntry(entry.id, bindings) : [];
  return (
    <article class="pn-entry" data-testid="codex-entry" data-entry={entry.id} data-locked={open ? '0' : '1'} aria-labelledby="pn-entry-title">
      <Plate category={entry.category} title={entry.title} unlocked={open} ring={ring} />
      <h2 id="pn-entry-title" class="pn-h2">{entry.title}</h2>
      {entry.binomial && open && <p class="ui-binomial">{entry.binomial}</p>}
      <p class="pn-muted pn-small" data-testid="codex-observed">{observedLine(entry, u)}</p>
      {open ? (
        <>
          <p class="pn-note" data-testid="codex-note">{fieldNote(entry)}</p>
          {entry.source && <p class="pn-source">Source: {entry.source}</p>}
          {inGame && <section><h3 class="pn-h3">In this colony</h3><p>{inGame}</p></section>}
          {controls.length > 0 && (
            <section><h3 class="pn-h3">Controls</h3>
              <ul class="pn-controls">{controls.map((c) => <li key={c.id}><span>{c.label}</span><kbd>{c.keyboard}</kbd>{c.gamepad !== 'none' && <kbd>{c.gamepad}</kbd>}</li>)}</ul>
            </section>
          )}
          {related.length > 0 && (
            <section><h3 class="pn-h3">Related entries</h3>
              <ul class="pn-related">{related.map((r) => <li key={r.id}><button type="button" class="pn-link" onClick={() => onOpen(r.id)}>{r.title}{isUnlocked(r, u) ? '' : ' (not yet observed)'}</button></li>)}</ul>
            </section>
          )}
        </>
      ) : (
        <p class="pn-muted" data-testid="codex-locked">The field note appears here once this has been observed in a colony.</p>
      )}
    </article>
  );
}

export function CodexBook({ onClose, unlocks }: CodexBookProps) {
  const u = useUnlocks(unlocks);
  const [category, setCategory] = useState<CodexCategory>(() => (codexSelection.peek() ? getCodexEntry(codexSelection.peek() as string)?.category : undefined) ?? 'species');
  const [text, setText] = useState('');
  const counts = useMemo(() => categoryCounts(u), [u]);
  const rows = useMemo(() => codexRows({ category: text.trim() ? 'all' : category, text }, u), [category, text, u]);
  const selectedId = codexSelection.value;
  const selected = (selectedId ? getCodexEntry(selectedId) : undefined) ?? rows[0]?.entry ?? null;
  const list = useRef<HTMLUListElement>(null);
  const selectedInList = rows.some((r) => r.entry.id === selected?.id);
  const tabs: TabDef<CodexCategory>[] = codexCategories().map((c) => ({ id: c.id, label: c.title }));
  const cat = counts.find((c) => c.id === category);

  // a selection made from outside (an aim's "Open codex", a related link) switches the category to the entry's
  useEffect(() => {
    const e = selectedId ? getCodexEntry(selectedId) : undefined;
    if (e && e.category !== category && !text.trim()) setCategory(e.category);
  }, [selectedId]);

  const open = (id: string): void => { codexSelection.value = id; setText(''); };
  // "/" jumps to the search box (Q and E switch the categories only while no text field has the focus)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const a = document.activeElement as HTMLElement | null;
      if (e.key !== '/' || e.ctrlKey || e.altKey || e.metaKey || a?.tagName === 'INPUT') return;
      e.preventDefault();
      document.querySelector<HTMLInputElement>('.pn-codex-search input')?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const onListKey = (e: KeyboardEvent): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('button[data-entry]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    e.preventDefault();
    next.focus();
    codexSelection.value = next.dataset.entry ?? null;
  };

  return (
    <BookScreen
      title="Codex" tabs={tabs} tab={category} onTab={(c) => { setCategory(c); setText(''); const first = codexRows({ category: c, text: '' }, u)[0]; codexSelection.value = first ? first.entry.id : null; }}
      onClose={onClose} idPrefix="codex" class="pn-book pn-codex" initialFocus=".pn-entry-btn.is-selected, .pn-entry-btn"
      railFooter={<Button variant="ghost" icon="back" onClick={onClose} data-testid="codex-close">Close</Button>}
    >
      <div class="pn-codex-page">
        <div class="pn-codex-search"><Icon name="search" size={18} decorative /><TextField value={text} onInput={setText} aria-label="Search the codex by title" placeholder="Search titles (press / to type)" data-testid="codex-search" /></div>
        <div class="pn-codex-cols">
          <nav class="pn-codex-list" aria-label="Entries">
            <p class="pn-muted pn-small pn-count" data-testid="codex-count">
              {text.trim() ? `${rows.length} ${rows.length === 1 ? 'match' : 'matches'}` : cat ? `${cat.title}: ${cat.observed} / ${cat.total} observed` : ''}
            </p>
            {rows.length === 0 ? <p class="pn-empty" data-testid="codex-none">No entry has that title.</p> : (
              <ul ref={list} onKeyDown={onListKey} data-testid="codex-list">
                {rows.map((r) => {
                  const isSel = selected?.id === r.entry.id;
                  return (
                    <li key={r.entry.id}>
                      <button
                        type="button" class={`pn-entry-btn${isSel ? ' is-selected' : ''}${r.unlocked ? '' : ' is-locked'}`} data-entry={r.entry.id} data-locked={r.unlocked ? '0' : '1'}
                        tabIndex={isSel || (!selectedInList && r === rows[0]) ? 0 : -1} aria-current={isSel ? 'true' : undefined}
                        onClick={() => open(r.entry.id)}
                      >
                        <Icon name={r.unlocked ? 'codex' : 'lock'} size={16} decorative />
                        <span>{r.entry.title}</span>
                        <span class="ui-sr-only">{r.unlocked ? '' : ', not yet observed'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>
          <div class="pn-codex-entry">{selected ? <EntryPage entry={selected} u={u} onOpen={open} /> : <p class="pn-empty">Choose an entry.</p>}</div>
        </div>
      </div>
    </BookScreen>
  );
}

export { NO_UNLOCKS };
