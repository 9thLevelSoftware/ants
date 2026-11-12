// Save / Load (GDD 08 7.6): tabs Save (only in play), Load, Import / Export. Slots: the autosave ring, quick and
// slot-1..5. Export builds the `.foundress` bytes through the facade, tries a download and offers the text form
// when downloads are blocked (or `?nodownload=1`). Import takes a file or pasted FOUNDRESS1: text. Everything
// persistent is the game's job (facade); this screen only asks and reports.
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { SaveResult, SaveSlotInfo } from '../../api';
import { Button, ConfirmDialog, EmptyState, Field, IconButton, ScrollArea, Select, TextArea, BookScreen, type TabDef } from '../../components';
import { facade, snapshot } from '../../store';
import { UI_BALANCE } from '../../styles/tokens';
import { importInto, loadSlot } from '../loadFlow';
import { updateNav, type SaveTabId } from '../nav';
import { slotTitle, SLOT_IDS, isAutoSlot } from './describe';
import { ExportModal } from './ExportModal';
import { checkImportText, exportText, sizeKb } from './saveText';
import { SlotCard } from './SlotCard';

type Dialog =
  | { kind: 'overwrite' | 'load' | 'delete'; slot: string }
  | null;

const noDownloadFlag = (): boolean => /[?&]nodownload=1\b/.test(location.search);

