# Task input-gamepad-a11y — Gamepad play, rebinding polish and accessibility (Stage 3, Sonnet implement / Opus verify, visual)

## Goal
The game fully playable on a gamepad, every binding remappable from Settings, and the accessibility options the design promises working end to end: UI scale, reduced motion, colour-blind-safe overlays, spider comfort mode, hold-to-toggle options.

## Read in full
GDD 01 §5 (gamepad table, rebinding and conflict rules, input edge cases), GDD 08 (accessibility requirements; Settings controls and accessibility tabs; focus navigation rules for panels). `src/input/**`, `src/ui/**`, the settings store, the creature renderer's comfort mode, the camera rigs' reduced-motion hooks, the overlays' palettes.

## You own
`src/game/accessibility/**` (applies settings to the systems that honour them), `src/ui/nav/**` (focus/gamepad navigation layer for all panels), `tests/e2e/a11y.mjs`. Minimal, reported edits in UI components to register with the navigation layer.

## Deliverables
1. Gamepad: every gameplay action reachable; menus and panels navigable with stick/D-pad and confirm/cancel; on-screen key hints switch to gamepad glyphs when the last input was a gamepad.
2. Rebinding polish: capture UI for keyboard, mouse and gamepad, conflicts, reset, persistence.
3. Accessibility options applied live: UI scale 80-150 %, reduced motion (camera sway, shake, depth-of-field strength, UI transitions), colour-blind-safe palettes for overlays and status colours, spider comfort mode, hold-to-toggle for held actions, pause anywhere.
4. A focus-order audit of every screen and panel with fixes.

## Acceptance criteria
1. Typecheck and tests green.
2. `tests/e2e/a11y.mjs` with a virtual gamepad: start a game, possess an ant, walk, dig, open Directives and change a slider, save — using only gamepad input.
3. Screenshots, looked at: gamepad glyph hints; UI at 80 % and 150 %; overlays in the colour-blind-safe palette; comfort mode on.
4. With reduced motion on, camera shake and sway amplitudes are zero and transitions are instant (asserted through the debug API).
5. No console errors.

## Integrator addendum (Nov 16, 18:40)
- **What exists now** (read before designing): `src/input/**` with an actions table (`src/input/actions.ts`: View is bound to colony-view on hold and release on tap), `KeyHint` in `src/ui/**` (cannot show axis bindings: fix that here so hints for move/look/zoom follow the bindings), Settings tabs in `src/ui/screens/settings/` (`ControlsTab.tsx`, `KeybindRow.tsx`, `captureBinding.ts`, `AccessibilityTab.tsx`), comfort settings reaching the creature renderer through `FrameInfo.comfort`, reduced motion on the camera rigs and the weather renderer (lightning), overlay palettes (`okabe-ito`, `high-contrast`, `pattern-only`) in the prefs, photo mode (`src/game/views/photo/**`: its `ph-*` actions carry pad bindings that were never exercised; subject / capture / guides keys were tested with the keyboard only), the onboarding hint engine (`src/game/onboarding/**`).
- **Owed to other tasks, do them here**: (1) a `dismiss-hint` action (Shift+H on keyboard, RB+View on the pad, with RB as a modifier so View alone keeps its meaning) calling `OnboardingController.dismiss()`; (2) default pad bindings for the books (journal, codex, colony panels) and the tools pad (`src/ui/panels/wiring/toolsPad.ts`); (3) `src/content/text/controls.test.ts` is red: find out why and fix the cause (the controls text table or the bindings, whichever is wrong); (4) photo mode fully usable from the pad (open, look, lens, focus at centre, capture, exit); (5) the founding opening usable from the pad (dig, seal by holding the action, lay, tend, time-lapse skip).
- **You own in addition**: `src/input/**` and `src/ui/screens/settings/{ControlsTab,KeybindRow,AccessibilityTab}.tsx`, `src/ui/screens/settings/captureBinding.ts`, `src/content/text/controls*.ts`. Do not edit `src/sim/**`, `src/render/**`, `src/audio/**`, `src/ui/screens/settings/AudioTab.tsx`. Other engineers are in `src/sim/**` and `src/game/flows/**`, `src/ui/screens/{overwinter,flight,epitaph,lineage}/**` (new winter and reproduction screens: they will register with your navigation layer later; give them a one-line registration and document it at the top of `src/ui/nav/index.ts`).
- The opening and the colony are being repaired in the simulation; in `tests/e2e/a11y.mjs` use `?test=1&seed=1&autostart=1` and `cheat.completeFounding` to reach the colony phase, and exercise the opening's pad controls only as far as the opening works on seed 1.
- Virtual gamepad: Playwright has no gamepad; inject one by overriding `navigator.getGamepads` in the page before the game reads it (the input layer must poll through one function so that a test can do this without touching game code paths).
- Machine rules: 4 cores shared; one headless browser at a time; never the whole vitest suite; global Playwright only (never npm-install it). Evidence under `test-output/a11y/`; look at every screenshot you cite.
