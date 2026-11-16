// KeybindRow (GDD 08 7.5): action name, primary and secondary binding, the gamepad binding (read-only until the
// gamepad remapping tier), and a reset button. Clicking a binding starts listening ("Press a key (Esc to cancel)");
// the next key, mouse button or wheel notch becomes the binding. A conflict is never silent: the row says what the
// input is already used for and offers Swap / Unbind other / Cancel. All rules come from src/input/rebind.ts.
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  bindingLabel, defaultBindings, firstPad, PAD, padBindingGlyph, PadCapture, rebind, readGamepads, type ActionDef, type Binding, type BindingSet, type Conflict,
  type ConflictResolution, type PadCaptureKind, type Slot,
} from '@/input';
import { Button, IconButton, cx, pushBack } from '../../components';
import { BACK_LEVEL } from '../../components/logic/escapeStack';
import { padCaptureHolds, swallowGamePad } from '../../nav';
import { padStyle } from '../../nav/device';
import { actionLabel, captureKey, captureMouse, captureWheel, conflictMessage, REFUSAL_TEXT } from './captureBinding';

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

/** A pad row that nobody presses anything on stops listening after this long (a pad-only player has no Esc). */
export const PAD_LISTEN_TIMEOUT_MS = 10000;

/** What the pad capture should accept for this action: a stick, a stick direction (zoom), or a button. */
export function padCaptureKind(def: ActionDef): PadCaptureKind {
  const comp = def.axis ? def.id.split('.')[1] : null;
  if (comp === 'stick') return 'stick';
  return comp === 'in' || comp === 'out' ? 'axis' : 'button';
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

  useLayoutEffect(() => {
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
    const off = pushBack(() => { setListening(null); setMessage(''); }, BACK_LEVEL.capture);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('wheel', onWheel, true);
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, def.id]);

  // gamepad slot: the next button (or stick push) becomes the binding; Menu or 10 s of silence cancels
  useLayoutEffect(() => {
    if (listening !== 'pad') return;
    padCaptureHolds.value++;
    const capture = new PadCapture(padCaptureKind(def));
    const startedAt = performance.now();
    let raf = 0;
    const done = () => { setListening(null); };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = firstPad(readGamepads());
      if (p && (p.buttons[PAD.START] ?? 0) > 0.5) { swallowGamePad(); setMessage(''); done(); return; } // Menu cancels; the game must not also read it as "close the pause menu"
      const b = capture.feed(p);
      if (b) { done(); apply('pad', b); return; }
      if (performance.now() - startedAt > PAD_LISTEN_TIMEOUT_MS) { setMessage(''); done(); }
    };
    raf = requestAnimationFrame(tick);
    const off = pushBack(() => { setListening(null); setMessage(''); }, BACK_LEVEL.capture);
    return () => { cancelAnimationFrame(raf); off(); padCaptureHolds.value--; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, def.id]);

  const startListening = (slot: 0 | 1) => {
    if (def.locked) return;
    setPending(null);
    setMessage('Press a key (Esc to cancel)');
    setListening(slot);
  };

  const startPadListening = () => {
    if (def.locked) return;
    setPending(null);
    setMessage(padCaptureKind(def) === 'button' ? 'Press a controller button, or hold LB / RB and press another (Menu to cancel)' : 'Push a stick (Menu to cancel)');
    setListening('pad');
  };

  /** Gamepad-stick components are pad-only: the keyboard slots do not apply (rebind refuses them). */
  const padOnly = def.id.endsWith('.stick');
  const slotButton = (slot: 0 | 1) => {
    if (padOnly) return <span class="ui-keybind-na" aria-hidden="true">–</span>;
    const b = bound[slot];
    const isListening = listening === slot;
    const text = isListening ? 'Press a key…' : b ? bindingLabel(b) : 'Unbound';
    return (
      <button
        type="button" class={cx('ui-keybind-slot', isListening && 'is-listening', !b && 'is-empty')} data-listening={isListening ? '1' : undefined}
        aria-label={`${slot === 0 ? 'Primary' : 'Secondary'} binding of ${actionLabel(def)}: ${b ? bindingLabel(b) : 'unbound'}. Activate to change.`}
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
      <span class="ui-keybind-name">{actionLabel(def)}{unboundRequired && <span class="ui-keybind-req"> (required)</span>}</span>
      {slotButton(0)}
      {slotButton(1)}
      <button
        type="button" class={cx('ui-keybind-slot', 'ui-keybind-pad', listening === 'pad' && 'is-listening', !pad && 'is-empty')} data-listening={listening === 'pad' ? '1' : undefined}
        aria-label={`Gamepad binding of ${actionLabel(def)}: ${pad ? bindingLabel(pad) : 'none'}. Activate to change; Shift+Enter clears it.`}
        disabled={!!def.locked} onClick={startPadListening}
        onKeyDown={(e: KeyboardEvent) => {
          if (listening === 'pad' || def.locked) return;
          if (((e.key === 'Enter' && e.shiftKey) || e.key === 'Delete') && pad) { e.preventDefault(); apply('pad', null); }
        }}
        data-testid={`bind-${def.id}-pad`}
      >
        {listening === 'pad' ? 'Press a button…' : pad ? padBindingGlyph(pad, padStyle.value) : 'Unbound'}
      </button>
      <IconButton
        icon="reset" label={`Reset ${actionLabel(def)} to default`} class={cx('ui-keybind-reset', !changed && 'is-hidden')}
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
