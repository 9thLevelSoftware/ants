// Modal / Dialog (GDD 08 2.7): confirm, prompt and text-export variants share this frame. Focus is trapped and
// restored to the opener, Esc cancels (through the back stack so it never also closes the screen below),
// the backdrop is --e-3. ConfirmDialog is the common Cancel / confirm pair; `danger` marks destructive confirms.
import type { ComponentChildren } from 'preact';
import { useId, useRef } from 'preact/hooks';
import { cx } from './cx';
import { Button } from './Button';
import { useBackLayer, useFocusScope } from './focus';
import { BACK_LEVEL } from './logic/escapeStack';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  /** Buttons row (right-aligned). */
  actions?: ComponentChildren;
  /** alertdialog for confirmations that interrupt (default 'dialog'). */
  role?: 'dialog' | 'alertdialog';
  /** Selector inside the dialog to focus first (default: first focusable). */
  initialFocus?: string;
  wide?: boolean;
  class?: string;
}

export function Modal(p: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useFocusScope(ref, { trap: true, initial: p.initialFocus });
  useBackLayer(p.onClose, BACK_LEVEL.dialog);
  return (
    <div class="ui-modal-backdrop" onPointerDown={(e: PointerEvent) => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div
        ref={ref} class={cx('ui-modal', 'ui-surface', p.wide && 'is-wide', p.class)} role={p.role ?? 'dialog'} aria-modal="true"
        aria-labelledby={titleId} aria-describedby={bodyId}
      >
        <h2 id={titleId} class="ui-modal-title">{p.title}</h2>
        <div id={bodyId} class="ui-modal-body">{p.children}</div>
        {p.actions && <div class="ui-modal-actions">{p.actions}</div>}
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  title: string;
  message: ComponentChildren;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  /** An extra middle option, e.g. "Save and leave". */
  alternate?: { label: string; onClick: () => void };
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(p: ConfirmDialogProps) {
  return (
    <Modal
      title={p.title} onClose={p.onCancel} role="alertdialog" initialFocus=".ui-confirm-cancel"
      actions={(
        <>
          <Button variant="ghost" onClick={p.onCancel} class="ui-confirm-cancel" data-testid="confirm-cancel">{p.cancelLabel ?? 'Cancel'}</Button>
          {p.alternate && <Button variant="secondary" onClick={p.alternate.onClick}>{p.alternate.label}</Button>}
          <Button variant={p.danger ? 'danger' : 'primary'} onClick={p.onConfirm} data-testid="confirm-ok">{p.confirmLabel}</Button>
        </>
      )}
    >
      <p>{p.message}</p>
    </Modal>
  );
}
