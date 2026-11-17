// The inline-SVG icon set (GDD 08 2.5): line icons on a 24 dp grid, 1.5 dp stroke, round caps and joins,
// `currentColor`, no fills except status shapes. Each entry is the markup inside the <svg>. Silhouettes of
// organisms are drawn from above, as in a field sketch, never with faces. The set is original line work.

const line = (d: string) => `<path d="${d}"/>`;
const circle = (cx: number, cy: number, r: number) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const ellipse = (cx: number, cy: number, rx: number, ry: number) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
const rect = (x: number, y: number, w: number, h: number, r = 1.5) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const chevrons = (n: number) => {
  const x0 = 12 - ((n - 1) * 4 + 4) / 2;
  return Array.from({ length: n }, (_, i) => line(`M${x0 + i * 4} 6l4 6-4 6`)).join('');
};

interface AntShape {
  head: number; thorax: number; gaster: number; legs?: boolean; wings?: boolean; antennae?: boolean; node?: boolean;
}

/** Top view of an ant, scaled by body parts so the castes read apart. */
function ant(s: AntShape): string {
  const parts = [
    circle(12, 5.2, s.head),
    ellipse(12, 10.4, s.thorax * 0.7, s.thorax),
    ellipse(12, 18, s.gaster * 0.85, s.gaster * 1.15),
  ];
  if (s.node) parts.push(circle(12, 13.4, 0.7));
  if (s.legs !== false) {
    parts.push(line('M10.6 9.6L5.5 7M10.5 10.6L4.6 11M10.7 11.8L5.6 15.4M13.4 9.6L18.5 7M13.5 10.6L19.4 11M13.3 11.8L18.4 15.4'));
  }
  if (s.antennae !== false) parts.push(line('M11 3.4L8.4 1.2M13 3.4L15.6 1.2'));
  if (s.wings) parts.push(line('M10.8 8.6L4 3.4M13.2 8.6L20 3.4'));
  return parts.join('');
}

const status = {
  ok: circle(12, 12, 8),
  watch: `<circle cx="12" cy="12" r="8" fill="currentColor"/>`,
  warn: `<path d="M12 3.5L21.5 20h-19z" fill="currentColor" stroke="none"/><path d="M12 9.5v5M12 17.2v.2" stroke="var(--c-on-accent, #16130F)" stroke-width="1.8"/>`,
  bad: `<path d="M8.2 2.8h7.6l5.4 5.4v7.6l-5.4 5.4H8.2l-5.4-5.4V8.2z" fill="currentColor" stroke="none"/><path d="M12 7.5v5.6" stroke="var(--c-on-accent, #16130F)" stroke-width="1.8"/><path d="M12 16.2v.2" stroke="var(--c-on-accent, #16130F)" stroke-width="1.8"/>`,
};

const sun = (cx = 12, cy = 12, r = 3.6) =>
  circle(cx, cy, r) + line(`M${cx} ${cy - r - 3}v1.6M${cx} ${cy + r + 1.4}v1.6M${cx - r - 3} ${cy}h1.6M${cx + r + 1.4} ${cy}h1.6M${cx - r - 1.6} ${cy - r - 1.6}l1.1 1.1M${cx + r + 0.5} ${cy + r + 0.5}l1.1 1.1M${cx + r + 1.6} ${cy - r - 1.6}l-1.1 1.1M${cx - r - 0.5} ${cy + r + 0.5}l-1.1 1.1`);
