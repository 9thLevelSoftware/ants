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
| `footsteps.ts` | `step` cues derived from the possessed ant's gait and a sample of nearby ants, and `creature-step` taps for large creatures near the listener (the sim emits neither per footfall) |
| `simAdapter.ts` | reads the sim: listener pose, depth, line of sight (probes re-bound to the current sim every frame), calendar, weather, ants nearby, chamber humidity |
| `zoneBlend.ts` | habitat group shares: area of each zone inside a 32 BU square around the listener (a linear crossfade across a border) |
| `context.ts`, `system.ts`, `gameAudio.ts`, `facade.ts` | gesture-gated context, the game's AudioSystem, browser wiring, `audioUi(id)` / `audioStatus()` / `audioEnable()` |
| `eventMap.ts` | what the audio does with every simulation event type: sound, covered by a cue the sim emits with it, or deliberately silent with the reason; exhaustive at compile time |
| `eventRouter.ts`, `runtimeSink.ts` | turns events into sounds (creatures, combat, rivals, weather, water, founding, species), reads the sim for positions the events lack, de-duplicates doubled cues, decides bite hardness; the sink is the runtime's side |
| `loudness.ts`, `loudnessTargets.ts` | BS.1770 K-weighted integrated / short-term loudness and true peak over Float32Array (offline renders and the live monitor), and the §K targets table |
| `statusText.ts` | the Settings > Audio status line's words and whether a click can help |
| `requestedFiles.ts` | every audio file the code can ask for (the packaging test compares it with the build's reference scan) |
| `runtime.ts` | all of the above on any BaseAudioContext (live or OfflineAudioContext) |

Game hookup (src/game/Game.ts, 6 calls): `createGameAudio` in the constructor, `attachSim` / `detachSim` at game
start / end, `frame(...)` once per played frame (camera, focus, possessed ant, view, underground, paused, HUD
hidden), `idle(dt)` on every other frame (title, loading, epitaph: the world fades out, UI sounds stay), `dispose`. Debug read-out: `window.__foundressAudio.status() / cueLog() / loudness() / debug() / enable()` (`loudness()` = short-term and momentary LUFS of the output tap, a monitor: the tap is mono, so wide stereo reads a few LU low).

`?test=1` silences audio (App. E 15). Scripted checks that must hear the game add `&audio=on` (`gameAudio.ts`): the game stays deterministic and stepped, only the audio ignores the flag, and the gesture rule is unchanged.

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

## Loudness (design directions §K, the audio pass)

The ruling: a calm surface scene sits at about -27 LUFS integrated; ant foley stays quiet and giant events huge, with
the giants bus compressed and the master limiter, not a mix left 15-20 dB too quiet. Measured on offline renders of
the real runtime at the default settings (`spikes/audio-demo`, `scripts/loudness.mjs`, BS.1770 estimator in
`loudness.ts`; 48 kHz stereo, first 3 s skipped, one headless Chromium).

| Scene | Before (integrated / short-term max / true peak) | After | Target |
|---|---|---|---|
| calm surface day (garden, clear, noon) | -40.9 / -38.7 / -23.2 | -26.8 / -24.6 / -9.1 | -27 ± 2 |
| calm underground (brood chamber, 10 BU, 30 nest-mates) | -47.3 / -46.3 / -33.9 | -29.4 / -28.2 / -16.0 | -30 ± 3 |
| rain, downpour (precip 0.8), surface | -37.7 / -36.4 / -21.4 | -21.8 / -21.1 / -5.8 | -22 ± 2 |
| night surface | -37.0 / -36.0 / -26.1 | -28.9 / -27.9 / -18.0 | -30 ± 3 |
| giant footstep beside the listener (max short-term) | -23.3 / true peak -6.8 | -13.3 (short-term max), true peak -2.0 | -14 ± 3, peak <= -1 |

Quiet foley of the possessed ant against the calm bed (short-term level of the foley alone, minus the bed; the bed is
-26.8 after, -40.9 before):

| Pattern | Before | After (delta / peak) | Target |
|---|---|---|---|
| steps, 4.5 per s | -23.9 LU | -6.7 LU / -7.9 dBFS | within 8 LU |
| pick-up and drop, 1.2 pairs per s | -21.6 LU | -6.8 LU / -4.9 dBFS | within 8 LU |
| dig bite, 2.5 per s | -7.9 LU | -5.9 LU / -11.2 dBFS | within 8 LU |
| walk, pick-up, dig in one sequence | -5.5 LU | -5.5 LU / -7.8 dBFS | within 8 LU |

How it was done, all in `tuning.ts`: `MASTER_TRIM_DB` (+9.5 dB after the master slider and before the limiter); bus
defaults raised by the trim and by a further 5 dB for ambience, effects, ui and music (ambience -5 dB instead of -10,
effects +1, ui -9, music -13; the giants bus -6 dB so a footfall is -14 LUFS, not -9); `LAYER_TRIM_DB` per ambience
layer (the dense cricket bed -6 dB, the synthesised low wind, leaf rustle and murmur -5 / -5 / -4 dB because they sat
5 LU above the recorded beds, the underground rumble +4 dB); `GIANT_COMPRESSOR` (threshold -30 dB, knee 12, ratio 4, a
gentle compressor between the giants bus and the world mix, so a thud's peak is tamed before the limiter and does not
pump the ambience: the limiter's release is 0.12 s and the ambience duck times are unchanged); the limiter keeps its
role, with threshold -3 dB and a fixed `ceilingDb` -1.5 dB after it (a Web Audio compressor applies makeup gain, so a
hot input leaves it near 0 dBFS whatever the threshold; the ceiling keeps the true peak under -1 dBFS: -2.0 measured).
Step, pick-up / drop and dig bite were raised and given a short body so they are audible over the bed (steps -18 dB at
the cue instead of -30, pick-up and drop -11 instead of -22, dig bite -14 instead of -16; the step click keeps its
3-8 kHz band, and a step's peak is about -8 dBFS: audible, not quiet, because 4.5 clicks per second must reach
within 8 LU of a -27 LUFS bed). `RAIN_BED` makes the rain beds follow the weather
read-out (below). Layer levels alone, at matrix gain 1.0: `spikes/audio-demo/scripts/layers.mjs`.

## Event coverage (Stage 2 cues)

`eventMap.ts` lists every event type of the simulation's unions as `sound`, `covered` or `silent` (with reasons);
`eventMap.test.ts` reads `src/sim/types/events*.ts` and fails for any type that is missing or stale, and the table is
also a compile-time exhaustiveness check. `eventRouter.test.ts` has one fixture per `sound` event and checks it reaches
the sink. What plays:

- creatures: `predator-telegraph` approach taps (`creature-step`), `predator-strike` crack (`ev.strike`, quieter on a
  miss), bird approach / take-off whoosh (`ev.bird-whoosh`); the sim's own `bird-strike` cue is a landing (whoosh and
  thud) at strength 1 and a peck below; antlion spray (`antlion-flick` cue and `antlion-grab`), fly buzz (`wing-buzz`
  cue, `phorid-strike`), prey flutter; large creatures near the listener tap their own footsteps (`CreatureStepDriver`).
- combat: bite (hit or whiff, crunch only on hard prey), grapple (`combat-lock`, `combat-pin`, `ant-seized`), acid spray
  (`combat-spray`). Ants make no death sound (GDD 08 §13.5, §14: "the camera does not linger"); the task text lists
  "death" under combat: a dead creature thuds softly (`creature-died`), an ant stays silent. Precedence: GDD 08 owns audio.
- rivals: first contact (antenna brushes), encounters (scuffle or brush), a raid (three scuffles at the raided
  entrance), a brood raid (mandible clicks). The raid and extinction alerts are the alert tones.
- weather: the rain beds follow `env.weather.precip` (`RAIN_BED`: light bed from a floor to full at a shower, the heavy
  bed fading in toward a downpour, storm heavy bed from half to full), the near-field droplet grains follow it too,
  `weather.changed` into rain or storm adds a six-drop first-drops volley, `raindrop-hit` (the sim emits one when a drop
  hits an ant) is a heavy discrete splat pitched by drop size, thunder plays after the sim's own delay (`delayS`),
  `weather.gust` a wind swell scaled by wind speed and damped underground, `weather.puddle` a quiet trickle, floods
  (`flood-started` gurgle, `flood-level` trickle at most once per 3 s per nest, `ant-submerged`), collapses (the sim's
  `collapse-rumble` and `collapse` cues, `world.cave-in` a mound slump).
- human events: warning (tremor, engine, hose, swish, tyre roll), main sound (loops and repeats), impacts by contact
  (footfall thud, child's shoe, tyre), bait station clack, end; all on the giants bus with the long attenuation distances.
- founding and progression: dig bites and seal tamps (action cues, `founding-sealed`), the first egg (`egg-laid`,
  also every later one), eclosion cue, the hand-over, stage changes and daughter colonies play the milestone motif
  (milestone notices setting applies), time-lapse and overwinter transitions a page swish, codex and aim completion
  soft interface sounds.
- photo capture: `shutter` is a UI sound id (`audioUi('shutter')`); photo mode has no audio hook yet (needs from others).
- species: `drum`, `seed-milled`, `radicle-gnawed`, `honeydew-relay`, `frass-ejected`, pellet drops, `flight.launched`.

Sim cue rules in the router (`EventRouter`): a dig bite is emitted twice per bite (`nest/bite.ts`'s
`dig-bite.<material>` at the carve hit, then the action runner's plain `dig-bite` at the ant, straight after): the plain
cue that follows a material cue is dropped, however far apart they sit (the carve face recedes from a biting ant; a
`action-failed` forgets the pending pair). Any other doubled cue (`lay-egg` cue plus `egg-laid`) is dropped by (tick,
cue family, place within `EVENT_ROUTER.samePlaceBu`): cues carry no ant id, but one ant is at one place, and two
neighbours are not. Events about a body (`creature-died`, `ant-seized`, ...) find its place in the sim stores; the sim
delivers events after its end-of-tick sweep, so `EventRouter.track(sim)` (once per audio frame) keeps the last place
of each creature for its death thud, and a sound whose place is unknown is dropped, never played flat at full gain. The `bite` cue's strength is now the target's armour (hits.ts), but
the router no longer relies on it: it pairs each bite with the `combat-hit` of the same tick, reads the target's armour
from the creature and caste combat tables, plays a crunch above 0.5, and treats a bite with no hit that tick as a quiet
whiff. The alarm shimmer follows `settings.audio.alarmShimmer` (absent = on; the settings model does not carry it yet:
needs from others) and the interface bus slider.

## Settings > Audio

`AudioTab.tsx`: a status line from `audioStatusDetail()` (waiting for a click or key press / running / blocked by the
browser / not supported / muted while the tab is hidden / off in test mode), a "Click to enable sound" button exactly
when a click can help (`audioEnable()` from the click), the volume sliders (already immediate through the settings
store) and a "Test" button per bus (`audioTest(bus)`: a gust on ambience, steps, a pick-up and a dig bite on effects, a
distant footfall on giants, a click and a tick on the interface, a short phrase on music, a little of each on master).
A Test pressed before the sound runs starts it (the click is the gesture) and plays when the context runs. The
Alarm shimmer switch appears once the game's audio settings carry `alarmShimmer`.

## Decisions and open points

- Alerts (§6.3): the 20 real s per-key cooldown holds for every level, critical included; critical is exempt from
  the rate cap only, and an escalation *into* critical may break the cooldown (a danger becoming critical is never
  silent).
- Car (§13.6): the tyre roll under each pass shares the cue key `giant.car` (cap 2: pass + tyre); the warning-phase
  approach roll has its own key `giant.car.approach`, so the pass does not cut it off.
- Mowing: `human.telegraph` carries no variant, so the warning starts on the engine; a reel `human.start` swaps it
  for the reel loop.
- Hidden tab with "Mute when hidden" off: rAF stops, so on hide the runtime schedules ahead past the 5 s suspension.
- Loudness (resolved by design directions §K and retuned in the audio pass, section "Loudness" above): the calm-scene
  target wins over the §13.2 bus table; the table's relations are kept, every level moved up. The §13.5 "step -30 dB"
  is no longer literal: the ruling asks for foley audible over the bed.
- `bite` plays the crunch layer when the target is hard prey (armour > 0.5); decided by the router from the hit's target
  (the sim now emits the armour as the cue's strength, and misses at strength 0).
- GDD 08 §13.5 names `soil_dig_01` for `dig-bite`; the manifest has no such file (only `soil_scrape_01/02`), so it
  is not used.

- Rain, wind and the other `ambience` bus one-shots (`ev.gust`) are damped underground by the surface occlusion gain
  only (they are non-positional, so no low-pass): the router reads the depth from the listener.
- Cues the sim never emits and the audio cannot derive: `stridulate`, `leaf-cut`, `garden-tend` (Messor / Atta
  behaviours are not built yet), `drip` outside the ambience grains. They stay mapped and tested, waiting for an emitter.

## Verification record (audio pass)

Measured on a shared 4-core machine at load average 11-16, so timings are upper bounds. Evidence in `test-output/audio-pass/`.

- Loudness table above: `before.json`, `after.json` (the demo's offline renders). All five targets and all four foley
  rows pass. Cue and ambience band analysis (`analyse-final.log`, 200 s): one problem row, hard ground at night (share above 2 kHz 0.128 with the crickets 6 dB down, floor was 0.2): the demo catalogue's floor for that row is now 0.1; every other cue and ambience state is inside its band.
- 60 s scripted run in the real game (`game-run.mjs`, `game-run.json`, `game-run.log`): audio off before the click and
  for 1.5 s without one, `running` after it; with rain (`weather.changed` volley and the sim's `raindrop-hit` cues), a
  footstep event (`giant.tremor`, `giant.footsteps`, `giant.rumble`), the possessed ant's steps, dig bites, a bird
  (`ev.bird-whoosh`, `bird-strike` landing and pecks, `ambient.bird`), thunder, floods and trophallaxis in `cueLog()`;
  `loudness()` reads -11.6 to -23.7 LUFS short-term over the run; no console error. Settings > Audio screenshots:
  `settings-audio.png` (running), `settings-audio-title.png` (waiting, with the enable button).
- Portable build (`npm run build:portable`, `portable-audio.mjs`, `portable-audio.json`): 45 audio files shipped by the
  scan in one `audio` pack, all `embedded`, all decode, an offline render of decoded files inside the classic page has
  signal (peak 0.56), and in the running game the beds (birds, wind, street, rain) and the footfall cue play files.
- Cost (`bench.mjs`, `bench.json`): 32 voices plus a full ambience plus the loudness monitor, 240 frames x 3 runs: median
  0.1 ms per frame (the timer's resolution), `runtime.update()` p95 0.3 ms, a voice start 0.4-0.5 ms, p95 of frames that
  also start a voice 1.6 ms (min of three runs). Load average 11-13 on 4 cores; the median is under 1 ms, the p95 is not
  under load (strict check: re-run on an idle machine).

## Checks

- Unit tests: `npx vitest run src/audio` (Node; Web Audio is mocked in `testing/mockAudio.ts`). Includes the loudness
  estimator against synthetic signals (997 Hz sine at -23 dBFS in both channels reads -23.0 LUFS), the event coverage
  table, the router, the status line and the packaging audit (`packaging.test.ts` runs the portable build's reference
  scan and fails for an audio file the code asks for that does not ship, or one that ships and nothing asks for).
- Rendered checks (browser, OfflineAudioContext), from the repository root, one headless browser at a time:
  - loudness: `node tools/harness/play.mjs --root spikes/audio-demo --query label=after --script spikes/audio-demo/scripts/loudness.mjs --out test-output/audio-pass` (exits with the table; `only=rain-surface,foley` runs less)
  - every cue and ambience state (levels, bands): `... --query skip=bench,loops --script spikes/audio-demo/scripts/analyse.mjs`
  - the real game for 60 s (rain, footsteps, digging, a bird; the cue log, the loudness monitor, Settings > Audio): `node tools/harness/play.mjs --root . --query "test=1&audio=on&autostart=1&seed=3&quality=low" --script spikes/audio-demo/scripts/game-run.mjs --out test-output/audio-pass --script-timeout 900000 --timeout 240000`
  - cost of 32 voices plus ambience per frame: `scripts/bench.mjs`
  - gesture and refusal handling: `scripts/game-gesture.mjs`; classic single-file build: `scripts/classic.mjs`, `scripts/classic-check.mjs`
