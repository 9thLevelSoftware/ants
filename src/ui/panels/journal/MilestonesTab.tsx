// Journal > Milestones (GDD 08 7.2): a horizontal timeline with one tick per game day, season bands shaded by season (with the
// season glyph and name, never colour alone), and a pin per milestone with its title. A pin opens a detail card with the
// date, the line the sim wrote and, when one was captured, the thumbnail.
import { useMemo, useState } from 'preact/hooks';
import { Icon } from '../../icons';
import { SEASON_ICON } from '../../hud/format';
import type { UiJournal } from '../../api';
import { layoutPins, milestonePins, timelineAxis } from './timeline';

// Everything on the timeline is laid out in rem, the unit the text scales with (UI scale 150 % makes the labels wider and
// taller; positions in px would then collide with them). Heights and offsets below are in rem too.
const MIN_REM_PER_DAY = 2.1;
const MAX_REM_PER_DAY = 6.9;
const FIT_WIDTH = 50;
/** One lane of pin labels: a pin is 1.5rem tall. */
const LANE_H = 1.75;
/** Width one character of a pin title needs (text-small, with room to spare), and the dot + gap before it. */
const CHAR_REM = 0.46;
const PIN_PAD_REM = 1.5;
/** Space above the axis for the lowest lane, below it for the day labels, and the season strip's height. */
const ABOVE_AXIS = 1.9;
const DAY_LABELS = 2;
const SEASON_STRIP = 1.75;
const BOTTOM_PAD = 0.5;
const LEFT_PAD = 2.1;

export function MilestonesTab({ j }: { j: UiJournal }) {
  const pins = useMemo(() => milestonePins(j), [j]);
  const axis = useMemo(() => timelineAxis(j), [j]);
  const [sel, setSel] = useState<number>(-1);
  // a short game spreads over the page; a long one scrolls sideways
  const remPerDay = Math.max(MIN_REM_PER_DAY, Math.min(MAX_REM_PER_DAY, Math.floor((FIT_WIDTH / Math.max(1, axis.d1 - axis.d0)) * 10) / 10));
  const laid = useMemo(() => layoutPins(pins, remPerDay, (p) => p.title.length * CHAR_REM + PIN_PAD_REM), [pins, remPerDay]);
  const lanes = Math.max(1, ...laid.map((p) => p.lane + 1));
  // the last pin's title may run past the last day: the canvas is as wide as the furthest label end
  const labelEnd = Math.max(0, ...laid.map((p) => (p.day - axis.d0) * remPerDay + LEFT_PAD + p.title.length * CHAR_REM + PIN_PAD_REM));
  const width = Math.max(43.75, (axis.d1 - axis.d0) * remPerDay + 2 * LEFT_PAD, labelEnd + 1);
  const x = (d: number): number => (d - axis.d0) * remPerDay + LEFT_PAD;
  const open = laid.find((p) => p.id === sel) ?? laid[laid.length - 1] ?? null;
  const axisY = lanes * LANE_H + ABOVE_AXIS;
  const rem = (n: number): string => `${n.toFixed(2)}rem`;
  return (
    <div class="pn-milestones" data-testid="journal-milestones">
      {laid.length === 0 ? (
        <p class="pn-empty" data-testid="milestones-none">No milestone has been reached yet. Each one is recorded here when it happens.</p>
      ) : (
        <>
          <div class="pn-timeline-scroll" tabIndex={0} role="region" aria-label="Milestone timeline, scrolls sideways" data-testid="timeline">
            <div class="pn-timeline" data-tab-order="logical" style={{ width: rem(width), height: rem(axisY + DAY_LABELS + SEASON_STRIP + BOTTOM_PAD) }}>
              {axis.bands.map((b, i) => (
                <div key={i} class={`pn-tl-band is-${b.season % 2}`} style={{ left: rem(x(b.from)), width: rem((b.to - b.from) * remPerDay), top: rem(axisY + DAY_LABELS) }}>
                  <Icon name={SEASON_ICON[b.label.toLowerCase()] ?? 'sun'} size={16} decorative /> <span>{b.label}</span>
                </div>
              ))}
              <div class="pn-tl-axis" style={{ top: rem(axisY), width: rem(width) }} />
              {axis.days.map((d) => (
                <div key={d.day} class={`pn-tl-tick${d.major ? ' is-major' : ''}`} style={{ left: rem(x(d.day)), top: rem(axisY) }}>
                  {d.major && <span class="pn-tl-day">{d.label}</span>}
                </div>
              ))}
              {laid.map((p) => (
                <button
                  key={p.id} type="button" class={`pn-pin${open && open.id === p.id ? ' is-open' : ''}`} data-testid="milestone-pin" data-ms={p.key}
                  style={{ left: rem(x(p.day)), top: rem(axisY - 1.6 - p.lane * LANE_H) }}
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
