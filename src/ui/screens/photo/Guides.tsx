// Composition guides (GDD 08 7.9): rule-of-thirds lines and a centre mark over the picture. They are DOM, drawn above the
// canvas, so a capture never contains them.
import type { PhotoGuides } from './store';

export function Guides({ guides }: { guides: PhotoGuides }) {
  if (guides === 'off') return null;
  return (
    <svg class="ph-guides" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" data-testid="photo-guides" data-guides={guides}>
      {guides === 'thirds' && (
        <>
          <line x1="33.333" y1="0" x2="33.333" y2="100" /><line x1="66.667" y1="0" x2="66.667" y2="100" />
          <line x1="0" y1="33.333" x2="100" y2="33.333" /><line x1="0" y1="66.667" x2="100" y2="66.667" />
        </>
      )}
      {guides === 'centre' && (
        <>
          <line x1="50" y1="46" x2="50" y2="54" /><line x1="46" y1="50" x2="54" y2="50" />
          <line x1="0" y1="50" x2="42" y2="50" class="is-faint" /><line x1="58" y1="50" x2="100" y2="50" class="is-faint" />
          <line x1="50" y1="0" x2="50" y2="42" class="is-faint" /><line x1="50" y1="58" x2="50" y2="100" class="is-faint" />
        </>
      )}
    </svg>
  );
}
