// The plate of a codex entry (GDD 08 7.3: 512 x 288 dp). Drawn as a field-sketch line drawing of the entry's category on
// paper; a locked entry shows only its silhouette and "Not yet observed". Spider entries follow the comfort setting: any
// setting but "off" draws a plain ring, the "marker only" form of GDD 08 12, never a body.
import { ICON_PATHS } from '../../icons/paths';

const CATEGORY_GLYPH: Record<string, string> = {
  species: 'ant-worker', castes: 'ant-queen', behaviours: 'ant-worker', creatures: 'task-guard', 'plants-food': 'leaf', habitats: 'season-summer',
  weather: 'weather-rain', human: 'footfall', interface: 'codex',
};

export interface PlateProps {
  category: string;
  title: string;
  unlocked: boolean;
  /** True for a spider entry while the comfort setting is not "off". */
  ring: boolean;
}

export function Plate({ category, title, unlocked, ring }: PlateProps) {
  const glyph = ICON_PATHS[ring ? 'spider' : CATEGORY_GLYPH[category] ?? 'codex'] ?? '';
  return (
    <svg class={`pn-plate${unlocked ? '' : ' is-locked'}`} viewBox="0 0 512 288" role="img" aria-label={unlocked ? `Plate: ${title}` : `Plate for ${title}: not yet observed`} data-testid="codex-plate" data-locked={unlocked ? '0' : '1'}>
      <rect x="0.5" y="0.5" width="511" height="287" rx="6" class="pn-plate-paper" />
      <rect x="14.5" y="14.5" width="483" height="259" rx="3" class="pn-plate-rule" />
      {ring ? (
        <g class="pn-plate-art"><circle cx="256" cy="144" r="62" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="10 6" /><text x="256" y="150" text-anchor="middle" class="pn-plate-ring-label">Spider</text></g>
      ) : (
        <g class="pn-plate-art" transform="translate(166 54) scale(7.5)" fill={unlocked ? 'none' : 'currentColor'} stroke="currentColor" stroke-width="0.35" stroke-linecap="round" stroke-linejoin="round" dangerouslySetInnerHTML={{ __html: glyph }} />
      )}
      <text x="256" y="262" text-anchor="middle" class="pn-plate-caption">{unlocked ? title : 'Not yet observed'}</text>
    </svg>
  );
}
