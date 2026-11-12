// Settings > Controls (GDD 08 7.4, 7.5): mouse settings and the keyboard binding table. Bindings come from and go
// back to the game through GameFacade.getBindings / setBindings; without them the table works on a local copy that
// is kept in localStorage `foundress.bindings.v1` (the key the input module names) so rebinding still persists.
import { useState } from 'preact/hooks';
import { ACTIONS, BINDINGS_STORAGE_KEY, defaultBindings, parseBindings, resetAll, serializeBindings, type ActionDef, type BindingSet } from '@/input';
import { Button, ConfirmDialog, Field, SegmentedControl, Slider, Toggle, setCurrentBindings } from '../../components';
import { Icon } from '../../icons';
import { facade } from '../../store';
import { contextName } from './captureBinding';
import { KeybindRow } from './KeybindRow';
import { useGameSettings } from './useSettings';

/** Display order of the groups (GDD 01 5: contexts). */
const GROUP_ORDER = ['G', 'P', 'O', 'C', 'Ph', 'TL', 'UI'] as const;
const GROUP_TITLES: Record<string, string> = {
  G: 'Everywhere', P: 'Possession', O: 'Observer', C: 'Colony view', Ph: 'Photo mode', TL: 'Time-lapse', UI: 'Menus',
};

/** Actions grouped by their first context, in the table's display order. */
export function groupActions(actions: readonly ActionDef[] = ACTIONS): { id: string; title: string; actions: ActionDef[] }[] {
  const out = GROUP_ORDER.map((id) => ({ id: id as string, title: GROUP_TITLES[id] ?? contextName(id), actions: [] as ActionDef[] }));
  for (const a of actions) out.find((g) => g.id === a.contexts[0])?.actions.push(a);
  return out.filter((g) => g.actions.length > 0);
}

function loadLocalBindings(): BindingSet {
  try {
    return parseBindings(localStorage.getItem(BINDINGS_STORAGE_KEY)).bindings;
  } catch {
    return defaultBindings();
  }
}

function saveLocalBindings(set: BindingSet): boolean {
  try {
    localStorage.setItem(BINDINGS_STORAGE_KEY, serializeBindings(set));
    return true;
  } catch {
    return false;
  }
}

/** Current bindings: the game's when it provides them, else the locally stored set. */
export function readBindings(): BindingSet {
  return facade.value?.getBindings?.() ?? loadLocalBindings();
}

export function writeBindings(set: BindingSet): void {
  const f = facade.value;
  if (f?.setBindings) f.setBindings(set);
  else saveLocalBindings(set);
  setCurrentBindings(set);
}

export function ControlsTab() {
  const [settings, setSettings] = useGameSettings();
  const [bindings, setBindings] = useState<BindingSet>(() => readBindings());
  const [open, setOpen] = useState<Record<string, boolean>>({ G: true, P: true });
  const [confirmReset, setConfirmReset] = useState(false);
  if (!settings) return <p class="ui-notice">Settings are not available yet.</p>;
  const c = settings.controls;
  const change = (next: BindingSet) => { setBindings(next); writeBindings(next); };
  return (
    <>
      <div class="ui-fieldset">
        <Field label="Mouse sensitivity" help="How far a drag turns the camera.">
          <Slider value={c.mouseSensitivity} min={0.2} max={3} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => setSettings({ controls: { mouseSensitivity: v } })} />
        </Field>
        <Field label="Invert vertical look"><Toggle checked={c.invertY} onChange={(v) => setSettings({ controls: { invertY: v } })} /></Field>
        <Field label="Mouse look" help="Captured locks the pointer to the game; it falls back to Drag when the browser refuses.">
          <SegmentedControl value={c.mouseLook} onChange={(v) => setSettings({ controls: { mouseLook: v } })} options={[{ value: 'drag', label: 'Drag' }, { value: 'locked', label: 'Captured' }]} />
        </Field>
        <Field label="Left mouse button" help="With Orbit, left drag turns the camera and biting stays on Q.">
          <SegmentedControl value={c.leftButton} onChange={(v) => setSettings({ controls: { leftButton: v } })} options={[{ value: 'bite', label: 'Bite' }, { value: 'orbit', label: 'Orbit' }]} />
        </Field>
        <Field label="Gamepad dead zone">
          <Slider value={c.deadZone} min={0.05} max={0.35} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => setSettings({ controls: { deadZone: v } })} />
        </Field>
      </div>
      <div class="ui-bindings-head">
        <h2 class="ui-section-title">Keyboard and mouse</h2>
        <Button variant="ghost" icon="reset" onClick={() => setConfirmReset(true)} data-testid="reset-all">Reset all to defaults</Button>
      </div>
      <p class="ui-field-help">Select a binding, then press the new key. With a binding selected, Delete clears it. Esc, F11 and F12 cannot be bound.</p>
      {groupActions().map((g) => {
        const expanded = !!open[g.id];
        return (
          <section key={g.id} class="ui-bindgroup" aria-label={g.title}>
            <button type="button" class="ui-disclosure" aria-expanded={expanded ? 'true' : 'false'} onClick={() => setOpen({ ...open, [g.id]: !expanded })} data-testid={`group-${g.id}`}>
              <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={18} decorative />
              <span>{g.title}</span>
              <span class="ui-disclosure-count">{g.actions.length}</span>
            </button>
            {expanded && (
              <div class="ui-keybind-table" role="group" aria-label={`${g.title} bindings`}>
                <div class="ui-keybind-headrow" aria-hidden="true"><span>Action</span><span>Primary</span><span>Secondary</span><span>Gamepad</span><span /></div>
                {g.actions.map((a) => <KeybindRow key={a.id} def={a} bindings={bindings} onChange={change} />)}
              </div>
            )}
          </section>
        );
      })}
      {confirmReset && (
        <ConfirmDialog
          title="Reset all bindings?" message="Every key returns to its default. Your other settings are kept." confirmLabel="Reset all" danger
          onCancel={() => setConfirmReset(false)} onConfirm={() => { setConfirmReset(false); change(resetAll()); }}
        />
      )}
    </>
  );
}
