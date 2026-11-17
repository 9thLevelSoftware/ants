// Every action id of GDD 01 section 5 with its default bindings and contexts.
//
// Button actions are listed directly. Analogue axes (move, orbit, zoom, ...) are split into rebindable
// components named `<axis>.<component>`: up/down/left/right (keys or pad half-axes), stick (a whole pad stick),
// drag (mouse buttons whose drag feeds the axis), in/out (zoom). The input state recombines them.
//
// Decision (recorded in the F3a report): the GDD says `G` "overlaps all" for conflicts, but G actions are only
// live in P/O/C, and the default tables reuse G keys in Ph/TL/UI (H = hide-hud and ph-guides, Enter = alert-jump
// and ph-capture). We therefore treat G as overlapping P, O and C only (see contexts.ts).
//
// Decision: GDD 01 5.1 gives `scent-view` two pad defaults ("Dpad left (P), Dpad up (O)"), but 5.7 allows one
// gamepad slot per action. We keep Dpad left in every view (it is free in P, O and C).
import type { ActionDef, AxisDef, Binding, InputContext } from './types';
import { HOLD_THRESHOLD_MS, INTERACT_HOLD_MS, KEY_CV_YAW_DEG_S, KEY_ORBIT_PITCH_DEG_S, KEY_ORBIT_YAW_DEG_S, PAD, PAD_AXIS, SPECIAL_ALARM_HOLD_MS } from './defaults';

// --- tiny binding constructors (keep the tables readable) ---
const k = (code: string): Binding => ({ kind: 'key', code });
const ks = (code: string): Binding => ({ kind: 'key', code, shift: true });
const m = (button: number): Binding => ({ kind: 'mouse', button });
const mClick = (button: number): Binding => ({ kind: 'mouse', button, gesture: 'click' });
const mDbl = (button: number): Binding => ({ kind: 'mouse', button, gesture: 'dbl' });
const mHold = (button: number, holdMs: number): Binding => ({ kind: 'mouse', button, gesture: 'hold', holdMs });
const drag = (button: number): Binding => ({ kind: 'drag', button });
const wheel = (dir: 1 | -1, shift = false): Binding => (shift ? { kind: 'wheel', dir, shift } : { kind: 'wheel', dir });
const p = (button: number, mod?: number): Binding => (mod === undefined ? { kind: 'pad', button } : { kind: 'pad', button, mod });
const pTap = (button: number, holdMs: number): Binding => ({ kind: 'pad', button, gesture: 'tap', holdMs });
const pHold = (button: number, holdMs: number): Binding => ({ kind: 'pad', button, gesture: 'hold', holdMs });
const pAxis = (axis: number, dir: 1 | -1, mod?: number): Binding => (mod === undefined ? { kind: 'padAxis', axis, dir } : { kind: 'padAxis', axis, dir, mod });
const stick = (s: 'left' | 'right'): Binding => ({ kind: 'padStick', stick: s });

const PLAY: InputContext[] = ['P', 'O', 'C'];

type Def = Omit<ActionDef, 'tier'> & { tier?: 1 | 2 | 3 };
const def = (d: Def): ActionDef => ({ tier: 1, ...d });

