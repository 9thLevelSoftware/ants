# Task ui-shell — Design system, component library and out-of-game screens (Stage 1A, Sonnet implement / Opus verify, visual)

## Goal
The interface foundation: design tokens, a small accessible component library, and every screen that exists outside moment-to-moment play — title, new-game setup, loading, pause menu, settings (with key rebinding), save/load, error and unsupported screens — in the calm field-notebook tone of the design.

## Read first
- GDD 08 (`docs/design/gdd/08-ui-ux-art-audio.md`): read in full the sections on the design system (tokens: colours, typography, spacing, radii, elevation, motion, icons, component inventory), the information hierarchy, accessibility requirements, and the screen specifications for Title, New Game setup, Loading, Pause menu, Settings, Save/Load, plus the error/unsupported states. `docs/design/gdd/digests/08.md` gives the map. GDD 01 §1 (application flow and screen transitions) and §5 (rebinding rules).
- `docs/03-architecture.md` §8 (packaging: fonts and every other asset must work from an opaque-origin single-file build — fonts therefore have to be inlinable; no remote fonts).
- `src/ui/App.tsx`, `src/ui/store.ts`, `src/ui/api.ts` (the `GameFacade` the UI calls and the `UiSnapshot` it reads — extend additively and list changes), `src/input/**` (bindings model for the rebinding UI), `src/render/app` quality presets (for graphics settings).

## You own
`src/ui/styles/**`, `src/ui/components/**`, `src/ui/screens/**` (except `founding/` and `photo/`, later tasks), `src/ui/icons/**`, a demo page `spikes/ui-demo/**`. You may add the two open-licensed font families named in GDD 08 as exact-version `@fontsource` dependencies (this is the one dependency change allowed), imported so the build can inline them.

## Boundaries
- The in-game HUD and panels (directives, roster, colony health, nest, journal, codex, markers) are later tasks: your component library must make them easy to build.
- Persistence is another task (`save`): the Save/Load screen and Settings talk to it through `GameFacade` methods; use a mock facade in the demo page.
- No game logic in components: they render the snapshot and call facade methods.

## Deliverables
1. Design tokens as CSS custom properties (exact values from GDD 08) and a global stylesheet; UI scale 80-150 %; reduced-motion mode; high-contrast friendly; light-on-dark panels that stay legible over a bright 3D scene.
2. Components (Preact + signals, typed props, keyboard and gamepad focus handling, ARIA roles): Button, IconButton, Toggle, Slider, Stepper, Select, SegmentedControl, Tabs, Panel/Drawer, Modal/Dialog with focus trap, Tooltip, Card, List/ListItem, ProgressBar, Meter with trend arrow, KeyHint (renders the current binding), Toast/Alert item, EmptyState, ScrollArea, and an inline-SVG icon set covering the list in GDD 08.
3. Screens per GDD 08: Title (continue, new game, load, lineage entry point, settings, codex entry point, credits with the asset credits from `public/assets/CREDITS.md`), New Game setup (species cards, locality archetype, size, seed with randomise, starting season, difficulty presets and custom rules), Loading (world generation progress with the chapter's wording), Pause menu, Settings (graphics incl. quality presets and auto-detect; audio; controls with rebinding, conflict handling and reset; accessibility; gameplay), Save/Load (slots, autosave ring, quick slot, export/import with the copy/paste text fallback), error overlay and unsupported-browser screen.
4. Screen routing driven by the game's mode in the snapshot, with the transitions GDD 01 §1 defines.
5. Demo page `spikes/ui-demo/`: every screen and every component state with a mock facade, selectable by URL flag (`?screen=…&scale=…&reducedMotion=1`), sets `window.__ready`.

## Acceptance criteria
1. `npm run typecheck` clean; component unit tests green (state changes, keyboard interaction, focus trap, rebinding conflict logic).
2. Harness screenshots of every screen at 1280x720 and 1920x1080 and at UI scale 80 % and 150 %, looked at and judged honestly: aligned, readable, no overflow or clipped text, consistent spacing, correct fonts, matching the tone GDD 08 describes. Fix what looks wrong.
3. Keyboard-only navigation reaches every control on every screen in a sensible order (scripted harness check using Tab/Enter/arrow keys); focus is always visible.
4. Text contrast meets WCAG AA on panels (computed check over the token pairs).
5. No remote requests of any kind (fonts and icons are bundled); the demo works in the classic single-file build served by the harness in `--static` mode.
6. No console errors.
