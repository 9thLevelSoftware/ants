// Inspect card (GDD 08 10.2, GDD 01 10): 280 dp wide, a header, a "senses" block (what an ant perceives) and a
// "colony" block, from the simulation's own read-out. Auto-hides 0.4 real seconds after the hover ends; pin keeps it.
// Buttons: Possess, Follow, and "Colony orders" on the queen's card. Docked at the left, below the time cluster, so it
// never covers the centre of the screen.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { UiInspect } from '../../api';
import { Button, IconButton } from '../../components/Button';
import { CASTE_ICON } from '../../hud/format';
import { inspectSlice } from '../../hud/slices';
import { hudBridge, inspectPin, openPanel } from '../../hud/state';
import { Icon } from '../../icons';
import { facade } from '../../store';
import { pinInspect } from './inspectState';
import { rowLabel, rowValue } from './rows';

export const INSPECT_LINGER_MS = 400;

/** The card to draw: the live one, kept for INSPECT_LINGER_MS after it disappears unless it is pinned. */
export function useLingeringCard(card: UiInspect | null, pinned: boolean): UiInspect | null {
  const [shown, setShown] = useState<UiInspect | null>(card);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (card) { if (timer.current !== undefined) { clearTimeout(timer.current); timer.current = undefined; } setShown(card); return; }
    if (pinned) return;
    timer.current = window.setTimeout(() => { setShown(null); timer.current = undefined; }, INSPECT_LINGER_MS);
    return () => { if (timer.current !== undefined) { clearTimeout(timer.current); timer.current = undefined; } };
  }, [card, pinned]);
  return card ?? shown;
}

function Block({ title, rows }: { title: string; rows: UiInspect['senses'] }) {
  if (rows.length === 0) return null;
  return (
    <section class="fd-ins-block" aria-label={title}>
      <h3 class="fd-ins-h">{title}</h3>
      <dl class="fd-ins-rows">
        {rows.filter((r) => r.key !== 'colony-orders').map((r) => (
          <div key={r.key} class="fd-ins-row" data-key={r.key}>
            <dt>{rowLabel(r.key)}</dt>
            <dd>{rowValue(r)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function InspectCard() {
  const live = inspectSlice.value;
  const pin = inspectPin.value;
  const card = useLingeringCard(live, pin !== null);
  if (!card) return null;
  const f = facade.value;
  const pinned = pin !== null && pin.id === card.targetId && pin.kind === card.targetKind;
  const casteRow = card.senses.find((r) => r.key === 'caste');
  return (
    <aside class="fd-ins fd-chip" aria-label={`Inspect: ${card.header}`} data-hud="inspect" data-testid="inspect-card">
      <header class="fd-ins-head">
        <Icon name={casteRow ? (CASTE_ICON[casteRow.word] ?? 'ant-worker') : card.targetKind === 'brood' ? 'larva' : 'info'} size={20} decorative />
        <h2 class="fd-ins-title" data-testid="inspect-title">{card.header}</h2>
        <IconButton icon={pinned ? 'close' : 'pin'} label={pinned ? 'Unpin' : 'Pin this card'} pressed={pinned} onClick={() => pinInspect(pinned ? null : { kind: card.targetKind, id: card.targetId })} />
      </header>
      <Block title="Senses" rows={card.senses} />
      <Block title="Colony" rows={card.colony} />
      {(card.canPossess || card.canFollow || card.colonyOrders) && (
        <footer class="fd-ins-actions">
          {card.canPossess && <Button variant="secondary" icon="possess" onClick={() => f?.possess(card.targetId)} data-testid="inspect-possess">Possess</Button>}
          {card.canFollow && hudBridge.value && <Button variant="secondary" icon="follow" onClick={() => hudBridge.value?.follow(card.targetId)} data-testid="inspect-follow">Follow</Button>}
          {card.colonyOrders && <Button variant="primary" onClick={() => openPanel('directives')} data-testid="inspect-orders">Colony orders</Button>}
        </footer>
      )}
    </aside>
  );
}
