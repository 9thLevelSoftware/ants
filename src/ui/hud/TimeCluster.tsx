// Time cluster (GDD 08 3.4, 5.1): season glyph and date, clock, sun or moon, weather and surface temperature, and the
// speed control (pause, 1x, 2x, 4x, 8x, next event). The box is 304 x 56 dp at the top left. The buttons are for the
// pointer: the keyboard operates the same actions with their keys and the HUD is not in the tab order (focusPolicy.ts).
import { useRef } from 'preact/hooks';
import type { UiSpeed, UiTime } from '../api';
import { currentBindings, hintLabel } from '../components';
import { Tooltip } from '../components/Tooltip';
import { Icon } from '../icons';
import { facade } from '../store';
import { clock, dateLine, degrees, effectiveRate, SEASON_ICON, WEATHER_ICON } from './format';
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

/** How long the speed control's flash stays on the selected button (matches the CSS animation). */
const FLASH_MS = 900;

function SpeedControl({ speed }: { speed: UiSpeed }) {
  const f = facade.value;
  // one flash per automatic slow-down: remembered for FLASH_MS so the clock's re-renders do not cut it short
  const count = speed.autoSlowFlash ?? 0;
  const seen = useRef({ count, until: 0 });
  if (seen.current.count !== count) seen.current = { count, until: Date.now() + FLASH_MS };
  const flash = Date.now() < seen.current.until ? count : 0;
  const choose = (b: SpeedBtn['id']) => {
    if (b === 'pause') f?.togglePause();
    else if (b !== 'next') f?.setSpeed(b);
  };
  const keyOf = (action: string): string => {
    const l = hintLabel(currentBindings.value, action);
    return l ? ` (${l})` : '';
  };
  return (
    <div class="fd-speed" role="group" aria-label="Time controls">
      {BUTTONS.map((b) => {
        const why = speedRefusal(b.id, speed);
        const sel = isSelected(b.id, speed);
        return (
          <Tooltip key={String(b.id)} text={why ? `${b.label}: ${why}` : `${b.label}${keyOf(b.action)}`} placement="bottom">
            <button
              // the selected button lights up once for every automatic slow-down (GDD 06 4.5): the key restarts the animation
              key={sel && flash > 0 ? `flash-${flash}` : undefined}
              type="button" class={`fd-speed-btn${sel ? ' is-selected' : ''}${sel && flash > 0 ? ' is-flash' : ''}`}
              aria-label={b.label} aria-pressed={sel ? 'true' : 'false'} aria-disabled={why ? 'true' : undefined}
              tabIndex={-1} data-testid={`speed-${b.id}`}
              onClick={() => { if (!why) choose(b.id); }}
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
  // the sim cannot keep up with the speed asked for: say what it really manages (it replaces the weather word, which
  // the date row's temperature and the sun glyph still back up)
  const lag = speed && speed.lagging && !speed.paused ? speed : null;
  return (
    <div class="fd-time-clock" data-testid="hud-clock">
      <span class="fd-clock">{clock(time.hour, time.minute)}</span>
      {lag && (
        <span class="fd-lag" data-testid="hud-lag" title={`The simulation cannot keep up with ${lag.requested}x: running at ${effectiveRate(lag.effective)}`}>
          <Icon name="status-warn" size={16} decorative /> <span class="ui-sr-only">Running at </span>{effectiveRate(lag.effective)}
        </span>
      )}
      {w && !lag && (
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
