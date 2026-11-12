# Task save — Persistence: saves, settings and profile (Stage 1A, Sonnet implement / Opus verify)

## Goal
Everything that survives a page reload: save slots and autosaves, export/import of a save as a file or as text, the settings store, and the profile (hints seen, codex unlocks, lineage). All of it must tolerate storage being missing, blocked or full — the game has to run without it.

## Read first
- `docs/03-architecture.md` §7 (persistence) and §8 (packaging constraints: storage may be unavailable or throw; downloads may be blocked, so export needs a copy/paste text fallback).
- GDD 06 (`docs/design/gdd/06-environment-progression.md`): the sections on autosave rules, the lineage system and what persists across games; GDD 08: the Save/Load screen specification and the Settings model. `docs/design/gdd/00-index.md` records the final save-slot scheme (an `auto` ring of 3 labelled generations, `quick`, `slot-1..5`, a hidden opening-start checkpoint) and the single profile store `foundress.profile.v1` — follow it.
- `src/sim/save/**` (`snapshot`, `restore`, `stateHash`, version and migration hook), `src/core/serialize.ts` (encode/decode, gzip, base64 text), `src/ui/api.ts` (`GameFacade` save/load/settings methods — extend additively), `src/game/Game.ts` (autosave hook points).

## You own
`src/game/save/**`, `src/game/settings/**`, `src/game/profile/**`, and a harness script `tests/e2e/save.mjs`. No new dependencies.

## Boundaries
- The Save/Load and Settings screens are another task; you provide the functions and observable state they call.
- Encoding a 2,500-ant state with the core encoder takes about half a second: autosaves must store the live state through IndexedDB's structured clone (typed arrays are stored natively) taken from a cheap deep copy at a tick boundary, not through `encode`. Use `encode` + gzip only for export.

## Deliverables
1. A storage layer with one small interface and two back ends: IndexedDB (database, object stores for saves, metadata and thumbnails) and an in-memory fallback used when IndexedDB is unavailable or throws. Every call is wrapped; failures surface as a status the UI can show, never as exceptions.
2. Save manager: the slot scheme above; metadata per save (label, species, colony age and date, population, play time, real time stamp, generator and save versions, a small thumbnail captured from the canvas when possible); `saveTo(slot)`, `load(slot)`, `delete(slot)`, `list()`, autosave policy per GDD 06 with hook points the game calls; quota handling (drop the oldest autosave generation and retry); protection against saving during a transition.
3. Loading: version check and migration hook, world regeneration from the saved params with fingerprint verification (a mismatch blocks the load with a clear status rather than loading a broken world), and restoration of the simulation.
4. Export / import: `.foundress` files (gzip of the encoded `{ meta, state }`), import through a file input with validation and friendly rejection of corrupt or foreign files, and the text fallback (base64 with a short header and checksum) for hosts that block downloads.
5. Settings store: defaults, validation and clamping, change notifications, persistence in localStorage with try/catch, schema versioning. Covers graphics, audio, controls (bindings object from `src/input`), accessibility and gameplay options named in GDD 08.
6. Profile store (`foundress.profile.v1`): hints seen, codex unlocks, lineage records, with merge-safe updates and reset.

## Acceptance criteria
1. `npm run typecheck` clean; unit tests green against the in-memory back end (slot scheme, autosave ring rotation, quota retry, metadata, migration hook, corrupt import rejection, text fallback round-trip, settings validation, profile merge).
2. Browser test through the harness (`tests/e2e/save.mjs`): start a game, advance, save, reload the page, load — `stateHash()` after loading equals the hash at save time; the same through export -> import; the same through the text fallback.
3. With IndexedDB and localStorage forced to throw (inject a failing back end and a page script that breaks the globals), the game still starts and plays, and the save layer reports `unavailable`.
4. An autosave of a state with 1,500 ants blocks the main thread for under 80 ms on this machine (measure and report; describe the copy strategy).
5. No console errors; no unhandled promise rejections.
