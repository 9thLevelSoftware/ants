// Teaching hints and journal aims (GDD 08 §9.2, GDD 06 §5.13, §5.16). A hint is a verb with the input it teaches; the
// UI draws the key cap from the player's CURRENT binding of `action` (the controls reference, controls.ts, resolves the
// same ids), so the text never names a key. `action` is an input action id or axis id (src/input/actions.ts); null
// means the hint teaches something that has no key (a gauge, a bar).
import type { AimId, HintId, SpeciesId } from '@/sim/types';

export interface HintText {
  /** The verb phrase beside the key cap, e.g. "Walk" gives `[W A S D] Walk`. */
  verb: string;
  /** Input action or axis id whose binding the key cap shows; null for a hint without a key. */
  action: string | null;
  /** True when the key is held rather than tapped (`[hold F] Dig`). */
  hold?: boolean;
  /** Key text for a hint whose key is not a rebindable action (the marker tools are Shift+1 to Shift+7). */
  fixedKey?: string;
}

export const HINT_TEXT: Record<HintId, HintText> = {
  'hint-move': { verb: 'Walk', action: 'move' },
  'hint-look': { verb: 'Look around', action: 'orbit' },
  'hint-antennate': { verb: 'Antennate the ground', action: 'inspect' },
  'hint-dig': { verb: 'Dig', action: 'dig', hold: true },
  'hint-readiness': { verb: 'Dig until the chamber is ready', action: null },
  'hint-seal': { verb: 'Seal the entrance', action: 'interact', hold: true },
  'hint-lay': { verb: 'Lay eggs', action: 'interact' },
  'hint-timelapse': { verb: 'Tend the brood', action: 'interact' },
  'hint-cycle': { verb: 'Next ant', action: 'possess-next' },
  'hint-observer': { verb: 'Watch the colony', action: 'release' },
  'hint-pickup': { verb: 'Pick up', action: 'interact' },
  'hint-trail': { verb: 'Lay a trail home', action: 'trail-toggle' },
  'hint-share': { verb: 'Share food', action: 'share-food' },
  'hint-colony-view': { verb: 'Survey the colony', action: 'colony-view' },
  'hint-marker': { verb: 'Plan a chamber', action: null, fixedKey: 'Shift+1' },
  'hint-speed': { verb: 'Change speed', action: 'speed-1' },
  'hint-scent': { verb: 'Scent view', action: 'scent-view' },
  'hint-why': { verb: 'Why?', action: 'why-view' },
  'hint-directives': { verb: 'Colony orders', action: 'directives' },
  'hint-reserves': { verb: 'Watch the reserve gauge', action: null },
  'hint-photo': { verb: 'Photograph the colony', action: 'photo-mode' },
  'hint-overlay': { verb: 'Show temperature, moisture and threats', action: 'overlay-cycle' },
};

export interface AimText {
  /** The aim as a naturalist question or a plain instruction (GDD 08 §9.2, GDD 06 §5.13). */
  text: string;
  /** Shown beside the aim when it applies out of season or similar (GDD 06 §5.13 journal hint). */
  hint?: string;
}

/**
 * Aim texts. Decision (recorded in the report): where GDD 08 §9.2 and GDD 06 §5.13 both give a text for an id
 * (`aim-first-food`, `aim-second-chamber`, `aim-first-protein`, `aim-first-trail`), GDD 06 owns the hand-over aims and
 * its questions are used; GDD 08's wording applies to the five opening aims. The game flow already uses GDD 06's text.
 */
export const AIM_TEXT: Record<AimId, AimText> = {
  'aim-find-site': { text: 'Where is the ground sheltered, warm and diggable?' },
  'aim-dig-chamber': { text: 'Dig a chamber for the first brood' },
  'aim-seal': { text: 'Close the nest against the outside' },
  'aim-first-clutch': { text: 'Lay the first eggs' },
  'aim-first-workers': { text: 'Raise the first workers' },
  'aim-first-food': { text: 'Where does the nearest sugar lie?' },
  'aim-second-chamber': { text: 'Is one chamber enough for a growing brood?' },
  'aim-first-protein': { text: 'What will the larvae need that sugar cannot give?' },
  'aim-first-trail': { text: 'Does a route last once it has been walked?' },
  'aim-stores-winter': { text: 'Will the stores last the winter?' },
  'aim-midden': { text: 'Where do the dead go?' },
  'aim-nest-open': { text: 'Can the workers reach the surface?' },
  'aim-garden': { text: 'Is the garden taking hold?' },
  'aim-satellite': { text: 'Is there a drier, warmer corner for the larger brood?' },
  'aim-trunk-trail': { text: 'Which way do the seeds lie?' },
  'aim-second-entrance': { text: 'Is one way in and out enough for this many workers?' },
  'aim-cross-zone': { text: 'What lies past the edge of the home ground?' },
  'aim-herd': { text: 'Can the aphids on that stem be kept, and guarded?' },
  'aim-alates': { text: 'Is the colony ready to raise winged queens and males?', hint: 'Out of season' },
  'aim-flight': { text: 'Will the weather give the winged ants their day?' },
  'aim-find-wood': { text: 'Where is the wood soft and damp?' },
  'aim-plant-garden': { text: 'Plant the fungus brought from the mother nest' },
};

/** The out-of-season hint text of `aim-alates` (GDD 06 §5.13). */
export const AIM_OUT_OF_SEASON = 'Out of season';

/** Species variants of an aim text (GDD 08 §9.2: the Messor founding question differs). */
export const AIM_TEXT_BY_SPECIES: Partial<Record<AimId, Partial<Record<SpeciesId, string>>>> = {
  'aim-find-site': { 'messor-barbarus': 'Where is the ground open, dry and deep?' },
};
