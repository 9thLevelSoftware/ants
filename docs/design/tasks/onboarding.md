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

## Integrator addendum (Nov 16, 10:30)
- State of the game: the opening (founding) is being repaired by simulation engineers right now; some seeds stall while sealing. In `tests/e2e/onboarding.mjs` play the real opening only as far as it works on seed 1 at this commit, and use `cheat.completeFounding` (`?test=1&seed=1&autostart=1`) to reach the colony phase. Do not edit `src/sim/**` or `src/game/founding/**`; the opening's own prompts belong to founding (do not duplicate; your engine must stay silent while `foundingInProgress` unless the hint is about the opening and is not already shown by the founding overlay).
- Existing pieces to use, not rebuild: key hints `KeyHint` and bindings text in `src/ui/**`; alerts feed and aims in the journal (`src/ui/panels/**`, `src/game/uiBridge/panels/**`); profile store `src/game/profile`; progression events (`src/sim/progression/**`, read only); photo mode (F2) and overlays exist and want one hint each. Settings has an Accessibility page: put "Reset hints" where GDD 08 says.
- `src/ui/App.tsx` registration: one line, report it. Another engineer (`stage2-look-fix`) edits `src/render/**` and `tests/e2e/stage2.mjs`; do not touch those.
- Hints must use the words table (`src/content/text/**`): add your strings there, in the house style (calm, precise, no exclamation marks, no second-person cheerleading).
- Machine rules: 4 cores shared; one headless browser at a time; never the whole vitest suite; global Playwright only. Evidence under `test-output/onboarding/`; look at every screenshot you cite.