/** Button actions (not axis components). Order = display order in the controls screen. */
export const BUTTON_ACTIONS: readonly ActionDef[] = [
  // 5.1 global
  def({ id: 'menu', label: 'Pause menu / back', contexts: ['G', 'Ph', 'TL', 'UI'], type: 'press', kbm: [k('Escape')], pad: pTap(PAD.START, 1000), locked: true, required: true }),
  def({ id: 'pause-toggle', label: 'Pause / resume', contexts: ['G'], type: 'press', kbm: [k('KeyP'), k('Pause')], pad: p(PAD.DUP, PAD.LB) }),
  def({ id: 'speed-1', label: 'Speed 1x', contexts: ['G'], type: 'press', kbm: [k('Digit1')], pad: null }),
  def({ id: 'speed-2', label: 'Speed 2x', contexts: ['G'], type: 'press', kbm: [k('Digit2')], pad: null }),
  def({ id: 'speed-4', label: 'Speed 4x', contexts: ['G'], type: 'press', kbm: [k('Digit3')], pad: null }),
  def({ id: 'speed-8', label: 'Speed 8x', contexts: ['G'], type: 'press', kbm: [k('Digit4')], pad: null }),
  def({ id: 'speed-up', label: 'Speed up', contexts: ['G'], type: 'press', kbm: [k('Equal')], pad: p(PAD.DRIGHT, PAD.LB) }),
  def({ id: 'speed-down', label: 'Speed down', contexts: ['G'], type: 'press', kbm: [k('Minus')], pad: p(PAD.DLEFT, PAD.LB) }),
  def({ id: 'hide-hud', label: 'Hide / show HUD', contexts: ['G'], type: 'toggle', kbm: [k('KeyH')], pad: p(PAD.DDOWN, PAD.LB) }),
  // Shift+H / RB+View: dismiss the teaching hint on screen (GDD 08 5.4). RB is a modifier, so View alone keeps its meaning.
  def({ id: 'dismiss-hint', label: 'Dismiss the hint on screen', contexts: ['G'], type: 'press', kbm: [ks('KeyH')], pad: p(PAD.VIEW, PAD.RB) }),
  def({ id: 'alert-focus', label: 'Focus the alert feed', contexts: ['G'], type: 'press', kbm: [k('Backquote')], pad: p(PAD.VIEW, PAD.LB) }),
  def({ id: 'quick-save', label: 'Quick save', contexts: ['G'], type: 'press', kbm: [k('F5')], pad: null }),
  def({ id: 'quick-load', label: 'Quick load', contexts: ['G'], type: 'press', kbm: [k('F9')], pad: null }),
  def({ id: 'colony-view', label: 'Colony view', contexts: PLAY, type: 'toggle', kbm: [k('KeyM')], pad: pHold(PAD.VIEW, 500) }),
  def({ id: 'scent-view', label: 'Scent overlay', contexts: PLAY, type: 'toggle', kbm: [k('KeyV')], pad: p(PAD.DLEFT), tier: 2 }),
  // the two stick clicks "together": LS with RS held (the slot) or RS with LS held (fixed), so either order works
  def({ id: 'photo-mode', label: 'Photo mode', contexts: ['P', 'O', 'C', 'Ph'], type: 'toggle', kbm: [k('F2')], pad: p(PAD.LS, PAD.RS), fixed: [p(PAD.RS, PAD.LS)], tier: 2 }),
  def({ id: 'overlay-cycle', label: 'Cycle overlays', contexts: PLAY, type: 'press', kbm: [k('KeyO')], pad: p(PAD.B, PAD.RB), tier: 2 }),
  def({ id: 'directives', label: 'Colony orders', contexts: ['G'], type: 'toggle', kbm: [k('KeyI')], pad: p(PAD.DUP, PAD.RB) }),
  def({ id: 'nest-overview', label: 'Nest overview', contexts: ['G'], type: 'toggle', kbm: [k('KeyU')], pad: p(PAD.DLEFT, PAD.RB) }),
  def({ id: 'codex', label: 'Codex', contexts: ['G'], type: 'toggle', kbm: [k('KeyK')], pad: p(PAD.Y, PAD.RB), tier: 2 }),
  def({ id: 'journal', label: 'Journal', contexts: ['G'], type: 'toggle', kbm: [k('KeyJ')], pad: p(PAD.X, PAD.RB), tier: 2 }),
  def({ id: 'why-view', label: 'Colony health', contexts: ['G'], type: 'toggle', kbm: [k('KeyY')], pad: p(PAD.DRIGHT, PAD.RB), tier: 2 }),
  def({ id: 'roster', label: 'Roster', contexts: ['G'], type: 'toggle', kbm: [k('KeyL')], pad: p(PAD.DDOWN, PAD.RB) }),
  def({ id: 'controls-reminder', label: 'Show controls', contexts: ['G'], type: 'press', kbm: [ks('Slash')], pad: pHold(PAD.START, 1000) }),
  def({ id: 'alert-jump', label: 'Go to newest alert', contexts: ['G'], type: 'press', kbm: [k('Enter')], pad: p(PAD.RB, PAD.LB), tier: 2 }),
  def({ id: 'skip-ahead', label: 'Skip to next event', contexts: ['O', 'C'], type: 'press', kbm: [k('KeyN')], pad: p(PAD.LS, PAD.LB), tier: 2 }),
  def({ id: 'pointer-lock-toggle', label: 'Mouse look: drag or captured', contexts: ['P', 'O', 'Ph'], type: 'toggle', kbm: [k('F8')], pad: null }),
  // RB and LB are tap gestures (they fire on release, and not when they served as the modifier of a combination)
  def({ id: 'possess-next', label: 'Next nearby ant', contexts: ['P', 'O'], type: 'press', kbm: [k('Tab')], pad: pTap(PAD.RB, HOLD_THRESHOLD_MS) }),
  def({ id: 'possess-prev', label: 'Previous nearby ant', contexts: ['P', 'O'], type: 'press', kbm: [ks('Tab')], pad: pTap(PAD.LB, HOLD_THRESHOLD_MS) }),
  def({ id: 'possess-last', label: 'Back to previous ant', contexts: ['P', 'O'], type: 'press', kbm: [k('Backspace')], pad: null }),
  def({ id: 'possess-forager', label: 'Possess a forager', contexts: PLAY, type: 'press', kbm: [k('Digit5')], pad: p(PAD.X, PAD.LB) }),
  def({ id: 'possess-digger', label: 'Possess a digger', contexts: PLAY, type: 'press', kbm: [k('Digit6')], pad: p(PAD.A, PAD.LB) }),
  def({ id: 'possess-nurse', label: 'Possess a nurse', contexts: PLAY, type: 'press', kbm: [k('Digit7')], pad: p(PAD.B, PAD.LB) }),
  def({ id: 'possess-queen', label: 'Possess the queen', contexts: PLAY, type: 'press', kbm: [k('Digit8')], pad: p(PAD.Y, PAD.LB) }),
  // 5.2 possession
  def({ id: 'hurry', label: 'Hurry', contexts: ['P'], type: 'hold', kbm: [k('ShiftLeft'), k('ShiftRight')], pad: p(PAD.LS), holdToggle: true }),
  def({ id: 'recentre', label: 'Camera behind the ant', contexts: ['P'], type: 'press', kbm: [k('KeyZ'), mClick(1)], pad: p(PAD.RS) }),
  def({ id: 'interact', label: 'Interact (hold: secondary)', contexts: ['P'], type: 'tapHold', holdMs: INTERACT_HOLD_MS, kbm: [k('KeyE')], pad: p(PAD.A), required: true }),
  def({ id: 'cycle-target', label: 'Next target', contexts: ['P'], type: 'press', kbm: [k('KeyB')], pad: p(PAD.DRIGHT) }),
  def({ id: 'dig', label: 'Dig / cut / chew', contexts: ['P'], type: 'hold', kbm: [k('KeyF')], pad: p(PAD.X), holdToggle: true }),
  def({ id: 'inspect', label: 'Inspect (hold: antennal sweep)', contexts: ['P'], type: 'tapHold', holdMs: INTERACT_HOLD_MS, kbm: [k('KeyT')], pad: p(PAD.Y), holdToggle: true }),
  def({ id: 'bite', label: 'Bite (hold: bite and hold)', contexts: ['P'], type: 'tapHold', kbm: [m(0), k('KeyQ')], pad: p(PAD.RT), holdToggle: true, tier: 2 }),
  def({ id: 'special', label: 'Species special (hold: alarm)', contexts: ['P'], type: 'tapHold', holdMs: SPECIAL_ALARM_HOLD_MS, kbm: [mClick(2), k('KeyC')], pad: p(PAD.LT), tier: 2 }),
  def({ id: 'trail-toggle', label: 'Lay trail on / off', contexts: ['P'], type: 'toggle', kbm: [k('KeyR')], pad: p(PAD.DUP) }),
  def({ id: 'share-food', label: 'Share food', contexts: ['P'], type: 'press', kbm: [k('KeyG')], pad: p(PAD.DDOWN) }),
  def({ id: 'foot', label: 'Let go / drop (hold: grip)', contexts: ['P'], type: 'tapHold', kbm: [k('Space')], pad: p(PAD.B), holdToggle: true }),
  def({ id: 'release', label: 'Release to observer', contexts: ['P'], type: 'press', kbm: [k('KeyX')], pad: pTap(PAD.VIEW, 500), required: true }),
  // 5.3 observer
  def({ id: 'obs-up', label: 'Fly up', contexts: ['O'], type: 'hold', kbm: [k('Space')], pad: p(PAD.RT) }),
  def({ id: 'obs-down', label: 'Fly down', contexts: ['O'], type: 'hold', kbm: [k('KeyC')], pad: p(PAD.LT) }),
  def({ id: 'obs-fast', label: 'Fly fast', contexts: ['O'], type: 'hold', kbm: [k('ShiftLeft'), k('ShiftRight')], pad: p(PAD.LS), holdToggle: true }),
  def({ id: 'select', label: 'Select', contexts: ['O'], type: 'press', kbm: [mClick(0)], pad: p(PAD.A) }),
  def({ id: 'possess-target', label: 'Possess', contexts: ['O'], type: 'press', kbm: [k('KeyE'), mHold(0, INTERACT_HOLD_MS)], fixed: [mDbl(0)], pad: p(PAD.X) }),
  def({ id: 'follow-toggle', label: 'Follow', contexts: ['O'], type: 'toggle', kbm: [k('KeyF')], pad: p(PAD.Y) }),
  def({ id: 'deselect', label: 'Deselect', contexts: ['O'], type: 'press', kbm: [mClick(2)], pad: p(PAD.B) }),
  // 5.4 colony view
  def({ id: 'cv-slice-up', label: 'Cutaway up', contexts: ['C'], type: 'press', kbm: [k('KeyR'), wheel(-1, true)], pad: p(PAD.DUP) }),
  def({ id: 'cv-slice-down', label: 'Cutaway down', contexts: ['C'], type: 'press', kbm: [k('KeyF'), wheel(1, true)], pad: p(PAD.DDOWN) }),
  def({ id: 'cv-cutaway-mode', label: 'Cutaway mode', contexts: ['C'], type: 'press', kbm: [k('KeyG')], pad: p(PAD.Y) }),
  def({ id: 'cv-confirm', label: 'Select / place', contexts: ['C'], type: 'press', kbm: [mClick(0)], pad: p(PAD.A) }),
  def({ id: 'cv-cancel', label: 'Cancel tool / deselect', contexts: ['C'], type: 'press', kbm: [mClick(2)], pad: p(PAD.B) }),
  def({ id: 'cv-delete', label: 'Delete marker', contexts: ['C'], type: 'press', kbm: [k('Delete')], pad: p(PAD.X) }),
  // 5.5 photo mode (T2)
  def({ id: 'ph-up', label: 'Photo: up', contexts: ['Ph'], type: 'hold', kbm: [k('Space')], pad: p(PAD.RT), tier: 2 }),
  def({ id: 'ph-down', label: 'Photo: down', contexts: ['Ph'], type: 'hold', kbm: [k('KeyC')], pad: p(PAD.LT), tier: 2 }),
  def({ id: 'ph-focus', label: 'Photo: focus here', contexts: ['Ph'], type: 'press', kbm: [mClick(0)], pad: p(PAD.A), tier: 2 }),
  def({ id: 'ph-aperture-down', label: 'Photo: aperture smaller', contexts: ['Ph'], type: 'press', kbm: [k('BracketLeft')], pad: p(PAD.DDOWN), tier: 2 }),
  def({ id: 'ph-aperture-up', label: 'Photo: aperture wider', contexts: ['Ph'], type: 'press', kbm: [k('BracketRight')], pad: p(PAD.DUP), tier: 2 }),
  def({ id: 'ph-exposure-down', label: 'Photo: exposure down', contexts: ['Ph'], type: 'press', kbm: [k('Minus')], pad: p(PAD.DDOWN, PAD.LB), tier: 2 }),
  def({ id: 'ph-exposure-up', label: 'Photo: exposure up', contexts: ['Ph'], type: 'press', kbm: [k('Equal')], pad: p(PAD.DUP, PAD.LB), tier: 2 }),
  def({ id: 'ph-roll-left', label: 'Photo: roll left', contexts: ['Ph'], type: 'hold', kbm: [k('Comma')], pad: p(PAD.DLEFT), tier: 2 }),
  def({ id: 'ph-roll-right', label: 'Photo: roll right', contexts: ['Ph'], type: 'hold', kbm: [k('Period')], pad: p(PAD.DRIGHT), tier: 2 }),
  def({ id: 'ph-guides', label: 'Photo: guides', contexts: ['Ph'], type: 'toggle', kbm: [k('KeyH')], pad: p(PAD.Y), tier: 2 }),
  def({ id: 'ph-capture', label: 'Photo: capture', contexts: ['Ph'], type: 'press', kbm: [k('Enter')], pad: p(PAD.X), tier: 2 }),
  def({ id: 'ph-exit', label: 'Photo: exit', contexts: ['Ph'], type: 'press', kbm: [], pad: p(PAD.B), tier: 2 }),
  // time-lapse (T2)
  def({ id: 'tl-skip', label: 'Skip time-lapse (hold)', contexts: ['TL'], type: 'hold', holdMs: 1000, kbm: [k('Space')], pad: p(PAD.A), holdToggle: true, tier: 2 }),
  def({ id: 'tl-dropout', label: 'Step in', contexts: ['TL'], type: 'press', kbm: [k('KeyE')], pad: p(PAD.X), tier: 2 }),
  // menus (keyboard and pad navigation; the mouse works natively on DOM panels)
  def({ id: 'ui-up', label: 'Menu up', contexts: ['UI'], type: 'press', kbm: [k('ArrowUp')], pad: p(PAD.DUP), locked: true }),
  def({ id: 'ui-down', label: 'Menu down', contexts: ['UI'], type: 'press', kbm: [k('ArrowDown')], pad: p(PAD.DDOWN), locked: true }),
  def({ id: 'ui-left', label: 'Menu left', contexts: ['UI'], type: 'press', kbm: [k('ArrowLeft')], pad: p(PAD.DLEFT), locked: true }),
  def({ id: 'ui-right', label: 'Menu right', contexts: ['UI'], type: 'press', kbm: [k('ArrowRight')], pad: p(PAD.DRIGHT), locked: true }),
  def({ id: 'ui-confirm', label: 'Menu confirm', contexts: ['UI'], type: 'press', kbm: [k('Enter'), k('Space')], pad: p(PAD.A) }),
  def({ id: 'ui-back', label: 'Menu back', contexts: ['UI'], type: 'press', kbm: [], pad: p(PAD.B) }),
  def({ id: 'ui-tab-prev', label: 'Previous tab', contexts: ['UI'], type: 'press', kbm: [k('KeyQ')], pad: p(PAD.LB) }),
  def({ id: 'ui-tab-next', label: 'Next tab', contexts: ['UI'], type: 'press', kbm: [k('KeyE')], pad: p(PAD.RB) }),
  // GDD 08 8: secondary / tertiary action of a row (Possess / Follow in the roster, Why? on a pulse row) and paging
  def({ id: 'ui-secondary', label: 'Menu secondary action', contexts: ['UI'], type: 'press', kbm: [ks('Enter')], pad: p(PAD.X) }),
  def({ id: 'ui-tertiary', label: 'Menu tertiary action', contexts: ['UI'], type: 'press', kbm: [], pad: p(PAD.Y) }),
  def({ id: 'ui-scroll-up', label: 'Scroll up', contexts: ['UI'], type: 'hold', kbm: [k('PageUp')], pad: p(PAD.LT) }),
  def({ id: 'ui-scroll-down', label: 'Scroll down', contexts: ['UI'], type: 'hold', kbm: [k('PageDown')], pad: p(PAD.RT) }),
];

