# Task docs-final — The documents a player and a maintainer need (Sonnet implement / Opus verify)

## Goal
Four documents, each true to the code as it is today. Nothing in them may describe a feature that does not work; where the game is unfinished the documents say so plainly.

## Read first
`docs/STATUS.md` (all of it: it is the running log and holds the integrator rulings R1–R28), `docs/01-design-seed.md`, `docs/03-architecture.md`, `docs/research/tech-stack.md`, the GDD index `docs/design/gdd/00-index.md`, the task reports under `docs/design/tasks/*-report.md`, `package.json` scripts, `tools/harness/play.mjs` usage, the key bindings and pad bindings in the code (`src/input/**`, `src/content/text/controls*.ts`), the settings schema (`src/game/settings/schema.ts`), the New Game screen (`src/ui/screens/newgame/**`), `src/sim/config/presetDisplay.ts`.

## You own
`README.md` (repository root), `docs/MANUAL.md`, `docs/design/gdd/DEVIATIONS.md`, `CREDITS.md` and `docs/CREDITS-AUDIT.md`. No source file. If you find a wrong string in the game (a control name that does not exist, a rule shown as working that is flagged `inEffect: false`), list it in your report; do not edit it.

## Deliverables
1. **`README.md`**: what FOUNDRESS is in three sentences; requirements; how to install, run the dev server, run the tests (typecheck, vitest by folder, the long tests and their flag), run a harness script, build the site and the portable single-folder build and verify it; the query flags (`?test=1&seed=…&quality=…&autostart=1&species=…`); the repository layout in a short table; where the design lives; the state of the game today (what is playable, what is not) taken from STATUS, dated. Every command in it must have been run by you today and its outcome noted in your report (a command that fails is fixed in the README or reported, not printed as working).
2. **`docs/MANUAL.md`** — the player's manual: starting a game (species available today, difficulty presets and custom rules, with the rules that are not in effect yet marked as such), the opening step by step, the three views and how to move between them, possessing an ant and what each action does, colony orders through the queen, markers and dig plans, the scent view and overlays, alerts and what auto-slow does, time controls, saving, photo mode, accessibility settings, keyboard-and-mouse and gamepad tables **generated from the bindings in the code** (say which file), a short "what the colony needs" guide that matches the simulation's rules as built (food kinds, brood care, waste, winter), and a "known problems" section taken from the latest gate report and STATUS. No lore that the game does not show.
3. **`docs/design/gdd/DEVIATIONS.md`**: one table of every integrator ruling R1–R28 and every GDD deviation recorded in STATUS and in the task reports and the colony-life ledger: id, date, what the GDD says (chapter and section), what the game does instead, why (one line), where in the code (file and symbol), the test that pins it. Then a list of GDD passages that are now wrong and should be amended (chapter, section, the correction). Do not edit the GDD chapters.
4. **`CREDITS.md` and `docs/CREDITS-AUDIT.md`**: for every third-party file shipped by the portable build (textures, audio, fonts, libraries): the file or set, the author or source, the licence, where the licence text or the source record is in the repository. `docs/CREDITS-AUDIT.md` lists how each entry was checked (a licence file in the repo, a manifest entry, a header) and every asset whose provenance cannot be shown from the repository — those are named plainly as unverified. Do not fetch anything from the network to "confirm" a licence; the audit is of what the repository itself can show.

## Acceptance criteria
1. Every command in the README was run; the report has the outcome of each.
2. Every control in the manual's tables exists in the bindings file named, with that default; every setting named exists in the schema; every species, preset and rule named matches the New Game screen's data, with `inEffect: false` ones marked.
3. DEVIATIONS covers R1–R28 with none missing; each row's code pointer resolves (file exists, symbol found by grep).
4. Every shipped third-party asset set appears in CREDITS; the audit names the unverified ones.
5. Plain language: short sentences, no marketing words, no claims about feel or quality.

## Machine rules
4 cores shared with other engineers (load average 6–10): no life runs; a build and one short harness run are fine (one headless browser at a time on the machine: check `pgrep -f chrome-headless` first and wait if one is running); `date -u` before a timestamp; no git commands that change the index.
