# Task codex-content — Codex, journal and help text (Stage 3, Sonnet implement / Sonnet verify)

## Goal
The words of the game: every codex entry as a short naturalist note grounded in the research, journal lines, alert and hint wording review, the controls reference, and the player manual — calm, precise, honest about what is known and what the game abstracts.

## Read in full
GDD 06 (codex entry list with ids, unlock triggers and two-sentence drafts; milestone journal texts), GDD 08 (tone rules, wording patterns, the player-facing wording rule for rival relations, the no-speech/no-character rule), the fact-checked dossiers `docs/research/bio-*.md` and `docs/research/ecology-habitats.md` including their verification logs (do not state as fact anything a dossier marks as unsupported or estimated; say "is thought to" or leave it out), `docs/02-design-directions.md` §K (the codex must say honestly that real colonies are larger than the game's and that queen directives and brood raiding are gameplay abstractions where applicable).

## You own
`src/content/codex/**` (entries as data keyed by id: title, category, species tags, body of 60-140 words, optional "in the game" line stating the abstraction), `src/content/text/**` (journal lines, alert and hint wording tables if not already owned — coordinate by replacing only text values, never ids), `docs/manual/**` (player manual in Markdown: getting started, controls, views, the colony, the nest, species, settings, troubleshooting), tests.

## Deliverables
1. All codex entries in the design index, written; none left as placeholder.
2. A review pass of all player-facing strings for tone, consistency of terms, and the wording rules.
3. The manual, and an in-game controls reference generated from the bindings table.

## Acceptance criteria
1. A test asserts every codex id in the design index has an entry with a non-empty title and a body within the length bounds, and that no entry contains banned patterns (first-person ant speech, jokes flagged by a small list, the words listed as avoided in GDD 08).
2. A fact-check sample: for 25 entries chosen across species, each factual sentence is traceable to a dossier statement that is not marked unsupported (list the mapping in the report).
3. The manual covers every screen and control and matches the actual default bindings (generated table compared in a test).