/** Analogue axes. Their components are generated below as ordinary actions `<axis>.<component>`. */
export const AXES: readonly AxisDef[] = [
  { id: 'move', label: 'Move', contexts: ['P'], kind: 'rate2', required: true, tier: 1 },
  { id: 'orbit', label: 'Orbit camera', contexts: ['P'], kind: 'look2', keyRateDeg: [KEY_ORBIT_YAW_DEG_S, KEY_ORBIT_PITCH_DEG_S], lockedMouse: true, tier: 1 },
  { id: 'zoom', label: 'Camera distance', contexts: ['P'], kind: 'zoom1', tier: 1 },
  { id: 'obs-move', label: 'Fly', contexts: ['O'], kind: 'rate2', tier: 1 },
  { id: 'obs-look', label: 'Look', contexts: ['O'], kind: 'look2', keyRateDeg: [KEY_ORBIT_YAW_DEG_S, KEY_ORBIT_PITCH_DEG_S], lockedMouse: true, tier: 1 },
  { id: 'obs-pan', label: 'Pan', contexts: ['O'], kind: 'rate2', tier: 1 },
  { id: 'obs-zoom', label: 'Follow distance', contexts: ['O'], kind: 'zoom1', tier: 1 },
  { id: 'cv-pan', label: 'Pan', contexts: ['C'], kind: 'rate2', tier: 1 },
  { id: 'cv-rotate', label: 'Rotate', contexts: ['C'], kind: 'look2', keyRateDeg: [KEY_CV_YAW_DEG_S, KEY_CV_YAW_DEG_S], tier: 1 },
  { id: 'cv-zoom', label: 'Zoom', contexts: ['C'], kind: 'zoom1', tier: 1 },
  { id: 'ph-move', label: 'Photo: move', contexts: ['Ph'], kind: 'rate2', tier: 2 },
  { id: 'ph-look', label: 'Photo: look', contexts: ['Ph'], kind: 'look2', keyRateDeg: [KEY_ORBIT_YAW_DEG_S, KEY_ORBIT_PITCH_DEG_S], lockedMouse: true, tier: 2 },
  { id: 'ph-focal', label: 'Photo: focal length', contexts: ['Ph'], kind: 'zoom1', tier: 2 },
  { id: 'ph-focus-dist', label: 'Photo: focus distance', contexts: ['Ph'], kind: 'zoom1', tier: 2 },
];

