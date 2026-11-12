// Number and text formats of the HUD (GDD 08 2.2): loads with one decimal below 10 and integers above, temperatures
// as whole degrees with the unit, times as 24 h, dates as "Spring · Day 3 · Year 1".

/** Loads and other small quantities: 7.4, 126. */
export function loads(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 10) / 10;
  return Math.abs(r) < 10 ? r.toFixed(1) : String(Math.round(v));
}

export function pct(v01: number): string {
  return `${Math.round(Math.max(0, Math.min(1, v01)) * 100)} %`;
}

export function degrees(c: number): string {
  return `${Math.round(c)} °C`;
}

export function clock(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function dateLine(season: string, day: number, year: number): string {
  return `${season.charAt(0).toUpperCase()}${season.slice(1)} · Day ${day} · Year ${year}`;
}

/** The speed the simulation really achieves, "5.6x" (GDD 01 section 8: "8x (running at 5.6x)"). */
export function effectiveRate(effective: number): string {
  return `${Math.round(effective * 10) / 10}x`;
}

/** "about 0.5 game days": days of stock as the alerts word them. */
export function gameDays(d: number): string {
  if (!Number.isFinite(d)) return 'plenty';
  if (d >= 10) return `${Math.round(d)} game days`;
  return `${(Math.round(d * 10) / 10).toFixed(1)} game days`;
}

const CASTE_NOUN: Record<string, [string, string]> = {
  worker: ['worker', 'workers'], minor: ['minor', 'minors'], media: ['media worker', 'media workers'], major: ['major', 'majors'],
  queen: ['queen', 'queens'], gyne: ['gyne', 'gynes'], male: ['male', 'males'],
};

/** "1 worker", "40 workers": a caste count with its noun in the right number (unknown castes get an "s"). */
export function casteCount(n: number, caste: string): string {
  const [one, many] = CASTE_NOUN[caste] ?? [caste, `${caste}s`];
  return `${n} ${n === 1 ? one : many}`;
}

/** Sentence case: first letter up. */
export function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** The sun / moon, weather and season glyph names of the icon set. */
export const SEASON_ICON: Record<string, string> = { spring: 'season-spring', summer: 'season-summer', autumn: 'season-autumn', winter: 'season-winter' };
export const WEATHER_ICON: Record<string, string> = {
  clear: 'weather-clear', overcast: 'weather-overcast', rain: 'weather-rain', storm: 'weather-storm', heat: 'weather-heat', frost: 'weather-frost',
};
export const CASTE_ICON: Record<string, string> = {
  queen: 'ant-queen', gyne: 'ant-gyne', male: 'ant-male', worker: 'ant-worker', minor: 'ant-minor', media: 'ant-media', major: 'ant-major',
};
export const TASK_ICON: Record<string, string> = {
  idle: 'task-idle', rest: 'task-rest', nurse: 'task-nurse', 'queen-care': 'task-queen-care', scout: 'task-scout', forage: 'task-forage', tend: 'task-tend',
  store: 'task-store', dig: 'task-dig', haul: 'task-haul', guard: 'task-guard', patrol: 'task-patrol', fight: 'task-fight', flee: 'task-flee',
  garden: 'task-garden', cut: 'task-cut', mill: 'task-mill',
};