const cloud = line('M7 17.5h10a3.6 3.6 0 0 0 .4-7.2A5 5 0 0 0 7.8 9.3 4.1 4.1 0 0 0 7 17.5z');
export const ICON_PATHS: Record<string, string> = {
  // --- time and weather
  pause: line('M8 5v14M16 5v14'),
  'speed-1': chevrons(1),
  'speed-2': chevrons(2),
  'speed-4': chevrons(3),
  'speed-8': chevrons(3) + line('M20.5 6v12'),
  'next-event': line('M5 6l7 6-7 6M13 6l7 6-7 6') + line('M20 5v14'),
  'season-spring': line('M12 21v-9') + line('M12 12C12 8 9 5.5 5 5.5 5 9.5 7.5 12 12 12z') + line('M12 14c0-3 2.4-5 6-5 0 3.2-2 5-6 5z'),
  'season-summer': sun(),
  'season-autumn': line('M12 21v-4M12 17C7 17 4.5 13 6 9c1.2 1.4 2.6 1.6 3.4 1.2C8.8 7.6 10 5 12 3c2 2 3.2 4.6 2.6 7.2.8.4 2.2.2 3.4-1.2 1.5 4-1 8-6 8z'),
  'season-winter': line('M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 6.8l2.5-2.3M9.5 19.5L12 17.2l2.5 2.3'),
  'weather-clear': sun(),
  'weather-overcast': cloud,
  'weather-rain': `<g transform="translate(0 -3)">${cloud}</g>` + line('M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5'),
  'weather-storm': `<g transform="translate(0 -3)">${cloud}</g>` + line('M12.5 13l-2.5 4h3.5l-2.2 4'),
  'weather-heat': sun(12, 9, 3) + line('M4 18c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 1.5 1 2.5.5'),
  'weather-frost': line('M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9'),
  sun: sun(),
  moon: line('M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z'),
  thermometer: line('M10 14.2V5a2 2 0 0 1 4 0v9.2a4 4 0 1 1-4 0z') + line('M12 8v8'),
  droplet: line('M12 3.5C8 8.5 6 11.5 6 14.5a6 6 0 0 0 12 0c0-3-2-6-6-11z'),
  // --- ants and brood
  'ant-worker': ant({ head: 2, thorax: 2.6, gaster: 3.2 }),
  'ant-minor': ant({ head: 1.5, thorax: 2, gaster: 2.5 }),
  'ant-media': ant({ head: 2.2, thorax: 2.8, gaster: 3.4 }),
  'ant-major': ant({ head: 3, thorax: 3, gaster: 3.4, antennae: true }),
  'ant-queen': ant({ head: 2, thorax: 3, gaster: 3.8, node: true }) + line('M9 1.5h6l-1 1.5h-4z'),
  'ant-gyne': ant({ head: 2, thorax: 3, gaster: 3.4, wings: true }),
  'ant-male': ant({ head: 1.4, thorax: 2.6, gaster: 2.4, wings: true, legs: false }),
  egg: ellipse(12, 12, 4.5, 6),
  larva: line('M7 8c2-2.5 5-2.5 7 0s5 2.5 4.5 6c-.6 3.8-4 5-7.5 4.2C6.5 17.5 4.5 14.5 5.5 11') + line('M9 9.5v.1'),
  pupa: ellipse(12, 12, 4, 7.5) + line('M8.2 9h7.6M8 13h8M8.8 17h6.4'),
  'nutrient-c': circle(12, 12, 8) + line('M14.5 9.2a3.8 3.8 0 1 0 0 5.6'),
  'nutrient-p': circle(12, 12, 8) + line('M10 17V7.5h2.7a2.6 2.6 0 0 1 0 5.2H10'),
  crop: ellipse(12, 12, 5.5, 7) + line('M8 11c2 1.5 6 1.5 8 0'),
  carry: ant({ head: 1.8, thorax: 2.4, gaster: 2.8, antennae: false }) + circle(12, 1.8, 1.2),
  health: line('M12 20.5S4 15.5 4 9.5a4.2 4.2 0 0 1 8-1.8 4.2 4.2 0 0 1 8 1.8c0 6-8 11-8 11z'),
  reserves: rect(7, 3.5, 10, 17, 2) + line('M7 12h10'),
  acid: line('M12 3.5C8.5 8 7 10.5 7 13.5a5 5 0 0 0 10 0c0-3-1.5-5.5-5-10z') + line('M10 14.5h4'),
  // --- tasks
  'task-idle': circle(12, 12, 8) + line('M9 12h.1M12 12h.1M15 12h.1'),
  'task-rest': line('M5 17h14M6 17V9M18 17v-3M6 13h12') + line('M9 6.5h2.5L9 9.5h2.5'),
  'task-nurse': ellipse(12, 14, 4.5, 6) + line('M5 5l2.5 2.5M19 5l-2.5 2.5M12 2.5v2.5'),
  'task-queen-care': line('M7 7.5l3 3 2-4 2 4 3-3v7H7z') + line('M7 18.5h10'),
  'task-scout': circle(11, 11, 6) + line('M15.5 15.5L20 20'),
  'task-forage': line('M4 18c4-1 6-5 8-9M12 9c1.5-3 4-4.5 8-5-.5 4-2 6.5-5 8') + line('M12 9l3 3'),
  'task-tend': circle(12, 14, 3.8) + line('M9 12.5L6 9M15 12.5L18 9M12 10.2V6.5') + circle(12, 4.5, 1.2),
  'task-store': rect(4, 8, 16, 11, 2) + line('M4 12h16M10 15.5h4M7 8V5.5h10V8'),
  'task-dig': line('M4 20l8-8M10.5 4.5l9 9M9 7l8 8') + line('M14 3l7 7'),
  'task-haul': circle(8, 16, 3) + line('M11 16h8M16 13l3 3-3 3'),
  'task-guard': line('M12 3l7.5 3v5.5c0 4.5-3.2 7.8-7.5 9.5-4.3-1.7-7.5-5-7.5-9.5V6z'),
  'task-patrol': line('M4 12a8 8 0 0 1 13.5-5.8M20 12a8 8 0 0 1-13.5 5.8') + line('M17.5 3v3.5H14M6.5 21v-3.5H10'),
  'task-fight': line('M6 6l5 5M18 6l-5 5M6 18l5-5M18 18l-5-5') + circle(12, 12, 1.5),
  'task-flee': line('M4 12h12M11 6l6 6-6 6') + line('M20 5v14'),
  'task-garden': line('M12 21v-8') + line('M12 13c-4 0-6.5-2.5-6.5-6.5C9.5 6.5 12 9 12 13z') + line('M12 15c0-3 2-5.5 6-5.5 0 3.5-2 5.5-6 5.5z'),
  'task-cut': circle(7, 17, 2.5) + circle(17, 17, 2.5) + line('M8.7 15.2L17 4M15.3 15.2L7 4'),
  'task-mill': circle(12, 12, 7.5) + circle(12, 12, 2.2) + line('M12 4.5v5.3M12 14.2v5.3M4.5 12h5.3M14.2 12h5.3'),
  // --- markers
  'marker-dig': line('M4 20l8-8M10.5 4.5l9 9M9 7l8 8M14 3l7 7') + line('M3 21h6'),
  'marker-forage': circle(12, 12, 8) + line('M12 7.5c3 1.6 3 7.4 0 9-3-1.6-3-7.4 0-9zM12 10v6'), // a ring with a seed
  'marker-avoid': circle(12, 12, 8) + line('M6.4 6.4l11.2 11.2'),
  'marker-rally': line('M7 21V4M7 5h11l-2.5 3.5L18 12H7'),
  'marker-entrance': line('M4 20h16M7 20v-6a5 5 0 0 1 10 0v6') + line('M12 9V3.5M9.5 6L12 3.5 14.5 6'),
  'marker-move-brood': ellipse(9, 14, 3.5, 4.8) + line('M15 8h6M18.5 5.5L21 8l-2.5 2.5'),
  'marker-move-queen': line('M5 9l3 3 2.5-4.5L13 12l3-3v6H5z') + line('M15 19h6M18.5 16.5L21 19l-2.5 2.5'),
  // --- chambers
  'chamber-founding': line('M4 19c0-7 3-13 8-13s8 6 8 13z') + circle(12, 14, 1.5),
  'chamber-royal': line('M3.5 18c0-5 3.5-9 8.5-9s8.5 4 8.5 9z') + line('M8 6.5l2 2 2-3 2 3 2-2'),
  'chamber-nursery': ellipse(12, 13, 8.5, 6) + circle(8.5, 13, 1.5) + circle(12, 12, 1.5) + circle(15.5, 13, 1.5),
  'chamber-food': ellipse(12, 13, 8.5, 6) + line('M8 11.5c2 2.5 6 2.5 8 0'),
  'chamber-granary': ellipse(12, 13, 8.5, 6) + line('M8.5 12.5h.1M12 11.5h.1M15.5 12.5h.1M10 15h.1M14 15h.1'),
  'chamber-fungus': ellipse(12, 13, 8.5, 6) + line('M8 14.5c0-3 2-4.5 4-4.5s4 1.5 4 4.5z'),
  'chamber-midden': ellipse(12, 13, 8.5, 6) + line('M8 15.5l2-2.5 2 2 2-3 2 3.5'),
  'chamber-rest': ellipse(12, 13, 8.5, 6) + line('M9 12h6M9 15h4'),
  'chamber-general': ellipse(12, 13, 8.5, 6),
  // --- overlays and views
  'overlay-scent': line('M4 18c3-6 7-10 16-12M4 12c3-3 6-5 10-6M8 20c4-2 8-5 12-9'),
  'overlay-temperature': line('M10 14.2V5a2 2 0 0 1 4 0v9.2a4 4 0 1 1-4 0z') + line('M17.5 6h3M17.5 10h3'),
  'overlay-moisture': line('M12 3.5C9 7.5 7.5 10 7.5 12.5a4.5 4.5 0 0 0 9 0c0-2.5-1.5-5-4.5-9z') + line('M4 20c2-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 2.5 1 3 .5'),
  'overlay-threats': line('M12 3.5L21 19.5H3z') + line('M12 10v4M12 16.8v.2'),
  'overlay-dig-plans': line('M4 20V9h16v11') + line('M4 9l4-4h8l4 4') + line('M9 20v-5h6v5'),
  cutaway: rect(4, 4, 16, 16, 1.5) + line('M4 12h16M12 12v8'),
  xray: rect(4, 4, 16, 16, 1.5) + line('M4 4l16 16M20 4L4 20'),
  why: circle(12, 12, 8.5) + line('M9.5 9.5a2.6 2.6 0 1 1 3.7 2.4c-.8.4-1.2 1-1.2 1.8') + line('M12 16.8v.2'),
  'jump-to': circle(12, 12, 3) + line('M12 3v4M12 17v4M3 12h4M17 12h4'),
  possess: ant({ head: 1.8, thorax: 2.3, gaster: 2.8 }) + circle(12, 12, 10.5),
  release: line('M5 12h13M13 6l6 6-6 6') + line('M4 5v14'),
  follow: circle(7, 12, 2.5) + circle(17, 12, 2.5) + line('M9.5 12h5M13 10l2 2-2 2'),
  journal: line('M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6z') + line('M6 3.5v17M9.5 8h6M9.5 11.5h6M9.5 15h4'),
  codex: line('M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5z') + line('M12 6.5v13'),
  lineage: circle(6, 12, 2.2) + circle(18, 6, 2.2) + circle(18, 18, 2.2) + line('M8.2 11.2L15.8 6.8M8.2 12.8l7.6 4.4'),
  settings: circle(12, 12, 3) + line('M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8'),
  save: line('M5 4h11l3 3v13H5z') + line('M8 4v5h7V4M8 20v-6h8v6'),
  load: line('M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z') + line('M12 10v6M9.5 13.5L12 16l2.5-2.5'),
  export: line('M12 15V4M8 8l4-4 4 4') + line('M5 14v5h14v-5'),
  import: line('M12 4v11M8 11l4 4 4-4') + line('M5 14v5h14v-5'),
  copy: rect(8, 8, 12, 12, 1.5) + line('M16 8V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8.5A1.5 1.5 0 0 0 6 16h2'),
  camera: line('M4 8h3l1.5-2.5h7L17 8h3v11H4z') + circle(12, 13, 3.5),
  photo: rect(3.5, 5, 17, 14, 1.5) + circle(9, 10, 1.5) + line('M3.5 17l5-4.5 4 3.5 3-2.5 5 4'),
  'trend-up': line('M6 17L18 7M10 7h8v8'),
  'trend-up-strong': line('M5 18L18 6M9 6h9v9') + line('M5 12l6-6'),
  'trend-down': line('M6 7l12 10M10 17h8V9'),
  'trend-down-strong': line('M5 6l13 12M9 18h9V9') + line('M5 12l6 6'),
  'trend-flat': line('M5 12h13M14 8l4 4-4 4'),
  'status-ok': status.ok,
  'status-watch': status.watch,
  'status-warn': status.warn,
  'status-bad': status.bad,
  // --- interface
  close: line('M6 6l12 12M18 6L6 18'),
  back: line('M19 12H6M11 6l-6 6 6 6'),
  search: circle(11, 11, 6) + line('M15.5 15.5L20 20'),
  pin: line('M9 4h6l-1 6 3 3H7l3-3z') + line('M12 13v7'),
  lock: rect(5.5, 11, 13, 9, 1.5) + line('M8.5 11V8a3.5 3.5 0 0 1 7 0v3'),
  undo: line('M9 7L4.5 11.5 9 16') + line('M5 11.5h9a5 5 0 0 1 0 10h-3'),
  trash: line('M4.5 7h15M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5'),
  'sound-on': line('M4.5 9.5h3L12 5.5v13l-4.5-4h-3z') + line('M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11'),
  'sound-off': line('M4.5 9.5h3L12 5.5v13l-4.5-4h-3z') + line('M16 9.5l4 5M20 9.5l-4 5'),
  gamepad: line('M7.5 8h9a4.5 4.5 0 0 1 4.3 5.8l-.8 3a2 2 0 0 1-3.3.8L14 15.5h-4l-2.7 2.1a2 2 0 0 1-3.3-.8l-.8-3A4.5 4.5 0 0 1 7.5 8z') + line('M8 10.5v3M6.5 12h3M15.5 11.5h.1M17.5 13h.1'),
  keyboard: rect(3, 6.5, 18, 11, 1.5) + line('M6.5 10h.1M10 10h.1M13.5 10h.1M17 10h.1M7 14h10'),
  spider: circle(12, 11, 3) + line('M12 14v3.5M9.5 9.5L5 6M14.5 9.5L19 6M9 11.5H3.5M15 11.5h5.5M9.5 13.5L5.5 18M14.5 13.5l4 4.5'),
  footfall: line('M8.5 4c2 0 3 2 3 5s-1 4.5-3 4.5-2.5-2-2.5-4S6.5 4 8.5 4z') + line('M15.5 10c2 0 3 2 3 4.5s-1 4.5-3 4.5-2.5-2-2.5-4 .5-5 2.5-5z'),
  wheel: circle(12, 12, 8) + circle(12, 12, 2) + line('M12 4v6M12 14v6M4 12h6M14 12h6'),
  broom: line('M15 3l-5 9M7 12h6l3 8H4z') + line('M7.5 15.5L7 20M10.5 15.5L10 20'),
  mower: line('M4 14h13l2 3H4zM7 14V8h5') + circle(7, 18.5, 1.8) + circle(16.5, 18.5, 1.8) + line('M17 14l3-8'),
  'water-can': line('M5 10h10v9H5z') + line('M15 12l5-4M15 15h4') + line('M5 10c0-3 10-3 10 0'),
  // --- sound-cue indicator pips (GDD 08 §12); tremor uses footfall, rain onset weather-rain
  'cue-alarm': circle(12, 13, 2.6) + line('M12 10.4V8M9.6 11.2L8 9.4M14.4 11.2L16 9.4') + line('M6.5 6.5a8 8 0 0 0 0 13M17.5 6.5a8 8 0 0 1 0 13'),
  'cue-drum': line('M4 12h2l2-5 3 10 3-10 3 10 2-5h1') + line('M4 20h16'),
  'cue-crackle': line('M3.5 7.5h17M3.5 7.5V20h17V7.5') + line('M9 7.5l2 4-2.5 3 2.5 5.5M15 7.5l-1.5 3.5 2 2.5'),
  // --- helpers used by components
  'chevron-down': line('M6 9l6 6 6-6'),
  'chevron-up': line('M6 15l6-6 6 6'),
  'chevron-left': line('M15 6l-6 6 6 6'),
  'chevron-right': line('M9 6l6 6-6 6'),
  check: line('M5 12.5l4.5 4.5L19 7'),
  plus: line('M12 5v14M5 12h14'),
  minus: line('M5 12h14'),
  play: line('M8 5.5l11 6.5-11 6.5z'),
  dice: rect(4, 4, 16, 16, 3) + line('M8.5 8.5h.1M15.5 8.5h.1M12 12h.1M8.5 15.5h.1M15.5 15.5h.1'),
  info: circle(12, 12, 8.5) + line('M12 11v5M12 7.8v.2'),
  fullscreen: line('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'),
  reset: line('M5 12a7 7 0 1 0 2.2-5.1') + line('M5 4.5v4h4'),
  leaf: line('M5 19C5 10 10 5 19 5c0 9-5 14-14 14z') + line('M5 19l8-8'),
  ellipsis: line('M6 12h.1M12 12h.1M18 12h.1'),
  mouse: rect(7, 3.5, 10, 17, 5) + line('M12 3.5v6'),
};