type Comp = { c: string; kbm?: Binding[]; pad?: Binding | null };
const WASD: Comp[] = [{ c: 'up', kbm: [k('KeyW')] }, { c: 'down', kbm: [k('KeyS')] }, { c: 'left', kbm: [k('KeyA')] }, { c: 'right', kbm: [k('KeyD')] }];
const ARROWS: Comp[] = [{ c: 'up', kbm: [k('ArrowUp')] }, { c: 'down', kbm: [k('ArrowDown')] }, { c: 'left', kbm: [k('ArrowLeft')] }, { c: 'right', kbm: [k('ArrowRight')] }];
const BRACKET_ZOOM: Comp[] = [
  { c: 'in', kbm: [k('BracketLeft'), wheel(-1)], pad: pAxis(PAD_AXIS.RY, -1, PAD.LB) },
  { c: 'out', kbm: [k('BracketRight'), wheel(1)], pad: pAxis(PAD_AXIS.RY, 1, PAD.LB) },
];

/** Default components per axis. */
const AXIS_COMPONENTS: Record<string, Comp[]> = {
  'move': [...WASD, { c: 'stick', pad: stick('left') }],
  'orbit': [...ARROWS, { c: 'drag', kbm: [drag(2), drag(1)] }, { c: 'stick', pad: stick('right') }],
  'zoom': BRACKET_ZOOM,
  'obs-move': [...WASD, { c: 'stick', pad: stick('left') }],
  'obs-look': [...ARROWS, { c: 'drag', kbm: [drag(2)] }, { c: 'stick', pad: stick('right') }],
  'obs-pan': [{ c: 'drag', kbm: [drag(1)] }],
  'obs-zoom': BRACKET_ZOOM,
  'cv-pan': [...WASD, { c: 'drag', kbm: [drag(1)] }, { c: 'stick', pad: stick('left') }],
  'cv-rotate': [{ c: 'left', kbm: [k('KeyQ')] }, { c: 'right', kbm: [k('KeyE')] }, { c: 'drag', kbm: [drag(2)] }, { c: 'stick', pad: stick('right') }],
  'cv-zoom': [{ c: 'in', kbm: [wheel(-1)], pad: p(PAD.RT) }, { c: 'out', kbm: [wheel(1)], pad: p(PAD.LT) }],
  'ph-move': [...WASD, { c: 'stick', pad: stick('left') }],
  'ph-look': [...ARROWS, { c: 'drag', kbm: [drag(2)] }, { c: 'stick', pad: stick('right') }],
  'ph-focal': [{ c: 'in', kbm: [wheel(-1)], pad: pAxis(PAD_AXIS.RY, -1, PAD.LB) }, { c: 'out', kbm: [wheel(1)], pad: pAxis(PAD_AXIS.RY, 1, PAD.LB) }],
  'ph-focus-dist': [{ c: 'in', kbm: [wheel(-1, true)] }, { c: 'out', kbm: [wheel(1, true)] }],
};

