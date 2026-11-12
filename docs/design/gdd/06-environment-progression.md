# FOUNDRESS GDD — Chapter 06: Environment, Time, Progression, Reproduction, Failure

Status: complete draft for engineering and test. Binding sources: `docs/01-design-seed.md`, `docs/02-design-directions.md` (section J identifiers), `docs/03-architecture.md`. Research used: `research/ecology-habitats.md` (final), `research/bio-lasius-niger.md` (final, verified), `research/genre-ux.md` (final), and the founding / seasonal sections of `research/bio-camponotus.md`, `bio-messor.md`, `bio-atta.md` (all with verification logs).

Tier tags: **[T1]** core, **[T2]** full sandbox, **[T3]** breadth and polish. A feature with no tag inherits the tag of its section heading.

## 0. Scope, conventions, tier map

### 0.1 What this chapter owns

| Subsystem | Code home (architecture section 1) | Owns |
|---|---|---|
| Calendar, light, moon | `src/sim/environment/calendar.ts` | tick-to-date, day phases, sunrise/sunset, moon phase |
| Climate, temperature | `src/sim/environment/temperature.ts` | air / surface / soil / micro temperature, ant thermal response tables |
| Weather, moisture | `src/sim/environment/weather.ts`, `moisture.ts` | weather state machine, wind, precipitation, dew, soil moisture, puddles, flood inputs |
| Time control | `src/game/timeControl.ts` (loop) + `sim/environment/timeCommands.ts` | speed, pause, auto-slow, skip-to-event, catch-up policy |
| Opening | `src/sim/progression/opening.ts` | founding script, site assessment, founding model, first-brood time-lapse |
| Overwintering | `src/sim/environment/overwinter.ts` | winter trigger, aggregate model, report |
| Progression | `src/sim/progression/{stages,milestones,journal,history,codex}.ts` | stages, milestones, journal, history graphs, codex |
| Reproduction, lineage, failure | `src/sim/colony/reproduction.ts`, `src/sim/progression/{lineage,epitaph}.ts`, `src/sim/colony/queenDeath.ts` | alates, nuptial flight, lineage, orphaning, game over, epitaph |
| Difficulty, autosave | `src/sim/balance/difficulty.ts`, `src/game/autosave.ts` | presets, custom rules, save triggers |

All numbers in this chapter are NAMED balance constants. They live in `src/sim/balance/environment.ts`, `time.ts`, `opening.ts`, `progression.ts`, `reproduction.ts`, `difficulty.ts` and species data (`SpeciesDef.climate`, `.opening`, `.reproduction`, `.winter`, `.thermal`). No magic numbers in systems.

### 0.2 Conventions

- **Two clocks (from the Lasius dossier, section 0).** Kinematics, digging strokes, pheromone decay and fights run on the *fast clock*: game seconds equal real seconds at 1x. Development, lifespans, consumption per day, seasons run on the *slow clock*: game days (GD). One GD stands for 13.04 real days of biology (365 / 28). Each GD still plays as a full 24 h cycle for light, temperature and human activity. Rates are quoted "per GD" or "per game second" and say which.
- Day-of-year (`doy`) is 1..28; fractional day `d = (doy - 1) + hour/24` is 0-based. The year starts at the spring equinox (mapping: `d = 0` is 20 March; `d = 7` is about 20 June; `d = 14` about 22 September; `d = 21` about 21 December).
- Temperatures in degrees C. Loads (C, P) as in directions section J. `N` = number of living adult worker-caste ants of the colony (simulated workers = displayed workers; directions K: no per-agent weights). Every colony-size threshold in this chapter is in `N` and reachable under the K caps (Lasius 1500, Camponotus 1200, Messor 1500, Atta 1500). Real colonies are larger; the codex says so (`SpeciesDef.wildColonySize`, GDD 07).
- Determinism: every random draw in this chapter uses the named RNG streams `rng.weather`, `rng.opening`, `rng.winter`, `rng.repro`, `rng.events` (sub-streams of the state RNG, seeded from world seed + stream name) so that changing one subsystem does not reshuffle another.
- **T1 degraded mode.** If weather/season systems are not yet built, `environment` provides constants: air 21 C, surface = air, soil 19 C, light 1.0 by day / 0.25 at night, weather `clear`, no seasons (calendar still advances). All consumers use the query interface of section 2.9, so T2 replaces the body only.

### 0.3 New canonical identifiers added by this chapter

Listed in full in the structured return; headline additions: climates `temperate-maritime`, `temperate-continental`, `mediterranean`, `subtropical`; day phases `night`, `dawn`, `morning`, `midday`, `afternoon`, `dusk`; opening phases; stages `founding`, `first-workers`, `growing`, `mature`; death causes; milestone ids (`ms-*`), codex ids (`cx-*`), aim ids (`aim-*`), diagnostic ids (`diag-*`).

---

## 1. Calendar, clock, light [T1 calendar; T2 light and phases]

### 1.1 Constants

| Constant | Value | Unit / note |
|---|---|---|
| `TICK_S` | 0.1 | game seconds per tick |
| `TICKS_PER_HOUR` | 250 | 1 game hour = 25 s at 1x |
| `HOURS_PER_DAY` | 24 | |
| `TICKS_PER_DAY` | 6000 | 1 GD = 600 s at 1x |
| `DAYS_PER_SEASON` | 7 (custom 5 / 7 / 10, directions K; read from `config.rules.seasonLengthDays`, never hard-coded) | section 1.7 |
| `SEASONS_PER_YEAR` | 4 | `spring, summer, autumn, winter` |
| `DAYS_PER_YEAR` | `4 * DAYS_PER_SEASON` = 28 | |
| `REAL_DAYS_PER_GD` | 13.04 | biology conversion only |
| `WEEK_DAYS` | 7 | independent of season length; `weekday = dayIndex mod 7`; 0..4 weekdays, 5 and 6 weekend. A deliberate abstraction (human-activity chapter reads `isWeekend`) |
| `MOON_PERIOD_DAYS` | 2.265 | 29.53 real days / 13.04; new moon at phase 0 |

Environment sub-schedules (ticks): `ENV_FAST_EVERY = 25` (air/surface/Tb tables, 2.5 s), `ENV_MOISTURE_EVERY = 50` (5 s), `ENV_HOURLY_EVERY = 250` (weather dwell check, dew, hourly history), `ENV_DAILY_EVERY = 6000` (daily anomaly, week flags, daily history sample).

### 1.2 Date state and display

`CalendarState = { tick: int, startTick: int }` plus derived values (computed, cached per tick):

| Derived | Formula |
|---|---|
| `dayIndex` | `floor(tick / 6000)` (0-based, whole game) |
| `year` | `floor(dayIndex / DAYS_PER_YEAR) + 1` |
| `doy` | `dayIndex mod DAYS_PER_YEAR + 1` |
| `season` | `floor((doy - 1) / DAYS_PER_SEASON)` (0 spring .. 3 winter) |
| `dayOfSeason` | `(doy - 1) mod DAYS_PER_SEASON + 1` |
| `hour` | `(tick mod 6000) / 250` (float 0..24) |
| `d` | `(doy - 1) + hour / 24` |
| `yearFrac` | `d / DAYS_PER_YEAR` |
| `colonyAgeDays` | `(tick - foundingTick) / 6000` (`foundingTick` = tick of first egg of the first clutch) |

HUD and journal date strings follow GDD 08 (`Summer · Day 3 · Year 1`, with `Day n` = `dayOfSeason`, plus the 24 h clock in the HUD). The calendar never wraps or overflows: `tick` is a safe integer (2^53 ticks = 4.5e8 years).

### 1.3 Day length, sunrise, sunset, phases

Day length (hours) `L(d) = 12 + 4 sin(2 pi d / DAYS_PER_YEAR)`: 12 h at the equinoxes, 16 h at `d = 7`, 8 h at `d = 21`. `SR = 12 - L/2`, `SS = 12 + L/2` (solar noon fixed at 12:00). Examples: midsummer `d = 10.5`: L = 14.8 h, SR 04:35, SS 19:25. Midwinter `d = 24.5`: L = 9.2 h, SR 07:25, SS 16:35. (The same `L` formula is used by all climates; latitude differences are not modelled. Deviation D1.)

| Phase | Starts | Ends | Notes |
|---|---|---|---|
| `night` | `SS + 1` | `SR - 1` (next day) | darkest |
| `dawn` | `SR - 1` | `SR + 1` | twilight and low sun |
| `morning` | `SR + 1` | 11:00 | |
| `midday` | 11:00 | 14:00 | sun highest |
| `afternoon` | 14:00 | `SS - 1` | |
| `dusk` | `SS - 1` | `SS + 1` | |

Always valid because `L` stays within 8..16 (`SR + 1 <= 9 < 11`, `SS - 1 >= 15 > 14`).

### 1.4 Light and moon

| Quantity | Definition |
|---|---|
| `sunElev` | `max(0, sin(pi (hour - SR) / L))` for `SR <= hour <= SS`, else 0 |
| `peakSolar(d)` | `0.25 + 0.75 (L - 8) / 8` (0.25 midwinter, 1.0 midsummer): seasonal sun height |
| `insolation` | `sunElev * peakSolar(d) * sunMult(weather)` (0..1). Drives surface heating and evaporation |
| `daylight` | `smoothstep(SR-1, SR+1, hour) * (1 - smoothstep(SS-1, SS+1, hour))` ambient brightness before cloud |
| `moonPhase` | `frac(tick / (MOON_PERIOD_DAYS * 6000) + moonPhase0)`; `moonPhase0` from seed; 0 = new moon |
| `moonIllum` | `0.5 (1 - cos(2 pi moonPhase))` |
| `light` | `max(daylight * cloudAtten(weather), moonlight)`, `moonlight = (0.04 + 0.06 moonIllum) * (1 - 0.6 cloud)` |
| `cloudAtten` | per weather state, table 3.5 (0.35 for overcast, etc.) |

`light` feeds rendering (sky, exposure), ant light preference (2.6) and the nuptial-flight gates. `moonless` (Atta flights) = `moonIllum < 0.25` and `cloud < 0.5`.

### 1.5 Day/night implications for ant activity [T2; per-species rows T3]

Light does not change walking speed. It changes *willingness to leave the nest*: `lightPref(species, phase)` multiplies forager activation (2.6):

| Phase | `lasius-niger` | `camponotus-pennsylvanicus` | `messor-barbarus` | `atta-texana` |
|---|---|---|---|---|
| night | 0.35 | 1.0 | 0.6 (summer 1.0) | 1.0 |
| dawn | 0.8 | 0.8 | 1.0 | 0.7 |
| morning | 1.0 | 0.35 | 0.9 | 0.6 |
| midday | 1.0 | 0.2 | 0.7 | 0.5 |
| afternoon | 1.0 | 0.3 | 0.9 | 0.6 |
| dusk | 0.8 | 1.0 | 1.0 | 1.0 |

Sources: Lasius active by day with summer night activity [dossier 7, MEM]; carpenter ants forage mostly at night, peak about 20:00-04:00 [Camponotus 12]; Messor summer peaks at dusk, night and dawn [Messor 12]; Atta emerges at dusk once air temperature falls below 30 C [ecology 4.2]. Dawn/dusk foraging in hot summers emerges from this table combined with the heat gate (2.6), not from a script.

### 1.6 Starting dates and start conditions per species [T1 Lasius; T3 others]

By default a new game starts on the species' natural founding day: the seed picks the exact day inside the window below. Custom rule `startSeason` (directions K: spring, summer or autumn, never winter) overrides it: the game then starts on `dayOfSeason` 3 of that season at the species start hour and the forced start conditions are rolled for that day. A Lineage daughter (section 12) starts at the same `doy` as her flight.

| Species | Climate (2.1) | Window `doy` | Default `doy` (season day) | Start hour | Forced start conditions |
|---|---|---|---|---|---|
| `lasius-niger` | `temperate-maritime` | 8..12 | 10 (Summer 3) | 14:00-16:00 | weather `clear` or `overcast`, no rain in prior 0.5 GD, wind2m < 4, air 18-26 C |
| `camponotus-pennsylvanicus` | `temperate-continental` | 2..9 | 5 (Spring 5) | 17:00-19:00 | weather `clear`/`overcast`, air >= 13 C, wind2m < 4 |
| `messor-barbarus` | `mediterranean` | 15..19 | 17 (Autumn 3) | 14:00-16:00 | a rain event of >= 7 h ended 3.6-12 h before start (`lastRainEndTick`), topsoil `theta0 >= 0.45`, weather `clear`, wind2m < 3 |
| `atta-texana` | `subtropical` | 2..8 | 5 (Spring 5) | 21:00-23:00 | cumulative rain in prior 1 GD >= 6.35 mm, `moonless`, weather `clear`, air 20-27 C |

