// A settings row: visible label, optional help text, and the control. The label id flows to the control through
// context so every control has an accessible name without repeating the text.
import { createContext, type ComponentChildren } from 'preact';
import { useContext } from 'preact/hooks';
import { useId } from 'preact/hooks';
import { cx } from './cx';

export interface FieldCtx {
  labelId?: string;
  descId?: string;
}

export const FieldContext = createContext<FieldCtx>({});

/** Accessible-name attributes for a control: explicit label wins, otherwise the enclosing Field's label. */
export function useFieldA11y(label?: string): { 'aria-label'?: string; 'aria-labelledby'?: string; 'aria-describedby'?: string } {
  const f = useContext(FieldContext);
  if (label) return { 'aria-label': label, 'aria-describedby': f.descId };
  return { 'aria-labelledby': f.labelId, 'aria-describedby': f.descId };
}

export interface FieldProps {
  label: ComponentChildren;
  help?: ComponentChildren;
  /** 'row' puts label and control side by side (default); 'stack' puts the control under the label. */
  layout?: 'row' | 'stack';
  children: ComponentChildren;
  class?: string;
}

export function Field({ label, help, layout = 'row', children, class: cls }: FieldProps) {
  const labelId = useId();
  const descId = useId();
  return (
    <FieldContext.Provider value={{ labelId, descId: help ? descId : undefined }}>
      <div class={cx('ui-field', `is-${layout}`, cls)} role="group" aria-labelledby={labelId}>
        <div class="ui-field-text">
          <span id={labelId} class="ui-field-label">{label}</span>
          {help && <span id={descId} class="ui-field-help">{help}</span>}
        </div>
        <div class="ui-field-control">{children}</div>
      </div>
    </FieldContext.Provider>
  );
}
