# src/audio — FOUNDRESS sound (GDD 08 §13)

Web Audio only (no AudioWorklet, no `new Audio(url)`, no fetch: bytes come from the asset loader). Nothing here
can throw into the game: before a user gesture, in `?test=1`, when the browser refuses (`blocked`) or has no Web
Audio (`unsupported`) the system is a silent no-op.

## Layout

| File | What |
|---|---|
| `tuning.ts` | every number (bus dB, distances, occlusion, voice caps, loop crossfade, music timing) |
| `mix.ts`, `spatial.ts`, `listener.ts` | pure maths: slider law, bus gains, inverse distance, surface/underground and line-of-sight occlusion, air absorption, pan |
| `cueTable.ts` | cue id -> sound (files + synth, pitch ranges, slices, caps); every `CUE_IDS` entry, `dig-bite.<material>`, `giant.<kind>`, `ambient.<kind>` |
| `voices.ts` | voice limiter (24, per-cue caps, priorities, steal quietest of the lowest priority) and the crowd meter |
| `ambience/matrix.ts`, `ambience/layers.ts` | the §13.4 matrix as a pure function: habitat groups x time of day x weather x depth -> layer gains, surface filter, grain rates |
| `loopSchedule.ts`, `engine/loopPlayer.ts` | seamless loops: each pass skips 30 ms at both ends and overlaps the next by a 1.5 s equal-power crossfade, so the files' ~5 ms loop dropout and MP3 encoder delay are never heard (no file was re-encoded) |
| `engine/graph.ts` | buses -> ducking -> pause fade -> master -> tab-hidden fade -> limiter (-1 dBFS) -> mono -> out, plus an analyser tap |
| `engine/buffers.ts` | decode cache; effects kept, beds LRU (4 resident); failures marked missing -> synth fallback |
| `engine/cuePlayer.ts`, `engine/shots.ts`, `engine/positionalLoop.ts` | positional voices (gain, low-pass, stereo pan), round-robin files and pitch variation, long giant loops |
| `ambience/player.ts` | layer channels (file loop or synth bed), gain glides, occlusion, granular grains |
| `giants.ts` | human events: warning phase from `human.telegraph`, main sound on `human.start`, thuds on `human.impact`, thunder; ducking |
| `uiSounds.ts`, `uiDelegation.ts`, `alertGate.ts` | UI clicks/hover/toggles (delegated listener: no UI file edits), alert tones with the §6.3 throttles, milestone motif |
| `music/compose.ts`, `music/player.ts` | sparse generative phrases (season modes, 54-66 bpm, 90-360 s gaps, triggers), FM bell / pad / pulse voices |
| `footsteps.ts` | `step` cues derived from the possessed ant's gait and a sample of nearby ants (the sim emits no footfall event) |
| `simAdapter.ts` | reads the sim: listener pose, depth, line of sight (probes re-bound to the current sim every frame), calendar, weather, ants nearby, chamber humidity |
| `zoneBlend.ts` | habitat group shares: area of each zone inside a 32 BU square around the listener (a linear crossfade across a border) |
| `context.ts`, `system.ts`, `gameAudio.ts`, `facade.ts` | gesture-gated context, the game's AudioSystem, browser wiring, `audioUi(id)` / `audioStatus()` / `audioEnable()` |
| `runtime.ts` | all of the above on any BaseAudioContext (live or OfflineAudioContext) |

Game hookup (src/game/Game.ts, 6 calls): `createGameAudio` in the constructor, `attachSim` / `detachSim` at game
start / end, `frame(...)` once per played frame (camera, focus, possessed ant, view, underground, paused, HUD
hidden), `idle(dt)` on every other frame (title, loading, epitaph: the world fades out, UI sounds stay), `dispose`. Debug read-out: `window.__foundressAudio.status() / cueLog() / debug() / enable()`.

## Synthesised sounds (§13.7)

All built from oscillators, noise buffers generated once per context (white, pink, brown), biquad filters and gain
envelopes. Granular sounds use one noise source + one filter + one gain carrying all grain envelopes. Each recipe's
comment in `synth/foley.ts`, `synth/giantsUi.ts` and `synth/beds.ts` states its recipe:

- ant-scale: step click, grain trickle (pellet / frass), mandible click (pick-up / drop), bite click, grapple scuffle,
  acid hiss, trophallaxis ticks, antenna brush, membranous pop (egg / eclosion), alarm shimmer (UI proxy), wood drum
  (Camponotus), stridulation rasp, leaf tearing, prey flutter, creature taps, single-fly buzz, bird wing whoosh +
  pecks, antlion sand spray, flood gurgle, grain slide (collapse / mound slump), wood gnaw, seal tamp, collapse
  rumble, water trickle, garden brush;
- giants: sub thump (80 -> 35 Hz), warning tremor (30-60 Hz rising), engine, reel whirr, broom swish, vacuum, tyre
  roll, car pass, hose hiss, sand thumps, glug, plastic clack, thunder (3-8 s rumbling tail);
- UI: click / hover / switch fallbacks, notice tick (880 + 1760 Hz), warning (660 -> 495 Hz), critical
  (392, 330, 262 Hz, repeated once after 4 s if unacknowledged), milestone motif (season scale), page turn;
- ambience: leaf rustle, low wind, voice-less distant murmur (200-900 Hz noise, slow swells, never formant-shaped),
  underground tone, granular droplets / heat ticks / ice ticks / nest murmur / wood-nest crackle, plus a fallback
  bed for every bed file.

Every file-based cue has a synth fallback (unit-tested), so no single file is required.

## Decisions and open points

- Alerts (§6.3): the 20 real s per-key cooldown holds for every level, critical included; critical is exempt from
  the rate cap only, and an escalation *into* critical may break the cooldown (a danger becoming critical is never
  silent).
- Car (§13.6): the tyre roll under each pass shares the cue key `giant.car` (cap 2: pass + tyre); the warning-phase
  approach roll has its own key `giant.car.approach`, so the pass does not cut it off.
- Mowing: `human.telegraph` carries no variant, so the warning starts on the engine; a reel `human.start` swaps it
  for the reel loop.
- Hidden tab with "Mute when hidden" off: rAF stops, so on hide the runtime schedules ahead past the 5 s suspension.
- Loudness: following the §13.2 bus table and -24 LUFS bed normalisation, calm scenes render at about -40 to -50
  dBFS RMS, well under the "~-23 LUFS calm scene" target of the same section; quiet foley (step, pick-up) is near
  inaudible. Which one gives way is for the GDD owner; nothing is retuned here.
- `bite` plays the crunch layer when strength > 0.5 ("hard prey"); the sim emits every action cue at strength 1,
  so every bite crunches until the action runner passes the target's hardness as strength.
- GDD 08 §13.5 names `soil_dig_01` for `dig-bite`; the manifest has no such file (only `soil_scrape_01/02`), so it
  is not used.

## Checks

- Unit tests: `npx vitest run src/audio` (Node; Web Audio is mocked in `testing/mockAudio.ts`).
- Rendered checks (browser, OfflineAudioContext): `spikes/audio-demo` — see its scripts.
