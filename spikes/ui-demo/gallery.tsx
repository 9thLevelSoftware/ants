// Component gallery: every component in every state, drawn on one page (?screen=components&section=...). The
// forced states (is-hover, is-active, is-focus) draw a pseudo-state without real interaction so one screenshot
// shows them all; real focus and hover are checked by the behaviour script.
import { useState } from 'preact/hooks';
import { defaultBindings } from '@/input';
import {
  AlertItem, Badge, Button, Card, ConfirmDialog, Drawer, EmptyState, Field, IconButton, KeyCap, KeyHint, List, ListItem, Meter, Modal, Panel,
  ProgressBar, RadioCards, ScrollArea, SegmentedControl, Select, Slider, Stepper, StatusChip, Tabs, TextArea, TextField, Toggle, Tooltip, trendOf,
} from '@/ui/components';
import { ICON_PATHS, Icon } from '@/ui/icons';
import { ExportModal } from '@/ui/screens/saves/ExportModal';

export const GALLERY_CSS = `
.gal { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: auto; }
.gal-page { width: min(72rem, 96%); height: min(42rem, 96vh); display: flex; flex-direction: column; }
.gal-head { padding: var(--s-5) var(--s-6) var(--s-3); display: flex; align-items: baseline; gap: var(--s-4); }
.gal-scroll { flex: 1; padding: 0 var(--s-6) var(--s-6); }
.gal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); gap: var(--s-5); }
.gal-cell { display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-4); border: 1px solid var(--c-border); border-radius: var(--r-m); }
.gal-cell h3 { font-size: var(--t-caption); letter-spacing: 0.04em; text-transform: uppercase; color: var(--c-text-3); font-family: var(--font-sans); font-weight: 600; }
.gal-row { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: center; }
.gal-wide { grid-column: 1 / -1; }
.gal-icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); gap: var(--s-3); }
.gal-icon { display: flex; flex-direction: column; align-items: center; gap: var(--s-1); padding: var(--s-2); color: var(--c-text); font-size: var(--t-caption); color: var(--c-text-2); text-align: center; overflow-wrap: anywhere; }
.gal-icon svg { color: var(--c-text); }
.gal-tipbox { padding-top: 3.5rem; }
`;

const SECTIONS = ['buttons', 'inputs', 'structure', 'feedback', 'icons'] as const;
export type GallerySection = (typeof SECTIONS)[number];

function Cell({ title, children, wide }: { title: string; children: preact.ComponentChildren; wide?: boolean }) {
  return <section class={`gal-cell${wide ? ' gal-wide' : ''}`}><h3>{title}</h3>{children}</section>;
}

function Buttons() {
  const variants = ['primary', 'secondary', 'ghost', 'danger'] as const;
  const b = defaultBindings();
  return (
    <div class="gal-grid">
      {variants.map((v) => (
        <Cell key={v} title={`Button ${v}`}>
          <div class="gal-row"><Button variant={v}>Default</Button><Button variant={v} forceState="hover">Hover</Button></div>
          <div class="gal-row"><Button variant={v} forceState="active">Pressed</Button><Button variant={v} forceState="focus">Focus</Button></div>
          <div class="gal-row"><Button variant={v} disabled>Disabled</Button><Button variant={v} disabled disabledReason="Not until a colony exists">With reason</Button></div>
          <div class="gal-row"><Button variant={v} busy>Busy</Button><Button variant={v} icon="save">With icon</Button></div>
        </Cell>
      ))}
      <Cell title="IconButton">
        <div class="gal-row">
          <IconButton icon="settings" label="Settings" /><IconButton icon="settings" label="Settings" forceState="hover" />
          <IconButton icon="settings" label="Settings" forceState="focus" /><IconButton icon="pin" label="Pin" pressed />
          <IconButton icon="trash" label="Delete" variant="danger" /><IconButton icon="close" label="Close" disabled />
        </div>
        <div class="gal-tipbox"><Tooltip text="Opens the settings book" forceOpen><IconButton icon="settings" label="Settings" /></Tooltip></div>
      </Cell>
      <Cell title="Tooltip, rich">
        <div class="gal-tipbox"><Tooltip term="Trophallaxis" text="Mouth-to-mouth sharing of food between nestmates." forceOpen placement="top"><Button variant="ghost">Term</Button></Tooltip></div>
      </Cell>
      <Cell title="KeyHint and KeyCap">
        <div class="gal-row"><KeyHint action="interact" bindings={b}>Interact</KeyHint><KeyHint action="dig" bindings={b}>Dig</KeyHint></div>
        <div class="gal-row"><KeyHint action="interact" device="pad" bindings={b}>Interact</KeyHint><KeyHint action="bite" bindings={b}>Bite</KeyHint></div>
        <div class="gal-row"><KeyCap label="Shift+Tab" /><KeyCap label="A" kind="pad" /><KeyHint action="ph-exit" bindings={b}>Exit photo</KeyHint></div>
      </Cell>
    </div>
  );
}

