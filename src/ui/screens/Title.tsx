// Title (GDD 08 3.3): wordmark, subtitle and the main menu: Continue, New colony, Load, Lineage (only when there
// are lineage records), Codex, Settings, Credits. Bottom-left: the storage status line when saving is not
// available; bottom-right: version and the asset licence line. The calm scene behind it is the game's own render.
import { useEffect, useRef, useState } from 'preact/hooks';
import { FOUNDRESS_VERSION } from '@/core/version';
import type { SaveSlotInfo } from '../api';
import { Button, useFocusScope } from '../components';
import { facade } from '../store';
import { loadSlot } from './loadFlow';
import { updateNav, type OverlayId } from './nav';
import { continueLine, newestSave } from './saves/describe';

export function Title({ inert }: { inert?: boolean }) {
  const f = facade.value;
  const root = useRef<HTMLDivElement>(null);
  const [saves, setSaves] = useState<SaveSlotInfo[] | null>(null);
  useEffect(() => {
    let live = true;
    f?.listSaves().then((s) => { if (live) setSaves(s); }).catch(() => { if (live) setSaves([]); });
    return () => { live = false; };
  }, [f]);
  useFocusScope(root, { trap: true, initial: '.ui-menuitem:not([disabled])' });
  const storageOk = f?.storageAvailable?.() !== false;
  const latest = storageOk && saves ? newestSave(saves) : null;
  // The save list arrives after the first frame (IndexedDB), when focus has already gone to "New colony". GDD 08 3.3:
  // focus starts on Continue when it is enabled, so move it there once, unless the player has already started to act.
  const acted = useRef(false);
  useEffect(() => {
    if (!latest || acted.current) return;
    const cont = root.current?.querySelector<HTMLElement>('[data-testid=menu-continue]');
    const at = document.activeElement;
    const stillOnInitial = !at || at === document.body || at === root.current?.querySelector('[data-testid=menu-new]'); // gamepad moves focus without keys
    if (cont && stillOnInitial && !(cont as HTMLButtonElement).disabled) cont.focus({ preventScroll: true });
  }, [latest?.slot]);
  const open = (id: OverlayId, extra: { saveTab?: 'load' } = {}) => updateNav((n) => ({ ...n, stack: [...n.stack, id], ...(extra.saveTab ? { saveTab: extra.saveTab } : {}) }));
  const lineage = f?.hasLineage?.() === true;

  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(root.current?.querySelectorAll<HTMLElement>('.ui-menuitem:not([disabled])') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  };

  return (
    <div ref={root} class="ui-screen ui-title" inert={inert} data-screen="title" onKeyDownCapture={() => { acted.current = true; }} onPointerDownCapture={() => { acted.current = true; }}>
      <div class="ui-title-col">
        <h1 class="ui-wordmark">FOUNDRESS</h1>
        <p class="ui-subtitle">A naturalistic ant colony sandbox</p>
        <nav aria-label="Main menu" onKeyDown={onMenuKey}>
          <ul class="ui-menu">
            <li>
              <Button variant="ghost" block class="ui-menuitem" disabled={!latest} onClick={() => { if (latest && f) void loadSlot(f, latest.slot, latest); }} data-testid="menu-continue">
                <span class="ui-menu-main">Continue</span>
                {latest && <span class="ui-menu-sub">{continueLine(latest)}</span>}
              </Button>
            </li>
            <li><Button variant="ghost" block class="ui-menuitem" onClick={() => open('new-game')} data-testid="menu-new">New colony</Button></li>
            <li><Button variant="ghost" block class="ui-menuitem" onClick={() => open('save-load', { saveTab: 'load' })} data-testid="menu-load">Load</Button></li>
            {lineage && <li><Button variant="ghost" block class="ui-menuitem" onClick={() => open('lineage')} data-testid="menu-lineage">Lineage</Button></li>}
            <li><Button variant="ghost" block class="ui-menuitem" onClick={() => open('codex')} data-testid="menu-codex">Codex</Button></li>
            <li><Button variant="ghost" block class="ui-menuitem" onClick={() => open('settings')} data-testid="menu-settings">Settings</Button></li>
            <li><Button variant="ghost" block class="ui-menuitem" onClick={() => open('credits')} data-testid="menu-credits">Credits</Button></li>
          </ul>
        </nav>
      </div>
      {!storageOk && <p class="ui-title-note ui-chip-scrim" role="status">Saving to this browser is not available here. Use Export to keep your colony.</p>}
      <p class="ui-title-foot ui-chip-scrim">v{FOUNDRESS_VERSION} · Assets: CC0, see Credits</p>
    </div>
  );
}
