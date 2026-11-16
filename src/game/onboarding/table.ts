// The hint table (GDD 08 §9.2, GDD 06 §5.16): every hint id with its trigger, order (= priority), who draws it, how it
// is learned, and the aims it moves. Table-driven: the engine knows no hint by name. The words (verb, key action,
// hold) are the words table's (src/content/text/hints.ts); the key cap is drawn from the player's CURRENT binding.
//
// Decisions (recorded in the task report):
//  - The opening's own overlay (src/ui/screens/founding) already draws prompts for move, antennate, dig, readiness,
//    seal, lay, "tend the brood" and "next ant", and the reserve meter. The engine TRACKS those (shown when the overlay
//    draws them, learned when the player does the thing) but never draws a second copy: `presenter: 'founding'`.
//    `hint-look` is about the opening and no overlay draws it, so the engine draws it.
//  - Pick-up and share-food are verbs of the context prompt chip (`[E] Pick up crumb`): tracked, drawn by the chip.
//  - `hint-why` and `hint-directives` have no prerequisite hint (GDD 08 §9.2 #18, #19, decision E-100): the owning
//    chapter wins over an earlier ordering idea. The one-at-a-time rule and the per-minute limit keep them from piling up.
//  - `hint-photo` and `hint-overlay` are additive ids for the photo mode and the overlay cycle (the integrator asked
//    for one hint each).
import {
  HINT_ANTENNATE_AFTER_REAL_S, HINT_DIRECTIVES_FALLBACK_GAME_DAYS, HINT_LOOK_DELAY_REAL_S, HINT_LOOK_QUIET_REAL_S, HINT_MARKER_DELAY_REAL_S,
  HINT_MOVE_DELAY_REAL_S, HINT_OVERLAY_DELAY_REAL_S, HINT_PASSIVE_NOTICE_REAL_S, HINT_PHOTO_AFTER_REAL_S, HINT_PHOTO_DELAY_REAL_S, HINT_SPEED_DELAY_REAL_S,
} from './balance';
import type { HintDef } from './types';

const SEARCH = 'search';
const inOpening = (f: { openingPhase: string | null }, ...phases: string[]): boolean => f.openingPhase !== null && phases.includes(f.openingPhase);
const playing = (f: { view: string }): boolean => f.view === 'possess' || f.view === 'observer';