/** Ids the chapter requires (GDD 08 2.5), used by the unit test to prove the set is complete. */
export const REQUIRED_ICON_IDS: readonly string[] = [
  'pause', 'speed-1', 'speed-2', 'speed-4', 'speed-8', 'next-event', 'season-spring', 'season-summer', 'season-autumn', 'season-winter',
  'weather-clear', 'weather-overcast', 'weather-rain', 'weather-storm', 'weather-heat', 'weather-frost', 'sun', 'moon', 'thermometer', 'droplet',
  'ant-worker', 'ant-minor', 'ant-media', 'ant-major', 'ant-queen', 'ant-gyne', 'ant-male', 'egg', 'larva', 'pupa', 'nutrient-c', 'nutrient-p',
  'crop', 'carry', 'health', 'reserves', 'acid', 'task-idle', 'task-rest', 'task-nurse', 'task-queen-care', 'task-scout', 'task-forage',
  'task-tend', 'task-store', 'task-dig', 'task-haul', 'task-guard', 'task-patrol', 'task-fight', 'task-flee', 'task-garden', 'task-cut',
  'task-mill', 'marker-dig', 'marker-forage', 'marker-avoid', 'marker-rally', 'marker-entrance', 'marker-move-brood', 'marker-move-queen',
  'chamber-founding', 'chamber-royal', 'chamber-nursery', 'chamber-food', 'chamber-granary', 'chamber-fungus', 'chamber-midden',
  'chamber-rest', 'chamber-general', 'overlay-scent', 'overlay-temperature', 'overlay-moisture', 'overlay-threats', 'overlay-dig-plans',
  'cutaway', 'xray', 'why', 'jump-to', 'possess', 'release', 'follow', 'journal', 'codex', 'lineage', 'settings', 'save', 'load', 'export',
  'import', 'copy', 'camera', 'photo', 'trend-up', 'trend-up-strong', 'trend-down', 'trend-down-strong', 'trend-flat', 'status-ok',
  'status-watch', 'status-warn', 'status-bad', 'close', 'back', 'search', 'pin', 'lock', 'undo', 'trash', 'sound-on', 'sound-off', 'gamepad',
  'keyboard', 'spider', 'footfall', 'wheel', 'broom', 'mower', 'water-can',
];