function Inputs() {
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState('standard');
  const [sel, setSel] = useState('medium');
  const [n, setN] = useState(3);
  const [vol, setVol] = useState(60);
  const [text, setText] = useState('4F7A-21C9');
  const opts = [{ value: 'compact', label: 'Compact' }, { value: 'standard', label: 'Standard' }, { value: 'large', label: 'Large' }];
  return (
    <div class="gal-grid">
      <Cell title="Toggle">
        <div class="gal-row"><Toggle checked={on} onChange={setOn} label="Haze" /><Toggle checked={!on} onChange={(v) => setOn(!v)} label="Mono" /></div>
        <div class="gal-row"><Toggle checked onChange={() => {}} label="Hover" forceState="hover" /><Toggle checked={false} onChange={() => {}} label="Focus" forceState="focus" /></div>
        <div class="gal-row"><Toggle checked={false} onChange={() => {}} label="Disabled" disabled /><Toggle checked onChange={() => {}} label="Disabled on" disabled /></div>
      </Cell>
      <Cell title="Slider">
        <Slider value={vol} min={0} max={100} step={5} format={(v) => `${v} %`} onChange={setVol} aria-label="Volume" />
        <Slider value={80} min={0} max={100} step={5} format={(v) => `${v} %`} onChange={() => {}} aria-label="Hover" forceState="hover" />
        <Slider value={30} min={0} max={100} step={5} format={(v) => `${v} %`} onChange={() => {}} aria-label="Focus" forceState="focus" />
        <Slider value={40} min={0} max={100} step={5} format={(v) => `${v} %`} onChange={() => {}} aria-label="Disabled" disabled />
      </Cell>
      <Cell title="Stepper">
        <Stepper value={n} min={0} max={4} step={1} onChange={setN} aria-label="Rival colonies" />
        <Stepper value={0} min={0} max={4} step={1} onChange={() => {}} aria-label="At minimum" />
        <Stepper value={2} min={0} max={4} step={1} onChange={() => {}} aria-label="Disabled" disabled />
      </Cell>
      <Cell title="SegmentedControl">
        <SegmentedControl options={opts} value={seg} onChange={setSeg} aria-label="Size" />
        <SegmentedControl options={[{ value: 'a', label: 'Natural' }, { value: 'b', label: 'Spring' }, { value: 'c', label: 'Winter', disabled: true, reason: 'Queens do not found in frost.' }]} value="a" onChange={() => {}} aria-label="Season" />
      </Cell>
      <Cell title="Select">
        <Select options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'ultra', label: 'Ultra' }]} value={sel} onChange={setSel} aria-label="Quality" />
        <Select options={[{ value: 'a', label: 'Disabled' }]} value="a" onChange={() => {}} aria-label="Disabled" disabled />
      </Cell>
      <Cell title="TextField">
        <TextField value={text} onInput={setText} mono aria-label="Seed" />
        <TextField value="" placeholder="Slot name" aria-label="Name" />
        <TextField value="Not a code" error="That text is not a FOUNDRESS save." aria-label="Error" />
        <TextField value="Read only" readOnly aria-label="Read only" />
      </Cell>
      <Cell title="TextArea" wide>
        <TextArea value={'FOUNDRESS1:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5fYGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn8='} readOnly mono rows={3} aria-label="Exported text" />
      </Cell>
      <Cell title="Field rows" wide>
        <Field label="Resolution scale" help="Renders fewer pixels and scales up."><Slider value={85} min={50} max={100} step={5} format={(v) => `${v} %`} onChange={() => {}} /></Field>
        <Field label="Dynamic resolution"><Toggle checked onChange={() => {}} /></Field>
      </Cell>
    </div>
  );
}

