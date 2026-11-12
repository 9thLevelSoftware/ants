// Colony orders drawer (GDD 08 4.2, screen id `directives`, key I): right-docked, 400 x 688 dp. Opened by the I key, by
// the queen's "Colony orders" prompt and button, and by her inspect card; it does not pause and does not release the
// possessed ant, and nothing changes until a control is moved. While it is open the HUD's right column folds into the
// one-line strip at the top of the drawer (colony pulse and an alert count).
import type { DirectivesPatch } from '@/sim/types';
import { DrawerShell } from '../../hud/DrawerShell';
import { useState } from 'preact/hooks';
import { Icon } from '../../icons';
import { loads } from '../../hud/format';
import { feedView } from '../../hud/alerts/store';
import { colonySlice, directivesSlice } from '../../hud/slices';
import { closePanel } from '../../hud/state';
import { facade } from '../../store';
import { BroodSection, DietSection, NestSection, SafetySection } from './PolicySections';
import { WorkforceSection } from './WorkforceSection';

function Strip() {
  const c = colonySlice.value;
  const alerts = feedView.value;
  const n = alerts.cards.length + alerts.more;
  if (!c) return null;
  return (
    <div class="fd-strip" data-testid="dir-strip" aria-label="Colony at a glance">
      <span>Workers <b>{c.workers}</b></span>
      <span>Brood <b>{c.brood.egg} · {c.brood.larva} · {c.brood.pupa}</b></span>
      <span class="tone-c-text">C <b>{loads(c.stores.c)}</b></span>
      <span class="tone-p-text">P <b>{loads(c.stores.p)}</b></span>
      {n > 0 && <span class="fd-strip-alerts" aria-label={`${n} alerts`}><Icon name="status-warn" size={16} decorative /> {n}</span>}
    </div>
  );
}

export function Directives() {
  const [about, setAbout] = useState(false);
  const d = directivesSlice.value;
  const f = facade.value;
  const setDirectives = (patch: Record<string, unknown>) => f?.setDirectives(patch as DirectivesPatch);
  const command = f?.command ? (cmd: Record<string, unknown>) => f.command?.(cmd as never) : undefined;
  return (
    <DrawerShell title="Colony orders" onClose={() => closePanel('directives')} class="fd-drawer fd-directives">
      <Strip />
      <div class="fd-intro">
        <button type="button" class="fd-info" aria-label="About colony orders" aria-expanded={about ? 'true' : 'false'} aria-controls="fd-about" onClick={() => setAbout(!about)} data-testid="dir-info">
          <Icon name="info" size={18} decorative />
        </button>
        <p class="fd-help fd-infotext" id="fd-about">{about ? 'Ants have no commander. These orders stand for many local decisions; read why in the codex.' : 'Nothing changes until you move a control.'}</p>
      </div>
      {!d ? (
        <p class="fd-note">No colony to give orders to.</p>
      ) : (
        <>
          <WorkforceSection d={d} setDirectives={setDirectives} />
          <BroodSection d={d} setDirectives={setDirectives} />
          <DietSection d={d} setDirectives={setDirectives} />
          <SafetySection d={d} setDirectives={setDirectives} />
          <NestSection d={d} setDirectives={setDirectives} command={command} />
        </>
      )}
    </DrawerShell>
  );
}
