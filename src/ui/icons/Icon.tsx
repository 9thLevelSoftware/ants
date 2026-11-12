// Inline-SVG icon. Icons always have an accessible name (GDD 08 2.5): pass `label`, or `decorative` when the
// surrounding control already carries the name.
import { ICON_PATHS } from './paths';

export interface IconProps {
  name: string;
  /** Size in dp (1/16 rem); default 24. */
  size?: number;
  /** Accessible name; leave out together with `decorative` when the parent names it. */
  label?: string;
  decorative?: boolean;
  class?: string;
}

export function Icon({ name, size = 24, label, decorative, class: cls }: IconProps) {
  const body = ICON_PATHS[name];
  const hidden = decorative || !label;
  const rem = `${size / 16}rem`;
  return (
    <svg
      class={`ui-icon ${cls ?? ''}`} viewBox="0 0 24 24" width={rem} height={rem} fill="none" stroke="currentColor"
      stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false"
      role={hidden ? undefined : 'img'} aria-label={hidden ? undefined : label} aria-hidden={hidden ? 'true' : undefined}
      data-icon={name}
      dangerouslySetInnerHTML={{ __html: body ?? '' }}
    />
  );
}