function Structure() {
  const [tab, setTab] = useState('overview');
  const [vtab, setVtab] = useState('graphics');
  const [card, setCard] = useState('b');
  const tabs = [{ id: 'overview', label: 'Overview' }, { id: 'tasks', label: 'Tasks' }, { id: 'stores', label: 'Stores' }];
  return (
    <div class="gal-grid">
      <Cell title="Tabs, horizontal"><Tabs tabs={tabs} value={tab} onChange={setTab} aria-label="Drawer sections" /></Cell>
      <Cell title="Tabs, vertical rail"><Tabs tabs={[{ id: 'graphics', label: 'Graphics', icon: 'settings' }, { id: 'audio', label: 'Audio', icon: 'sound-on' }, { id: 'controls', label: 'Controls', icon: 'keyboard' }]} value={vtab} onChange={setVtab} orientation="vertical" aria-label="Settings sections" /></Cell>
      <Cell title="Card">
        <Card>Static card</Card><Card selected>Selected card</Card><Card pinned>Pinned card</Card>
      </Cell>
      <Cell title="RadioCards">
        <RadioCards aria-label="Choice" value={card} onChange={setCard} options={[{ value: 'a' }, { value: 'b' }, { value: 'c', disabled: true, reason: 'Not yet available' }]} render={(o, sel) => <span>Option {String(o.value).toUpperCase()}{sel ? ' (chosen)' : ''}{o.disabled ? ' (unavailable)' : ''}</span>} />
      </Cell>
      <Cell title="List and ListItem">
        <List aria-label="Alerts"><ListItem icon="task-forage" trailing="12">Foragers</ListItem><ListItem icon="task-nurse" trailing="9" selected onClick={() => {}}>Nurses</ListItem><ListItem icon="task-dig" trailing="4" onClick={() => {}}>Diggers</ListItem></List>
      </Cell>
      <Cell title="Panel">
        <Panel title="Colony pulse" class="gal-panelbox"><p>Workers 34 · Brood 12 · 20 · 8</p></Panel>
      </Cell>
      <Cell title="ScrollArea (focusable when it overflows)">
        <ScrollArea label="Notes" class="gal-scrollbox"><div style={{ height: '8rem' }}>Scrolling content. Tab to focus this region, then use the arrow keys or PageDown.</div></ScrollArea>
      </Cell>
      <Cell title="EmptyState" wide><EmptyState icon="journal" title="No entries yet" action={<Button>Open the codex</Button>}>Entries appear here as your colony does things worth noting.</EmptyState></Cell>
    </div>
  );
}

