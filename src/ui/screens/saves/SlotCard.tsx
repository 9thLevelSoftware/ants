// A save slot card (GDD 08 7.6): thumbnail 160 x 90, slot name, species, locality + seed, colony date, population,
// when it was saved, play time, version; or "Empty". Actions are passed in by the screen.
import type { ComponentChildren } from 'preact';
import { Icon } from '../../icons';
import { cx } from '../../components';
import type { SaveSlotInfo } from '../../api';
import { playTimeText, savedAtText, slotTitle, speciesName } from './describe';

const ARCHETYPE_WORDS: Record<string, string> = {
  'woodland-edge': 'Woodland Edge', 'suburban-garden': 'Suburban Garden', 'playground-park': 'Playground Park',
  'car-park-verge': 'Car Park Verge', 'kitchen-door': 'Kitchen Door', 'field-margin': 'Field Margin',
};

export interface SlotCardProps {
  slot: string;
  info: SaveSlotInfo | null;
  actions?: ComponentChildren;
  /** Heading override (autosave generations show their trigger). */
  title?: string;
}

export function SlotCard({ slot, info, actions, title }: SlotCardProps) {
  const name = title ?? slotTitle(slot);
  if (!info) {
    return (
      <li class="ui-slot is-empty" data-slot={slot}>
        <div class="ui-slot-thumb is-empty" aria-hidden="true"><Icon name="save" size={24} decorative /></div>
        <div class="ui-slot-info"><h3 class="ui-slot-name">{name}</h3><p class="ui-slot-empty">Empty</p></div>
        <div class="ui-slot-actions">{actions}</div>
      </li>
    );
  }
  const loc = [info.archetype ? ARCHETYPE_WORDS[info.archetype] ?? info.archetype : '', info.seedCode ? `seed ${info.seedCode}` : ''].filter(Boolean).join(', ');
  return (
    <li class={cx('ui-slot', info.kind === 'auto' && 'is-auto')} data-slot={slot}>
      <div class="ui-slot-thumb">
        {info.thumbnail ? <img src={info.thumbnail} alt="" width={160} height={90} /> : <Icon name="photo" size={24} decorative />}
      </div>
      <div class="ui-slot-info">
        <h3 class="ui-slot-name">{name}{info.trigger ? <span class="ui-slot-trigger"> · {info.trigger}</span> : null}</h3>
        <p class="ui-slot-line"><span class="ui-binomial">{speciesName(info.species)}</span>{loc ? ` · ${loc}` : ''}</p>
        <p class="ui-slot-line">{info.dateLabel ?? `Day ${info.colonyDay}`} · {info.population ?? info.workers} workers</p>
        <p class="ui-slot-meta">
          {savedAtText(info.savedAt)}{info.playTimeS !== undefined ? ` · ${playTimeText(info.playTimeS)} played` : ''}{info.version ? ` · v${info.version}` : ''}
        </p>
      </div>
      <div class="ui-slot-actions">{actions}</div>
    </li>
  );
}
