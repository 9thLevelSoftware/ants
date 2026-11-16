// Presentation constants of the onboarding hints (GDD 08 §9.1, 00-index §C "hint timing (HINT_*)"). They never affect
// simulation results, so they live here and not in src/sim/balance. All times are REAL seconds, the clock of the
// player's attention; the engine's clock only runs while a game is being played (not paused, not in a menu).

/** Successful uses that teach a verb unless the table says otherwise (= GDD 01 `PROMPT_LEARN_COUNT`). */
export const HINT_LEARN_USES = 3;
/** A shown hint not completed within this long fades to its compact form. */
export const HINT_IDLE_REAL_S = 60;
/** ... and after this much longer in compact form it returns to full form once. */
export const HINT_RETURN_REAL_S = 120;
/** At most this many NEW teaching prompts per real minute. */
export const HINT_MAX_PER_MINUTE = 2;
/** The window of that rule, real seconds. */
export const HINT_RATE_WINDOW_REAL_S = 60;
/** How long a trigger must stay true before its hint shows (a table entry may ask for more). */
export const HINT_DELAY_REAL_S = 1.5;
/** Quiet time between one hint going away and the next appearing. */
export const HINT_GAP_REAL_S = 4;
/** After combat, a seized ant, a raid: no teaching prompt for this long. */
export const HINT_FIGHT_QUIET_REAL_S = 12;
/** A shown hint that lost its trigger (the player did something else) may come back after this long. */
export const HINT_RESHOW_COOLDOWN_REAL_S = 20;
/** A hint that retired after HINT_EXPIRY_REAL_S unlearned may come back after this long (a reminder, never a nag). */
export const HINT_RETIRE_COOLDOWN_REAL_S = 180;
/** A hint is shown at most this many times in full form without being learned; then it stays quiet. */
export const HINT_MAX_FULL_SHOWS = 3;
/** Total time on screen after which an unlearned hint retires (until its re-show cooldown). */
export const HINT_EXPIRY_REAL_S = 300;
/** Two uses of one verb closer together than this count once (an assessment refreshes twice a second). */
export const HINT_USE_GAP_REAL_S = 3;
/** Pointer travel (CSS px) that makes a press-and-move a camera drag. */
export const HINT_DRAG_MIN_PX = 12;
/** Movement intent shorter than this length is no movement. */
export const HINT_MOVE_MIN_INTENT = 0.1;
/** Quiet time of the hint after the dealation meter appears, real seconds, before the reserve gauge counts as noticed. */
export const HINT_PASSIVE_NOTICE_REAL_S = 8;
/** Game days after the first workers hatch before the Colony orders hint shows even if the queen was never possessed. */
export const HINT_DIRECTIVES_FALLBACK_GAME_DAYS = 3;
/** Real seconds into a game with workers before the photo-mode hint may show. */
export const HINT_PHOTO_AFTER_REAL_S = 240;
/** Engine steps in `advance(realS)` are at most this long, so cumulative-time hints behave as in play. */
export const HINT_ADVANCE_STEP_REAL_S = 0.25;
