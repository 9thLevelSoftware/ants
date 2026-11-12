// TextField and TextArea (GDD 08 2.7): error and read-only states; the seed field uses JetBrains Mono. While a text
// field has focus the game's key bindings are suspended by the input layer (it ignores events from inputs); the
// shell's menu key handler makes Esc blur the field first (GDD 01 5.8) before it can leave the screen.
import { useFieldA11y } from './Field';
import { cx } from './cx';

interface BaseProps {
  value: string;
  onInput?: (value: string) => void;
  'aria-label'?: string;
  error?: string;
  readOnly?: boolean;
  mono?: boolean;
  placeholder?: string;
  id?: string;
  class?: string;
  maxLength?: number;
  spellcheck?: boolean;
  'data-testid'?: string;
}

export interface TextFieldProps extends BaseProps {
  onEnter?: () => void;
}

export function TextField(p: TextFieldProps) {
  const a11y = useFieldA11y(p['aria-label']);
  return (
    <div class={cx('ui-text', p.error && 'is-error', p.readOnly && 'is-readonly', p.class)}>
      <input
        id={p.id} type="text" class={cx('ui-input', p.mono && 'is-mono')} value={p.value} readOnly={p.readOnly} placeholder={p.placeholder}
        maxLength={p.maxLength} spellcheck={p.spellcheck ?? false} autocomplete="off" aria-invalid={p.error ? 'true' : undefined}
        data-testid={p['data-testid']} data-text-input="1" {...a11y}
        onInput={(e) => p.onInput?.((e.currentTarget as HTMLInputElement).value)}
        onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') p.onEnter?.(); }}
      />
      {p.error && <p class="ui-text-error" role="alert">{p.error}</p>}
    </div>
  );
}

export interface TextAreaProps extends BaseProps {
  rows?: number;
}

export function TextArea(p: TextAreaProps) {
  const a11y = useFieldA11y(p['aria-label']);
  return (
    <div class={cx('ui-text', p.error && 'is-error', p.readOnly && 'is-readonly', p.class)}>
      <textarea
        id={p.id} class={cx('ui-input', 'ui-textarea', p.mono && 'is-mono')} value={p.value} readOnly={p.readOnly} placeholder={p.placeholder}
        rows={p.rows ?? 6} spellcheck={p.spellcheck ?? false} aria-invalid={p.error ? 'true' : undefined} data-testid={p['data-testid']}
        data-text-input="1" {...a11y}
        onInput={(e) => p.onInput?.((e.currentTarget as HTMLTextAreaElement).value)}
      />
      {p.error && <p class="ui-text-error" role="alert">{p.error}</p>}
    </div>
  );
}