/** Starts a browser download of the bytes; false when the attempt itself throws. */
export function tryDownload(bytes: Uint8Array, filename: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

export function SaveLoad({ tab, onTab, onClose }: { tab: SaveTabId; onTab: (t: SaveTabId) => void; onClose: () => void }) {
  const f = facade.value;
  const snap = snapshot.value;
  const inGame = snap.screen === 'paused';
  const storageOk = f?.storageAvailable?.() !== false;
  const [saves, setSaves] = useState<SaveSlotInfo[] | null>(null);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [exported, setExported] = useState<{ text: string; kb: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    f?.listSaves().then(setSaves).catch(() => setSaves([]));
  }, [f]);
  useEffect(refresh, [refresh]);

  const tabs: TabDef<SaveTabId>[] = [
    ...(inGame ? [{ id: 'save' as const, label: 'Save', icon: 'save' }] : []),
    { id: 'load', label: 'Load', icon: 'load' },
    { id: 'transfer', label: 'Import / Export', icon: 'export' },
  ];
  const active: SaveTabId = tabs.some((t) => t.id === tab) ? tab : 'load';

  const infoOf = (slot: string) => saves?.find((s) => s.slot === slot) ?? null;
  const unsaved = inGame && (snap.lastSave === null || (snap.lastSave?.agoS ?? 0) > UI_BALANCE.unsavedWarnRealS);
  const report = (r: SaveResult, ok: string) => setMessage(r.ok ? { text: ok, bad: false } : { text: r.message ?? 'That did not work.', bad: true });

  const doSave = async (slot: string) => {
    if (!f) return;
    setBusy(true);
    report(await f.save(slot), `Saved to ${slotTitle(slot)}.`);
    setBusy(false);
    refresh();
  };
  const doLoad = async (slot: string) => {
    if (!f) return;
    setBusy(true);
    const r = await loadSlot(f, slot, infoOf(slot));
    setBusy(false);
    if (!r.ok) report(r, '');
  };
  const doDelete = async (slot: string) => {
    if (!f?.deleteSave) return;
    report(await f.deleteSave(slot), `${slotTitle(slot)} deleted.`);
    refresh();
  };
  const doExport = async (slot: string) => {
    if (!f?.exportSave) return;
    const r = await f.exportSave(slot);
    if (!r.ok || !r.bytes) { setMessage({ text: r.message ?? 'The colony could not be exported.', bad: true }); return; }
    const name = `foundress-${slot}.foundress`;
    if (noDownloadFlag() || !tryDownload(r.bytes, name)) {
      setExported({ text: exportText(r.bytes), kb: sizeKb(r.bytes.length) });
    } else {
      setMessage({ text: `Exported ${name} (${sizeKb(r.bytes.length)} KB). If your browser saved nothing, use Export as text.`, bad: false });
    }
  };
  const exportAsText = async (slot: string) => {
    const r = await f?.exportSave?.(slot);
    if (r?.ok && r.bytes) setExported({ text: exportText(r.bytes), kb: sizeKb(r.bytes.length) });
    else setMessage({ text: r?.message ?? 'The colony could not be exported.', bad: true });
  };

  const askLoad = (slot: string) => (unsaved ? setDialog({ kind: 'load', slot }) : void doLoad(slot));
  const askSave = (slot: string) => (infoOf(slot) ? setDialog({ kind: 'overwrite', slot }) : void doSave(slot));

  const cardActions = (slot: string, mode: 'save' | 'load') => {
    const info = infoOf(slot);
    return (
      <>
        {mode === 'save' && (
          <Button variant="primary" busy={busy} disabled={!storageOk} disabledReason="Saving to this browser is not available here." onClick={() => askSave(slot)} data-testid={`save-${slot}`}>
            Save here
          </Button>
        )}
        {mode === 'load' && info && <Button variant="primary" onClick={() => askLoad(slot)} data-testid={`load-${slot}`}>Load</Button>}
        {info && <IconButton icon="export" label={`Export ${slotTitle(slot)}`} onClick={() => void doExport(slot)} disabled={!f?.exportSave} disabledReason="Not available yet" />}
        {info && mode === 'load' && !isAutoSlot(info) && (
          <IconButton icon="trash" label={`Delete ${slotTitle(slot)}`} variant="danger" onClick={() => setDialog({ kind: 'delete', slot })} disabled={!f?.deleteSave} disabledReason="Not available yet" />
        )}
      </>
    );
  };

  const autoSlots = (saves ?? []).filter(isAutoSlot);
  const slotList = (mode: 'save' | 'load') => (
    <ul class="ui-slots" aria-label={mode === 'save' ? 'Save slots' : 'Saved colonies'}>
      {mode === 'load' && autoSlots.map((s) => <SlotCard key={s.slot} slot={s.slot} info={s} title={s.trigger ? 'Autosave' : undefined} actions={cardActions(s.slot, 'load')} />)}
      {SLOT_IDS.map((slot) => <SlotCard key={slot} slot={slot} info={infoOf(slot)} actions={cardActions(slot, mode)} />)}
    </ul>
  );

  return (
    <BookScreen
      title="Save and load" tabs={tabs} tab={active} onTab={(t) => { setMessage(null); onTab(t); updateNav((n) => ({ ...n, saveTab: t })); }} onClose={onClose}
      railFooter={<Button variant="ghost" icon="back" onClick={onClose} block data-testid="saves-back">Back</Button>} idPrefix="saves"
    >
      <ScrollArea label="Saves" class="ui-page-scroll">
        {active === 'save' && (
          <>
            {!storageOk && <p class="ui-notice is-warn" role="status">Saving to this browser is not available here. Use Export to keep your colony.</p>}
            {slotList('save')}
          </>
        )}
        {active === 'load' && (
          saves && saves.length === 0 && storageOk
            ? <EmptyState icon="save" title="No saved colonies yet">Saves appear here once you have saved or an autosave has run.</EmptyState>
            : slotList('load')
        )}
        {active === 'transfer' && <TransferTab saves={saves ?? []} unsaved={unsaved} onExport={doExport} onExportText={exportAsText} setMessage={setMessage} refresh={refresh} />}
      </ScrollArea>
      <p class={`ui-status-line${message?.bad ? ' is-bad' : ''}`} role="status" aria-live="polite" data-testid="saves-message">{message?.text ?? ''}</p>
      {dialog?.kind === 'overwrite' && (
        <ConfirmDialog
          title="Overwrite this save?" message={`${slotTitle(dialog.slot)} already holds a colony. Saving here replaces it.`} confirmLabel="Overwrite" danger
          onCancel={() => setDialog(null)} onConfirm={() => { const s = dialog.slot; setDialog(null); void doSave(s); }}
        />
      )}
      {dialog?.kind === 'load' && (
        <ConfirmDialog
          title="Load this colony?" message="Progress since your last save will be lost." confirmLabel="Load"
          onCancel={() => setDialog(null)} onConfirm={() => { const s = dialog.slot; setDialog(null); void doLoad(s); }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="Delete this save?" message={`${slotTitle(dialog.slot)} will be removed. This cannot be undone.`} confirmLabel="Delete" danger
          onCancel={() => setDialog(null)} onConfirm={() => { const s = dialog.slot; setDialog(null); void doDelete(s); }}
        />
      )}
      {exported && <ExportModal text={exported.text} sizeKb={exported.kb} onClose={() => setExported(null)} />}
    </BookScreen>
  );
}

/** What the player has chosen to import: a file's bytes or pasted text, kept until they pick where it goes. */
type Staged = { data: Uint8Array | string; label: string };

function TransferTab(p: {
  saves: SaveSlotInfo[];
  /** Playing with progress since the last save: loading over it needs a confirmation. */
  unsaved: boolean;
  onExport: (slot: string) => Promise<void>;
  onExportText: (slot: string) => Promise<void>;
  setMessage: (m: { text: string; bad: boolean } | null) => void;
  refresh: () => void;
}) {
  const f = facade.value;
  const occupied = p.saves.map((s) => s.slot);
  const [exportSlot, setExportSlot] = useState<string>(occupied[0] ?? 'slot-1');
  const [staged, setStaged] = useState<Staged | null>(null);
  const [pasted, setPasted] = useState('');
  // Nothing is stored until the player picks a target: the choice starts empty (GDD 08 7.6)
  const [target, setTarget] = useState<string>('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ data: Uint8Array | string; target: string } | null>(null);
  const exportOptions = occupied.length ? occupied.map((s) => ({ value: s, label: slotTitle(s) })) : [{ value: 'slot-1', label: 'No saved colonies', disabled: true }];
  const targets = [
    { value: '', label: 'Choose where to store it', disabled: true },
    ...SLOT_IDS.filter((s) => s !== 'quick').map((s) => ({ value: s as string, label: slotTitle(s) })),
    { value: 'quick', label: 'Quick save' },
    { value: 'now', label: 'Load now (do not store)' },
  ];

  const run = async (data: Uint8Array | string, to: string) => {
    setError('');
    const r = await importInto(f as NonNullable<typeof f>, data, to);
    if (!r) { setError('Importing is not available yet.'); return; }
    if (!r.ok) { setError(r.message ?? 'That file could not be imported.'); return; }
    p.setMessage({ text: to === 'now' ? 'Colony loaded.' : `Imported into ${slotTitle(to)}.`, bad: false });
    setStaged(null);
    setPasted('');
    p.refresh();
  };
  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement; // read before the await: the event is gone afterwards
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setError('');
    setPasted('');
    setStaged({ data: new Uint8Array(await file.arrayBuffer()), label: `${file.name} (${sizeKb(file.size)} KB)` });
  };
  const onImport = () => {
    if (!f) return;
    let data: Uint8Array | string;
    if (staged) data = staged.data;
    else {
      const c = checkImportText(pasted);
      if (!c.ok) { setError(c.error); return; }
      data = c.text;
    }
    if (!target) { setError('Choose where to store the colony first.'); return; }
    // replacing a stored colony, or the running one, is always confirmed (GDD 08 7.6)
    if (occupied.includes(target) || (target === 'now' && p.unsaved)) setConfirm({ data, target });
    else void run(data, target);
  };

  return (
    <div class="ui-transfer">
      <section class="ui-section" aria-labelledby="export-h">
        <h2 id="export-h" class="ui-section-title">Export</h2>
        <p class="ui-field-help">A .foundress file holds one colony. Keep it to move the colony to another browser or to back it up.</p>
        <Field label="Colony" layout="stack">
          <div class="ui-inline">
            <Select options={exportOptions} value={exportSlot} onChange={setExportSlot} disabled={!occupied.length} />
            <Button icon="export" onClick={() => void p.onExport(exportSlot)} disabled={!occupied.length || !f?.exportSave} data-testid="export-file">Export file</Button>
            <Button icon="copy" variant="ghost" onClick={() => void p.onExportText(exportSlot)} disabled={!occupied.length || !f?.exportSave} data-testid="export-as-text">Export as text</Button>
          </div>
        </Field>
      </section>
      <section class="ui-section" aria-labelledby="import-h">
        <h2 id="import-h" class="ui-section-title">Import</h2>
        <Field label="From a file" layout="stack">
          <label class="ui-filebtn">
            <input type="file" accept=".foundress" class="ui-file" onChange={onFile} data-testid="import-file" aria-label="Choose a .foundress file" />
          </label>
          {staged && <p class="ui-field-help" role="status" data-testid="import-staged">Ready to import: {staged.label}</p>}
        </Field>
        <Field label="Or paste text" layout="stack">
          <TextArea value={pasted} onInput={(v) => { setPasted(v); setStaged(null); setError(''); }} mono rows={5} placeholder="FOUNDRESS1:..." aria-label="Pasted colony text" error={error || undefined} data-testid="import-text" />
        </Field>
        <Field label="Store in" layout="stack">
          <div class="ui-inline">
            <Select options={targets} value={target} onChange={(v) => { setTarget(v); setError(''); }} aria-label="Store the imported colony in" />
            <Button icon="import" onClick={onImport} disabled={!f?.importSave} disabledReason="Importing is not available yet" data-testid="import-go">Import</Button>
          </div>
        </Field>
      </section>
      {confirm && (
        <ConfirmDialog
          title={confirm.target === 'now' ? 'Load this colony?' : 'Overwrite this save?'}
          message={confirm.target === 'now' ? 'Progress since your last save will be lost.' : `${slotTitle(confirm.target)} already holds a colony. Importing here replaces it.`}
          confirmLabel={confirm.target === 'now' ? 'Load' : 'Overwrite'} danger={confirm.target !== 'now'}
          onCancel={() => setConfirm(null)} onConfirm={() => { const c = confirm; setConfirm(null); void run(c.data, c.target); }}
        />
      )}
    </div>
  );
}
