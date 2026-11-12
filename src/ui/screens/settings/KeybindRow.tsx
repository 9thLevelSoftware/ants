// KeybindRow (GDD 08 7.5): action name, primary and secondary binding, the gamepad binding (read-only until the
// gamepad remapping tier), and a reset button. Clicking a binding starts listening ("Press a key (Esc to cancel)");
// the next key, mouse button or wheel notch becomes the binding. A conflict is never silent: the row says what the
// input is already used for and offers Swap / Unbind other / Cancel. All rules come from src/input/rebind.ts.
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  bindingLabel, defaultBindings, rebind, type ActionDef, type Binding, type BindingSet, type Conflict, type ConflictResolution, type Slot,
} from '@/input';
import { Button, IconButton, cx, pushBack } from '../../components';
import { captureKey, captureMouse, captureWheel, conflictMessage, REFUSAL_TEXT } from './captureBinding';

export interface KeybindRowProps {
  def: ActionDef;
  bindings: BindingSet;
  onChange: (next: BindingSet) => void;
}

interface PendingConflict {
  slot: Slot;
  binding: Binding;
  conflicts: Conflict[];
}

/** Mouse buttons and wheel are offered only to actions whose defaults already use them (GDD 08 7.5). */
export function allowsPointer(def: ActionDef): boolean {
  return [...def.kbm, ...(def.fixed ?? [])].some((b) => b.kind !== 'key') || def.id.endsWith('.drag');
}

function slotBindings(set: BindingSet, id: string): (Binding | null)[] {
  const s = set.kbm[id] ?? [];
  return [s[0] ?? null, s[1] ?? null];
}

export function KeybindRow({ def, bindings, onChange }: KeybindRowProps) {
  const [listening, setListening] = useState<Slot | null>(null);
  const [pending, setPending] = useState<PendingConflict | null>(null);
  const [message, setMessage] = useState('');
  const bound = slotBindings(bindings, def.id);
  const defaults = slotBindings(defaultBindings(), def.id);
  const changed = bound.some((b, i) => JSON.stringify(b) !== JSON.stringify(defaults[i])) || JSON.stringify(bindings.pad[def.id] ?? null) !== JSON.stringify(defaultBindings().pad[def.id] ?? null);
  const unboundRequired = !!def.required && !bound.some(Boolean);
  const rowRef = useRef<HTMLDivElement>(null);
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const apply = (slot: Slot, binding: Binding | null, resolution?: ConflictResolution) => {
    const r = rebind(bindingsRef.current, def.id, slot, binding, resolution);
    if (r.status === 'applied') { setPending(null); setMessage(''); onChange(r.bindings); }
    else if (r.status === 'conflict') { setPending({ slot, binding: binding as Binding, conflicts: r.conflicts }); setMessage(conflictMessage(binding as Binding, r.conflicts)); }
    else if (r.status === 'refused') { setPending(null); setMessage(REFUSAL_TEXT[r.reason]); }
    else { setPending(null); setMessage(''); }
  };

  useEffect(() => {
    if (listening === null || listening === 'pad') return;
    const slot = listening;
    let shiftPending: string | null = null;
    const stop = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); };
    const finish = (binding: Binding) => { setListening(null); apply(slot, binding); };
    const blockClick = () => window.addEventListener('click', (ev) => { ev.stopImmediatePropagation(); ev.preventDefault(); }, { capture: true, once: true });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') return; // the back stack cancels
      stop(e);
      if (e.repeat) return;
      const c = captureKey(e);
      if (c.kind === 'binding') { shiftPending = null; finish(c.binding); }
      else if (c.kind === 'pending') shiftPending = c.code;
      else if (c.kind === 'refused') { setMessage(c.message); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Escape') return;
      if (shiftPending && e.code === shiftPending) { stop(e); const code = shiftPending; shiftPending = null; finish({ kind: 'key', code }); }
    };
    const onMouseDown = (e: MouseEvent) => {
      const inRow = rowRef.current?.contains(e.target as Node);
      if (!allowsPointer(def)) { if (!inRow) setListening(null); return; }
      stop(e);
      blockClick();
      finish(captureMouse(def.id, e.button));
    };
    const onWheel = (e: WheelEvent) => {
      if (!allowsPointer(def) || def.id.endsWith('.drag')) return;
      stop(e);
      finish(captureWheel(e.deltaY, e.shiftKey));
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    const off = pushBack(() => { setListening(null); setMessage(''); });
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('wheel', onWheel, true);
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, def.id]);

  const startListening = (slot: 0 | 1) => {
    if (def.locked) return;
    setPending(null);
    setMessage('Press a key (Esc to cancel)');
    setListening(slot);
  };

  const slotButton = (slot: 0 | 1) => {
    const b = bound[slot];
    const isListening = listening === slot;
    const text = isListening ? 'Press a key…' : b ? bindingLabel(b) : 'Unbound';
    return (
      <button
        type="button" class={cx('ui-keybind-slot', isListening && 'is-listening', !b && 'is-empty')} data-listening={isListening ? '1' : undefined}
        aria-label={`${slot === 0 ? 'Primary' : 'Secondary'} binding of ${def.label}: ${b ? bindingLabel(b) : 'unbound'}. Activate to change.`}
        disabled={!!def.locked}
        onClick={() => startListening(slot)}
        onKeyDown={(e: KeyboardEvent) => {
          if (isListening || def.locked) return;
          if ((e.key === 'Delete' || e.key === 'Backspace') && b) { e.preventDefault(); apply(slot, null); }
        }}
        data-testid={`bind-${def.id}-${slot}`}
      >
        {text}
      </button>
    );
  };

  const pad = bindings.pad[def.id];
  return (
    <div class={cx('ui-keybind', unboundRequired && 'is-required-missing', pending && 'has-conflict')} ref={rowRef} data-action={def.id}>
      <span class="ui-keybind-name">{def.label}{unboundRequired && <span class="ui-keybind-req"> (required)</span>}</span>
      {slotButton(0)}
      {slotButton(1)}
      <span class="ui-keybind-pad" aria-label={pad ? `Gamepad: ${bindingLabel(pad)}` : 'Gamepad: none'}>{pad ? bindingLabel(pad) : ''}</span>
      <IconButton
        icon="reset" label={`Reset ${def.label} to default`} class={cx('ui-keybind-reset', !changed && 'is-hidden')}
        disabled={!changed} onClick={() => { const d = defaultBindings(); const next = JSON.parse(JSON.stringify(bindings)) as BindingSet; next.kbm[def.id] = d.kbm[def.id]; next.pad[def.id] = d.pad[def.id]; setPending(null); setMessage(''); onChange(next); }}
      />
      {(message || pending) && (
        <div class="ui-keybind-note" role="status" aria-live="polite">
          <span class={cx(pending && 'is-conflict')}>{message}{pending ? ` Swap, unbind it or cancel?` : ''}</span>
          {pending && (
            <span class="ui-keybind-resolve">
              <Button variant="primary" onClick={() => apply(pending.slot, pending.binding, 'swap')} data-testid="conflict-swap">Swap</Button>
              <Button onClick={() => apply(pending.slot, pending.binding, 'unbind-other')} data-testid="conflict-unbind">Unbind other</Button>
              <Button variant="ghost" onClick={() => { setPending(null); setMessage(''); }} data-testid="conflict-cancel">Cancel</Button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