export const HINT_TABLE: readonly HintDef[] = [
  { id: 'hint-reserves', order: 0, presenter: 'founding', anchor: 'top', opening: true,
    when: (f) => inOpening(f, SEARCH), learn: { key: 'reserves', uses: 1 }, passiveS: HINT_PASSIVE_NOTICE_REAL_S },
  { id: 'hint-move', order: 1, presenter: 'founding', anchor: 'top', opening: true,
    when: (f) => inOpening(f, SEARCH) && !f.moving, delayS: HINT_MOVE_DELAY_REAL_S, learn: { key: 'move', uses: 3, seconds: true } },
  { id: 'hint-look', order: 2, presenter: 'engine', anchor: 'top', opening: true, after: ['hint-move'],
    when: (f, c) => f.view === 'possess' && !!f.possessed && (!f.foundingInProgress || inOpening(f, SEARCH, 'dig')) && c.sinceUse('look') >= HINT_LOOK_QUIET_REAL_S,
    delayS: HINT_LOOK_DELAY_REAL_S, learn: { key: 'look', uses: 2 } },
  { id: 'hint-antennate', order: 3, presenter: 'founding', anchor: 'top', opening: true,
    when: (f, c) => inOpening(f, SEARCH) && c.clock >= HINT_ANTENNATE_AFTER_REAL_S, learn: { key: 'antennate', uses: 2 } },
  { id: 'hint-dig', order: 4, presenter: 'founding', anchor: 'top', opening: true,
    when: (f) => inOpening(f, SEARCH, 'dig'), learn: { key: 'dig', uses: 1 },
    aims: { opens: ['aim-dig-chamber'], closes: ['aim-find-site'] } },
  { id: 'hint-readiness', order: 5, presenter: 'founding', anchor: 'top', opening: true,
    when: (f) => inOpening(f, 'dig', 'seal'), learn: { key: 'readiness', uses: 1 },
    aims: { opens: ['aim-seal'], closes: ['aim-dig-chamber'] } },
  { id: 'hint-seal', order: 6, presenter: 'founding', anchor: 'top', opening: true,
    when: (f) => inOpening(f, 'seal'), learn: { key: 'seal', uses: 1 },
    aims: { opens: ['aim-first-clutch'], closes: ['aim-seal'] } },
  { id: 'hint-lay', order: 7, presenter: 'founding', anchor: 'top', opening: true,
    when: (f) => inOpening(f, 'lay'), learn: { key: 'lay', uses: 1 } },
  { id: 'hint-timelapse', order: 8, presenter: 'founding', anchor: 'top', opening: true, timelapse: true,
    when: (f) => f.timelapse || inOpening(f, 'lay', 'timelapse'), learn: { key: 'timelapse', uses: 1 },
    aims: { closes: ['aim-first-clutch', 'aim-first-workers'] } },
  { id: 'hint-cycle', order: 9, presenter: 'founding', engineFallback: true, anchor: 'top',
    when: (f) => f.workers >= 1 && !f.foundingInProgress && playing(f), learn: { key: 'cycle', uses: 2 },
    aims: { opens: ['aim-nest-open', 'aim-first-food'] } },
  { id: 'hint-observer', order: 10, presenter: 'engine', anchor: 'top', after: ['hint-cycle'],
    when: (f) => f.view === 'possess' && !!f.possessed && f.workers >= 1, learn: { key: 'observer', uses: 1 } },
  { id: 'hint-pickup', order: 11, presenter: 'prompt', anchor: 'top',
    when: (f) => !!f.possessed && !f.possessed.isQueen && f.promptPickup, learn: { key: 'pickup', uses: 3 } },
  { id: 'hint-trail', order: 12, presenter: 'engine', anchor: 'top',
    when: (f) => f.view === 'possess' && !!f.possessed && !f.possessed.isQueen && !f.possessed.underground && f.possessed.carryingFood && !f.possessed.trailOn,
    learn: { key: 'trail', uses: 2 } },
  { id: 'hint-share', order: 13, presenter: 'prompt', anchor: 'top',
    when: (f) => !!f.possessed && f.promptShare, learn: { key: 'share', uses: 2 } },
  { id: 'hint-colony-view', order: 14, presenter: 'engine', anchor: 'top',
    when: (f, c) => playing(f) && !f.foundingInProgress && (f.firstFood || c.flag('firstDelivery')), learn: { key: 'colony-view', uses: 1 },
    aims: { opens: ['aim-first-trail'], closes: ['aim-first-food'] } },
  { id: 'hint-marker', order: 15, presenter: 'engine', anchor: 'bottom', // the colony view's palette fills the top centre
    when: (f) => f.view === 'colony', delayS: HINT_MARKER_DELAY_REAL_S, learn: { key: 'marker', uses: 1 }, aims: { opens: ['aim-second-chamber'] } },
  { id: 'hint-speed', order: 16, presenter: 'engine', anchor: 'time',
    when: (f) => f.view === 'observer' && !f.alertActive && !f.foundingInProgress, delayS: HINT_SPEED_DELAY_REAL_S, learn: { key: 'speed', uses: 2 } },
  { id: 'hint-scent', order: 17, presenter: 'engine', anchor: 'top',
    when: (f, c) => playing(f) && !f.foundingInProgress && (f.firstTrail || c.flag('trailExists')), learn: { key: 'scent', uses: 1 } },
  { id: 'hint-why', order: 18, presenter: 'engine', anchor: 'pulse', // no prerequisite: GDD 08 §9.2 #18 is "the first diagnostic turns warn"
    when: (f, c) => playing(f) && !f.foundingInProgress && (f.diagWarn || c.flag('diagWarn')), learn: { key: 'why', uses: 1 } },
  // The possessed queen already has the context chip "Colony orders (I)" (and the panel button): the chip is the hint, so the
  // card is not drawn on top of it. When the queen is not possessed the card is the fallback chip by the time cluster.
  { id: 'hint-directives', order: 19, presenter: 'prompt', engineFallback: true, anchor: 'time', // no prerequisite: a player who possesses by click never learns Tab
    anchorWhen: (f) => (f.possessed?.isQueen ? 'panel' : 'time'), // (GDD 08 §9.2 #19)
    when: (f) => playing(f) && !f.foundingInProgress
      && ((!!f.possessed && f.possessed.isQueen && f.possessed.colonyOrders)
        || (f.workers >= 1 && f.daysSinceFirstWorker >= HINT_DIRECTIVES_FALLBACK_GAME_DAYS)),
    learn: { key: 'directives', uses: 1 } },
  { id: 'hint-photo', order: 20, presenter: 'engine', anchor: 'top', after: ['hint-scent'],
    when: (f, c) => playing(f) && !f.foundingInProgress && f.workers >= 1 && c.clock >= HINT_PHOTO_AFTER_REAL_S, delayS: HINT_PHOTO_DELAY_REAL_S,
    learn: { key: 'photo', uses: 1 } },
  { id: 'hint-overlay', order: 21, presenter: 'engine', anchor: 'top', after: ['hint-scent'],
    when: (f) => playing(f) && !f.foundingInProgress && f.workers >= 1, delayS: HINT_OVERLAY_DELAY_REAL_S, learn: { key: 'overlay', uses: 1 } },
];

const BY_ID = new Map(HINT_TABLE.map((d) => [d.id, d] as const));

export function hintDef(id: string): HintDef | undefined {
  return BY_ID.get(id as HintDef['id']);
}
