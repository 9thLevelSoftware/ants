// Workforce (GDD 08 4.2): four allocation sliders in a linked group (always 100 % in total, steps of 5 %, padlocks,
// floors), the Auto switch, and per group the thin "actual" tick under the track with the headcount.
import { useState } from 'preact/hooks';
import { Slider } from '../../components/Slider';
import { Toggle } from '../../components/Toggle';
import { IconButton } from '../../components/Button';
import { Icon } from '../../icons';
import type { UiDirectives, UiGroupId } from '../../api';
import { boundsFor, GROUP_ORDER, moveShare, quantise, type Flags, type Shares } from './linkedShares';
import { useCommit } from './useCommit';
import { blockSyntheticVertical } from '../../hud/padGuard';

const GROUPS: Record<UiGroupId, { name: string; icon: string; what: string }> = {
  forage: { name: 'Forage', icon: 'task-forage', what: 'Scouting, foraging and tending aphids: finding food and bringing it in.' },
  nurse: { name: 'Nurse', icon: 'task-nurse', what: 'Feeding and warming brood, attending the queen, storing food.' },
  dig: { name: 'Dig', icon: 'task-dig', what: 'Excavating chambers and tunnels and hauling the soil out.' },
  defend: { name: 'Defend', icon: 'task-guard', what: 'Guarding the entrances and patrolling the nest edge.' },
};

const same = (a: Shares, b: Shares): boolean => GROUP_ORDER.every((g) => a[g] === b[g]);

export interface WorkforceProps {
  d: UiDirectives;
  setDirectives: (patch: Record<string, unknown>) => void;
}

export function WorkforceSection({ d, setDirectives }: WorkforceProps) {
  const [locked, setLocked] = useState<Flags>({});
  const source = quantise(d.shares);
  const bounds = boundsFor(d.need, d.workers);
  const [shown, setShares] = useCommit<Shares>(source, (s) => setDirectives({ allocation: s }), same);
  const auto = d.allocationMode === 'auto';
  const actualTotal = GROUP_ORDER.reduce((a, g) => a + d.actual[g], 0);
  const onSlide = (g: UiGroupId, v: number) => setShares(moveShare(shown, g, v, locked, bounds).shares);
  return (
    <section class="fd-sec" aria-labelledby="fd-sec-workforce" data-testid="dir-workforce">
      <h3 id="fd-sec-workforce" class="fd-sec-h">Workforce</h3>
      <p class="fd-help">How workers are shared between jobs. The ants still choose for themselves; these orders shift how many go where.</p>
      {d.workers < 4 && <p class="fd-note" data-testid="dir-few">Too few workers for priorities to matter.</p>}
      <Toggle
        checked={auto} label={<>Auto<span class="ui-sr-only"> workforce</span></>} onChange={(on) => { if (on) setDirectives({ allocation: 'auto' }); else setDirectives({ allocation: source }); }}
      />
      <p class="fd-help">The colony sets its targets from need. Moving any slider turns Auto off.</p>
      <div class="fd-shares" role="group" aria-label="Workforce shares">
        {GROUP_ORDER.map((g) => {
          const info = GROUPS[g];
          const actualPct = actualTotal > 0 ? (d.actual[g] / actualTotal) * 100 : 0;
          const floor = bounds[g]?.min ?? 0;
          return (
            <div key={g} class="fd-share" data-group={g}>
              <div class="fd-share-head">
                <Icon name={info.icon} size={18} decorative />
                <span class="fd-share-name">{info.name}</span>
                <span class="fd-share-count" data-testid={`dir-count-${g}`} title={`${d.actual[g]} working now, target ${d.target[g]}, need ${Math.round(d.need[g] * 10) / 10}`}>{d.actual[g]} ants</span>
                <IconButton
                  icon="lock" label={locked[g] ? `Unlock ${info.name}` : `Lock ${info.name}`} pressed={!!locked[g]}
                  onClick={() => setLocked({ ...locked, [g]: !locked[g] })} class={locked[g] ? 'is-locked' : ''}
                />
              </div>
              <div class="fd-share-track" onKeyDownCapture={blockSyntheticVertical}>
                <Slider
                  min={0} max={100} step={5} value={shown[g]} onChange={(v) => onSlide(g, v)} format={(v) => `${v} %`}
                  aria-label={`${info.name} share`} disabled={!!locked[g]}
                />
                <span class="fd-share-actual" style={{ '--p': String(actualPct / 100) } as never} aria-hidden="true" title="Share working now" />
              </div>
              <p class="fd-help">{info.what}{floor > 0 ? ` At least ${floor} % while there is work to do.` : ''}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
