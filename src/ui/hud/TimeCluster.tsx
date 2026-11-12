// Time cluster (GDD 08 3.4, 5.1): season glyph and date, clock, sun or moon, weather and surface temperature, and the
// speed control (pause, 1x, 2x, 4x, 8x, next event). The box is 304 x 56 dp at the top left.
import { useRef } from 'preact/hooks';
import type { UiSpeed, UiTime } from '../api';
import { currentBindings, hintLabel } from '../components';
import { groupNext } from '../components/logic/groupNav';
import { Tooltip } from '../components/Tooltip';
import { Icon } from '../icons';
import { facade } from '../store';
import { clock, dateLine, degrees, SEASON_ICON, WEATHER_ICON } from './format';
import { speedSlice, timeSlice } from './slices';
import { isSelected, speedRefusal, type SpeedButtonId } from './speedModel';

interface SpeedBtn {
  id: SpeedButtonId;
  icon: string;
  label: string;
  action: string;
}

const BUTTONS: readonly SpeedBtn[] = [
  { id: 'pause', icon: 'pause', label: 'Pause', action: 'pause-toggle' },
  { id: 1, icon: 'speed-1', label: 'Normal speed', action: 'speed-1' },
  { id: 2, icon: 'speed-2', label: 'Twice as fast', action: 'speed-2' },
  { id: 4, icon: 'speed-4', label: 'Four times as fast', action: 'speed-4' },
  { id: 8, icon: 'speed-8', label: 'Eight times as fast', action: 'speed-8' },
  { id: 'next', icon: 'next-event', label: 'Skip to the next event', action: 'skip-ahead' },
];

function SpeedControl({ speed }: { speed: UiSpeed }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const f = facade.value;
  const choose = (b: SpeedBtn['id']) => {
    if (b === 'pause') f?.togglePause();
    else if (b !== 'next') f?.setSpeed(b);
  };
  const keyOf = (action: string): string => {
    const l = hintLabel(currentBindings.value, action);
    return l ? ` (${l})` : '';
  };
  const selected = Math.max(0, BUTTONS.findIndex((b) => isSelected(b.id, speed)));
  return (
    <div class="fd-speed" role="group" aria-label="Time controls">
      {BUTTONS.map((b, i) => {
        const why = speedRefusal(b.id, speed);
        const sel = isSelected(b.id, speed);
        return (
          <Tooltip key={String(b.id)} text={why ? `${b.label}: ${why}` : `${b.label}${keyOf(b.action)}`} placement="bottom">
            <button
              type="button" ref={(el) => { refs.current[i] = el; }} class={`fd-speed-btn${sel ? ' is-selected' : ''}`}
              aria-label={b.label} aria-pressed={sel ? 'true' : 'false'} aria-disabled={why ? 'true' : undefined}
              tabIndex={i === selected ? 0 : -1} data-testid={`speed-${b.id}`}
              onClick={() => { if (!why) choose(b.id); }}
              onKeyDown={(e: KeyboardEvent) => {
                const n = groupNext(BUTTONS.length, i, e.key, { orientation: 'horizontal' });
                if (n === null) return;
                e.preventDefault();
                refs.current[n]?.focus();
              }}
            >
              <Icon name={why && b.id === 8 ? 'lock' : b.icon} size={18} decorative />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

function DateRow({ time }: { time: UiTime }) {
  const w = time.weather;
  return (
    <div class="fd-time-date" data-testid="hud-date">
      <Icon name={SEASON_ICON[time.season] ?? 'season-summer'} size={16} decorative />
      <span class="fd-date">{dateLine(time.season, time.dayOfSeason, time.year)}</span>
      {w && (
        <span class="fd-temp" data-testid="hud-temp">
          <Icon name={w.isDay ? 'sun' : 'moon'} size={16} label={w.isDay ? 'Day' : 'Night'} /> {degrees(w.tempC)}
        </span>
      )}
    </div>
  );
}

function ClockRow({ time, speed }: { time: UiTime; speed: UiSpeed | null }) {
  const w = time.weather;
  return (
    <div class="fd-time-clock" data-testid="hud-clock">
      <span class="fd-clock">{clock(time.hour, time.minute)}</span>
      {w && (
        <>
          <Icon name={WEATHER_ICON[w.state] ?? 'weather-clear'} size={16} decorative />
          <span class="fd-weather">{w.word}</span>
        </>
      )}
      {speed && <SpeedControl speed={speed} />}
    </div>
  );
}

export function TimeCluster() {
  const time = timeSlice.value, speed = speedSlice.value;
  if (!time) return null;
  return (
    <section class="fd-time fd-chip" aria-label="Time" data-hud="time">
      <DateRow time={time} />
      <ClockRow time={time} speed={speed} />
    </section>
  );
}