function buildAxisComponents(): ActionDef[] {
  const out: ActionDef[] = [];
  for (const axis of AXES) {
    for (const comp of AXIS_COMPONENTS[axis.id] ?? []) {
      out.push({
        id: `${axis.id}.${comp.c}`,
        label: `${axis.label} (${comp.c})`,
        contexts: axis.contexts,
        type: 'axis',
        kbm: comp.kbm ?? [],
        pad: comp.pad ?? null,
        axis: axis.id,
        tier: axis.tier,
      });
    }
  }
  return out;
}

/** All rebindable actions: button actions followed by axis components. */
export const ACTIONS: readonly ActionDef[] = [...BUTTON_ACTIONS, ...buildAxisComponents()];

const BY_ID = new Map<string, ActionDef>(ACTIONS.map((a) => [a.id, a]));
const AXIS_BY_ID = new Map<string, AxisDef>(AXES.map((a) => [a.id, a]));

export function actionDef(id: string): ActionDef | undefined {
  return BY_ID.get(id);
}

export function axisDef(id: string): AxisDef | undefined {
  return AXIS_BY_ID.get(id);
}

/** Component action ids of an axis (e.g. `move` -> move.up, move.down, ..., move.stick). */
export function axisComponents(axisId: string): ActionDef[] {
  return ACTIONS.filter((a) => a.axis === axisId);
}

/** Actions the player must not leave unbound: required button actions and every key component of required axes. */
export function requiredActionIds(): string[] {
  const ids = ACTIONS.filter((a) => a.required).map((a) => a.id);
  for (const ax of AXES) {
    if (!ax.required) continue;
    for (const c of axisComponents(ax.id)) if (['up', 'down', 'left', 'right'].includes(c.id.split('.')[1])) ids.push(c.id);
  }
  return ids;
}

/**
 * Actions the gamepad player must not lose: required button actions that have a default pad binding, and the
 * stick component of required axes (a controller player could otherwise not open the menu or walk).
 */
export function requiredPadActionIds(): string[] {
  const ids = BUTTON_ACTIONS.filter((a) => a.required && a.pad).map((a) => a.id);
  for (const ax of AXES) if (ax.required) for (const c of axisComponents(ax.id)) if (c.pad) ids.push(c.id);
  return ids;
}