Windows follow the research: Lasius flights fall at `gd` 9-12.5 [Lasius 12.2]; Camponotus flights `gd` 1-9, peak 4-6 [Camponotus 12]; Messor flights `gd` 15-19.7 after a rain front [Messor 12.2]; Atta flights April-June after more than 6.35 mm of rain, on clear moonless nights [Atta 12.2]; the Atta dossier counted from 1 March, so on this equinox calendar April-June is `doy` 1-8 and the window is `doy` 2-8 (consistency pass, GDD 07 risk R3; Messor's `doy` 15-19 already places its flights between late September and mid November, peak October, and is kept). The environment is pre-rolled at setup so the forced conditions hold: weather history (`lastRainEndTick`, `cumRain24h`), soil moisture and moon phase are initialised to satisfy them; temperature then follows the normal model.

### 1.7 Custom season length [T3]

`seasonLengthDays` in {5, 7 (default), 10} (directions K). All `doy`-based thresholds in this chapter are written for the standard 7-day season and are **scaled by `seasonLengthDays / 7`** (`doy_scaled = (doy - 1) * 7 / seasonLengthDays + 1` when comparing). Biological durations (development, lifespans, brood stages, upkeep) are in GD and are **not** scaled: longer seasons therefore give more brood cycles per season (easier), shorter ones fewer (harder). The moon period (`MOON_PERIOD_DAYS` 2.265 GD), weekdays (always 7 days; game day 1 of year 1 is weekday 0) and the 24 h day are unchanged.

---

## 2. Climate and temperature [T2; T1 stub per 0.2]

### 2.1 Climate profiles

Each species names a `climateId`. A `ClimateDef` is data.

| Field | `temperate-maritime` (Lasius) | `temperate-continental` (Camponotus) | `mediterranean` (Messor) | `subtropical` (Atta) |
|---|---|---|---|---|
| `Tann` annual mean air (C) | 12.0 | 11.5 | 17.5 | 19.5 |
| `Aseas` seasonal half-range (C) | 8.5 | 12.5 | 7.5 | 9.5 |
| Peak / trough of seasonal mean | 20.5 / 3.5 | 24.0 / -1.0 | 25.0 / 10.0 | 29.0 / 10.0 |
| `Ad` diurnal half-range by season (spring, summer, autumn, winter) | 5, 6, 4, 2.5 | 6, 7, 5, 3.5 | 6, 8, 5, 4 | 6, 7, 6, 5 |
| `rainMult` / `stormMult` / `heatMult` / `frostMult` (weights, 3.2) | 1 / 1 / 1 / 1 | 1.1 / 1.2 / 0.9 / 1.2 | 0.5 / 0.8 / 1.5 / 0.15 | 0.9 / 1.5 / 1.3 / 0.15 |
| `heatOffsetC` (heat-wave air offset) | +6 | +6 | +5 | +4 |
| `frostSeasonalMaxC` (frost may start only while seasonal mean is below) | 9.5 | 9.5 | 11.0 | 11.0 |
| `heatSeasonalMinC` | 17.0 | 19.0 | 21.0 | 24.0 |
| `windBase` factor | 1.0 | 0.9 | 0.9 | 1.0 |
| `humidityBase` (RH, 0..1) | 0.75 | 0.7 | 0.5 | 0.7 |

Seasonal mean: `Tseason(d) = Tann + Aseas cos(2 pi (d - 9.5) / DAYS_PER_YEAR)`. The peak sits at `d = 9.5` (about 22 July) because temperature lags insolation. Anchors: Lasius sites Jan 3.5 / Jul 20.5 (UK-like); Texas Jan 10 / Jul 29; Iberian Jan 10 / Jul 25 [ecology 5]. Values are tunable `[E]`.

### 2.2 Air temperature

```
Tair(t) = Tseason(d) + Ad(season) * dm(weather) * shape(hour) + anomaly(day) + Woff(t)
```

- `shape(hour)`: trough at sunrise, peak at 14:30. For `hour` in `[SR, 14.5]`: `-cos(pi (hour - SR) / (14.5 - SR))`. For `hour` in `[14.5, SR + 24]` (wrap `hour < SR` by +24): `cos(pi (hour - 14.5) / (SR + 24 - 14.5))`. Range -1..+1, continuous at both joins.
- `dm(weather)` diurnal multiplier: clear 1.2, overcast 0.6, rain 0.5, storm 0.5, heat 1.1, frost 1.3.
- `anomaly(day)`: drawn at each local midnight, AR(1): `a_n = 0.7 a_{n-1} + N(0, 1.2)` (stationary sd 1.7 C), clamped to +-5.
- `Woff(t)`: weather offset, relaxed toward the target with `tau_w = 4 h`: clear 0, overcast -1.0, rain -2.5, storm -3.5, heat `+heatOffsetC * difficulty.heatOffsetMult`, frost -5.0 (night target), -2.5 while a cold snap persists by day.
- Check (maritime, clear, `d = 10.5`, anomaly 0): `Tseason = 20.29`, `Ad = 6`, peak at 14:30 = 20.29 + 6 * 1.2 = 27.5 C; trough at 04:36 = 13.1 C.

Output also: `Tair_day_max`, `Tair_day_min` (rolling previous 24 h) for flight prior-day trend and the history graph.

### 2.3 Surface temperature by material and shade

For each `(material, shaded)` pair a lagged state `Tsurf[m][s]` is updated every `ENV_FAST_EVERY` ticks:

```
target = Tair + G[m] * insolation * (shaded ? SHADE_SUN_RESIDUAL : 1) - Nloss[m] * clearNight
Tsurf += (target - Tsurf) * (1 - exp(-dt / tau[m]))
```

`SHADE_SUN_RESIDUAL = 0.12`. `clearNight` = 1 if `light < 0.15` and weather in {clear, frost}, 0.4 if overcast, else 0. Per-position shade comes from the world (`world.shadeAt(p, sunDir)`, cached per 16 BU cell, refreshed every 50 ticks); positions under objects use `shaded = true`; under a stone or slab the micro temperature is the soil model (2.4), not `Tsurf`.

| Material (ids from J) | `G` sun gain at insolation 1 (C) | `Nloss` clear-night loss (C) | `tau` (game hours) | Basis |
|---|---|---|---|---|
| `asphalt` | 22 | 1.5 | 0.8 | > 50 C in summer sun [ecology 4.2]: normal clear midsummer noon about 45, heat wave about 52 |
| `concrete`, `tile`, `brick`, `stone` | 14 (`stone`, `brick` 15; `tile` 12) | 2 | 1.2 (`stone` 1.5) | paper: concrete up to 45 C sunlit [S32]; informal 57 not used |
| `gravel` | 16 | 2 | 0.9 | |
| `loam`, `humus`, `clay` (bare soil surface) | 18 | 3 | 0.7 | 40-55 C bare dark soil surface; drops below 20 mm [ecology 4.2] |
| `sand` | 20 | 3 | 0.5 | |
| `leaf`, `plant`, `bark` (litter, leaves) | 3 | 3 | 0.15 | woodland litter about air -1..+3 |
| lawn (zone `lawn` / `garden-bed` grass) | 6 | 4 | 0.25 | air +5..10 in full sun |
| `wood-sound`, `wood-decayed` | 10 | 2 | 0.6 | |
| `metal` | 28 | 4 | 0.3 | painted slides 50-70 C |
| `plastic`, `rubber` | 24 | 3 | 0.4 | rubber mats hot |
| `glass`, `ceramic`, `fabric`, `paper` (small objects) | 10 | 2 | 0.3 | |
| `interior` zone floors | none | none | none | `Tint` (2.5) |

Check (clear, `d = 10.5`, 12:00, no anomaly, lag ignored): `Tair = 25.3`, `insolation = 0.890`: asphalt `25.3 + 22 * 0.890 = 44.9`; concrete 37.8; shaded asphalt 27.7. Heat wave at 13:00 (`Tair` 32.2, `insolation` 0.915 including `sunMult 1.05`): asphalt 52.3. The lagged value trails the target by about `tau` hours and peaks around 13:30.

### 2.4 Soil temperature by depth [T2]

Depth `z` is in mm (`zmm = depthBU * BU_mm`), so larger species at equal BU depth have steadier chambers.

```
Tsoil(z, t) = Tann + SOIL_MEAN_OFFSET
            + Aseas * exp(-z / DA) * cos(2 pi (d - 9.5)/Y - z / DA)
            + Adsoil(season) * exp(-z / DD) * cos(2 pi (hour - 14.5)/24 - z / DD) * coverAmp
            + Wsoil(t) * exp(-z / DW) + coverMean
```

| Constant | Value | Meaning |
|---|---|---|
| `SOIL_MEAN_OFFSET` | +1.0 C | soil mean slightly above air mean |
| `DA` | 2000 mm | annual damping depth (also phase lag `z/DA` rad) |
| `DD` | 100 mm | diurnal damping depth (lag `z/DD` rad = 3.8 h per 100 mm) |
| `Adsoil(season)` | `1.3 * Ad(season) * dm(weather)` | bare-soil diurnal amplitude |
| `DW` | 300 mm | penetration of weather anomalies |
| `Wsoil` | EMA of `(Woff + anomaly)` with time constant 1.5 GD | cold snaps and heat waves soak in |
| `coverAmp`, `coverMean` | bare 1.0 / 0; grass 0.6 / 0; litter or moss 0.5 / 0; under stone, slab, log, bark slab 0.45 / +1.2 C; asphalt-covered 0.5 / +2.0 C (sub-base) | thermal bonus of stones and paving [ecology 1.1, 1.2] |

Soil examples (maritime): January mean, 100 mm: about 5.0 C (+-1.2 diurnal), 400 mm: 6.0 C; the 2 m layer barely moves. A 2-GD frost (`Woff = -5`) lowers 100 mm by about 2.4 C. Founding chambers (45-60 mm deep) track the diurnal swing, hence the warmth score of site assessment (5.7).

### 2.5 Chamber, interior and micro temperature

`chamberTemp(chamberId) = Tsoil(zmm of chamber centre, cover class above the chamber's entrance footprint)`; chambers in buildings or wood use the rules below. Nest chapter reads this each 250 ticks for brood development, humidity and diagnostics.

| Place | Temperature |
|---|---|
| Soil chamber / tunnel | `Tsoil` (above) |
| Wood cavity (carpenter nests) | `0.7 * Tsoil(z_equiv = 150 mm) + 0.3 * Tair` smoothed over 3 h; wood in a heated building uses `Tint` |
| Building interior floors and walls (`interior` zone, heated) | `Tint = 0.25 * Tair + 0.75 * SET(season)`, `SET` = 20 (spring, autumn, winter), 23 (summer); unheated utility parts `0.6 * Tair + 8` |
| Surface walking ant (micro) | `Tmicro = 0.6 * Tsurf[m][shaded] + 0.4 * Tair` |
| Ant on plant stem / leaf above ground | `Tair + 0.2 * (Tsurf[plant][s] - Tair)` |
| Ant underground | `Tsoil(depth)` at its position |
| Under cover (stone, bark, litter) | soil model with the matching `coverAmp` |

### 2.6 Ant thermal response [T1 speed curve for Lasius; T2 gates; T3 other species]

**Body temperature.** Each ant stores `Tb`. Every tick: `Tb += (Tmicro - Tb) * (1 - exp(-0.1 / TB_TAU_S))`, `TB_TAU_S = 6` game seconds (1 mg body equilibrates within seconds). `Tb` initial = `Tmicro` at spawn.

**Speed multiplier** `speedMult(Tb)`: piecewise linear on the table, then shifted by the species `thermalShiftC` (add the shift to every temperature key, i.e. use `speedMult(Tb - shift)`).

| `Tb` (C, Lasius curve) | 5 | 10 | 15 | 20 | 22-28 | 30 | 35 | 40 |
|---|---|---|---|---|---|---|---|---|
| multiplier | 0 | 0.25 | 0.55 | 0.9 | 1.0 | 1.1 | 0.9 | 0 |

Lasius dossier 12.2 (`[EST]`, Q10 about 2). 6 BU/s cruise at 1.0. Cruise speed, loaded penalties and sprint belong to the locomotion chapter; this multiplier applies to them all.

**Species thermal profile (`SpeciesDef.thermal`).**

| Field | `lasius-niger` | `camponotus-pennsylvanicus` | `messor-barbarus` | `atta-texana` | Basis |
|---|---|---|---|---|---|
| `thermalShiftC` (speed curve) | 0 | -2 | +6 | +2 | nocturnal cold-tolerant / thermophilic harvester |
| `forageGate` air trapezoid (0 at a, 1 at b..c, 0 at d) | 8 / 18 / 30 / 38 | 5 / 13 / 26 / 33 | 8 / 20 / 35 / 42 | 7 / 20 / 25 / 28 | Lasius active about 8-38 C, peak 18-30 [EST]; carpenter ants stop below about 5 C [Camponotus 12]; Messor 0 at <= 8, 1 at 20-35, 0 at >= 42 [Messor 12.2]; Atta active 7-27 C, no surface foraging above 27 C [Atta 12.2] |
| `stressC` (heat load starts) | 35 | 36 | 40 | 38 | Lasius default stress 35 [ecology 4.2]; heat-tolerant species +4..6 |
| `shadeSeekC` (AI seeks shade or retreats) | 33 | 34 | 38 | 36 | `Tmicro` threshold |
| `chillC` (chill coma, immobile) | 4 | 2 | 6 | 5 | |
| `freezeC` (cold damage starts) | -2 | -4 | -1 | -1 | |

**Surface activity index** (consumed by the foraging chapter as the multiplier on forager activation and displayed in the Why view):

```
surfaceActivity = forageGate(Tair) * lightPref(species, phase) * fW(weather) * (1 - heatStress)
```

`fW` is table 3.5; `heatStress` = fraction of the colony's trail cells whose `Tmicro >= shadeSeekC` (0..1). For the individual ant, the AI additionally refuses to enter a cell with `Tmicro >= shadeSeekC` unless fleeing or carrying (then it hurries: speed unaffected, heat load accrues).

### 2.7 Lethal heat and cold [T2]

Each ant carries `heatLoad` (0..1) and `coldLoad` (0..1).

| Rule | Definition |
|---|---|
| Heat dose | while `Tb > stressC`: `heatLoad += (Tb - stressC) / HEAT_DOSE_K * dt`, `HEAT_DOSE_K = 6000` C*s. At 50 C ground contact: `15 / 6000` per s, death in 400 s (about 6.7 min), inside the 5-10 min the research gives for 50 C [ecology 4.2]. |
| Heat recovery | while `Tb <= stressC`: `heatLoad -= dt / 600` (10 min) |
| Heat stupor | `heatLoad >= 0.5` or `Tb >= stressC + 5`: state `heat-stupor`: speed x0.2, no task changes except `flee` to shade; recovers when `heatLoad < 0.3` |
| Heat death | `heatLoad >= 1.0`: death, cause `heat` |
| Cold dose | while `Tb < freezeC`: `coldLoad += (freezeC - Tb) / COLD_DOSE_K * dt`, `COLD_DOSE_K = 3600` C*s (death in 20 min at 3 C below) |
| Cold recovery | while `Tb >= freezeC`: `coldLoad -= dt / 900` |
| Chill coma | `Tb < chillC`: speed 0, tasks suspended, no damage until `freezeC`. Foragers recall home when `Tair < forageGate.a + 2` |
| Cold death | `coldLoad >= 1.0`: cause `cold` |
| Acclimation [T3] | `heatAccl` (colony, -1.5..+2 C) relaxes with tau 0.6 GD toward `0.2 * (mean Tair_day_max over previous 1 GD - 22)`; added to `stressC` (research: acclimation within 7-10 real days, i.e. under one GD) |
| Difficulty | `stressC += diff.heatToleranceOffsetC` |

Founding queens use the same model; the queen's `desiccationLoad` is separate (5.5). Brood and eggs inside the nest are protected by chamber temperature only (development stalls at <= 10 C and, above 36 C, brood chapter applies heat mortality).

### 2.8 Heat-seeking behaviour and the readable result

At midday in a heat wave the asphalt route shows `Tmicro` about 45 C, `speedMult` 0 at `Tb >= 40`: the route is effectively closed and `surfaceActivity` drops, so foraging shifts to dawn and dusk (emergent). Diagnostics 3.13 explain it.

### 2.9 Query interface (cross-chapter contract)

`environment.query` (pure, read-only): `airTemp()`, `surfaceTemp(material, shaded)`, `microTemp(pos, material, shaded)`, `soilTemp(zmm, coverClass)`, `chamberTemp(id)`, `interiorTemp(zoneId)`, `light()`, `phase()`, `insolation()`, `weather()`, `windAt(pos)`, `moisture(cell, layer)`, `puddleDepthMm(cell)`, `rainRateMmH()`, `surfaceActivity(speciesId)`, `speedMult(speciesId, Tb)`, `forageGate(speciesId, Tair)`.

---

## 3. Weather and moisture [T2]

### 3.1 States

States are the canonical `clear`, `overcast`, `rain`, `storm`, `heat`, `frost`.

| State | Meaning | Cloud (0..1) | `sunMult` | `cloudAtten` | RH delta | `fW` surface activity |
|---|---|---|---|---|---|---|
| `clear` | open sky | 0.1 | 1.0 | 1.0 | 0 | 1.0 |
| `overcast` | grey sky, no precipitation | 0.9 | 0.35 | 0.55 | +0.2 | 0.95 |
| `rain` | drizzle, shower or downpour (intensity class, 3.3) | 1.0 | 0.2 | 0.4 | +0.35 | drizzle 0.4, shower 0.1, downpour 0.0 |
| `storm` | thunderstorm: downpour, gusts, thunder | 1.0 | 0.12 | 0.3 | +0.3 | 0.0 |
| `heat` | heat wave: clear, still, hot | 0.05 | 1.05 | 1.0 | -0.25 | 0.6 (further cut by `forageGate`) |
| `frost` | clear cold night with air frost; thaw by mid-morning | 0.1 | 1.0 | 1.0 | +0.1 | 0.15 |

Weather state is global to the map (one sky). Local differences come from shade, cover and zone (3.9).

### 3.2 State machine

A semi-Markov process stepped at `ENV_HOURLY_EVERY`. State record: `{ state, startTick, dwellEndTick, intensityClass, peakPrecip }`.

| State | Entry condition | Behaviour | Exit |
|---|---|---|---|
| any | drawn by transition (below) and not blocked by guards | `Woff` target and effects of table 3.5 apply; `precip` follows a bell (peak at 35 % of dwell) for `rain`/`storm` | `tick >= dwellEndTick`: draw next state |
| `heat` | `season == summer` (or climate allows in spring/autumn at weight x0.3), from `clear` only, `Tseason >= heatSeasonalMinC`, no `dryspell` blocking | ramps `Woff` over 8 h | dwell end, or `season` changed + 12 h (hard stop), or storm break |
| `frost` | from `clear`/`overcast`, `hour` in `[SS, SR - 2]`, `Tseason <= frostSeasonalMaxC` | air frost; dew becomes rime | no earlier than `SR + 3 h`; at that check, in `winter` with prob `P_COLDSNAP_PERSIST = 0.55` (max 4 extensions) it persists another 24 h (`cold snap`) |
| `storm` | from `rain`, `overcast`, `heat` | thunder, gusts, hail-free downpour | dwell end |

**Dwell (game hours):** `dwell = min + Exp(mean - min)`, capped at `3 * mean` (`heat` 96). Table `(min, mean)`:

| Season | clear | overcast | rain | storm | heat | frost |
|---|---|---|---|---|---|---|
| spring | 4, 14 | 4, 11 | 1.5, 5 | 1.5, 3 | 24, 40 | 8, 12 |
| summer | 4, 16 | 4, 9 | 1.5, 4 | 1.5, 3 | 24, 54 | 8, 12 |
| autumn | 4, 12 | 4, 13 | 1.5, 6 | 1.5, 3 | 24, 40 | 8, 12 |
| winter | 4, 12 | 4, 14 | 1.5, 6 | 1.5, 3 | 24, 40 | 10, 28 |

Intensity class (drawn at rain onset): drizzle dwell x1.5, shower x1.0, downpour x0.6.

**Transition weights** (rows = current state; self excluded; weights are normalised after multiplication by `climate.*Mult * difficulty.*Mult` for the destination, and by 0.15 for `rain` and `storm` during a `dryspell`). Tuned by a 300-year Monte Carlo of this machine (maritime): spring clear 36 %, overcast 42 %, rain 14 %, frost 7 %; summer clear 40 %, overcast 25 %, rain 8 %, storm 2 %, heat 25 %; autumn rain 17 %; winter frost 21 %. Events per season: rain 3-5, storm 1.2 in summer, heat wave 1.0 per summer, frost 1.5 per winter (research: rain 1 per 3-4 GD, one thunderstorm and one heat wave per summer, 1-2 cold snaps per winter [ecology 7.2]).

| Season, from | to `clear` | `overcast` | `rain` | `storm` | `heat` | `frost` |
|---|---|---|---|---|---|---|
| spring `clear` | - | .55 | .28 | .02 | 0 | .15 |
| spring `overcast` | .40 | - | .54 | .02 | 0 | .04 |
| spring `rain` | .30 | .64 | - | .06 | 0 | 0 |
| spring `storm` | .30 | .40 | .30 | - | 0 | 0 |
| spring `heat` / `frost` | .50 / .50 | .30 / .50 | .10 / 0 | .10 / 0 | - / 0 | 0 / - |
| summer `clear` | - | .50 | .20 | .03 | .27 | 0 |
| summer `overcast` | .50 | - | .40 | .10 | 0 | 0 |
| summer `rain` | .40 | .50 | - | .10 | 0 | 0 |
| summer `storm` | .40 | .35 | .25 | - | 0 | 0 |
| summer `heat` | .30 | .25 | .05 | .40 | - | 0 |
| autumn `clear` | - | .55 | .27 | .01 | 0 | .17 |
| autumn `overcast` | .30 | - | .62 | .02 | 0 | .06 |
| autumn `rain` | .22 | .74 | - | .04 | 0 | 0 |
| autumn `storm` | .30 | .40 | .30 | - | 0 | 0 |
| autumn `frost` | .45 | .55 | 0 | 0 | 0 | - |
| winter `clear` | - | .40 | .16 | .01 | 0 | .43 |
| winter `overcast` | .32 | - | .42 | .01 | 0 | .25 |
| winter `rain` | .15 | .78 | - | .02 | 0 | .05 |
| winter `storm` | .20 | .50 | .30 | - | 0 | 0 |
| winter `frost` | .35 | .65 | 0 | 0 | 0 | - |

(States that cannot occur in a season are not listed. If `heat` or `frost` is still current when a season changes, the next draw uses the spring row of that state; `heat` is hard-stopped 12 h after the season changes.) Rejected draws (guards of the table above) are redrawn up to 50 times; then the state stays `overcast`.

**Dry spell [T2].** At each summer start, `P_DRYSPELL = 0.5` (difficulty-scaled) that one dry spell of `3 GD` starts at a uniform time in the season: `rain` and `storm` weights x0.15, `heat` weight x1.5; `topsoil` moisture falls, flagging "drought" in diagnostics.

### 3.3 Precipitation parameters

| Class | `rainRateMmH` | Drop diameter | Hit rate per exposed ant (per game second) | Effect on an exposed ant | Source |
|---|---|---|---|---|---|
| drizzle | 1 | 0.5 mm | 0 | wetting only, no harm | drops < 0.5 mm [ecology 4.1] |
| shower | 5 | 2.5 mm (about 4x worker mass) | `RAIN_HIT_SHOWER = 0.02` | knocked off a vertical surface (falls), stunned 1.5 s | 2-3 mm drops, 4 mg each |
| downpour | 18 | 4.5 mm (about 34-65 mg) | `RAIN_HIT_DOWNPOUR = 0.15` | stunned 3 s, health -0.05, falls from climbs | drops 4-5 mm [ecology 4.1] |
| storm | 30 | 4.5 mm | 0.25 | as downpour | |

"Exposed" = no overhead cover within 3 BU (leaf, stone, slab, grass canopy over 8 BU tall count as cover) and above ground. Underground, under stones and in tunnels the hit rate is 0. Hits are sampled per ant per 5 ticks. `rainHitMult` from difficulty scales the rate. Splashes (visual) and impact decals use `rainRateMmH`.

### 3.4 Wind

```
wind2m = max(0.2, windBase * climate.windBase * diurnal(hour) * stateWind + OU)
```

`stateWind` (m/s at 2 m): clear 2.0, overcast 3.0, rain 3.5, storm 8.5, heat 1.5, frost 1.2.

`diurnal(hour)`: 0.65 from 21:00 to 05:00, 1.3 from 12:00 to 17:00, else 1.0 (linear blends). `OU`: Ornstein-Uhlenbeck noise, sd 0.8 m/s, correlation time 1 h. **Gusts:** Poisson rate `0.012` per game hour in non-storm states (about 2 per season), `0.5` per game hour in `storm`; a gust multiplies `wind2m` by 2.2 for 30 game seconds and emits `weather.gust`. `windDir` rotates slowly (random walk 15 degrees per game hour, shifts 90 degrees at storm onset). Ground-level wind `windGround = WIND_GROUND_FACTOR (0.2) * wind2m` (x0.5 inside grass canopy, 0 indoors/underground). Effects: ants on stems or blade tips (height >= 8 BU) are blown off with probability `0.02 * (windGround - 1.2)` per game second above `STEM_TOPPLE_WIND_GROUND = 1.2` m/s (reached in storms and gusts); light food items drift; volatile pheromone decay multiplier `1 + windGround / 3` (alarm, trail); alates cannot fly at `wind2m >= 6.3`.

### 3.5 Effects of each state

| State | Activity | Trails (3.7) | Flooding (3.10) | Dew / puddles | Visibility and light | Sound |
|---|---|---|---|---|---|---|
| `clear` | full; hot surfaces gate by temperature | `trail` x1 (sun x0.5 on exposed soil per pheromone chapter) | none | dew possible on clear nights | haze 1.0, sun full | birdsong dawn, insect hum by day |
| `overcast` | 0.95; best for long foraging in summer | x1 | none | slow dew evaporation (8 h) | flat light, haze 0.85 | wind bed |
| `rain` | by class (table 3.1) | washing by class (3.7) | `rainRateMmH` runoff | puddles form; dew absent | haze 0.6 (drizzle) .. 0.5, drops, wet surfaces, specular | rain loop scaled by `precip`; patter on leaf |
| `storm` | 0 (all foragers recalled) | washing x3 | maximum | puddles, standing water | haze 0.4, very dark, flashes limited (3.11) | thunder with delay, gust howl |
| `heat` | gate by `forageGate`, `fW` 0.6 | decay x1.5 on hot surfaces | none; drought flag | dew none; puddles dry in 0.3 GD | shimmer (reduced-motion: off), haze 0.8 | cicada-like drone only if species/habitat tagged; otherwise silence |
| `frost` | 0.15 (thaw by `SR + 3 h`) | `trail` x2 lifetime (cold) | none | rime on blades and slabs, slippery x0.8 friction | clear cold light, mist chance | muffled, wind low |

### 3.6 Rain impacts on terrain and cover [T2]

Showers and downpours: sand and loam crusts compact (`topsoil` more diggable the next day: nest chapter reads `moisture`), light litter and fine sand wash into paving joints (joint `diggable` volume +0.2 BU per hour of downpour, cap), exposed shallow entrances (depth < 3 BU) in sand collapse with `P = 0.05 * precipNorm` per game hour unless the entrance has a mound (-70 %). Leaves and stones are the cover model of 3.3.

### 3.7 Trails and pheromone washing [T2]

Applied by the pheromone system each 10 ticks to cells flagged `exposed` (no overhead cover, above ground):

| Channel | Rain / storm effect | Wind | Notes |
|---|---|---|---|
| `trail` | extra removal rate `lambda = WASH_K[class]`: drizzle 0.002 s^-1 (half-life 6 min), shower 0.010 (69 s), downpour 0.040 (17 s), storm 0.120 (6 s) | decay x (1 + windGround / 3) | GDD 02 §8 baseline half-life (`trail` 900 game s at 22 C) still applies |
| `home` (cuticular hydrocarbons, half-life 2 GD) | decay x (1 + 2 * precipNorm) during rain, `precipNorm` = 0.05 drizzle, 0.3 shower, 0.8 downpour, 1.0 storm | none | non-volatile, washed more slowly [Lasius dossier 12.2] |
| `alarm` | unchanged by rain | x (1 + windGround / 3) | |

Cells under cover keep their pheromone. Rain therefore erases open-ground trails while trails under leaves, stones, in cracks and in tunnels survive; the colony recovers by re-recruiting.

### 3.8 Dew, mist, rime [T2]

| Quantity | Rule |
|---|---|
| Dew night | decided at `SS` each day: `P_dew = 0.60` if `clear` and `wind2m < 2.5`; `0.25` if `overcast`; 0 if `rain`, `storm`, `heat`, or `wind2m >= 3.5` (2-3 of 7 nights per season, in line with about 3 of 7 [ecology 7.2]) |
| Dew amount | `dewLevel` 0..1 rising linearly from `SS + 1` to `SR`; droplets on `plant`, `leaf`, grass, metal, glass |
| Dew gone | `dewLevel` falls to 0 at `SR + 5 h` (clear) or `SR + 8 h` (overcast); about 09:00-10:00 in summer [ecology 4.3] |
| Dew effects | `dew` food kind (water), droplet size 0.2-2 mm; walkable surfaces `plant`, `leaf` friction x0.85 while `dewLevel > 0.3`; drinking source for the colony's water need when the species defines water need |
| Mist | after a dew night with `wind2m < 1.5`: `fogDensity` 0.3 until `SR + 2 h` (visual only) |
| Rime | in `frost`, dew becomes rime: no drinking, friction x0.8, melts when `Tair > 0` after `SR + 2 h` |

### 3.9 Soil moisture [T2]

Grid: `moisture` on the 16 BU nav cells (4000 BU map: 250 x 250 cells), two layers stored as `Uint8Array` (0..255 = saturation fraction theta 0..1): `theta0` top layer (water capacity `W0 = 12 mm`), `theta1` subsoil (`W1 = 90 mm`). Per-cell static data from worldgen: texture (`sand`, `loam`, `clay`, `humus`), `permeable` fraction (asphalt 0, concrete 0, joints 0.05, lawn 1, forest 1), `shade`, `veg` (lawn, garden-bed, forest = true), `puddleCapMm`. Updated every `ENV_MOISTURE_EVERY` ticks with `dt_h = 0.2` game hours. Every term in mm per game hour:

| Term | Formula | Constants |
|---|---|---|
| Rain input | `p = rainRateMmH * dt_h` | |
| Infiltration | `inf = min(p + puddle, Icap[tex] * dt_h) * permeable` | `Icap`: sand 60, humus 40, loam 20, lawn 15, clay 5, joints 3 mm/h |
| Runoff | `p - inf` (to puddle store, 3.10) | |
| Evaporation (top) | `E0 = EVAP_K * evapIdx * theta0^0.7 * (1 - 0.6 shade) * (1 - 0.5 litter)` | `EVAP_K = 0.35` mm/h; `evapIdx = insolation * (1 - RH) * (1 + windGround / 5) + 0.05` |
| Drainage top to sub | `K0[tex] * max(0, theta0 - thetaFC[tex]) * W0` | `K0`: sand 0.6, loam 0.12, clay 0.04 per hour; `thetaFC`: sand 0.25, loam 0.55, clay 0.70, humus 0.60 |
| Drainage sub to deep | `K1[tex] * max(0, theta1 - thetaFC) * W1` | `K1`: sand 0.20, loam 0.03, clay 0.01 |
| Capillary rise | `RISE_K * max(0, theta1 - theta0)` | `RISE_K = 0.02` mm/h |
| Transpiration | on `veg` cells in spring..autumn: `ET = 0.03 * insolation * theta1` mm/h from layer 1 | |

Dew adds `0.1 * dewLevel` mm to layer 0 on exposed natural cells. Frozen state (`Tsoil(20 mm) < -1`) halts infiltration and evaporation. Moisture classes for readouts: `dry < 0.15`, `slightly damp 0.15-0.35`, `damp 0.35-0.65`, `wet 0.65-0.9`, `waterlogged > 0.9`. Consumers: site assessment (5.7), digging and sand collapse (nest chapter: sand collapse risk rises as `theta0` drops), chamber humidity, wood moisture (nest chapter wets wood from `rainRateMmH` and `theta1` at contact), Atta fungus humidity, Messor granary.

Sanity: a 2.5 mm shower on loam (permeable 1) adds 2.5 / 12 = 0.21 to `theta0`; at `evapIdx 0.45` loam topsoil at `theta0 0.5` loses about 0.1 mm/h so dries from 0.5 to 0.25 in about 30 game hours (1.3 GD, about 13 real minutes).

### 3.10 Puddles and flood inputs [T2]

| Item | Rule |
|---|---|
| Puddle store | per cell with `puddleCapMm > 0` (paved low points, sand hollows, tyre ruts, gully mouths): `puddle += runoff * PUDDLE_FILL (0.5)`, `puddle -= (E0 + PUDDLE_DRAIN 0.4 mm/h) * dt_h`, clamped `0..puddleCapMm` |
| Puddle hazard | depth in BU `= puddleMm / BU_mm`. Depth >= 0.5 BU: nav cost x5 (AI avoids); an ant inside takes the shared drowning damage of GDD 03 §11 (50 s grace, then 1 % max hp per s; consistency pass) unless the carried item is a float-able leaf/twig; at >= 1.0 BU impassable except to a possessed ant swimming |
| Surface wetness | `surfaceWet` 0..1 rises with `rainRateMmH`, falls with evaporation; wet surfaces show specular and friction x0.9 |
| Entrance inflow | each nest entrance `e` with catchment area `A_e` (BU^2, from worldgen flow accumulation plus mound ring): `Q_e [BU^3/s] = (rainRateMmH / 3600) * A_e * runoffCoeff / BU_mm * difficulty.floodInflowMult`; `runoffCoeff`: asphalt 0.9, concrete 0.9, rubber 0.9, sand 0.15, loam 0.3, lawn 0.2, forest 0.1, interior 0. Sprinkler and hose events (human chapter) add to `rainRateMmH` locally |
| Seepage | cells with `theta1 >= 0.92` seep into adjacent chambers at `SEEPAGE_RATE = 0.002` BU^3 per second per BU^2 of wall |
| Interface | environment publishes `Q_e`, `puddle`, `theta*`; the nest chapter owns chamber water volume, drainage, brood relocation and drowning of ants in tunnels |

### 3.11 Visibility, light effects, audio cues [T2; audio events T2]

Render reads `cloud`, `insolation`, `light`, `fogDensity`, `precip`, `rainDropMm`, `wind2m`, `windDir`, `lightningFlash` (storm only). Lightning is a single brightness pulse of at most 120 ms, never more than 1 per 6 s, never repeating (photosensitivity: <= 2 flashes per second; disabled by the reduced-motion setting, which uses a soft sky brightening). Thunder sound delay `0.4..3 s` after a flash. Underground the sky has no effect except attenuated rain/thunder sound and the `rainOnRoof` cue in shallow chambers.

### 3.12 Failure handling

- Unknown or corrupt weather record on load: reset to `overcast`, dwell 6 h, emit `weather.changed` with `reason: 'repair'`.
- Weather never changes inside a time-lapse beat that the player is interacting with (interrupts keep the current state for the 20 s response window).
- NaN guard: if `Tair`, `Tsurf` or `wind2m` is not finite, clamp to the previous value and log `diag.envNaN` in the debug API.

### 3.13 Diagnostics published (see Appendix D)

`diag-surface-activity`, `diag-heat-exposure`; this chapter's chamber-climate and flood-risk rules feed GDD 03's `diag-nest-climate` and `diag-nest-flood` (merged by the consistency pass).

---
## 4. Time controls [T1; auto-slow and skip-to-event T2]

### 4.1 Speeds

| Speed | Key | Ticks per real second | Game seconds per real second | One GD takes (real) |
|---|---|---|---|---|
| pause | `P` | 0 | 0 | - |
| 1x | `1` | 10 | 1 | 10 min |
| 2x | `2` | 20 | 2 | 5 min |
| 4x | `3` | 40 | 4 | 2.5 min |
| 8x | `4` | 80 | 8 | 75 s |

(Directions A: keys 1-4 select 1x..8x.) The fixed tick is always 0.1 s; speed only changes how many ticks run per real second. Results are bit-identical at any speed (determinism rule).

### 4.2 Availability rules

| Situation | Allowed speeds | Behaviour |
|---|---|---|
| Observer, Colony view, menus closed | pause, 1x, 2x, 4x, 8x | |
| Possession of any ant | pause, 1x, 2x, 4x | **possession start forces 1x** (seed); the player may then raise to 2x or 4x. 8x is refused with a toast "Release the ant to run at 8x" (no silent change). Releasing does not restore the earlier speed |
| Opening phases `search`..`lay` | pause, 1x, 2x | queen is possessed and in danger |
| Nuptial flight possession | pause, 1x | |
| Time-lapse playback | none (the lapse sets its own rate) | |
| Photo mode | frozen (equivalent to pause); entering saves the previous speed, leaving restores it | |
| Epitaph, title | sim not running | |

Orders while paused: markers, directives and dig plans are accepted and queued; see 4.7.

### 4.3 Main loop (Game layer)

```
each animation frame (real dt, clamped to 0.1 s):
  if paused or tab hidden (and setting 'pauseWhenHidden' = true): no accumulation
  acc += dt * ticksPerRealSecond(speed)          // ticks owed
  start = now()
  while acc >= 1 and (now() - start) < SIM_FRAME_BUDGET_MS and ticksThisFrame < MAX_TICKS_PER_FRAME:
      sim.tick(); acc -= 1; ticksThisFrame += 1
  if acc > MAX_CATCHUP_TICKS: acc = 0 ; flagBehind = true      // drop, never spiral
  render with interpolation alpha = frac(acc)
```

| Constant | Value |
|---|---|
| `SIM_FRAME_BUDGET_MS` | 10 (leaves 6 ms for rendering at 60 fps) |
| `MAX_TICKS_PER_FRAME` | 16 |
| `MAX_CATCHUP_TICKS` | 20 (2 game seconds) |
| `PAUSE_WHEN_HIDDEN_DEFAULT` | true (a hidden tab is paused; on return no catch-up is attempted) |

### 4.4 When the machine cannot keep up [T1]

`effectiveSpeed` = EMA (window 3 real s) of ticks actually executed per real second divided by 10.

| Condition | Response |
|---|---|
| `effectiveSpeed < 0.85 * requestedSpeed` for 3 s | step the requested speed down one notch (8x to 4x to 2x to 1x), toast "Simulation could not keep pace at 8x; running at 4x", indicator on the speed control turns amber. The player may raise it again, which re-arms a 10 s grace before the next step-down |
| at 1x and `effectiveSpeed < 0.85` | the clock runs slower than real time (game time stretches, no ticks skipped), indicator "Running below real time (0.7x)", the perf subsystem is asked to lower simulation detail (stagger periodic systems 2x, cap visible ant animations; never changes results of deterministic tests because tests run unbudgeted via `step(n)`) |
| `acc` overflow (laptop sleep, long GC pause) | dropped ticks are not simulated; time simply does not pass for that interval; event `time.speed-limited` carries `droppedTicks` |
| `performance` unavailable | fixed `MAX_TICKS_PER_FRAME = 4` fallback |

### 4.5 Automatic slow-downs [T2]

Setting `autoSlow` in {`off`, `slow` (drop to 1x), `pause`}. Default: `slow` (Naturalist), `pause` (Gentle), `slow` (Harsh). Triggers (each with a 0.25 GD cooldown per kind, never while paused):

Auto-slow is driven by alerts (GDD 08 §5.1, §6.1): the `autoSlow` setting applies to `critical` alerts and `autoSlowWarning` to `warning` alerts. The trigger ids below are therefore the alert kinds of GDD 08 §6.5 that this chapter (or the named owner) raises with these conditions (consistency pass):

| Former trigger id | Alert kind (level) | Fires when |
|---|---|---|
| `queen-attacked` | `queen-in-danger` (critical) | queen health falls by >= 0.15 within 5 s |
| `entrance-breach` | `nest-attacked` (critical) | hostile creature or rival worker crosses an entrance with >= 3 ants |
| `rival-raid` | `raid-seen` (warning) | a rival raid party (GDD 05) reaches within 200 BU of an entrance |
| `flood-brood` | `nest-flooding` (critical) | water enters a chamber holding brood |
| `footfall-warning` | `human-event-warning` (warning) | human `footsteps` warning active within 120 BU of a trail or entrance |
| `possessed-low` | `possessed-danger` (critical) | possessed ant health < 0.3 |
| `storm-onset` | `weather-change` (warning when it is a `storm`) | weather becomes `storm` while >= 5 % of the colony is outside |
| `heat-stupor-mass` | `heat-danger` (warning) | >= 10 % of foragers in `heat-stupor` |
| `flight-launch` | `flight-weather` (notice; auto-slow regardless of level) | alates launch (section 11) |
| `overwinter-prompt` | `winter-coming` (notice; auto-slow regardless of level) | winter banner (section 6) |
| `queen-low` | `queen-reserves-low` (warning) | queen reserves or crop < 15 % (queenright colony) |

Action `slow`: speed set to 1x, alert shown (alerts chapter), speed control flashes once. Action `pause`: pause plus alert and "Resume" button. `autoSlow` never raises speed.

### 4.6 Skip to next event [T2]

Button and key `N` (GDD 01 `skip-ahead`): runs at 8x until the next qualifying event, then sets 1x. Qualifying events: `dawn`, `dusk`, `weather.changed`, any alert of severity >= warning, milestone, `flight.eligible`, colony-stage change, `season` change, overwinter banner. Limits: refused while possessing; refused while a `critical` alert is active; at most `SKIP_MAX_GD = 1.0` game day per press; if no event occurs within that span it stops anyway with a toast "Quiet day". Used for waiting through quiet stretches without being the only way to wait.

### 4.7 Pause semantics

While paused: rendering, camera, UI, photo mode and Observer continue; ambience ducks to 30 % and non-diegetic UI sounds stay. Commands (queued in the `Command` queue) are applied by `sim.applyPendingCommands()`, which runs only the command stage of the tick (no time passes, `tick` unchanged; an internal `commandSeq` counter keeps replays deterministic). Possessed-ant intent is not applied while paused (the ant does not move). Autosave may still fire on its timer (section 15).

---

## 5. The opening sequence [mechanics T1 for `lasius-niger`; polish, threats, onboarding T2; other species T3]

### 5.1 Overview and phase state machine

A new game (not a load, not a Lineage daughter's later play) starts the script. The player is a single dealate queen, `possessed = true`, observer-camera disabled except by `X` (which shows "She is alone" and does nothing until hand-over; photo mode and pause remain). A checkpoint autosave `opening-start` is written at `search` entry.

| Phase | Entry condition | Behaviour | Exit |
|---|---|---|---|
| `intro-card` | new game created, world generated | sim paused; wordless card (5.3), 6 s | any key or `OPEN_INTRO_S = 6` -> `dealation` |
| `dealation` | after card | queen sheds wings (8 s animation, input locked 3 s); `queen.wings = false`; reserves set to `R0`; weather and light begin running | 8 s -> `search` |
| `search` | dealation done | free exploration; `desiccationLoad` rising; sniff available; threats may appear (5.6); queen may dig anywhere diggable | first dig bite on a diggable material -> `dig`; `desiccationLoad >= 1` or queen health 0 -> `failed` |
| `dig` | first bite | shaft + chamber excavation (5.8); two readiness bars (depth, volume); she may abandon and walk away (then phase returns to `search`, exposure resumes, the old shaft stays and may be re-used) | both bars >= 1 and queen inside the chamber -> `seal` |
| `seal` | readiness met | prompt "Hold E to close the entrance"; hold `OPEN_SEAL_HOLD_S = 6` s at the shaft (5.9); Atta replaces this with planting (5.15) | entrance state `sealed` -> `lay` |
| `lay` | sealed | `lay-egg` action in batches (5.10); forecast panel; reserves fall slowly | player confirms "Tend the brood" (or automatically when the clutch is full, or 1.5 GD after sealing with the automatic batch of 5.10) with >= 1 batch laid -> `timelapse` |
| `timelapse` | confirmation | accelerated founding simulation with presentation (5.11); possible interrupt beats | first worker eclosion + `FOUND_END_AFTER_ECLOSION_GD = 0.4` -> `handover`; queen dead or no brood left -> `failed` |
| `handover` | lapse ends | normal speed restored (paused for first 1 s), workers appear, journal and first aims (5.13), autosave `opening-complete` | first movement input or 10 s -> `done` |
| `done` | after handover | normal play | - |
| `failed` | see exits above | calm card "The founding did not succeed", cause list, then Epitaph (13.5) or retry (5.14) | - |

### 5.2 Start conditions and placement

- Date, hour and forced conditions: table 1.6. Starting speed 1x, `autoSlow` per difficulty.
- Placement: worldgen supplies `foundingLandingPoint` on open ground (`lawn`, `forest`, `garden-bed`, `sand`, or a `pavement` joint patch) such that at least 3 candidate sites of at least `Fair` quality exist within 300 BU (world validation step "reachable founding sites for the chosen species"; regenerate on failure) and no rival nest or home-range scent above 0.3 within 150 BU.
- Grace period: no human event or predator spawns for the first `OPEN_GRACE_GD` = 0.3 GD (Gentle 0.6, Harsh 0.15).
- The queen starts with `reserves = 1.0`, `health = 1.0`, `desiccationLoad = 0`, `heatLoad = coldLoad = 0`.

### 5.3 Intro card (wordless, 6 s)

Layout: a field-journal plate. Left: line drawing of the species queen (from the `SpeciesDef` plate). Right, small serif captions: species common and binomial name; locality archetype name and a generated place token (e.g. "Hollow Verge"); season glyph, `Summer 3`, `15:20`; weather glyph and air temperature. Bottom: three input glyphs (move, sniff `T`, dig `F`) with no sentences. Fade 0.8 s in and out; "I know this" skip is any key (and a setting `showIntro`). Reduced motion: no fade slide, instant cut. Subtitles unnecessary (no speech).

### 5.4 Dealation (T2 polish)

8 s: the queen loosens and sheds the wings by rubbing against the ground; wings remain as a small prop that decays in 1 GD (it is also a landmark). Input locked for the first 3 s (camera settles behind her). The queen's meter appears at second 8 with a first-use hint (`p-reserves`).

### 5.5 Reserves, exposure and health

**Reserves.** `reserves` (meter, 0..1) = `R / R0`, where `R` is the founding pool in loads (one pool covers C and P at 1:1; assumption F5). Per species `R0`:

| Species | `FOUND_R0` (loads) | Basis |
|---|---|---|
| `lasius-niger` | 56 | calibrated so that a good site with a 24-egg clutch ends with about 0.4 left (section 5.12) |
| `camponotus-pennsylvanicus` | 36 | 9-16 egg clutch, 5.1 GD [Camponotus 3, 12] |
| `messor-barbarus` | 40 | includes winter arrest |
| `atta-texana` | 48 | queen loses about 30 % of body mass by first workers [Atta 12.2, EST] |

Reserve drains (loads): `FOUND_UPKEEP_PER_GD = 0.40` (0.30 C + 0.10 P, the directions J queen upkeep) at all times; `FOUND_SURFACE_EXTRA_PER_GD = 0.35` while above ground; `FOUND_DIG_COST_PER_BITE = 0.02`; `LAY_EGG_COST = 0.04` per egg (directions J); larva feeding `LARVA_COST_LOADS = 1.6` (1.2 P + 0.4 C) per larva, drawn progressively over the larval stage. Difficulty multiplies upkeep and larval draw by `reserveDrainMult`. Winter (frozen development) upkeep factor 0.4. Visible state: abdomen thickness `= 0.55 + 0.45 * reserves` (thinning queen; the research gives about half her body weight lost by the time workers hatch [genre-ux 5, item 2]).

**Desiccation (shelter clock).** `desiccationLoad` D (0..1): while above ground in open sun `+1.2` per GD; in shade or under cover on the surface (cover score >= 0.6) `+0.4`; inside a shaft deeper than 3 BU `+0.1`; sealed in a chamber with humidity >= 0.6: `-0.5` per GD. Multiplied by `foundingExposureRate` (Gentle 0.5, Naturalist 1.0, Harsh 1.3) and by 1.5 while `Tmicro >= shadeSeekC`. `D >= 1` -> death, cause `desiccation`. The roughly 24 h shelter limit is an author assumption in the source [Lasius verification row 8]; here it becomes 0.83 GD in full sun (8.3 real minutes) and about 2.5 GD in shade.

**Health.** `queen.health` 0..1, regenerates 0.05 per GD while sealed. Hits: beetle or spider bite 0.35, footfall near-miss 0.2, direct footfall 0.6, downpour hit 0.05, rival worker bite 0.1. Health 0 -> death (cause by killer).

### 5.6 Founding threat director [T2]

| Rule | Value |
|---|---|
| Active in phases | `search`, `dig` (only while the queen is above ground or in a shaft shallower than 3 BU) |
| Kinds (J creature and human-event ids) | `rove-beetle` (any hour, fast, bite), `wolf-spider` (dusk, night), `jumping-spider` (day, on stones and walls), `bird` event (daytime; founding variant of GDD 05 §2.6: one swoop at the queen in open ground, telegraphed by the 3.0 s approach shadow, 1.2 s strike), `footsteps` (human event: shadow plus tremor with GDD 04 §15.3 lead times × `HUMAN_TELEGRAPH_MULT`, footprint 280 x 100 mm adult / 200 x 80 mm child), rival `worker` scout (if rivals enabled) |
| Maximum simultaneous | 1 |
| Maximum per founding (`OPEN_THREATS_MAX`) | Gentle 0, Naturalist 2, Harsh 4 |
| Minimum gap | `OPEN_THREAT_GAP_GD = 0.15` (1.5 real minutes) |
| Spawn | at least 60 BU from the queen, approaching at 70 % of queen sprint |
| Escape | queen hurries (Lasius founding queen: cruise 6 BU/s, hurry 9.6 BU/s, GDD 01 / directions K); a shaft deeper than 4 BU is refuge: beetle and spider give up after 8 s at the entrance. Under a stone or slab on the surface the beetle loses the queen at 3 BU |
| Rain / downpour during `search` | counted as weather, not a threat; the queen shelters (cover) or accepts 0.05 health per hit |

### 5.7 Site assessment read-out (antennating the ground)

Key `T` ("sniff"): holding 1.2 s (or auto when the queen stands still 1.5 s with the head over a diggable surface) starts the read-out for the point under the antennae. It persists while she stays within 8 BU and updates every 0.5 s. Display: 7 bars with one-word labels, an overall word, and (from phase `dig`) the `Q` value of the actual chamber. Each factor `s_i` in 0..1:

| Factor | Computed from | Formula | Words (by `s`) |
|---|---|---|---|
| `diggability` | substrate material at 8 BU depth | `humus 0.9`, `loam 1.0`, `sand 0.8 * clamp(0.4 + theta1 / 0.5, 0.4, 1)` (dry sand collapses), `clay 0.45`, `gravel 0.3`, `mortar` crumb in joints 0.5, `wood-decayed 1.0 * moistW`, `wood-sound 0.4 * moistW`, everything else (`concrete`, `asphalt`, `stone`, `tile`, ...) 0 (not diggable: message "Cannot dig here") | Loose, Firm, Hard, Unbreakable |
| `moisture` | `theta1` at 8 BU (or wood moisture for carpenter ants) | trapezoid: 0 at <= 0.10, 1 at 0.35..0.65, 0 at >= 0.95 (Messor 0.20..0.50, Atta 0.40..0.70; wood: 0 at 8 %, 1 at >= 15 %, mould penalty to 0.5 at >= 30 %) | Dry, Slightly damp, Damp, Wet, Waterlogged |
| `warmth` | forecast 1-GD mean `chamberTemp` at the candidate depth | 1 inside `[Topt_lo, Topt_hi]`, linear to 0 at 10 C beyond; `Topt`: Lasius 20-26, Camponotus 22-28, Messor 22-28, Atta 21-25 (fungus 21-25 [Atta 12.2]) | Cold, Cool, Mild, Warm, Hot |
| `cover` | overhead structure above the site | solid roof >= 1 BU thick (stone, slab, log, bark slab, root cap) 1.0; dense litter, moss, thatch 0.6; grass canopy 0.35; bare ground 0.1 | Open, Leaf-covered, Roofed |
| `floodSafety` | `1 - world.hydro.floodRisk(x, z)` (catchment and height above the lowest neighbour, from worldgen) | | Low-lying, Sloped, Raised |
| `rivalScent` | `1 - clamp(rivalHomeScent / 0.5)` | | Strong, Faint, None |
| `exposure` | `1 - clamp(0.6 * footTraffic + 0.4 * openSky)` | `footTraffic` 0..1 from the human-activity map | Busy, Open, Sheltered |

**Quality:** weighted geometric mean `Q = exp(sum w_i ln(max(s_i, 0.05)))`, so one terrible factor drags the whole.

| Weights | dig | moisture | warmth | cover | flood | rival | exposure |
|---|---|---|---|---|---|---|---|
| `lasius-niger` | .20 | .20 | .20 | .15 | .15 | .05 | .05 |
| `camponotus-pennsylvanicus` | .20 | .30 | .15 | .15 | .05 | .05 | .10 |
| `messor-barbarus` | .20 | .15 | .25 | .05 | .20 | .05 | .10 |
| `atta-texana` | .15 | .20 | .20 | .05 | .25 | .10 | .05 |

Overall word: `Q < 0.30` Poor, `0.30-0.55` Fair, `0.55-0.75` Good, `>= 0.75` Excellent. Examples (Lasius): under a stone on loam (dig 1, moist .9, warm .9, cover 1, flood .8, rival 1, exposure .7) `Q = 0.91`; open lawn (1, .8, .7, .35, .7, 1, .5) `Q = 0.70`; dry paving-joint sand (.4, .3, .6, .1, .6, 1, .5) `Q = 0.37`. Gentle shows the read-out automatically on standing still; Harsh requires `T`; the `foundingAssist` rule (14.3) additionally highlights the best site within 200 BU with a faint scent haze.

### 5.8 Digging requirements [T1]

The queen uses the standard dig action. **Dig geometry, bite timing and readiness are owned by GDD 03 §13 (consistency pass):** the founding queen's bite takes `DIG_BITE_S` 1.0 s × material factor / `digPower` 0.77 (≈ 1.3 s in loam); during founding `autoHaul = true` (GDD 03 automatic expulsion: pellets merge into the entrance mound); the founding shaft is 2.5 BU in diameter (`royalD`). The two readiness bars are GDD 03's depth term and volume term:

| Species | `FOUND_SHAFT_MIN_BU` = GDD 03 `D_MIN` (open soil / under cover) | recommended | `FOUND_CHAMBER_MIN_VOXELS` = GDD 03 `V_MIN` / 0.125 BU^3 | Chamber note |
|---|---|---|---|---|
| `lasius-niger` | 8 / 5 | 8-15 (32-60 mm) | 80 (10 BU^3), cell width >= 3.5 BU | 2-3 BU wide, 1-1.5 BU tall; 3-6 cm deep in open soil, 2-5 cm below a stone [Lasius 5] |
| `camponotus-pennsylvanicus` | 3 (into wood or a cavity under bark) | 3-6 | 80 (10 BU^3) | chewed in moist decayed wood; sound wood costs x2.5 [Camponotus 12] |
| `messor-barbarus` | 20 / 15 | 20-30 (14-21 cm) | 120 (15 BU^3) | soft bare sunny soil [Messor 3] |
| `atta-texana` | 30 / 25 | 35 (about 25 cm, range 20-30 cm) | 200 (25 BU^3) | chamber about 6 cm across; entrance crater 5-8 cm [Atta 3] |

Chamber capacity limits the clutch: `maxEggsByVolume = floor(chamberVolumeBU3 / 0.25)`. Typical Lasius dig: about 80 bites, 2-3 minutes of play (GDD 03 §13.2). Bars: depth `= min(1, shaftDepth / min)`, volume `= min(1, voxels / minVoxels)`; seal is enabled when GDD 03 reports `ready` (both bars 1.0, width, roof and openings tests passed). Digging further is allowed (a larger chamber permits a larger clutch). Unreachable cases: if the chosen spot turns out to hit a non-diggable layer at depth (stone, buried slab), the dig action refuses with "Hard ground" and the read-out shows `diggability` 0; the queen must move. Worldgen guarantees no such trap within the minimum depth at the landing area's candidate sites.

### 5.9 Sealing [T1]

Prompt `E` at the shaft below `entrance + 2 BU`: holding repeats GDD 01 `seal-entrance` (2.0 s each, `PLUG_RADIUS` 1.2 BU, about 3 actions and 3 pellets for a 2.5 BU throat, GDD 03 §4) for about `OPEN_SEAL_HOLD_S` 6 s until the entrance `status` is `sealed` (GDD 03: no ant or creature passes, BFS entrance field cut), chamber humidity target +0.15, intruder hazard x0.4, `desiccationLoad` starts recovering. Releasing early cancels progress. She can reopen it later (hold `E`) at the cost of re-sealing. Species: Lasius, Camponotus (frass plug of chewed wood fibre), Messor (soil plug) use this; Atta plants the fungus first (5.15).

### 5.10 First clutch [T1]

Action `lay-egg` (GDD 01 primitive; key `E` in the chamber with the entrance `sealed`): in the opening phase `lay` it lays `OPEN_LAY_BATCH_EGGS = 6` eggs in a pile over `OPEN_LAY_ACTION_S = 4` s; repeatable. Limits: `FOUND_CLUTCH_MAX_EGGS` (Lasius 48, Camponotus 16, Messor 20, Atta 40), `maxEggsByVolume` (5.8), and eggs already laid. The first `lay` sets `foundingTick` and stage `founding`. A **forecast panel** (hidden on Harsh) shows after each batch, computed from the model of 5.12 for the current clutch `N`, chamber temperature and `Q`:

| Shown | Value |
|---|---|
| Expected first workers | `E[workers] = N * exp(-mu * Tdev)` displayed as a range `[0.7 E, 1.3 E]` rounded |
| Reserves at first worker | `1 - (0.04 N + 0.40 Tdev + 1.6 N exp(-mu * Tpre)) / R0` |
| Safe band marker on the reserve meter | highest `N` with expected end reserves >= 0.15 |

with `Tdev = 3.90 * 11 / (Tchamber - 10)` GD (egg to worker; Lasius degree-day law, 575 DD with the 0.08 GD pre-oviposition dropped because she lays right after sealing, anchored at 21 C [Lasius 12.2]), `Tpre = (1.4 + 0.6) * 11 / (Tchamber - 10)`, `mu = foundingMu(Q)` (5.12). Exceeding the safe band is allowed and risky (the forecast turns amber then red). Confirming "Tend the brood" requires >= 1 batch. If no batch is laid within 1.0 GD after sealing, a prompt appears; after 1.5 GD with no eggs the queen lays one batch automatically (so a passive player is not stuck).

### 5.11 The first-brood time-lapse [T1 logic; presentation T2]

**What runs.** The real simulation, with the reduced system list `{commands, environment, queen/eggs, brood, lifecycle (deaths, eclosion), founding-hazards, progression}`, stepped in batches without rendering at each tick. Environment runs normally (weather, soil temperature at the chamber, moisture) but `ENV_MOISTURE_EVERY` is 250 inside the lapse. All other systems are idle because only the queen and brood exist. Determinism is preserved (same ticks, same RNG stream `rng.opening`).

**Span and speed.** From the first egg until the first worker eclosion plus `FOUND_END_AFTER_ECLOSION_GD = 0.4`. Expected spans: Lasius 4.5-5.5 GD, Camponotus 5.1, Atta 5.0, Messor 11-17 (includes winter arrest, section 5.15). Playback target `TIMELAPSE_TARGET_S = 75` s of real time (range 45-120): speed `= spanGD * 600 / TIMELAPSE_TARGET_S` (Lasius about 36x). The loop runs `ceil(speed * 10 / 60)` ticks per frame, limited by `SIM_FRAME_BUDGET_MS`; slow machines simply take longer, the progress bar never lies. The 5.12 model is stepped with `dt = 0.1 s` ticks.

**What is shown (script).** Camera: a macro cutaway of the sealed chamber, warm dim light, constant (no day/night flicker). HUD: a stage strip with pip counts (eggs, larvae, pupae, workers), the reserve meter draining, the date advancing in `Summer 3 ... Autumn 2` style, a small surface weather glyph (changes at most once per real 2 s, no flashes), chamber temperature. Beats by fraction `p` of the real playback time:

| `p` | Shown |
|---|---|
| 0.00-0.12 | eggs in a pile, queen licks them and turns them; counter shows eggs laid |
| 0.12-0.35 | larvae hatch (eggs fade, larvae cluster by hooked hairs [genre-ux 5, item 4]); queen feeds them from her body; reserve bar falls |
| 0.35-0.55 | queen buries larvae lightly; larvae spin silk cocoons; stage strip shifts to pupae |
| 0.55-0.80 | cocoons stand; queen thin, the egg-eating beat (if reserves < 0.25: she consumes a larva, text "She eats one of the larvae") |
| 0.80-0.95 | first cocoon opens, the queen helps the worker out; pale callow worker, darkening over about an hour (callow dawn) |
| 0.95-1.00 | the final card: "Workers: N. Reserves: x %." then handover |

**Reduced motion:** a 20 s crossfade of five stills (eggs, larvae, cocoons, callow worker, final card) with date captions, no camera motion. **Skip:** key `Space`/`Esc`/button; the engine continues the same simulation at maximum batch rate to the same end tick (identical outcome), then plays only the final card for 2 s.

**Interrupt beats (T2).** Hazards (5.12) may fire during the lapse. If `interruptsUsed < diff.openingInterruptMax` (Gentle 0, Naturalist 2, Harsh 3) the lapse **drops to 1x, hands control of the queen back**, and shows a cue; the response window is `OPEN_INTERRUPT_WINDOW_S = 20` game seconds (extended while the queen is actively acting). Gentle resolves all hazards silently with the "responded" outcome halved in damage. Otherwise (or if the player chooses "Let it play") the default outcome applies.

| Hazard | Cue | Player response | Success outcome | Default (no response) |
|---|---|---|---|---|
| `flood` (water enters the chamber) | rising sound, wet floor | carry eggs/larvae to the highest alcove (`move-brood`, at least 50 % moved) | brood loss 15 % | brood loss 60 % |
| `intruder` (beetle, ant, or spider breaks the seal) | scratching, plug crumbles | bite or spray the intruder (formic acid for formicines), or re-seal in 6 s | brood loss 10 %, queen health -0.1 | brood loss 80 %, queen health -0.4 |
| `fungus` (Metarhizium-like outbreak in a saturated chamber) | pale threads on a larva | groom and carry the infected larvae to the side of the chamber (2 items) | brood loss 10 % | brood loss 50 % |
| `collapse` (shallow chamber, depth < 5 BU, trampled) | tremor, falling grains | dig out and re-seal | brood loss 20 % | brood loss 100 % of the affected half |

### 5.12 Founding model and outcome computation [T1]

Brood agents (`egg`, `larva`, `pupa`) advance by degree-days using the chamber temperature: `devRate(T) = max(0, T - 10) / 11` reference-days per GD up to 30 C, with GDD 02 §2.2's plateau and fall to 0 at 36 C above that (Lasius law; other species use the brood chapter's `SpeciesDef` rates, assumption F3). Reference stage durations at 21 C: pre-oviposition 0.08, egg 1.4, larva 0.6, pupa 1.9 GD (total 3.98) [Lasius 12.2, from Schlappi et al.: 1 + 18 + 8 + 25 days = 52 d]. Per tick:

1. **Reserves:** `R -= upkeep*dt`; each larva draws `LARVA_COST_LOADS * (devRate dt / larvaRefDuration)`.
2. **Mortality of brood items:** hazard `mu` per GD, `mu = min(0.60, max(0.06, 0.42 * (1.1 - Q)) * muSpecies * diff.foundingBroodMortalityMult)`; `muSpecies`: Lasius 1.0, Camponotus 0.55, Messor 1.0, Atta 0.9. Moisture adds `x (1 + 2 * max(0, 0.3 - moisture)/0.3)`.
3. **Cannibalism:** if `R < 0.10 R0`, every 0.05 GD with probability 0.25 the queen eats the youngest larva, returning `0.6 * (loads invested in that larva)` (pupae are cocooned and never eaten; eggs return only 0.024). If `R <= 0` and nothing is edible: queen dies, cause `exhaustion`.
4. **Hazards** (per GD, sealed): `flood` `P = FOUND_FLOOD_BASE (0.35) * (1 - floodSafety)^2 * precipPeakNorm` per rain event end; `intruder` `0.05 * (1 - cover) * 0.4 (sealed) * diff.predatorDensityMult * (1 + 2 * (1 - rivalScent))`; `fungus` `0.03 * max(0, (humidity - 0.8)/0.2)`; `collapse` `0.06 * disturbanceRate` only if depth < 5 BU.
5. **Eclosion:** a pupa that completes becomes a nanitic `worker` (or `minor` for polymorphic species) with age 0, scale 0.85 (head about 6 % narrower [Lasius 3]).

Calibration (Monte Carlo of this model, chamber 19.5 C, `R0 = 56`, 200 runs each; `workers` mean (p10-p90), queen death rate):

| Q | clutch 12 | clutch 24 | clutch 36 | clutch 48 |
|---|---|---|---|---|
| 0.5 | 3.8 (2-6), 0 % | 7.6 (5-11), 0 % | 11.4 (8-15), 0 % | 14.6 (11-18), 9 % |
| 0.7 | 5.7 (3-8), 0 % | 11.5 (8-15), 0 % | 16.8 (13-21), 0 % | 19.4 (16-23), 66 % |
| 0.9 | 8.1 (6-10), 0 % | 16.3 (13-19), 0 % | 24.2 (20-27), 2.5 % | not safe, > 90 % |

Typical Lasius result: 8-16 nanitics at `Q` 0.55-0.8, ending reserves 0.2-0.5, survival about 46 % of eggs (the Lasius dossier: about 45 % reach adult). Field-faithful rarity (about 1 % of dealate queens succeed in the wild [Lasius 3, EST]) is **not** modelled: deviation D3. Founding success by difficulty is determined by the quality-dependent hazards plus the exposure clock and director, not a flat probability.

### 5.13 Hand-over and the first journal aims [T2]

On entering `handover`: (a) the surviving first workers (`N_w` nanitics plus any still-pupating brood, which eclose over the next 0.5 GD) are placed in the chamber; (b) the entrance is reopened by the first workers (milestone `ms-nest-reopened` when one exits); (c) the queen keeps her remaining reserves and is fed by workers as soon as stores exist; (d) autosave `opening-complete`; (e) speed 1x, `autoSlow` active; (f) a banner "Tab to take a worker, or stay with the queen" (`p-possess-worker`); (g) the journal opens a page "Day {n}" with the first aims. The player may possess a worker, remain as the queen, or use the Observer.

**Aims (journal "Current focus", at most 3 shown, phrased as naturalist questions; no score, no rewards).**

| Aim id | Shown when | Question | Completes on |
|---|---|---|---|
| `aim-first-food` | handover | Where does the nearest sugar lie? | `ms-first-food` |
| `aim-second-chamber` | handover | Is one chamber enough for a growing brood? | `ms-second-chamber` |
| `aim-first-protein` | after `aim-first-food` | What will the larvae need that sugar cannot give? | `ms-first-prey` |
| `aim-first-trail` | after `ms-first-food` | Does a route last once it has been walked? | `ms-first-trail` |
| `aim-stores-winter` | stage `first-workers` and `season == autumn` | Will the stores last the winter? | `ms-first-winter-survived` |
| `aim-midden` | 12 or more workers | Where do the dead go? | `ms-first-midden` |
| `aim-nest-open` (Atta) | handover | Can the workers reach the surface? | `ms-nest-reopened` |
| `aim-garden` (Atta) | handover | Is the garden taking hold? | `ms-first-leaf` |
| `aim-satellite` (Camponotus) | 40 or more workers | Is there a drier, warmer corner for the larger brood? | `ms-satellite-nest` |
| `aim-trunk-trail` (Messor) | handover | Which way do the seeds lie? | `ms-first-seed` |
| `aim-second-entrance` | 25 or more workers (`ms-workers-25`) | Is one way in and out enough for this many workers? | `ms-second-entrance` |
| `aim-cross-zone` | stage `growing` | What lies past the edge of the home ground? | `ms-zone-crossed` |
| `aim-herd` (Lasius) [T2 herds] | stage `growing` and an `aphid-herd` source discovered by the colony | Can the aphids on that stem be kept, and guarded? | `ms-first-aphid-herd` |
| `aim-alates` | stage `mature` and `doy` inside the species' `alateLayWindow` (11.1 `gate-season`) | Is the colony ready to raise winged queens and males? | `ms-first-alate` |
| `aim-flight` | `ms-first-alate` | Will the weather give the winged ants their day? | `ms-first-flight` |

Open-aim rules (all rows): an aim whose completing milestone has already fired is never opened; at most 3 aims are shown, oldest first, and further eligible aims wait in order until a slot frees; growing and mature colonies therefore keep receiving questions after the founding aims are done (brief §5, continuing goals). `aim-alates` stays open across seasons until `ms-first-alate`; outside the window it is shown with the journal hint "Out of season" taken from the 11.1 gate text. No aim ever gates play or carries a reward.

### 5.14 Failure and retry rules

| Failure | Cause id | Result |
|---|---|---|
| desiccation clock reaches 1, health 0, heat/cold death before sealing | `desiccation`, `predation`, `crushed`, `heat`, `cold`, `drowning` | `failed` |
| reserves exhausted | `exhaustion` | `failed` |
| all brood lost before the first eclosion (queen alive) | `brood-lost` | the queen survives alone: **no automatic failure**. She may lay again if `R >= 0.35 R0` (one extra clutch of up to half the cap); else `failed` after 1 GD with cause `no-workers` |
| first eclosion happens but all die later | normal play | colony proceeds, extinction handled by 13.4 |

Retries: `diff.openingRetries` (Gentle 3, Naturalist 1, Harsh 0) "Undo founding: try another site" returns to checkpoint `opening-start` (the same world and queen, RNG stream advanced so the weather and threats differ) from the failure card or from the pause menu until the first `lay`. The Epitaph (13.5) always offers "Found again in this locality" (world seed unchanged, new attempt number, no limit).

### 5.15 Per-species variations

| Aspect | `lasius-niger` [T1] | `camponotus-pennsylvanicus` [T3] | `messor-barbarus` [T3] | `atta-texana` [T3] |
|---|---|---|---|---|
| Start | summer, afternoon | spring, late afternoon | autumn after a rain front | spring, night after >= 6.35 mm rain |
| Site | soil, ideally under stone or slab | cavity in moist decayed wood or under bark; wood `moisture >= 15 %` else `diggability` and `moisture` factors fall to 0 at 8 % | soft bare sunny soil, 15-30 BU deep | deep sandy loam, 25-35 BU shaft |
| Extra mechanic | none | wood moisture clock: brood survival x`clamp((woodM - 8) / 7, 0, 1)` | winter arrest in the lapse (below) | fungus pellet (below) |
| Clutch cap | 48 | 16 (9-16 real) | 20 | 40 viable-equivalent (below) |
| First workers | 8-16 (nanitic, scale 0.85) | 6-11 `minor` (survival about 0.7 in the dossier is reproduced by `muSpecies 0.55`) | 5-8 `minor`, success about 40 % at Fair sites | 8-14 `minor` (minims) |
| Lapse span | 4.5-5.5 GD | 5.1 GD (66 days) | 11-17 GD including winter | 5.0 GD to first workers, nest opens at 7-9 GD |
| Reserve story | thinning queen, eats a larva if low | thinning queen, helps workers out of cocoons | slow drain through winter (upkeep x0.4 while arrested) | queen mass countdown; she must not leave |
| Hand-over | free to forage | foraging at dusk | trunk-trail start | nest still closed: first aim `aim-nest-open` |

**Messor winter inside the lapse.** The first-brood lapse is allowed to reach winter. At winter start it applies the aggregate winter step (section 6) to the queen and brood only (brood arrested below 14 C, queen upkeep x0.4, larval overwinter survival 0.85, cold hazard as in section 6.3) and the playback shows a caption "Winter" for 8 s; the lapse then continues in spring until the first eclosion. Playback is capped at 120 s.

**Atta fungus (replaces sealing before laying).** After the dig readiness, the queen carries a `fungus pellet` in the infrabuccal pocket (state `pelletHealth = 1.0`; it decays 0.05 per GD while chamber humidity < 0.6 or `Tchamber` outside 18-30, and the colony cannot start if it reaches 0). Action `plant` (a founding-only primitive added to GDD 01's list; hold `E` 4 s) places the pellet on the chamber floor; the queen then fertilises it automatically (cost 0.25 loads per GD, `GARDEN_FERT_COST`). `garden.biomass` grows at the rate of the Atta economy (0.17 per GD sustained). **Eggs are blocked until `garden.established` (biomass >= 0.5 of the planting size, typically 0.6-0.8 GD after planting)**, then she may seal and lay. A fraction `ATTA_TROPHIC_FRACTION_FIRST = 0.7` of the first clutch is eaten by the queen or fed to the garden (a design reduction of the sourced "about 90 %" so that 8-14 minims result; deviation D4). Failure: pellet dies (`pelletHealth <= 0`) -> `failed`, cause `garden-lost`. The Escovopsis prevalence at founding is 6.6 % [Atta 3]: a 6.6 % chance (x`diff.predatorDensityMult`) that the garden suffers an `outbreak` hazard counted as `fungus`.

**Camponotus wood moisture.** `woodM` is read from the wood primitive (nest chapter). The brood clock uses the full-survival moisture of 15 % and linear drop to 0 at 8 % (research: nest wood about 15 % or higher [Camponotus 12]; the linear slope is an estimate). Drying during the lapse (dry spell, no rain) lowers `woodM`; the `fungus` hazard applies above 30 % (mould).

### 5.16 Onboarding prompts in the opening (diegetic first, per genre-ux 2.1) [T2]

Contextual glyph prompts near the queen; each appears only when its verb is available and not yet learned, hides after 3 uses (GDD 08 hint lifecycle; stored in the profile and mirrored into the save), never blocks input; "Remind me of controls" re-shows them.

Prompt ids are GDD 08's hint ids (consistency pass; GDD 08 §9.2 owns timing and learning, this table only states the opening triggers):

| Hint id (GDD 08) | Former id here | Shown when | Content |
|---|---|---|---|
| `hint-move` | `p-move` | first 5 s of `search` | move and camera glyphs |
| `hint-antennate` | `p-sniff` | `search`, queen stopped over soil, 4 s | `T` antennae glyph and a faint scent haze at the best site within 200 BU (Gentle: always; Naturalist: after 30 s; Harsh: never) |
| `hint-dig` | `p-dig` | read-out shows `diggability > 0` | `F` hold |
| `hint-reserves` (new) | `p-reserves` | dealation end | reserve meter pulses once |
| `hint-seal` | `p-seal` | readiness met | `E` hold at the shaft |
| `hint-lay` | `p-lay` | sealed | `E` in the chamber, forecast panel |
| `hint-timelapse` | `p-rest` | clutch >= 1 batch | "Tend the brood" key |
| `hint-cycle` | `p-possess-worker` | handover | `Tab` |

Usability criterion (from genre-ux 2.1): a first-time tester can dig a chamber and lay eggs without reading text beyond glyph labels; test on the headless build with the checks of Appendix E and on a few humans.

---

## 6. Overwintering [T2]

### 6.1 Modes per species

| `winter.mode` | Species | Meaning |
|---|---|---|
| `diapause-lapse` | `lasius-niger`, `camponotus-pennsylvanicus` | the colony withdraws; winter is resolved by an aggregate model with a skippable time-lapse |
| `rest-lapse` | `messor-barbarus` | same machinery, shorter rest (research: 10-15 C, 2-5 months, brood arrested below about 14 C) and milder losses; flights can extend into early winter |
| `active` | `atta-texana` | the fungus is not dormant and the colony forages on warm days (7-27 C): no lapse; winter is played normally (8x allowed). A "cool season" note appears in the journal |
| heated nests | any, if the weighted mean `chamberTemp` of chambers holding >= 80 % of brood over the previous 2 GD is >= 14 C | `winterActive`: no lapse for this colony; brood continues, workers stay active, alates may be drawn out in winter (carpenter-ant research) |

Custom rule `winterMode` = `timelapse` (default) or `realtime` (play every winter day; the aggregate model is not used and normal systems run at all speeds).

### 6.2 Trigger sequence

| Step | When | What |
|---|---|---|
| Notice | `autumn` day 6, 12:00 (`doy 20`) | journal note and alert "Nights are turning cold. Stores cover {x} days of winter at the current rate" (`diag-overwinter-readiness`) |
| Banner | winter day 1, 00:00 (`doy 22`) if mode requires the lapse | non-modal banner "Winter settles. The colony is withdrawing." with buttons `Begin` and `Delay one day` (max `OVERWINTER_DELAY_MAX_DAYS = 2` total); auto-slow rule `overwinter-prompt`. Foragers are recalled: every outdoor ant takes `return-to-nest` priority; the banner lasts at most 8 real seconds |
| Release | on `Begin` | the possessed ant is released; ants still outdoors beyond 120 BU of an entrance have a 50 % chance of dying (`cold`); ants within 120 BU shelter |
| Lapse | immediately | aggregate model 6.3 computes the whole winter at once and **then** the presentation plays |
| End | at `doy 1` 00:00 of the next year | speed paused, Winter Report overlay shown (6.5); closing it resumes 1x |

### 6.3 Aggregate model (per game hour, 168 steps for a 7-day winter)

Inputs snapshotted at `Begin`: `N` (by caste), brood by stage, stores (C, P loads), queen status, per-chamber depth and capacity, entrance floodSafety, nest `Tmin` history. The weather state machine runs for real (same `rng.weather`) so `frost` nights, rain and storms in the report are the same as the HUD would have shown.

Per game day `g`:

| Term | Formula |
|---|---|
| Cluster temperature `Tcl` | mean `chamberTemp` of the chambers where >= 20 % of workers cluster (deepest chambers with capacity, or heated chambers) |
| Metabolic factor | `fMet = WINT_MET_BASE * WINT_Q10^((Tcl - 6)/10)`; Lasius `WINT_MET_BASE = 0.35`, `WINT_Q10 = 2.2` (the dossier's 5 % of summer is too low for upkeep that includes cluster heat; deviation D6) |
| Consumption (C) | `need_g = (N * 0.08 + 0.30 + 0.02 * larvae) * fMet` loads (0.08 C/GD per resting worker and 0.30 C/GD queen from directions J; dormant larvae 0.02) |
| Consumption (P) | `(0.10 + 0.01 * larvae) * fMet` loads (queen 0.10 P/GD) |
| Starvation | if C stores reach 0 on day `g_s`: brood `0.25` per GD (eaten), then workers `0.12` per GD; if P reaches 0: larvae die at `0.06` per GD |
| Cold stress | per GD: workers `0.008 * max(0, T_COLD_STRESS - Tmin_g)` where `T_COLD_STRESS = 2.0` C (Lasius; Camponotus 0, Messor 4); `Tmin_g` = minimum `Tcl` that day; capped 0.6 total |
| Base loss | workers `WINT_BASE_LOSS = 0.06` over the winter (older workers, age > 60 % of expected life, x2); larvae `0.10` |
| Disease | `P_WINTER_FUNGUS = 0.05` per winter, x3 if nest humidity > 0.9; loss `U(0.10, 0.25)` of workers and 50 % of larvae in affected chambers |
| Flood | each `rain` or `storm` event end: for chambers below the local flood line `P = 0.3 * (1 - floodSafety) * precipPeakNorm`; loss 0.5 of occupants |
| Queen | death probability `0.03` per winter (Naturalist), plus `0.02 * (coldStress)`, plus starvation if stores 0 for 3 GD; Gentle 0 |
| Difficulty | all losses x `diff.winterLossMult` |
| Brood stage fix | at `Begin`: pupae in chambers colder than 10 C die with 0.5 (they cannot develop); eggs hatch into larvae; larvae are the overwintering stage and arrest (no development at <= 10 C) |

Species rows: `T_COLD_STRESS` and `WINT_BASE_LOSS`: Camponotus 0.0 / 0.05; Messor 4.0 / 0.05 (granary consumption `0.3 x` summer); Camponotus alates overwinter inside the nest and add their upkeep (section 11.2). Sources: research overwintering at 5-10 C for Lasius, +2 C reduced worker survival while queens were unaffected [Lasius 12.2, verified row 20], base loss 5-15 % [EST].

### 6.4 Presentation (time-lapse)

`OVERWINTER_TARGET_S = 45` s (30-75). Cutaway of the deepest chambers; frost rime on the surface strip at the top; day counter; stores bars decrement; the ant cluster tightens on cold days; brood is still; the Winter Report pre-fills as events fire (frost nights, rain, flood). `Skip` jumps to the report (the result is already computed, so identical). Reduced motion: five crossfaded stills. At the end the colony is placed as in spring: ants resume tasks, `season = spring`.

### 6.5 Winter Report (explanation shown)

A field-journal card, always shown, closable:

| Block | Content |
|---|---|
| Headline | "{Species} colony, winter of Year {n}: {W} workers (started with {W0})" |
| Population | workers `W0 -> W1 (-d)` with causes ranked (old age, cold, starvation, disease, flood, outdoors) with counts; larvae; queen status |
| Stores | C and P `before -> after`, days of stores remaining |
| Climate | coldest chamber temperature and its name/depth; number of frost nights; heaviest rain; flood events |
| Why | the top 3 weighted causes of loss (diagnostic style: factor, weight, remedy), e.g. "Cold 55 %: the nursery lay 12 BU deep (4.2 C minimum); chambers deeper than 40 BU stayed above 5.8 C. Remedy: dig a deeper winter chamber." |
| Outlook | "Spring brood expected from day {n}" |

### 6.6 Failure handling

If `N` is 0 after the aggregate step the lapse ends with the Epitaph (cause = leading loss cause). A save made inside the lapse is impossible (autosave blocks); autosaves `pre-winter` (before banner) and `post-winter` (after report) bracket it (section 15).

---
## 7. Colony stages [T2; descriptive, never gating]

Stages describe the colony; they do not lock content. They drive HUD wording, which onboarding prompts appear, the journal's section headings and the reproduction gate (11.1). Evaluated at each local midnight and on a stage-relevant event.

| Stage id | Meaning | Entry criteria | Leaves when |
|---|---|---|---|
| `founding` | the queen alone with brood | game start (first clutch laid sets `foundingTick`) | first adult worker eclosed |
| `first-workers` | a handful of nanitics, one chamber, solitary foraging | >= 1 adult worker | `N >= growThreshold` |
| `growing` | trails, several chambers, brood in every stage | `N >= growThreshold` | `N >= matureThreshold` and `colonyAge >= matureAgeYears` |
| `mature` | large, stable, able to rear alates | both mature criteria | `N < 0.7 * matureThreshold` (hysteresis) returns to `growing` |

| Species | `growThreshold` (`N`, simulated workers) | `matureThreshold` (`N`) | `matureAgeYears` (game years) | Basis (thresholds restated in simulated workers by the consistency pass, directions K; GDD 07 growth targets reach them at about the stated age) |
|---|---|---|---|---|
| `lasius-niger` | 75 | 700 | 2 | cooperative foraging at about 75 workers; alate gate 12.2 |
| `camponotus-pennsylvanicus` | 50 | 500 | 4 (Gentle 3, Harsh 6) | first alates about year 4 [Camponotus 4, 12] |
| `messor-barbarus` | 50 | 700 | 3 | 3-5 years to maturity [Messor 4] |
| `atta-texana` | 150 | 1 000 | 3 | years 1-2 at 500-100 000, alates from year 3-4 [Atta 4, 12.1] |

Modifiers (flags, not stages): `orphaned` (queenless, 13.2), `declining` (`N` fell >= 20 % over the last 3 GD outside winter), `dormant` (overwintering). Difficulty scales both thresholds by `diff.matureGateMult` (Gentle 0.8, Naturalist 1.0, Harsh 1.2). Stage changes emit `stage.changed` and a journal entry; regressing from `mature` to `growing` writes a note, not a failure.

---

## 8. Milestones [T2]

One-shot, recorded with the in-game date, tick and a short journal text (calm naturalist voice, no score, no rewards besides a plate and a line in the Lineage). Triggers are evaluated by the progression system from events or state in the milestone pass of the tick (after the economy). Text tokens: `{n}`, `{depth_mm}`, `{zone}`, `{zone_from}`, `{zone_to}`, `{species}`, `{doy_date}`. Species column: all unless named.

| Id | Title | Trigger condition | Journal text |
|---|---|---|---|
| `ms-first-shaft` | A shaft in the soil | founding shaft depth first reaches `FOUND_SHAFT_MIN_BU` | The queen has driven a shaft {depth_mm} mm into the ground. Pellets of soil lie scattered at the entrance, where she left them. |
| `ms-founding-chamber` | A chamber closed on all sides | founding chamber volume first reaches `FOUND_CHAMBER_MIN_VOXELS` | At the foot of the shaft she has widened a small cell, barely larger than herself. It will hold everything she raises. |
| `ms-sealed-in` | Sealed in | entrance `sealed` for the first time | The entrance is plugged with soil. From here she will not feed; her body is the only store. |
| `ms-first-eggs` | The first eggs | first egg laid (`foundingTick`) | The first eggs lie in a small pile. She turns them and licks them clean. |
| `ms-first-larva` | Larvae | first larva hatched | The first larvae have hatched. She feeds them from her own reserves. |
| `ms-first-pupa` | Cocoons | first pupa formed | The larvae have spun cocoons. Development now needs only warmth. |
| `ms-first-worker` | The first worker | first adult worker eclosed | The first worker has emerged. She is smaller than the workers that will follow and paler than her mother; within the hour she will darken. |
| `ms-nest-reopened` | The nest reopens | first worker leaves through the sealed entrance | A worker has opened the plug and stood in daylight for the first time. The colony is no longer closed. |
| `ms-first-food` | First food | first food load delivered to the nest by a worker | A worker has returned with food. The colony now depends on more than the queen's reserves. |
| `ms-first-honeydew` | Honeydew | first `honeydew` load delivered | A forager has come home carrying honeydew. Aphids on a stem above are feeding the colony. |
| `ms-first-prey` | First protein | first `prey` or `carrion` item delivered | A small animal has been dragged into the nest. The larvae can now grow on more than sugar. |
| `ms-first-trail` | A trail | a worker-laid `trail` followed by >= 3 distinct ants (any source) | Three ants have walked the same line. A trail persists only as long as it is walked. |
| `ms-second-chamber` | A second chamber | second chamber registered | The nest has a second chamber. Brood can be kept apart from stores. |
| `ms-nursery` | A nursery | a `nursery`-type chamber holds brood | Brood has been gathered in one chamber, the warmest the nest has. |
| `ms-first-midden` | The refuse heap | first `midden` chamber or surface heap holds waste | The dead and the discarded now lie in one place, away from the brood. |
| `ms-second-entrance` | A second way out | a second entrance exists | A second entrance opens to the surface. The nest is harder to block now. |
| `ms-depth-50` | Fifty body lengths down | GDD 03 `nest-milestone` `depth-50` (deepest open voxel ≥ 50 BU) | The deepest gallery now lies fifty body lengths below the surface, where the soil barely feels the day. |
| `ms-depth-100` | A hundred down | GDD 03 `depth-100` | The nest reaches a hundred body lengths into the ground. |
| `ms-chambers-10` | Ten chambers | GDD 03 `chambers-10` | Ten chambers now open off the galleries. |
| `ms-volume-1000` | A larger nest | GDD 03 `volume-1000` (open volume ≥ 1 000 BU^3) | The nest has grown to a thousand cubic body lengths of tunnels and rooms. |
| `ms-first-aphid-herd` | Herding aphids | a `tend` herd attended >= 0.5 GD | Workers stand among a cluster of aphids, stroking them with their antennae for droplets. |
| `ms-first-possession` | Seen from within | player possesses an ant for >= 30 s | For the first time the colony has been seen from the height of a worker. |
| `ms-first-trophallaxis` | Mouth to mouth | possessed ant completes a trophallaxis transfer | Food has passed from crop to mouth. The same act carries nutrients, and anything toxic, through the whole colony. |
| `ms-zone-crossed` | Across the boundary | a worker first enters a zone type other than the nest zone | A forager has crossed from {zone_from} onto {zone_to}. The ground underfoot has changed. |
| `ms-micro-connection` | A narrow way | first passage through a micro-connection (crack, joint, gap, pipe) | A crack too narrow for a larger animal has opened a route. A single body length of passage can join two worlds. |
| `ms-workers-25` | Twenty-five workers | `N >= 25` | Twenty-five workers now share the work. |
| `ms-workers-100` | A hundred workers | `N >= 100` | The colony has passed a hundred workers. Individual ants matter less, and the trails more. |
| `ms-workers-500` | Five hundred | `N >= 500` | The colony has passed five hundred workers. |
| `ms-workers-1000` | A thousand | `N >= 1000` | The colony has passed a thousand workers. |
| `ms-stage-growing` | A growing colony | stage becomes `growing` | The colony has passed its first fragile weeks. It now holds more brood than the queen could ever tend alone. |
| `ms-stage-mature` | A mature colony | stage becomes `mature` | The colony is large enough to spare labour for the next generation. |
| `ms-first-rain` | The first rain | a `shower` or `downpour` while >= 1 ant is outside and exposed trail cells exist | Rain has fallen on open ground and the trails across it are gone. Those under leaves and stones remain. |
| `ms-first-flood-rescue` | Brood carried uphill | brood moved out of a chamber that water entered (also GDD 03 `nest-milestone` `survived-flood`) | Water entered a chamber. The workers carried the brood to higher ground before it rose. |
| `ms-first-heat-wave` | Heat | a `heat` spell ends with the colony alive | A spell of heat has passed. The pavement was too hot to cross at midday; the colony worked at dawn and dusk. |
| `ms-first-frost` | Frost | first `frost` night | The first frost has settled on the grass. Underground, the colony is above freezing. |
| `ms-first-storm` | A storm | a `storm` ends with the colony alive | A thunderstorm has passed overhead. Every forager was recalled; the nest held. |
| `ms-first-footfall` | A shadow overhead | survived a `footsteps` event with an ant within 60 BU | A giant shape passed over the trail. Ants froze or scattered; the ground trembled before it fell. |
| `ms-first-fight` | First contact | first combat involving a colony ant | The first fight: a worker met a stranger and neither backed away. |
| `ms-first-rival-defeated` | A rival repelled | a rival colony is driven off or destroyed | A neighbouring colony has been turned back from the territory the workers hold. |
| `ms-first-winter-survived` | First winter | first Winter Report with the colony alive | The colony has come through its first winter. The queen is alive. |
| `ms-winter-3` | Third winter | third winter survived | A third winter survived. |
| `ms-winter-10` | Tenth winter | tenth winter survived | Ten winters survived. |
| `ms-year-1` | One year | `colonyAgeDays >= 28` | One year since the first egg. |
| `ms-year-5` | Five years | `colonyAgeDays >= 140` | Five years since the first egg. |
| `ms-first-alate` | Winged | first `gyne` or `male` eclosed | The first winged ants have emerged. They will wait in the nest for the right day. |
| `ms-first-flight` | A nuptial flight | first `flight.launched` | The winged ants have left the nest in a single morning's rush. By evening most will have been eaten or lost. |
| `ms-first-daughter` | A daughter | first daughter foundation recorded in the Lineage | A young queen has landed, shed her wings and begun to dig, somewhere beyond the colony's range. |
| `ms-flight-flown` | Flown | possessed flight completed (mating or not) | The flight is over: wind, height, the sound of other wings, and the ground coming up. |
| `ms-queen-lost` | The queen is gone | queen dies | The queen has died. Brood already in the nest will mature, but no more eggs will be laid. |
| `ms-first-gallery` (Camponotus) | A chewed gallery | first wood chamber excavated; frass pile exists | A gallery now runs through the wood. Pale shavings have collected below the opening. |
| `ms-satellite-nest` (Camponotus) | A satellite | a satellite nest holds brood | Older brood has been carried to a drier, warmer satellite; the queen stays in the damp parent nest. |
| `ms-night-trail` (Camponotus) | After dark | a trail laid and used between `dusk` and `dawn` | The first night trail runs along a trunk. Carpenter ants forage in the dark. |
| `ms-first-seed` (Messor) | A seed | first `seed` delivered | The first seed has been carried in and stored. |
| `ms-first-granary` (Messor) | A granary | a `granary` chamber holds seed | A chamber of stored seed stands dry beside the brood. Husks lie in a heap near the entrance. |
| `ms-trunk-trail` (Messor) | A trunk trail | a trail in use for >= 3 GD and >= 150 BU long | A worn road now leads out from the nest and stays after the ants have left it. |
| `ms-fungus-planted` (Atta) | The garden | fungus pellet planted | The queen has set down the fungus she carried from her mother's nest. |
| `ms-first-leaf` (Atta) | First leaf | first `leaf` fragment delivered | A green fragment has been carried in. Leaves feed the fungus, and the fungus feeds the brood. |
| `ms-garden-chamber` (Atta) | A second garden | second `fungus` chamber established | A second chamber holds fungus. |
| `ms-first-major` (polymorphic species) | A larger worker | first `major` eclosed | The first of the largest workers has emerged. Its head is far wider than its sisters'. |

Detail rules: a milestone fires at most once per game (stored by id); Lineage records the ones marked in Appendix A (`lineageMilestones`). Species-specific rows exist only for species that have the mechanic. Tier: opening rows and counts T1/T2, species rows T3.

---

## 9. Journal [T2; graphs and causes T2]

### 9.1 Contents

| Tab | Content |
|---|---|
| Timeline | chronological entries of kinds: `milestone`, `stage`, `season` (a note on each season change: workers, brood, stores, season weather summary), `weather` (first of each kind per season; heat spell and cold snap start/end with extremes), `loss` (>= 5 deaths in 0.25 GD, queen death), `event` (human, predator, rival, flood), `winter-report`, `flight` (nuptial flight record), `aim` (aims opened and completed). Each entry stores `{id, tick, kind, title, text, refs: entityIds}`; clicking jumps the camera to `refs` if still valid. Filters per kind; search |
| Graphs | the series in 9.2 with the season bands and weather band under the time axis, range selector (last year, last 5 years, all) |
| Causes of death | section 9.3 |
| Aims | "Current focus" (<= 3) and completed aims |

Limits: 4 000 timeline entries (older `season`/`weather` entries are merged into per-year summaries first). No free-text notes are required; none are implemented.

### 9.2 History series

Sampled once per GD at local midnight into `history.daily` (never discarded; 2 800 samples cover 100 game years) and once per game hour into `history.hourly` (ring of 168 h = 7 GD, as GDD 02 §13.2 and GDD 08 §7.2 need). Series ids are GDD 02 §13.2's (consistency pass); the former ids of this chapter map as listed in the second column.

| Series id (canonical) | Former id here | Unit | Notes |
|---|---|---|---|
| `workers` (+ `workers-by-caste`, `workers-by-group`) | `pop.workers` | `N` by caste (stacked) | |
| `eggs`, `larvae`, `pupae` | `pop.brood` | counts by stage | |
| `alates` | `pop.alates` | gynes, males | new id |
| `stores-c`, `stores-p` | `stores.c`, `stores.p` | loads | winter shading |
| `intake-c`, `intake-p` (+ `intake-by-kind`) | `flow.in.c`, `flow.in.p` | loads per GD | returned food by kind (stack: honeydew, nectar, prey, carrion, seed, human food, other) |
| `eclosions`, `deaths` | `flow.births`, `flow.deaths` | per GD | |
| `air-temp` (min, max), `nursery-temp` | `climate.air` | C | with the weather state band |
| `nest-volume`, `nest-chambers` | `nest.volume`, `nest.chambers` | BU^3, count | new ids |
| `range-max` | `range.max` | BU | farthest trail point from an entrance; new id |
| `deaths-by-cause` | `deaths.byCause` | per GD by cause id | new id |
| `queen-reserves` | `queen.reserves` | 0..1 (founding), queen age | new id |

### 9.3 Causes of death

Death causes (ids; canonical list, extended by GDD 05 and the consistency pass): `old-age`, `starvation`, `desiccation`, `heat`, `cold`, `drowning` (any water, including nest floods; the earlier separate `flood` is merged into it), `crushed`, `predation`, `bird`, `antlion`, `parasitoid`, `combat`, `disease`, `poison` (bait, spray), `fell`, `exhaustion` (queen reserves), `lost` (exposure after being separated), `dispersed` (left the map), `unknown`. Every ant death records `{tick, cause, caste, role (task at death), zone, season, underground: bool}`; deaths are aggregated, not stored per ant beyond the cause counters and a ring of the last 200 (for the Why view). The summary shows the top 5 causes overall, by caste, by role (foragers vs nurses), by season, surface vs underground. The Epitaph (13.5) reuses it.

---

## 10. Codex [T2 mechanism; entries per species T3]

The codex is a field-journal reference unlocked by first observation ("watch trophallaxis once and the plate fills in"). Each entry: id, title, unlock trigger, a two-sentence naturalist note grounded in the research, species tag (LN = *Lasius niger*, CP = *Camponotus pennsylvanicus*, MB = *Messor barbarus*, AT = *Atta texana*, ALL). Unlocks are stored per device in the profile store (`foundress.profile.v1`, GDD 08 §7.3; not per save), each with the first-seen game date, and mirrored per game in `progression.codexSeen`. Unlocking emits `codex.unlocked` and a quiet journal marker; it never opens a panel. Notes are written for the player in the naturalist voice; the dossier source of each fact is kept in `docs/research` only, not shown in play.

| Id | Title | Unlock trigger | Note | Tag |
|---|---|---|---|---|
| `cx-dealation` | Dealation | opening phase `dealation` | A newly mated queen sheds her wings after landing. The flight muscles inside her thorax are then broken down and used as food. | ALL |
| `cx-claustral-founding` | Claustral founding | `ms-sealed-in` | A claustral queen digs in, seals herself into a chamber and raises her first workers from stored fat and muscle without feeding. A queen with no shelter would most likely not survive. | LN CP MB AT |
| `cx-queen-reserves` | The thinning queen | queen reserves below 0.5 | Over the founding period the queen's body shrinks as her reserves are spent; the reference species loses roughly half her weight by the time workers hatch. The abdomen is the gauge. | LN |
| `cx-egg-eating` | A hard choice | queen eats a larva | A hungry founding queen may eat some of her own brood. The nutrients go back into the clutch that remains. | LN |
| `cx-brood-stages` | Egg, larva, pupa | `ms-first-pupa` | Eggs, larvae and pupae were recorded separately in founding colonies; in the laboratory the first worker appeared a median of 52 days after the first egg. Formicine pupae spin a silk cocoon. | LN |
| `cx-callow` | Colouring in | `ms-first-worker` | New workers emerge pale and darken over about an hour. The first generation visibly colours in. | ALL |
| `cx-nanitics` | The smallest sisters | `ms-first-worker` | Workers of the first brood are small: head width about 6 % narrower than workers of 20-month-old colonies. They are more efficient at brood care. | LN CP MB |
| `cx-brood-warmth` | Warmth and development | brood development slowed by cold | Brood development stops in the cold and speeds up as temperature rises. In the reference species the larva is the overwintering stage. | ALL |
| `cx-trophallaxis` | Mouth to mouth | trophallaxis observed | Liquid food passes from the crop of one ant to the mouth of another; nutrients and toxins spread through the colony this way. The queen is fed by workers. | ALL |
| `cx-trail-pheromone` | The trail | `ms-first-trail` | Foragers lay a chemical trail that fades unless it is reinforced. About one forager in five ignores it. | ALL |
| `cx-route-memory` | Memory against scent | an ant follows a remembered route off-trail | After a few visits a *Lasius niger* forager learns its route and combines memory with pheromone. It can learn to ignore a trail but not to avoid one. | LN |
| `cx-home-range` | Colony smell on the ground | crossing a home-range gradient | Workers leave non-volatile hydrocarbons from their feet, building a gradient of colony scent around the nest. Outbound ants lay less trail pheromone on such marked ground than returning ants. | LN |
| `cx-polyethism` | Young inside, old outside | a worker changes task from nurse to forager | The youngest workers nurse and tend the queen; the oldest forage and handle waste. Outdoor tasks carry more risk. | ALL |
| `cx-necrophoresis` | The undertakers | first corpse hauled | Workers carry the dead to a refuse heap away from the brood. In another ant, oleic and linoleic acid are the post-mortem cues. | ALL |
| `cx-nestmate-recognition` | Colony odour | a stranger is rejected | Ants recognise nestmates by a colony-specific blend of body hydrocarbons. Aggression does not depend on how near or how related the stranger is. | ALL |
| `cx-formic-acid` | Acid | first acid spray | Formicine ants have no sting. They bite, curl the abdomen forward and spray formic acid from the tip. | LN CP |
| `cx-honeydew` | Honeydew | `ms-first-honeydew` | Aphids excrete honeydew, rich in carbohydrate but an incomplete diet. Workers still need prey for protein. | LN CP |
| `cx-aphid-tending` | The herd | `ms-first-aphid-herd` | Workers stroke aphids to solicit droplets and drive off ladybirds. The footprints of tending ants carry chemicals that slow the aphids by about 30 %. | LN CP |
| `cx-protein-larvae` | What larvae need | `ms-first-prey` | Carbohydrate fuels adult activity and lifespan; protein is needed for larval growth and for the queen's eggs. A colony with larvae collects more protein. | ALL |
| `cx-elaiosome` | Seeds with a handle | an elaiosome seed carried | Violet and celandine seeds carry a fat-rich elaiosome. Ants take the seed home, eat the elaiosome and discard the seed on the refuse heap. | LN |
| `cx-extrafloral-nectar` | Nectar on the leaf | extrafloral nectar drunk | Cherry and some other plants secrete nectar outside the flower, on leaf stalks. Ants that visit it also guard the plant. | LN CP |
| `cx-cofounding` | Sisters who are not | opening start (Lasius) | In about 18-25 % of cases, two to five unrelated *Lasius niger* queens found a colony together. Once workers emerge the queens fight until one remains; egg output decides it, not size. | LN |
| `cx-nuptial-flight` | Flying day | first `flight.eligible` | British flights occurred mostly in July and August, only above 13 C and with wind under 6.3 m/s, and on every day with a mean above 25 C. They were far less synchronised than the popular idea of one flying-ant day. | ALL |
| `cx-males` | Short lives | first male dies after a flight | Males live only briefly after emerging; in leafcutters one to two weeks. They die soon after mating. | ALL |
| `cx-hibernation` | The cold months | first Winter Report | Lasius colonies overwinter at about 5-10 C. At 2 C worker survival was lower than at 7-8 C in one experiment, while queens were unaffected. | LN CP MB |
| `cx-overwinter-larvae` | Larvae through the winter | first Winter Report | Queens stop laying before winter and the brood overwinters as larvae. Development resumes as the soil warms. | LN CP |
| `cx-stone-nests` | Warm stone | nest founded under stone, slab or wood | *Lasius niger* nests under stones, paving, wood and plastic that the sun warms. Where none exist it builds a soft mound in soil or turf. | LN |
| `cx-mound-structure` | Inside a mound | nest volume above 5 000 BU^3 | CT scans of two meadow mounds, 27 and 21 cm tall, found chambers and galleries made up about 30 % of the volume, galleries about 6 mm high and 12 mm wide. | LN |
| `cx-wood-moisture` | Damp wood | `ms-first-gallery` | Carpenter ants prefer wood with a moisture content of 15 % or more. They chew it and carry it out; they do not eat it. | CP |
| `cx-frass` | Shavings | frass pile exists | Frass collects below nest openings. It holds insect parts and seed husks, so it is also the midden. | CP |
| `cx-satellite-nests` | Parent and satellite | `ms-satellite-nest` | The queen and young brood stay in the moist parent nest. Drier, warmer satellites speed the development of older brood. | CP |
| `cx-night-foraging` | The night shift | `ms-night-trail` | Carpenter ants forage mostly at night, up to about 91 m from the nest. *Atta texana* emerges at dusk once the air has cooled below 30 C. | CP AT |
| `cx-seed-classes` | Seeds by size | first seed of each size class delivered | Harvester seeds fall into size classes: about 0.4-4 mg carried by small workers, 4-20 mg dragged by medium, 20-100 mg carried or cut by majors. Seeds below about 0.4 mg are rarely taken. | MB |
| `cx-trunk-trail` | The worn road | `ms-trunk-trail` | *Messor barbarus* keeps permanent trunk trails up to about 30 m long. They persist when not in use. | MB |
| `cx-granary-chaff` | Granary and chaff | `ms-first-granary` | Husks and non-food plant parts go to a refuse pile beside each entrance, where the soil is richer and seeds sprout. Secretions of the metapleural gland are reported to prevent germination and rot in the store. | MB |
| `cx-hybridogenesis` | Two lineages | first gyne mated (flight record) | In Iberian *Messor barbarus* two lineages coexist; workers are hybrids between them, while new queens come only from matings within a lineage. A queen mates with about 2.4 males. | MB |
| `cx-fungus-garden` | The garden | `ms-fungus-planted` | Leafcutter larvae are fed only fungus, grown on cut leaf. The garden thrives at about 21-25 C and fails if too rich in protein. | AT |
| `cx-leaf-cutting` | Cutting | `ms-first-leaf` | A related leafcutter took about 25 s per millimetre of grass at 25 C and 77 s at 15 C. The ants stridulate as they cut. | AT |
| `cx-hitchhikers` | Passengers | a minim rides a carried leaf | Small workers sometimes stand on a carried leaf fragment and ward off parasitic flies. | AT |
| `cx-garden-waste` | Waste | first waste heap worker | Waste goes to detritus chambers or an outside heap. Heap workers rarely leave it, and contaminated workers are attacked. | AT |
| `cx-fungus-pellet` | Carrying the garden | opening phase `plant` | A founding queen carries a pellet of her mother's fungus and plants it. Only about 2.5 % of young queens found a colony that lasts. | AT |
| `cx-raindrops` | Rain at ant scale | first rain hit | A 2 mm raindrop weighs about 4 mg, several times a worker. Drops of 4-5 mm weigh 34-65 mg and fall at about 9 m/s. | ALL |
| `cx-hot-surfaces` | Hot ground | first `heat-stupor` or `Tmicro` >= 40 | Sunlit asphalt exceeds 50 C in summer. At such temperatures ants lose muscle control within minutes. | ALL |
| `cx-dew` | Dew | first dew morning | Dew forms on clear still nights and is gone by about 09:00-10:00. Droplets are a drink, and slippery underfoot. | ALL |
| `cx-frost` | Ground frost | first `frost` night | Air frost forms on clear cold nights. Ants shelter underground, where the soil lags behind the air. | ALL |
| `cx-wind` | Wind | first gust | Wind near the ground is a fraction of what a weather station reports: 1 m/s at 2 m is about 0.1-0.3 m/s at ground level. Winged ants do not fly above about 6 m/s. | ALL |
| `cx-paving-joints` | Joints | `ms-micro-connection` (joint) | Joints in permeable paving are 3-6 mm wide, about one *Lasius* body length. Sand-filled joints are favoured nest sites. | LN |
| `cx-footfall` | A shoe | `ms-first-footfall` | A shoe print is about 200 by 80 mm, fifty body lengths long for *Lasius*. The ground trembles before it falls. | ALL |
| `cx-jumping-spider` | Jumping spiders | first jumping spider seen | Jumping spiders have the best eyesight among arthropods and stalk to within a few body lengths before they leap. Some species specialise in ants. | ALL |
| `cx-wolf-spider` | Wolf spiders | first wolf spider seen | Wolf spiders hunt on the ground and in litter, sprinting to pounce; ants are among their prey. | ALL |
| `cx-antlion` | The pit | first antlion pit seen | An average antlion larva digs a pit about 75 mm wide and 50 mm deep in dry loose sand under shelter. It flicks sand at escapees. | ALL |
| `cx-ant-spiders` | Ant-eating spiders | first `ant-spider` seen | *Zodarion* spiders specialise in ants, up to 5 mm long; they bite and retreat while the ant is paralysed. | ALL |
| `cx-phorid-flies` | Flies over the trail | a phorid attack | Phorid flies hover over trails and strike the thorax; the larva consumes the head over weeks. Ants freeze or hide, and foraging falls. | CP AT |
| `cx-formica` | The big neighbour | first Formica-type rival seen | *Formica rufa* group colonies hold 100 000 to 400 000 workers, spray formic acid and hold their territories in spring boundary contests. | LN CP |
| `cx-pavement-wars` | Boundary disputes on the slabs | first *Tetramorium*-type rival seen | *Tetramorium immigrans* nests under pavement; colonies range from a few thousand to over 10 000 workers and contest shared joints in mass encounters at their boundaries. | LN |
| `cx-fungal-threads` | Fungus in the nest | first `disease` death | Entomopathogenic fungi thrive in damp nests. Ants control them by grooming, and by moving away from infected areas. | ALL |
| `cx-interface-orders` | Orders without a commander | first `setDirectives` or `placeMarker` command (or opening it from the Directives tooltip link, GDD 08 §4.2) | No queen gives orders: a colony coordinates its work through each ant's local encounters and chemical cues, and how it does so differs from species to species (Gordon 2007, "Control without hierarchy"). The Directives panel and markers are a simplification for play; the ants still decide one by one whether to take up the work (GDD 02 §0.3 D10). | ALL |

Rows: 57 (56 plus `cx-interface-orders`, Interface category, added to close traceability gap G2; unlike the other `cx-interface-*` entries it unlocks on use rather than being always unlocked), plus the entries GDD 08 §9.4 needs that the table above does not yet hold (ids fixed by the consistency pass, text to be written in the same voice): `cx-species-lasius-niger` (game start; one `cx-species-<id>` per species), `cx-antennation` (first antennation), `cx-nursing` (first larva fed), `cx-springtail` (first springtail seen), `cx-material-loam` (first dig in loam; one `cx-material-<id>` per diggable material), `cx-habitat-<zone>` (first entry into each zone type), `cx-interface-why`, `cx-interface-markers`, `cx-interface-time` (always unlocked; the manual). All codex ids use the `cx-` prefix. Codex trigger resolution never blocks play; a trigger fires the first time the underlying sim event is seen by the *player's* view (observed, not merely occurring); the debug API has `cheat.unlockCodex(id)`.

---
## 11. Reproduction [T2 for `lasius-niger`; other species T3]

### 11.1 When alates are reared (the gate)

Evaluated at each local midnight inside the species' `alateLayWindow`. All must hold:

| Gate id | Condition (Lasius) | Diagnostic text if failed |
|---|---|---|
| `gate-stage` | stage `mature` (7) | "Colony too small: {N} of {matureThreshold} workers" |
| `gate-age` | `colonyAge >= 2` game years (`matureAgeYears`) | "Colony too young" |
| `gate-queen` | queen alive and queenright | "No queen" |
| `gate-stores` | C stores cover >= `REPRO_STORE_DAYS_C = 3` GD and P stores >= `REPRO_STORE_DAYS_P = 1.5` GD of colony need (GDD 02 `daysC`, `daysP`; equal to the normal stock targets, which the colony can actually reach) | "Stores cover only {x} days" |
| `gate-season` | `doy` inside `alateLayWindow` | "Out of season" |
| `gate-player` | `alateInvestment > 0` | "Alate production is off" |

If the gate passes the colony enters `alateRearing = true` for the window. Hysteresis: if stores fall below half of those covers during rearing, new sexual eggs stop (those already laid continue).

### 11.2 Species parameters

| Parameter | `lasius-niger` | `camponotus-pennsylvanicus` | `messor-barbarus` | `atta-texana` |
|---|---|---|---|---|
| `alateLayWindow` (`doy`) | spring 2-6 | spring 2-3 (0.7 GD window; sexuals from spring eggs [Camponotus 4]) | summer 8-13 | autumn-winter 15-28 (alate brood reared in the winter central cavity [Atta 4]) |
| Egg-to-alate duration | 1.3 x worker duration (5.2 GD at 21 C) | 1.15 x major duration (about 5.6 GD) | 1.2 x worker | 1.3 x major duration (about 6.5 GD) |
| Eclosion | spring `doy` 7-11 | about `doy` 11 (August); **alates overwinter in the nest** (males before females) | summer | winter-spring |
| `alateFlightWindow` (`doy`) | 9-13 (peak 10-11) | 1-9 of the next year (peak 4-6), individual, not synchronised | 15-20 (peak 17-19) | 2-8 |
| Launch hour | 14:00-18:00 | 16:00-20:00 (time of day not found: `[E]`) | 13:00-17:00 | 21:00-03:00 |
| Max alate fraction `REPRO_MAX_FRAC` of `N` (at investment 1.0) | 0.10 (research 5-8 %) | 0.12 (30-140 per year [Camponotus 12]) | 0.02 (8-25 alates) | 0.04 (20-60 alates per flight) |
| Gyne share `REPRO_GYNE_SHARE` | 0.40 | 0.44 | 0.50 | 0.25 |
| Cost multipliers (x `LARVA_COST_LOADS` = 1.6 loads) gyne / male | 12 / 2 | 8.0 / 1.3 × the media larval cost (= 12.8 / 2.1 loads; consistency pass adopts GDD 07 R4: the dossier's units were minor-relative) | 10 / 2 | 15 / 3 |
| Alate upkeep per GD (C loads) gyne / male | 0.15 / 0.08 | 0.5 x queen / 0.2 | 0.15 / 0.08 | 0.2 / 0.1 |
| Flight survival `p_air` / mating `p_mate` / site `p_found` | 0.60 / 0.90 / 0.70 | 0.65 / 0.90 / 0.70 | 0.55 / 0.866 / 0.70 | 0.50 / 0.90 / 0.70 |
| Weather gate | see 11.5 | see 11.5 | see 11.5 | see 11.5 |

Cost example (Lasius): gyne 19.2 loads (14.4 P, 4.8 C), male 3.2 loads. Colony `N = 700`, investment 0.5: target `A* = round(0.5 * 0.10 * 700) = 35` alates, 14 gynes and 21 males, total `14 * 19.2 + 21 * 3.2 = 336` loads. The Directives panel shows this preview, with "about N GD of the colony's protein income" (computed from the last 5 GD of `flow.in.p`).

### 11.3 Player control of investment [T2]

| Control | Range | Effect |
|---|---|---|
| `alateInvestment` (sent with `setDirectives`, GDD 02 §12.1) | 0 % to 100 % (default 50 %, Auto) | the target `A* = round(investment * REPRO_MAX_FRAC * N * diff.alateCapMult)`; the queen's first `A*` eggs in the lay window become `sexual` destined (sexes by `REPRO_GYNE_SHARE`, or the `gyneShare` slider below) |
| `gyneShare` [T3] | 20 %-60 % | changes the sex mix of `A*`; more gynes cost more |
| `alatePolicy` | `auto-release` (default), `ask`, `hold` | what happens on an eligible flight day (11.5) |

Larvae of `sexual` destiny need `mult x` the nutrition of a worker larva. When a sexual larva reaches the pupal checkpoint with a nutrition ratio below 0.6 it is **demoted**: it pupates as a worker and the partial cost is booked as `alateShortfall` in the Why view; at 0.6-1 it proceeds. Unreleased alates (policy `hold`, or no eligible day) are evicted and eaten by workers `ALATE_EXPIRE_GD = 3` GD after the flight window closes, recovering 40 % of their P (Camponotus alates overwinter instead).

### 11.4 Alate states

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `brood-sexual` | egg destined sexual | as brood, larger | eclosion |
| `callow-alate` | eclosed | wings soft, 0.3 GD maturation; fed by workers | 0.3 GD |
| `waiting` | matured | stays in a `rest` or `general` chamber (not tasked, not fed priority over brood), consumes upkeep | flight launch, or expiry |
| `assembling` | launch day | moves to entrances and climbs to the highest point near the nest within 0.1 GD (males first) | takeoff |
| `flying` | takeoff | not simulated per-ant unless possessed (11.6) | `flight.ended` |

### 11.5 Nuptial-flight day conditions

At the species `launch hour` start minus 0.5 h on every day inside `alateFlightWindow`, and while any `waiting` alate exists, the day roll uses these terms (Lasius; others in the table below):

```
p_launch = clamp01(0.85 * p_T * p_W * p_state + bonus)      // hard gates first
hard:  Tair >= 13 C ;  wind2m < 6.3 m/s ;  weather not in {rain, storm, frost}
p_T    = clamp((Tair - 13) / (25 - 13), 0, 1)
p_W    = 1 if wind2m < 1.7, else linear down to 0 at 6.3
p_state= clear 1.0, heat 0.8, overcast 0.6
bonus  = +0.10 if rain ended within the previous 1.5 GD (damp soil helps nest digging)
         + 0.05 * clamp((Tmax_today - Tmax_yesterday) / 3, -1, 1)
```

Humidity is not a trigger (research correction: humidity is not shown to be one [Lasius verification row 18]; the earlier "hot humid day" idea is dropped). Expected eligible days in a 5-day window: 2-3 in a normal summer, matching "2-3 eligible GD per summer".

| Species | Hard gates | Soft terms |
|---|---|---|
| `camponotus-pennsylvanicus` | `Tair >= 13`, `wind2m < 5`, weather `clear` or `overcast` | `p = 0.6 * clamp((Tair - 13)/9) + 0.15 if first rain in 2 GD`; launches spread over 4 h (alates leave singly, not a mass flight [Camponotus 10]); heated nests (`Tchamber >= 18` in winter) cause sporadic weak winter flights that end in death |
| `messor-barbarus` | rain accumulated >= 7 game hours in the prior 1.5 GD; the day is 0.15-0.6 GD after rain ended; `wind2m < 3`; `Tair >= 15` | `p = 0.8 * p_T * p_W`; single annual flight, regionally synchronised (all rivals' Messor release too) |
| `atta-texana` | cumulative rain >= 6.35 mm in the prior 1 GD; `clear`; `moonless`; `Tair >= 15`, `wind2m < 3` | `p = 0.8`; hour 21:00-03:00 |

`alatePolicy = auto-release`: flight launches at launch hour start if `rng.repro < p_launch`. `ask`: a prompt "Conditions are good. Release the alates?" with `Release` and `Wait` (a declined day is not rerolled that day). `hold`: never. One launch per day.

### 11.6 The flight itself [T2 observer; possessed experience T3]

| Step | Behaviour |
|---|---|
| Assembly (0.1 GD = 1 real minute) | alates stream out; males first; workers agitated; the Observer camera frames the entrance unless the player is possessing someone |
| Prompt (15 s, non-blocking, also a Roster entry) | `Fly as a young queen`, `Watch`, `Continue` |
| Possessed flight [T3] | `phase` sequence `ascend, lek, mate, descend, land`. Controls: camera-relative move, `Space` ascend (40 BU/s), `C` descend, forward speed 80 BU/s. `flightEnergy` 1.0 falls 1/90 per second (x1.5 if `wind2m > 3`; at 0 forced landing). Wind drifts the gyne by `0.4 * wind2m` BU/s. **Lek:** males hover around the tallest landmark within 1 500 BU (tree, lamp-post, building edge) at +60 BU; the gyne must stay within 60 BU of >= 2 males for 6 s (mating bar) (Messor: males carry a lineage tint A/B and she needs one of each) |
| Hazards | 1-3 aerial events (a bird swoop, dragonfly) each telegraphed 4 s: evade by dropping 40 BU or entering vegetation; a hit kills her (`predation`). Counts by difficulty: Gentle 0-1, Naturalist 1-3, Harsh 3-5. Surface landing hazards as for any surface ant |
| End | landing at a chosen point (diggable material required for `p_found` bonus: +0.15), or `Land now` (Esc), which resolves the rest by the aggregate model with `p_mate x 0.5`; total real duration <= 120 s |
| Observer / not possessed | 30-40 s cinematic of the swarm leaving, predators gathering (bird and spider feast [ecology 7.2]); reduced-motion: 6 stills crossfaded |

**Aggregate resolution for every other gyne** (and for a skipped flight): launched `n_g`, males `n_m`. `p_air = base * (wind2m > 3 ? 0.85 : 1) * (1 - 0.1 * birdDensity) / diff.flightLossMult`; `p_mate = species p_mate * clamp(n_m / n_g, 0.3, 1)`; `p_found` as the table; daughters `~ Binomial(n_g, p_air * p_mate * p_found)`. Messor: `hybridFail` for 13.4 % of gynes (cannot make workers). Males die `Poisson`-fast after the flight (cause `old-age`, booked under role `male` so it does not distort worker old-age statistics).

**What is recorded** (`FlightRecord`): tick, date, weather (state, `Tair`, `wind2m`), `nGynes`, `nMales`, `nLaunched`, `nMated`, `flightDeaths` by cause, `nLanded`, `nFounded`, landing zone counts, possessed record (gyne id, outcome, seconds flown, mated with), `daughters[]` ids. It becomes a journal entry (`flight`), milestones (`ms-first-flight`, `ms-first-daughter`, `ms-flight-flown`) and a Lineage flight (12).

---

## 12. Lineage [T2]

### 12.1 Persistent store

Stored per device in the profile store (`foundress.profile.v1`: IndexedDB store `profile`, localStorage fallback; GDD 08 §7.7) under `lineage` (separate from saves, beside the codex unlocks), written on events, never part of a save slot; exported by the Lineage screen as `lineage.json`.

| Collection | Content |
|---|---|
| `colonies[]` | `{ id, name, species, worldSeed, archetype, sizeId, generation, parentColonyId, parentFlightId, foundedDate, endedDate, endCause, peakWorkerEq, gameYears, winters, alatesReared, flights, daughtersFounded, rivalsDefeated, milestones[] (ids), difficultyHistory }` |
| `flights[]` | `FlightRecord` summary (11.6) with `motherColonyId` |
| `daughters[]` | `{ id, motherColonyId, flightId, species, generation, seed (u32), archetypeHint, witnessed: bool, landingZone, doy, state: available / founded / lost }` |
| `settings` | last difficulty and custom rules used per lineage |

Caps: 200 colonies, 2 000 daughters, 2 000 flights; oldest ended entries are trimmed first. At most `LIN_MAX_DAUGHTERS_PER_FLIGHT = 12` daughters are stored individually per flight (the rest are summarised in the count).

### 12.2 What persists and what does not

| Persists across games | Does not |
|---|---|
| lineage tree, colony summaries, flight records, daughters, milestone ids per colony, codex unlocks, onboarding prompts learned (per verb), best-of stats | stores, population, nests, trails, world, weather, rivals, any mechanical bonus |

There is no inheritance of stats or currency (genre-ux 1.3: no upgrade economy). Continuity is knowledge, the tree and an equal-ground restart. A daughter inherits only the species, generation number and archetype hint.

### 12.3 Founding as a daughter queen

From Title -> Lineage: pick an `available` daughter. The setup shows species (fixed), generation, mother's name and flight date, locality archetype (default `archetypeHint`; the player may override, the seed stays), size, difficulty (default: mother's). World seed = `hash32(motherWorldSeed, flightId, daughterIndex)`, so the locality is fresh but reproducible and shareable. Start `doy` = the flight's `doy` clamped into the species start window (1.6); weather forced as in 1.6; opening phases begin at `dealation` (the daughter has flown and landed). A witnessed landing (the player flew her) places the start in the landing zone type and marks `witnessed = true`. Founding marks the daughter `founded` (one use). If the new colony ends, its `colony` record links `parentColonyId`, and the epitaph can offer "Found a sister" if other `available` daughters of the same mother remain.

### 12.4 Names

`name = {placeToken} {roman generation}` (generation >= 2 only), place token from archetype word lists plus a 2-digit number from the seed (e.g. "Hollow Verge 14", "Hollow Verge 14 II"). No personal names.

---

## 13. Queen death, orphaned colonies, game over, epitaph [T2]

### 13.1 Queen death causes

| Cause id | When |
|---|---|
| `old-age` | queen age reaches her lifespan (13.2 table) |
| `starvation` | queen crop and reserve at 0 for `QUEEN_STARVE_GD = 3` GD |
| `exhaustion` | founding reserves exhausted (5.12) |
| `predation`, `combat` | killed by creature or rival (queens are protected by guards, combat chapter) |
| `crushed` | human event while on the surface or in a collapsed shallow chamber |
| `drowning` | water in her chamber while no ant moves her |
| `disease` | fungal outbreak in the nest (winter model or event) |
| `poison` | bait or spray reaching the nest |
| `cold`, `heat` | thermal model, chamber outside survivable range |

### 13.2 Queen lifespan

| Species | Queen lifespan (game years, Naturalist) | Research / note |
|---|---|---|
| `lasius-niger` | no senescence (research up to 28 years); optional: custom rule `queenSenescence` draws 10-20 years | "immortal for play" [Lasius 12.2] |
| `camponotus-pennsylvanicus` | 12 | [Camponotus 12] (queen over 10 years, up to 15) |
| `messor-barbarus` | uniform 6-12 | game choice (real 10-20 y) so succession can occur [Messor 12.2] |
| `atta-texana` | uniform 10-15 | [Atta 2] |

Multiplied by `diff.queenLifespanMult`. Multi-queen species (`atta-texana` 12 % chance of a second queen at the start and after founding) die independently; the colony is `orphaned` only when the last queen dies.

### 13.3 Orphaned colony rules

On the death of the last queen: `colony.orphaned = true`, `orphanedAt = tick`, alert and journal entry `ms-queen-lost`.

| Aspect | Rule |
|---|---|
| Eggs | no new fertilised eggs; eggs, larvae and pupae present continue to develop and eclose normally (workers, and any destined alates) |
| Alates | existing alates may fly (policy applies); `alateRearing` ends |
| Workers | tasks continue; allocation sliders and markers remain; the Production panel is disabled; the queen-care task (`queen-care`) stops |
| Worker-laid males [T3] | after `ORPHAN_LAY_DELAY_GD = 2` GD, each 100 workers lay `1` haploid male egg per GD (`male` alates only; carpenter ant queenless colonies produce mostly males [Camponotus 4]); capped at 20 % of the previous brood volume |
| Decline | worker lifespan unchanged except `diff.orphanDeclineMult` on mortality; no replacement: the population falls with the lifespan law (Lasius means 33 GD for small, 24 GD for large colonies, [Lasius verification row 1]); expected extinction about 2-3 mean lifespans after the last brood (about 60-100 GD, 2-3.5 game years) |
| Diagnostics | `diag-queen-condition` (GDD 02; GDD 06's `diag-queen-status` is merged into it): "Orphaned for {n} GD. {k} workers remain; last brood emerges by day {x}. Remedy: release the alates; found daughter colonies" |
| No rescue | no queen replacement in the base game (monogyne species). `[T3 idea]`: adopting a returning mated gyne is not biological for these species and is not provided |

### 13.4 Game over conditions

| Condition | Result |
|---|---|
| `livingAnts == 0` (queen, workers, gynes, males; brood alone does not count, it dies without nurses within 1 GD) | after `EXTINCTION_GRACE_GD = 0.05` GD (30 s), `colony.extinct`; the sim freezes; Epitaph |
| Founding failure (5.14) | Epitaph with `founding` cause |
| Player retires the colony (Pause menu "End this colony", confirm) | Epitaph with cause `retired` |
| Custom rule `extinctionEndsGame = false` [T3] | the empty nest remains in Observer; time runs; no Epitaph until the player retires |

The "last three ants" state (`livingAnts <= 3`) raises the `last-ants` alert (critical; added to GDD 08 §6.5) and so triggers auto-slow. A final autosave `final` is written at extinction and kept until a new game starts, so the Epitaph can offer "Load the last autosave" (the one before the fatal run).

### 13.5 Epitaph screen contents

A calm field-journal page; no score, no rating.

| Block | Content |
|---|---|
| Title | colony name, species, locality archetype and seed string (copyable), difficulty history |
| Life | founded `{date}`, ended `{date}`, span in game years and real play time, generation, parent colony |
| How it ended | primary cause of the last ant's death and the chain of causes (e.g. "Queen died of old age in Year 9; last worker died of starvation 214 days later"), from the Why diagnostic snapshots at `queen.died` and at extinction |
| History graph | `workers` stacked by caste, `eggs`/`larvae`/`pupae`, `stores-c`/`stores-p`, season bands, milestone ticks as marks, queen death mark |
| Causes of death | the 9.3 summary (top 5, by caste, role, season) |
| Figures | peak workers, total ants born, total food returned (C, P), farthest trail, chambers and nest volume at peak, winters survived, alates reared and flown, daughters founded, rival colonies overcome (display wording per GDD 08 §6.4), human events survived |
| Last entries | the final 10 journal entries |
| Lineage | daughters available (cards), "Continue as a daughter queen"; codex entries unlocked this game |
| Actions | `Found again in this locality` (same world seed, attempt + 1), `Found a daughter`, `Load the last autosave`, `New game`, `Title`, `Copy record as text` |

Text templates (deterministic, token-filled): "{Colony} lived {years} years in {archetype}. It reached {peak} workers in Year {y}. {How it ended}" followed by one sentence per notable event class present: weather ("Three winters were survived."), threats, reproduction ("Nuptial flights in Years {a} and {b} produced {d} daughter foundations.").

### 13.6 Failure handling

If the final snapshot or Why records are missing (corrupt save), the Epitaph falls back to the counters in `history` and cause `unknown`. The Epitaph screen never blocks on audio or storage failures.

---

## 14. Difficulty and custom rules [presets T3; constants for `naturalist` T1/T2]

`DifficultyDef` is a flat record of the parameters below, resolved at game start and re-resolvable mid-game (Pause -> Settings -> Difficulty; effective from the next tick; each change is a journal entry and appears in the Epitaph history). `naturalist` values are the defaults used in every other section.

| Parameter (used in) | `gentle` | `naturalist` | `harsh` |
|---|---|---|---|
| **Founding** | | | |
| `foundingExposureRate` (5.5) | 0.5 | 1.0 | 1.3 |
| `foundingBroodMortalityMult` (5.12) | 0.7 | 1.0 | 1.3 |
| `reserveDrainMult` (5.5) | 0.85 | 1.0 | 1.15 |
| `openingThreatsMax` (5.6) | 0 | 2 | 4 |
| `openingInterruptMax` (5.11) | 0 | 2 | 3 |
| `openingGraceGd` (5.2) | 0.6 | 0.3 | 0.15 |
| `openingRetries` (5.14) | 3 | 1 | 0 |
| `foundingAssist` (5.7, 5.16) | on | on | off |
| `forecastPanel` (5.10) | on | on | off |
| **Weather and climate** | | | |
| `rainFreqMult` (3.2) | 0.8 | 1.0 | 1.2 |
| `stormFreqMult` | 0.5 | 1.0 | 1.6 |
| `heatWaveFreqMult` | 0.7 | 1.0 | 1.3 |
| `heatOffsetMult` (2.2) | 0.7 | 1.0 | 1.25 |
| `frostFreqMult` | 0.7 | 1.0 | 1.3 |
| `pDrySpell` (3.2) | 0.25 | 0.5 | 0.7 |
| `rainHitMult` (3.3) | 0.6 | 1.0 | 1.3 |
| `floodInflowMult` (3.10) | 0.7 | 1.0 | 1.4 |
| `heatToleranceOffsetC` (2.7) | +2 | 0 | -1 |
| **Threats, rivals, humans** | | | |
| `predatorDensityMult` | 0.4 | 1.0 | 1.6 |
| `rivalCount` (GDD 05 §5) | 2 | 3 | 4 |
| `rivalAggMult` (GDD 05 §5) | 0.7 | 1.0 | 1.2 |
| `raidCooldownGd` (GDD 05 §5) | 4 | 2 | 1 |
| `HUMAN_FREQ_MULT` (GDD 04 §15.7) | 0.5 | 1.0 | 1.5 |
| `HUMAN_TELEGRAPH_MULT` (GDD 04 §15.7; footsteps lead 4.5 / 3.0 / 2.25 s) | 1.5 | 1.0 | 0.75 |
| `BAIT_ENABLED` (GDD 04 §15.6-15.7; reactive bait stations, no separate pesticide event) | false | interior | interior + garden |
| **Food** | | | |
| `foodAbundanceMult` (GDD 05 §5) | 1.3 | 1.0 | 0.75 |
| `honeydewYieldMult` | 1.2 | 1.0 | 0.85 |
| **Colony** | | | |
| `broodSurvivalMult` | 1.15 | 1.0 | 0.85 |
| `workerLifespanMult` | 1.2 | 1.0 | 0.85 |
| `starvationToleranceMult` | 1.3 | 1.0 | 0.8 |
| `queenLifespanMult` (13.2) | 1.5 | 1.0 | 0.7 |
| `queenSenescence` (Lasius) | off | off | on (10-20 years) |
| `winterLossMult` (6.3) | 0.5 | 1.0 | 1.5 |
| `winterQueenDeathP` | 0 | 0.03 | 0.06 |
| `orphanDeclineMult` (13.3) | 0.7 | 1.0 | 1.3 |
| `damageTakenMult` (possessed ant; GDD 05 §5) | 0.75 | 1.0 | 1.0 |
| **Progression** | | | |
| `matureGateMult` (7) | 0.8 | 1.0 | 1.2 |
| `alateCapMult` (11.3) | 1.2 | 1.0 | 0.9 |
| `flightLossMult` (11.6) | 0.7 | 1.0 | 1.25 |
| `flightPredatorEvents` | 0-1 | 1-3 | 3-5 |
| **Time and interface** | | | |
| `autoSlow` default (4.5) | pause | slow | slow |
| `alertLeadWarnings` | strong | normal | minimal |

Compatibility: tuning of the combat, creature, human-event and rival parameters is **owned by their chapters**; where this table names a parameter of GDD 04 or GDD 05 the value is copied from that chapter (consistency pass) and the owner's value wins on any later change.

### 14.1 Custom rules

`CustomRules` override any preset parameter group. All persist in the save and the Lineage `settings`.

| Toggle | Options | Mapping |
|---|---|---|
| `predators` | off / few / normal / many (GDD 05, GDD 08) | `predatorDensityMult` 0 / 0.4 / 1.0 / 1.6 (off = no creature spawns, also removes founding threats and flight hazards) |
| `rivals` | count 0-4 (fixed at generation) | `rivalCount`; aggression follows the preset |
| `humanActivity` | off / low / normal / high | `HUMAN_FREQ_MULT` 0 / 0.5 / 1.0 / 1.5 (GDD 04 §15.7) |
| `weatherSeverity` | none / mild / normal / severe | `none`: only `clear` and `overcast` (no rain, storm, heat, frost; temperature curve unchanged); mild 0.6, normal 1.0, severe 1.4 applied to `rainFreqMult`, `stormFreqMult`, `heatWaveFreqMult`, `frostFreqMult`, `rainHitMult`, `floodInflowMult`, `heatOffsetMult` |
| `seasonLengthDays` | 5 / 7 / 10 (fixed at generation) | 1.7 |
| `startSeason` | natural (default) / spring / summer / autumn (never winter; fixed at generation) | 1.6 |
| `foundingLeniency` | lenient / normal / strict | the Founding parameter group of the gentle / naturalist / harsh column |
| `winterMode` | timelapse / realtime | 6.1 |
| `foundingAssist` | on / off | 5.7, 5.16 |
| `queenSenescence` | on / off | 13.2 |
| `collapse` | on / off | GDD 03 §12 (off = no collapse; gentle default off) |
| `extinctionEndsGame` | on / off | 13.4 |

Changing a toggle mid-game that removes a threat applies immediately (existing creatures despawn over 1 GD); adding threats spawns them at the normal rate.

---

## 15. Autosave rules [T1 timer; T2 triggers]

Format and storage are in architecture section 7 (IndexedDB, 5 manual slots, export/import). This section defines **when**.

| Slot | Trigger | Notes |
|---|---|---|
| `auto` (ring of 3 generations; GDD 08 shows it as one slot with generations) | every `AUTOSAVE_INTERVAL_REAL_S = 300` real seconds of unpaused, visible play (setting 2 / 5 / 10 min / off, GDD 08); also on `season` change and before a time-lapse | oldest generation overwritten |
| `opening-start` (hidden checkpoint for `openingUndo`) | entry to opening `search` | kept until the first winter report |
| `auto` generation labelled `opening-sealed`, `opening-complete`, `pre-winter`, `post-winter`, `pre-flight`, `final` | the named event (entrance sealed, hand-over, before the winter banner, winter report closed, flight launched, colony extinct) | written into the `auto` ring with the label shown on the slot card; `final` is pinned until a new game starts |
| `quick` | `F5` (load `F9`) | one slot |
| `slot-1`..`slot-5` | player | manual (GDD 08 §7.6) |
| on exit | `pagehide` and `visibilitychange` to hidden: one best-effort write into the ring | may fail silently |

Rules:
1. Writes happen only at a tick boundary; the snapshot is taken synchronously, the storage write is asynchronous and never blocks the loop.
2. Minimum gap 5 real seconds between any two autosaves; skipped when `tick` equals the last saved tick.
3. Never during: time-lapse playback (opening, winter), the possessed flight (a `pre-flight` save precedes it), an interrupt beat, the intro card, photo mode.
4. A save made while the player is paused is allowed and identical.
5. Meta stored with each save: tick, date string, species, stage, population `N`, difficulty, play time, thumbnail 160x90 (omitted in test mode), generator version.
6. Load picks the newest valid slot; a failed integrity check marks the slot "damaged" and offers the next.
7. Failure: a storage error (quota, blocked, private mode) retries once after 30 s; if it fails again autosave is disabled for the session with a persistent, non-modal notice and an "Export save" button (file download with copy/paste fallback if downloads are blocked); the game continues.
8. Test mode (`?test=1`): autosave off unless `?autosave=1`; the debug API can force `save(slot)`.
9. Lineage and codex writes are independent of saves and happen on their own events.

---

## 16. Deviation notes (research versus directions, and design compressions)

| # | Note |
|---|---|
| D1 | One day-length curve for all climates (12 + 4 sin(2 pi d / 28)); no latitude. Sunrise and sunset therefore drift identically for Texas and Britain. Gameplay simplification. |
| D2 | A day in the game is a full 24 h cycle although it stands for 13.04 real days of seasonal change; the weekday cycle (7-day, weekend 5, 6) is a separate abstraction that the ecology dossier handles with a "game week = 3 GD" rule for human cadences. The human-event chapter must use `isWeekend` only for school/park schedules and the 3-GD rule for cadence. |
| D3 | Wild founding success is about 1 % (Lasius, estimate) and Atta about 2.5 %. The game models only the loss mechanisms the player can influence (site, exposure clock, hazards, reserves); first-brood success on a Good site is high. Naturalist is therefore far gentler than the field. Harsh is the closest compromise. |
| D4 | Atta: the sourced "about 90 % of the first brood eaten" becomes 70 % trophic (`ATTA_TROPHIC_FRACTION_FIRST`) so that 8-14 minims result. |
| D5 | The "must find shelter within 24 h" statement is an author assumption in the source (verification row 8); the clock is tuned to 0.83 GD in full sun. |
| D6 | Winter metabolic factor 0.35 x summer resting upkeep at 6 C instead of the dossier's "consumption about 5 % of summer", which counts total colony intake including foraging, not resting upkeep. |
| D7 | Flight humidity trigger removed (Hart et al. found none); the "one flying-ant day" idea is replaced by weather-gated eligibility on several days (verification row 18). |
| D8 | Carpenter-ant flights are individual and not synchronised (NJ data); the game still emits one `flight.launched` per day but spreads departures over 4 h, which is a presentation choice. |
| D9 | Messor founding in autumn means the first-brood time-lapse includes the winter arrest; the seed lists a single skippable time-lapse and this keeps it single. |
| D10 | Queen lifespans for Messor are shortened (6-12 years against 10-20 estimated) so that succession and queen death can occur in one long session. |
| D11 | Heat death times follow the 5-10 min at 50 C ground contact estimate (ecology 4.2); species CTmax values are not known for these species and are tunable `[E]`. |
| D12 | The 8x speed is refused while possessing, per the seed; the genre research asks for fast-forward that "produces visibly meaningful change", which here comes from skip-to-next-event rather than from allowing 8x during possession. |

---
## Appendix A. State required

All plain data (JSON-like and typed arrays). `u8`, `i32`, `f32` are typed-array element types; derived caches are marked (derived) and are rebuilt on load.

| Name | Type sketch | Purpose |
|---|---|---|
| `calendar.tick` | `int` | absolute tick, the only clock |
| `calendar.startTick` | `int` | tick at game start (start `doy` and hour) |
| `calendar.foundingTick` | `int` or `null` | first egg; colony age |
| `calendar.moonPhase0` | `f32` | moon phase offset from seed |
| `calendar.seasonLengthDays` | `5 / 7 / 10` | custom rule (1.7); stored as `config.rules.seasonLengthDays` (consistency pass) |
| `calendar.derived` (derived) | `{dayIndex, year, doy, season, dayOfSeason, hour, d, SR, SS, L, phase, daylight, moonIllum}` | cached per tick |
| `env.climateId` | string | species climate (2.1) |
| `weather` | `{state, intensityClass, startTick, dwellEndTick, peakPrecip, precip, rainRateMmH, cloud, wOff, wind2m, windDir, gustUntilTick, fogDensity, lightningNext}` | state machine (3.2-3.4) |
| `weather.anomaly` | `{prev: f32, cur: f32}` | daily AR(1) air anomaly |
| `weather.history` | `{lastRainEndTick, rainHoursRing: u8[36], cumRain24hMm: f32, coldSnapExt: u8, dryspellEndTick: int, dryspellDone: bool, TmaxToday: f32, TmaxYesterday: f32}` | flight and start gates, dry spells |
| `weather.dew` | `{tonight: bool, level: f32}` | dew (3.8) |
| `thermal.tsurf` | `Float32Array[materialCount * 2]` | lagged `Tsurf[m][shaded]` (2.3) |
| `thermal.wsoil` | `f32` | EMA of weather offset for soil (2.4) |
| `thermal.heatAccl` | `f32` | colony acclimation (T3) |
| `moisture.theta0`, `theta1` | `Uint8Array[cells]` (cell = 16 BU) | soil water (3.9) |
| `moisture.puddle` | `Uint8Array[cells]` (0.05 mm units) | puddle store (3.10) |
| `moisture.static` (derived) | per-cell `{tex, permeable, shade, veg, puddleCapMm, runoffCoeff}` | from worldgen |
| `ant.Tb`, `ant.heatLoad`, `ant.coldLoad`, `ant.thermalState` | `f32, f32, f32, u8` on every ant (additive optional fields of the ant record) | thermal model (2.6, 2.7) |
| `queen.founding` | `{reserveLoads: f32, R0: f32, desiccation: f32, wings: bool, eggsLaid: int}` | opening (5.5); queen health is the ant's `hp / maxHp` (no separate field) |
| `time` | `{speed: 1/2/4/8, paused: bool, requested, autoSlow: 'off'/'slow'/'pause', cooldowns: Record<string,int>, skipUntil: object or null, commandSeq: int}` | time control (4); `setSpeed {speed: 0}` sets `paused` |
| `opening` | `{phase, attempt, retriesUsed, startDoy, siteFactors: f32[7], siteQ: f32, entranceId, chamberId, shaftDepthBU: f32, chamberVoxels: int, sealed: bool, layBatches: int, threatsUsed: int, lastThreatTick: int, interruptsUsed: int, hazardLog: object[], lapse: {startTick, endTick, skipped: bool, outcome}, garden: {pelletHealth, planted, established, biomass} (Atta), woodMoisture: f32 (Camponotus), done: bool}` | opening script (5) |
| `winter` | `{phase: 'none/notice/banner/lapse/report', delaysUsed: int, snapshot: object, report: object or null, winterActive: bool, lastYearResolved: int}` | overwintering (6) |
| `stage` | `{id, flags: {orphaned, declining, dormant}, lastEvalTick, popAtEval3GD: f32[3]}` | stages (7) |
| `milestones` | `Record<id, {tick, doy, year}>` | one-shot record (8) |
| `journal.entries` | `{id, tick, kind, title, text, refs: int[]}[]` (cap 4 000) | timeline (9.1) |
| `journal.aims` | `{open: id[], done: id[]}` | current focus |
| `history.daily` | `Float32Array[series * maxDays]` plus `count` | graphs (9.2) |
| `history.hourly` | ring `Float32Array[series * 48]` | Why view trends |
| `deaths` | `{byCause: u32[cause * caste * role], bySeason: u32[...], recent: ring of 200 {tick, cause, caste, role, zone}}` | causes summary (9.3) |
| `repro` (on the colony; `investment`, `gyneShare`, `policy` are the colony directives `alateInvestment`, `gyneShare`, `alatePolicy`, GDD 02 §12.1) | `{alateRearing: bool, targetAlates: int, shortfall: f32, lastLaunchTick, flights: FlightRecord[], active: {id, phase, possessedAntId, startTick, energy, matingProgress} or null}` | reproduction (11) |
| `colony.queens` | `{antId, lifespanDays: f32 or null}[]` | queen death (13); age is derived from the ant's `bornTick` |
| `colony.orphanedAt` | `int or null` | orphan rules |
| `colony.livingAnts` | `int` (derived counter) | extinction test |
| `difficulty` | `{preset, params: Record<string, number or boolean>, custom: CustomRules, history: {tick, preset}[]}` | (14) |
| `autosave.meta` | `{lastTick, lastRealMs, disabled: bool, slots}` | (15), lives in Game layer |
| profile store `foundress.profile.v1` → `lineage` | `{colonies, flights, daughters, settings}` | (12), not in `SimState`; one profile store shared with GDD 08 |
| profile store `foundress.profile.v1` → `codex` | `Record<id, {tick, doy, year, species, firstSeenIso}>` | (10), not in `SimState`; prompt learning lives in `player.promptLearned` (GDD 01) and hints in the profile `hints` (GDD 08), not here |

## Appendix B. Commands

`Command` objects queued for the next tick (or applied by `applyPendingCommands` while paused). Every command is validated and may be refused with a typed reason (`refused: 'not-possessing' | 'invalid-phase' | 'limit' | ...`) that the UI shows. Command `type` names are camelCase (consistency pass, `00-index.md` §D); the former names are given in brackets.

| Command | Payload | Effect |
|---|---|---|
| `setSpeed` [`SetSpeed`] | `{speed: 0/1/2/4/8}` | 4.2 rules; 8 refused when possessing, speeds above 2 refused in opening phases; 0 = pause |
| `togglePause` [`TogglePause`] | `{}` | pause or resume |
| `setAutoSlow` [`SetAutoSlow`] | `{mode: 'off'/'slow'/'pause'}` | 4.5 |
| `skipToNextEvent` [`SkipToNextEvent`] | `{}` | 4.6 (executed by the game loop) |
| `openingSkipIntro` [`OpeningSkipIntro`] | `{}` | leave `intro-card` |
| `action {actionId: 'sniff'}` [`OpeningSniff`] | `{target: point}` | force a site read-out (GDD 01 primitive) |
| `action {actionId: 'seal-entrance'}` [`OpeningSeal`] | `{target: entranceId}` | sealing (the hold interaction repeats it) |
| `action {actionId: 'plant'}` [`OpeningPlantFungus`] | `{}` | Atta planting |
| `action {actionId: 'lay-egg'}` [`QueenLayBatch`] | `{}` | in the opening phase `lay`: a batch of 6 eggs (5.10) |
| `openingBeginTimelapse` [`OpeningBeginTimelapse`] | `{}` | confirm "Tend the brood" |
| `skipTimelapse` [`OpeningTimelapseSkip`, `OverwinterSkip`] | `{}` | skip playback of whichever time-lapse runs (same outcome) |
| `timelapseRespond` [`OpeningInterruptRespond`; GDD 08 `timelapseStepIn`] | `{interruptId, response: 'step-in' \| 'let-it-play'}` | interrupt beat (5.11) |
| `openingUndo` [`OpeningUndo`] | `{}` | restore checkpoint `opening-start` (5.14) |
| `overwinterChoice` [`OverwinterChoice`] | `{choice: 'begin'/'delay'}` | winter banner (6.2) |
| `setDirectives {alateInvestment}` [`SetAlateInvestment`] | `{alateInvestment: 0..1}` | 11.3 |
| `setDirectives {gyneShare}` [`SetGyneShare`] | `{gyneShare: 0.2..0.6}` | T3 |
| `setDirectives {alatePolicy}` [`SetAlatePolicy`] | `{alatePolicy: 'auto-release'/'ask'/'hold'}` | |
| `flightRelease` [`FlightRelease`] | `{}` | answer an `ask` prompt (`Release`) |
| `flightPossess` [`FlightPossess`] | `{gyneId}` | take a gyne into the possessed flight |
| (intent) [`FlightControl`] | `PlayerIntent.flight` via `sim.setPlayerIntent` | flight steering (GDD 01 Appendix A) |
| `flightLand` [`FlightLand`] | `{point}` | land now |
| `retireColony` [`RetireColony`] | `{}` | 13.4 |
| `setDifficulty` [`SetDifficulty`] | `{preset?, custom?}` | 14, mid-game |
| Game-level, not sim commands | `foundDaughter(daughterId, {archetype?, sizeId, difficultyPreset, customRules})` [`LineageFoundDaughter`], `foundAgain()` [`FoundAgain`], `save/load/quickSave/quickLoad(slot)`, `exportSave/importSave(data)/exportLineage()` | handled by `Game` (GDD 08 Appendix B) |
| Debug (`cheat.*`) | `setTime(tick)`, `setWeather(state, intensityClass)`, `setWind(ms)`, `setAnomaly(c)`, `noLag(bool)`, `completeFounding(workers)`, `addWorkers(n)`, `setQueenAge(days)`, `forceFlight()`, `unlockCodex(id)`, `triggerWinter()`, `killQueen(cause)`, `killAll()`, `setStores(c, p)` | acceptance tests, not in release UI |

## Appendix C. Events

Typed union, queued during a tick and dispatched after it. Payload sketches only.

| Event | Payload | Consumers |
|---|---|---|
| `time.hour` | `{hour}` | HUD, audio ambience, human chapter |
| `time.phase` | `{phase}` (`dawn`, `dusk`, ...) | audio, light, activity |
| `time.day` | `{dayIndex, doy, weekday, isWeekend}` | history, human schedule |
| `time.season` | `{season, year}` | journal, graphs, aims, alerts |
| `time.year` | `{year}` | journal |
| `time.speed-changed` | `{from, to, reason}` | HUD |
| `time.speed-limited` | `{requested, effective, droppedTicks}` | HUD |
| `time.auto-slow` | `{trigger, action}` | HUD, alerts |
| `weather.changed` | `{from, to, intensityClass, reason}` | render, audio, journal, alerts |
| `weather.gust` | `{windMs}` | audio, render |
| `weather.thunder` | `{delayS, intensity}` | audio |
| `weather.lightning` | `{}` | render (flash rules 3.11) |
| `weather.dew` | `{formed / gone}` | render, codex |
| `weather.puddle` | `{cellsAdded, cellsRemoved}` | render |
| `env.heat-stupor`, `env.cold-coma` | `{antId}` | render, journal, alerts |
| `opening.phase` | `{from, to}` | UI, camera, audio |
| `opening.site-assessed` | `{point, factors, Q, word}` | UI read-out |
| (merged) GDD 03 `founding-readiness` `{nestId, readiness, parts: {depth, volume}}` (was `opening.readiness`) | | UI bars |
| (merged) GDD 03 `founding-sealed` / `entrance-state-changed` (was `opening.sealed`) | `{nestId, entranceId}` | render, milestones |
| `opening.egg-batch` | `{eggs, total, forecast}` | UI, render |
| `opening.timelapse` | `{kind: 'start'/'progress'/'beat'/'interrupt'/'end', p, spanGD, hazard?}` | render, UI |
| `opening.handover` | `{workers, reserves, Q}` | UI, journal, autosave |
| `opening.failed` | `{cause}` | UI, epitaph |
| `queen.egg-eaten`, `queen.hazard` | `{...}` | render, codex |
| `overwinter.notice`, `overwinter.banner`, `overwinter.begin`, `overwinter.beat`, `overwinter.end` | `{...}` | UI, render |
| `overwinter.report` | `{report}` | UI, journal |
| `milestone.reached` | `{id, tick, title}` | journal, UI toast (GDD 08's `milestone`), Lineage |
| `journal.entry` | `{entryId}` | UI |
| `aim.opened`, `aim.completed` | `{id}` | UI |
| `stage.changed` | `{from, to}` | UI, journal |
| `codex.unlocked` | `{id}` | UI, codex store (replaces GDD 08's assumed `observe`) |
| (merged) `ant-eclosed` with `caste` `gyne`/`male` (GDD 02 App C; was `alate.eclosed`) | `{antId, colonyId, caste}` | render, journal |
| `flight.eligible` | `{p, factors}` | UI, diagnostics, codex |
| `flight.launched` | `{id, nGynes, nMales, weather}` | render, audio, autosave |
| `flight.possessed-start`, `flight.possessed-end` | `{gyneId, outcome}` | camera, UI |
| `flight.ended` | `{record}` | journal, Lineage, milestones |
| `lineage.daughter-added` | `{daughterId}` | Lineage store, UI |
| `queen.died` | `{queenId, cause}` | UI, alerts, journal |
| `colony.orphaned` | `{}` | UI, alerts, diagnostics |
| `colony.extinct` | `{cause, causeChain: string[]}` | UI (GDD 08 Epitaph; replaces GDD 08's assumed `game-over`), Lineage, autosave |
| `epitaph.ready` | `{snapshotId}` | UI |
| `diagnostic-changed` (shared with GDD 02; was `diag.changed`) | `{id, status, topCause}` | alerts (via diagnostics) |
| `autosave.done`, `autosave.failed` | `{slot / reason}` | HUD icon |
| `cue` (shared cue event; was `ambient.cue`) | `{cue: 'ambient.dawn-chorus' ..., pos: null, strength}` | audio (derived from `time.phase` and weather) |

## Appendix D. Diagnostics (the "why" view)

Each diagnostic publishes the shared record `{id, system, status, label, value, factors: [{cause, weight, detail}], remedies: string[] (remedy ids), sinceTick}` (consistency pass; the former `headline` is `label`, factor `id` is `cause`); status words map `ok`→`ok`, `watch`→`info`, `warn`→`warn`, `critical`→`bad`; weights sum to 1; recomputed every 250 ticks and on events; alerts fire on status changes (rate-limited by alerts chapter).

| Id | Status rules | Limiting factors (weights computed from magnitudes) | Remedies |
|---|---|---|---|
| `diag-surface-activity` | `ok` if `surfaceActivity >= 0.7`; `watch` 0.4-0.7; `warn` 0.1-0.4; `critical` < 0.1 for > 1 GD in a foraging season | temperature gate (cold or hot), light preference, weather (`fW`), heat-stressed trail share | wait (state the expected change: "dusk in 6 h"), route through shade, change species-appropriate hours; none if weather |
| (merged into GDD 03 `diag-nest-climate`) | per chamber: `warn` if brood chamber outside `[Topt_lo - 4, Topt_hi + 4]`; `critical` if < 10 C or > 36 C | depth, cover above, season, recent cold snap or heat wave | `move-brood` marker to a warmer or cooler chamber, `dig` deeper, add cover or mound |
| (merged into GDD 03 `diag-nest-flood`) | `warn` if forecast rain peak and any entrance catchment flux x chamber volume ratio > 0.1; `critical` while water in brood chamber | rainfall rate, catchment area per entrance, entrance elevation, soil saturation `theta1` | raise a mound or entrance (`entrance` marker), `move-brood` upward, dig drain chamber |
| `diag-heat-exposure` | `warn` if > 10 % of foragers have `Tb >= stressC - 3`; `critical` if any `heat-stupor` mass | surface `Tmicro` on trails, shade availability, hour | forage at dawn/dusk, shaded route, `avoid` marker on hot paving |
| `diag-overwinter-readiness` | autumn `doy >= 15`: `ok` if stores cover >= 1.5 x projected need; `warn` 1.0-1.5; `critical` < 1.0 | C stores, P stores, colony size, deepest chamber temperature, predicted frost nights | forage priority, honeydew tending, dig a deeper chamber, increase colony before winter |
| `diag-founding-outcome` | during `lay`: forecast-based: `ok` expected reserve >= 0.25; `warn` 0.15-0.25; `critical` < 0.15 | site factors (dig, moisture, warmth, cover, flood, rival, exposure) as weights of `1 - s_i`, clutch size | lay fewer eggs, dig a bigger or deeper chamber, move to a better site before sealing |
| `diag-reproduction-readiness` | `ok` if gates pass; otherwise `watch` listing the failing gates | gate list 11.1 with the numeric gap | feed the colony, wait, raise investment |
| `diag-flight-day` | on eligible window days: `ok` if `p_launch >= 0.5` | temperature, wind, sky, recent rain, trend | wait for a warmer or calmer day |
| (merged into GDD 02 `diag-queen-condition`) | `ok` queenright; `warn` queen reserve or crop < 30 %; `critical` orphaned | queen crop, stores, age vs lifespan | feed priority, protect, release alates if orphaned |
| (merged into GDD 08 `diag-storage`) | `warn` after a write failure | storage error kind | export the save |

## Appendix E. Acceptance checks

Each is scriptable through the debug API (`step`, `cheat.*`, `summary()`, `query.*`). "Tolerance" is absolute unless a percentage.

1. **Tick and day.** Given a new game at tick 0, When `step(6000)`, Then `calendar.tick = 6000`, `dayIndex = 1`, and after `step(162000)` more (168 000 total) `year = 2`, `doy = 1`. `hour` at tick 250 = 1.0.
2. **Day length.** Given standard calendar, When `d` = 7.0, 21.0, 10.5, Then `(SR, SS)` = (04:00, 20:00), (08:00, 16:00), (04:35, 19:25) with tolerance 0.02 h; at `d = 24.5` SR 07:25, SS 16:35.
3. **Phases.** At `d = 10.5` (SR 4.586, SS 19.414): hour 3.0 is `night`, 4.0 `dawn`, 8.0 `morning`, 12.0 `midday`, 16.0 `afternoon`, 19.0 `dusk`, 21.0 `night`.
4. **Air temperature.** Given `temperate-maritime`, weather `clear` settled, anomaly 0, `d = 10.5`, Then `Tair(14:30) = 27.5 +- 0.3` and `Tair(04:35) = 13.1 +- 0.3`; with `heat` settled `Tair(13:00) = 32.2 +- 0.5`.
5. **Surface temperature.** Given `clear`, anomaly 0, lag disabled (`cheat.noLag`), `d = 10.5`, hour 12.0, Then `Tsurf[asphalt][sun] = 44.9 +- 0.4`, `[concrete] = 37.8 +- 0.4`, `[asphalt][shade] = 27.7 +- 0.4`. With `heat` settled at 13:00, asphalt `= 52.3 +- 0.8`.
6. **Soil temperature.** Given the maritime climate, `d = 24.5`, hour 14.5, bare soil: `Tsoil(100 mm) = 5.0 +- 1.5`, `Tsoil(400 mm) = 6.0 +- 0.8`, and after 2 GD of `frost` the 100 mm value falls by `2.4 +- 0.8` C.
7. **Weather statistics.** Given maritime, Naturalist, a 2 000 GD weather-only run on 5 seeds, Then summer `heat` time fraction in 0.15-0.35, summer storm events 0.5-2.0 per season, rain events per spring 3-7, winter `frost` fraction 0.15-0.27, no `heat` more than 12 h after `season` leaves summer, no `frost` entry between 05:00 and 17:00.
8. **Heat load.** Given an ant (Lasius, `stressC 35`) forced to `Tb = 50`, Then it dies with cause `heat` at `400 +- 20` s; at `Tb = 45`, `600 +- 30` s; at `Tb = 35`, `heatLoad` stays 0; after exposure of 100 s at 50 C and then `Tb = 25`, `heatLoad` returns to 0 within 700 s.
9. **Speed curve.** `speedMult(Lasius, 15) = 0.55`, `(10) = 0.25`, `(40) = 0`, `(25) = 1.0`; Messor at `Tb 26` = 0.9; Atta at `Tb 24` = 1.0; `forageGate(Atta, 29) = 0`.
10. **Rain washing.** Given a `shower` (`rainRate 5`), an exposed trail cell with value 1.0 and baseline decay disabled, Then after 69 +- 3 s the value is `0.5 +- 0.05`; a covered cell is unchanged; during `downpour` the same cell halves in 17 +- 1 s.
11. **Soil moisture.** Given loam, `theta0 = 0.30`, `clear`, 2.5 mm of drizzle added, Then `theta0 = 0.51 +- 0.03` immediately and below 0.30 after `28 +- 8` game hours of `clear` weather at noon-like evaporation.
12. **Speed rules.** Given 4x and the player possesses an ant, Then speed becomes 1x; `setSpeed 8` is refused with `not-allowed-while-possessing` (the event `speed-refused` carries reason `possession`, GDD 01 E1); `setSpeed 4` is accepted.
13. **Cannot keep up.** Given requested 8x and an injected tick cost of 30 ms with a 10 ms budget, Then within 3 +- 1 real seconds the requested speed becomes 4x, event `time.speed-limited` is emitted, and game results at equal tick counts are identical to an unbudgeted run (hash of `summary()` equal).
14. **Orders while paused.** Given pause, When a `dig` marker command is enqueued, Then `calendar.tick` is unchanged and the marker exists after `applyPendingCommands()`.
15. **Opening shelter clock.** Given a Lasius opening, queen standing in open sun on bare soil (cover 0.1) at 22 C, Then `desiccation` reaches 1 at `5 000 +- 100` ticks (0.83 GD) and she dies with cause `desiccation`; under a stone (cover 1.0) she is alive at 14 000 ticks and dead at `15 000 +- 300` ticks.
16. **Site quality.** Given factors (dig 1, moist 0.9, warm 0.9, cover 1, flood 0.8, rival 1, exposure 0.7) Then `Q = 0.91 +- 0.01` ("Excellent"); (1, 0.8, 0.7, 0.35, 0.7, 1, 0.5) gives `0.70 +- 0.01` ("Good"); (0.4, 0.3, 0.6, 0.1, 0.6, 1, 0.5) gives `0.37 +- 0.01` ("Fair").
17. **Dig readiness.** Given Lasius in open soil with a 2.5 BU shaft 7.9 BU deep and a 4 x 2 x 4.5 cell, When `action seal-entrance` is sent, Then it is refused (`readiness`); with the shaft 8.0 BU deep (GDD 03 `D_MIN`) it is accepted; under a stone 5.0 BU suffices (GDD 03 E8).
18. **Founding outcome.** Given `Q = 0.7`, chamber 19.5 C constant, `R0 = 56`, clutch 24, 200 seeds, Then mean workers `11.5 +- 1.5`, p10 8, p90 15, queen deaths 0; clutch 48 gives queen deaths between 50 % and 80 %; `Q = 0.9`, clutch 48 gives more than 90 %.
19. **Lapse timing and skip.** Given the same state, Then first eclosion occurs `4.52 +- 0.1` GD after the first egg at constant 19.5 C; skipping the lapse yields identical `tick`, worker count, reserves and RNG state as full playback.
20. **Overwinter.** Given 18 workers, 20 larvae, stores C 10 / P 4, nest minimum 4 C, Naturalist, Then after the aggregate step workers are between 15 and 18 (base loss about 6 %), stores C fall by `5.2 +- 1.5` loads, and a report exists with population, stores, climate and top 3 causes. With C stores 0 at `Begin`, workers fall by at least 50 %. With nest `Tmean >= 14` the colony is `winterActive` and no banner appears.
21. **Milestones.** Given `cheat.addWorkers`, `ms-workers-100` fires exactly once when `N` first reaches 100 and its journal entry carries the in-game date; `ms-first-worker` fires at the first eclosion only; reloading a save does not refire any.
22. **Alate gate and cost.** Given a Lasius colony with `N` 650, age 2.1 years, stores at 4 GD C and 2 GD P, spring `doy 3`, investment 0.5: `gate-stage` fails. With `N` 700 all gates pass and `A* = 35` (14 gynes, 21 males), total cost `336 +- 2` loads; with C stores of 2 GD `gate-stores` fails.
23. **Flight eligibility.** Given Lasius, `doy 10`, `clear`, `Tair 24`, `wind2m 1.0`, rain 3 GD ago: `p_launch = 0.78 +- 0.02`. With `wind2m 7` or rain or `Tair 12`: 0. Over 1 000 seeded days with the first set, flights launch on `78 +- 3 %`.
24. **Queen death and extinction.** Given a queenright colony with brood and 40 workers, When `killQueen('predation')`, Then `colony.orphaned`, no new eggs after the next tick, existing larvae still pupate and eclose, `ms-queen-lost` is journaled; When `killAll()`, Then `colony.extinct` fires within 0.05 GD +- 5 ticks and `epitaph.ready` follows with the cause chain.
25. **Lineage and autosave.** Given a recorded flight with 20 gynes, Then 1 to 12 daughters are stored; founding one yields world seed `hash32(motherWorldSeed, flightId, index)` identical on repetition and generation 2, and the opening starts at `dealation`. Given 300 s of unpaused play, Then one `auto` generation exists; during the time-lapse no autosave is written; `pre-winter` exists before the banner.

## Appendix F. Cross-chapter assumptions

1. **Nest/carve chapter:** exposes `digSpeed(material)`, `chamber` records with volume, centre depth, `cover class` above; entrance `sealed` state that closes BFS; a `fill`/seal operation; `autoHaul` flag for the founding queen; chamber water volume and flood handling consume `Q_e`, `theta1` and `puddle` from this chapter; wood moisture per wood primitive (rain and `theta1` as inputs) with `woodMoisture(x)`.
2. **Worldgen:** supplies per-cell texture, `permeable`, `veg`, `puddleCapMm`, `runoffCoeff`, `world.hydro.floodRisk(x, z)` (0..1), flow-accumulation catchment per entrance footprint, `world.shadeAt(p, sunDir)`, `foundingLandingPoint` with at least 3 candidate sites of `Fair` quality within 300 BU, human-activity `footTraffic` map, `openSky`, micro-connection flags, and the climate id per species.
3. **Brood chapter:** brood development uses degree-days with the Lasius law `max(0, T - 10) / 11` per GD (21 C anchor: egg 1.4, larva 0.6, pupa 1.9 GD) and per-species rates from `SpeciesDef`; brood heat mortality above 36 C; larva draw `LARVA_COST_LOADS = 1.6` (1.2 P + 0.4 C) as in directions J; destined castes and demotion (11.3) are applied by the brood chapter's pupation checkpoint.
4. **Ants chapter:** ant records carry additive fields `Tb`, `heatLoad`, `coldLoad`, `thermalState`; speed uses `speedMult(Tb)`; tasks `flee`/`rest` respond to `shadeSeekC`; ant death emits cause ids of 9.3; `gyne` and `male` castes have states of 11.4.
5. **Colony/economy chapter (GDD 02):** `N` = simulated workers (no weights); consumption and egg laying use the dossier laws (`q(N)`, season factor); the founding pool `R` is a single 1:1 pool (C and P) that stands in for colony stores until the first worker eats; stores are available in `colony.stores.{c,p}`; worker lifespan 33 GD (< 100 workers) to 24 GD (>= 250 workers) with the species table; `queen-care` and allocation exist.
6. **Foraging chapter:** reads `surfaceActivity(species)`, `forageGate`, `heatStress`; the first-trail milestone (3 distinct followers) uses the trail follow counter; autonomous trail recruitment unlock at 75 workers is that chapter's rule and does not contradict `ms-first-trail` (a possessed or solitary worker can lay a followed trail earlier).
7. **Pheromone chapter:** applies the wash and wind multipliers of 3.7 and `home` decay multipliers each 10 ticks to cells flagged `exposed`; supplies the `exposed` flag from cover.
8. **Combat/creatures/rivals/human chapters (GDD 04, GDD 05):** own the preset knobs of section 14 (`predatorDensityMult`, `rivalCount`, `rivalAggMult`, `raidCooldownGd`, `HUMAN_FREQ_MULT`, `HUMAN_TELEGRAPH_MULT`, `BAIT_ENABLED`); the founding director (5.6) calls their spawn APIs with the creature kinds listed; human events use `isWeekend` and `hour` from the calendar; sprinkler/hose events add local `rainRateMmH`.
9. **Possession/camera chapter:** possession start forces 1x (calls `setSpeed`), the founding queen cannot be released (X), the possessed flight uses the flight state of 11.6, the photo mode freezes time through the same pause flag.
10. **Alerts/diagnostics chapter:** owns the alert tray, severity ranking and cooldown; this chapter supplies the trigger ids of 4.5 and the diagnostics of Appendix D.
11. **UI/Game layer:** owns the time loop of 4.3, the Winter Report, Epitaph, Lineage, journal and codex panels, the intro card, autosave scheduling (15), the profile store `foundress.profile.v1` (holding `lineage`, `codex` and `hints`), and applies `applyPendingCommands()` while paused.
12. **Species chapters:** provide `SpeciesDef.climate`, `.thermal`, `.opening`, `.winter`, `.reproduction` as tabulated here; Camponotus wood model, Messor granary and seed economy, Atta garden economy (growth 0.17 per GD sustained) are theirs; the polymorphic caste ids `minor`, `media`, `major`; Messor lineage tint and mating rule (11.6) use their data.
13. **Rendering/audio:** consume `light`, `cloud`, `fogDensity`, `precip`, `rainDropMm`, `wind2m`, `lightningFlash` per 3.11 and the events of Appendix C; they must honour reduced-motion and photosensitivity rules (no flashes above 2 per second).
14. **Save chapter:** persists everything in Appendix A (except device stores), keeps `weather`, `moisture` grids and `opening` in `SimState`, regenerates derived caches; versions generator and balance tables.
15. **Debug API:** implements the `cheat.*` entries of Appendix B including `noLag` and a deterministic `step(n)` that ignores frame budgets.