function Feedback() {
  return (
    <div class="gal-grid">
      <Cell title="ProgressBar">
        <ProgressBar value={0.35} aria-label="Determinate" />
        <ProgressBar value={0.42} stages={[5, 15, 15, 15, 5, 5, 10, 5, 15, 10]} aria-label="Staged" />
        <ProgressBar value={0.6} thin aria-label="Thin" />
      </Cell>
      <Cell title="Meter">
        <Meter label="Queen" value={0.7} max={1} reserve text="70 %" />
        <Meter label="Crop" max={1} segments={[{ value: 0.4, tone: 'c', mark: 'C' }, { value: 0.2, tone: 'p', mark: 'P' }]} text="C 0.4 · P 0.2" />
        <Meter label="C store" value={7.4} max={10} tone="c" text="7.4" trend={trendOf(7.4, 6.5)} />
        <Meter label="P store" value={1.2} max={10} tone="p" text="1.2" trend={trendOf(1.2, 1.6)} />
        <Meter label="Health" value={0.5} max={1} tone="ok" text="50 %" trend={trendOf(5, 5.05)} />
      </Cell>
      <Cell title="StatusChip, Badge">
        <div class="gal-row"><StatusChip status="ok" /><StatusChip status="watch" /><StatusChip status="warn" /><StatusChip status="bad" /></div>
        <div class="gal-row"><Badge count={3} /><Badge count={42} /><Badge count={120} /></div>
      </Cell>
      <Cell title="AlertItem" wide>
        <div class="gal-grid">
          <AlertItem level="info" title="Source found: honeydew" cause="Aphids on the rose stem" onDismiss={() => {}} />
          <AlertItem level="notice" title="Nest is getting crowded" cause="Two chambers are full" count={3} onActivate={() => {}} />
          <AlertItem level="warning" title="Protein is running low" cause="No prey found for 2 days" onActivate={() => {}} onDismiss={() => {}} />
          <AlertItem level="critical" title="The queen is in danger" cause="A spider is near the royal chamber" />
          <AlertItem level="warning" title="Brood growth slowed" resolved />
        </div>
      </Cell>
    </div>
  );
}

function Icons() {
  return (
    <div class="gal-icons">
      {Object.keys(ICON_PATHS).map((id) => (
        <div key={id} class="gal-icon"><Icon name={id} size={28} label={id} /><span>{id}</span></div>
      ))}
    </div>
  );
}

export function Gallery({ section, modal }: { section: GallerySection | 'all'; modal: string | null }) {
  const [drawer, setDrawer] = useState(modal === 'drawer');
  const shown = section === 'all' ? SECTIONS : [section];
  return (
    <div class="gal">
      <div class="gal-page ui-surface is-elevated">
        <header class="gal-head"><h1 class="ui-h1">Components</h1><span class="ui-field-help">{section === 'all' ? 'all sections' : section}</span></header>
        <ScrollArea label="Component gallery" class="gal-scroll">
          {shown.map((s) => (
            <div key={s}>
              {section === 'all' && <h2 class="ui-section-title" style={{ margin: 'var(--s-5) 0 var(--s-3)' }}>{s}</h2>}
              {s === 'buttons' && <Buttons />}{s === 'inputs' && <Inputs />}{s === 'structure' && <Structure />}{s === 'feedback' && <Feedback />}{s === 'icons' && <Icons />}
            </div>
          ))}
        </ScrollArea>
      </div>
      {modal === 'confirm' && <ConfirmDialog title="Overwrite this save?" message="Slot 2 already holds a colony. Saving here replaces it." confirmLabel="Overwrite" danger onCancel={() => {}} onConfirm={() => {}} />}
      {modal === 'dialog' && <Modal title="Dialog" onClose={() => {}} actions={<Button variant="primary">Done</Button>}><p>A dialog traps focus until it is closed.</p></Modal>}
      {modal === 'export' && <ExportModal text={'FOUNDRESS1:' + 'AAECAwQFBgcICQoLDA0ODxAREhMU'.repeat(40)} sizeKb={3} onClose={() => {}} />}
      {drawer && <Drawer title="Directives" onClose={() => setDrawer(false)}><p>Drawers dock at the right and close with Esc.</p></Drawer>}
    </div>
  );
}
