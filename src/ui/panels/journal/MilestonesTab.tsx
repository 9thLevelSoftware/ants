// Journal > Milestones (GDD 08 7.2): a horizontal timeline with one tick per game day, season bands shaded by season (with the
// season glyph and name, never colour alone), and a pin per milestone with its title. A pin opens a detail card with the
// date, the line the sim wrote and, when one was captured, the thumbnail.
import { useMemo, useState } from 'preact/hooks';
import { Icon } from '../../icons';
import { SEASON_ICON } from '../../hud/format';
import type { UiJournal } from '../../api';
import { layoutPins, milestonePins, timelineAxis } from './timeline';

const MIN_PX_PER_DAY = 34;
const MAX_PX_PER_DAY = 110;
const FIT_WIDTH = 800;
const LANE_H = 26;
const CHAR_PX = 6.6;

export function MilestonesTab({ j }: { j: UiJournal }) {
  const pins = useMemo(() => milestonePins(j), [j]);
  const axis = useMemo(() => timelineAxis(j), [j]);
  const [sel, setSel] = useState<number>(-1);
  // a short game spreads over the page; a long one scrolls sideways
  const PX_PER_DAY = Math.max(MIN_PX_PER_DAY, Math.min(MAX_PX_PER_DAY, Math.floor(FIT_WIDTH / Math.max(1, axis.d1 - axis.d0))));
  const laid = useMemo(() => layoutPins(pins, PX_PER_DAY, (p) => p.title.length * CHAR_PX + 22), [pins, PX_PER_DAY]);
  const lanes = Math.max(1, ...laid.map((p) => p.lane + 1));
  const width = Math.max(700, (axis.d1 - axis.d0) * PX_PER_DAY + 60);
  const x = (d: number): number => (d - axis.d0) * PX_PER_DAY + 34;
  const open = laid.find((p) => p.id === sel) ?? laid[laid.length - 1] ?? null;
  const axisY = lanes * LANE_H + 34;
  return (
    <div class="pn-milestones" data-testid="journal-milestones">
      {laid.length === 0 ? (
        <p class="pn-empty" data-testid="milestones-none">No milestone has been reached yet. Each one is recorded here when it happens.</p>
      ) : (
        <>
          <div class="pn-timeline-scroll" tabIndex={0} role="region" aria-label="Milestone timeline, scrolls sideways" data-testid="timeline">
            <div class="pn-timeline" style={{ width: `${width}px`, height: `${axisY + 56}px` }}>
              {axis.bands.map((b, i) => (
                <div key={i} class={`pn-tl-band is-${b.season % 2}`} style={{ left: `${x(b.from)}px`, width: `${(b.to - b.from) * PX_PER_DAY}px`, top: `${axisY + 30}px` }}>
                  <Icon name={SEASON_ICON[b.label.toLowerCase()] ?? 'sun'} size={16} decorative /> <span>{b.label}</span>
                </div>
              ))}
              <div class="pn-tl-axis" style={{ top: `${axisY}px`, width: `${width}px` }} />
              {axis.days.map((d) => (
                <div key={d.day} class={`pn-tl-tick${d.major ? ' is-major' : ''}`} style={{ left: `${x(d.day)}px`, top: `${axisY}px` }}>
                  {d.major && <span class="pn-tl-day">{d.label}</span>}
                </div>
              ))}
              {laid.map((p) => (
                <button
                  key={p.id} type="button" class={`pn-pin${open && open.id === p.id ? ' is-open' : ''}`} data-testid="milestone-pin" data-ms={p.key}
                  style={{ left: `${x(p.day)}px`, top: `${axisY - 22 - p.lane * LANE_H}px` }}
                  aria-label={`${p.title}, ${p.date}`} aria-pressed={open && open.id === p.id ? 'true' : 'false'} onClick={() => setSel(p.id)}
                >
                  <span class="pn-pin-dot" aria-hidden="true" /> <span class="pn-pin-title">{p.title}</span>
                </button>
              ))}
            </div>
          </div>
          {open && (
            <article class="pn-card" data-testid="milestone-card" aria-live="polite">
              {open.thumb && <img class="pn-thumb" src={open.thumb} alt={`Photograph taken at: ${open.title}`} width="256" height="144" />}
              <div>
                <p class="pn-muted pn-small">{open.date}</p>
                <h3 class="pn-h3">{open.title}</h3>
                <p>{open.text}</p>
              </div>
            </article>
          )}
        </>
      )}
    </div>
  );
}
