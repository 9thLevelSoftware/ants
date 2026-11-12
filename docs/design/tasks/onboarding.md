# Task onboarding — Contextual hints, first-play guidance and aims (Stage 2, Sonnet implement / Opus verify, visual)

## Goal
Teach the game without dialogue or characters: contextual prompts that appear once, at the moment they are useful, and never again; the first-fifteen-minutes sequence; and the journal aims that give direction afterwards.

## Read in full
GDD 08 (`docs/design/gdd/08-ui-ux-art-audio.md`): the onboarding plan (the exact sequence of contextual prompts and aims for the first 15 minutes, dismissal rules, how the codex teaches, hint ids). GDD 06: the opening script's own prompts (owned by the founding task — do not duplicate them) and the aims list. `docs/research/genre-ux.md` §2 (onboarding recommendations). The profile store (`src/game/profile`) holds which hints were seen. Digests 08, 06.

## You own
`src/game/onboarding/**` (hint engine: table-driven triggers over the UI snapshot and simulation events, once-only logic, priorities, cool-downs, persistence through the profile store), `src/ui/hud/prompts/**` (hint presentation), `tests/e2e/onboarding.mjs`.

## Deliverables
1. Hint table with every hint id from the design index: trigger, text (calm, precise, with live key hints from the bindings), priority, expiry, dismissal.
2. Engine: at most one hint at a time, never during a fight or a time-lapse unless the hint is about it, never repeated once learned (performing the action counts as learning), reset option in Settings.
3. Presentation: unobtrusive hint line/card consistent with the HUD; reduced-motion friendly.
4. A scripted first-play run proving the sequence.

## Acceptance criteria
1. Typecheck and tests green (trigger logic, once-only, priorities, persistence).
2. `tests/e2e/onboarding.mjs`: in a fresh profile the first-play hints appear in the designed order as the scripted player progresses, each exactly once; in a profile with hints learned, none appear.
3. Screenshots, looked at: hints are readable and do not cover the subject; key hints match the current bindings (rebinding a key changes the text).
4. No console errors; works in the classic single-file build.
