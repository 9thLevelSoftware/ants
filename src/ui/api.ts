// The UI contract: the snapshot the UI reads (refreshed by src/game/uiBridge.ts a few times per second) and the
// GameFacade the UI calls. The UI never touches SimState. Extend both additively (new optional fields / methods).
import type { DirectivesPatch, MarkerKind, PossessRole, RunSpeed, SpeedLevel } from '@/sim/types';
import type { Vec3 } from '@/core';
import type { BindingSet } from '@/input';
import type { CustomRules, StartSeasonRule } from '@/sim/types';
import type { NewGameOptions } from '@/game/newGame/options';
import type { GameMode, ViewId } from '@/game/time/speedRules';
import type { GameSettings, SettingsPatch } from '@/game/settings/settings';

export type { NewGameOptions, GameMode, ViewId, GameSettings, SettingsPatch };

/** Screens the shell routes on: the game modes plus the two boot outcomes. */
export type UiScreen = 'boot' | 'unsupported' | GameMode;

export interface UiLoading {
  /** Phase name shown to the player (worldgen wording). */
  phase: string;
  /** 0..1 */
  progress: number;
  attempt: number;
  maxAttempts: number;
  /** Set when generation or loading failed; the screen shows it with Back. */
  error: string | null;
  /**
   * ui-shell: whether this is world generation or loading a save (the wording and summary differ). Absent = the UI
   * infers it from the call it made itself (newGame vs load / import).
   */
  kind?: 'generate' | 'load';
}

export interface UiTime {
  tick: number;
  year: number;
  season: string;
  dayOfSeason: number;
  hour: number;
  minute: number;
  /** "Spring · Day 3 · 07:40" */
  label: string;
  /** ui-hud: weather word, surface air temperature and day / night for the time cluster (GDD 08 3.4). Absent = unknown. */
  weather?: UiWeather;
  /** ui-hud: season length in game days (never a literal 7: GDD 08 App. F 13). */
  seasonLength?: number;
}

export interface UiWeather {
  /** WeatherState id ('clear', 'overcast', 'rain', 'storm', 'heat', 'frost'). */
  state: string;
  /** "Clear", "Rain" ... */
  word: string;
  /** Surface air temperature, whole degrees C. */
  tempC: number;
  /** Sun glyph (true) or moon glyph. */
  isDay: boolean;
}

export interface UiSpeed {
  /** 0 = paused. */
  level: SpeedLevel;
  paused: boolean;
  /** Running speed chosen (kept while paused). */
  requested: RunSpeed;
  /** Achieved game s per real s. */
  effective: number;
  /** The sim cannot keep up with the requested speed. */
  lagging: boolean;
  belowRealTime: boolean;
  /** Levels the player may pick now (GDD 01 §8). */
  allowed: SpeedLevel[];
  /** Real-time ticking off (test mode: only __game.step advances). */
  manualClock: boolean;
  /** Counts the automatic slow-downs of this game; the speed control flashes once whenever it grows (GDD 06 4.5). Absent = 0. */
  autoSlowFlash?: number;
}

export interface UiColony {
  workers: number;
  queenAlive: boolean;
  /** All adults including the queen. */
  adults: number;
  brood: { egg: number; larva: number; pupa: number };
  stores: { c: number; p: number };
  /** ui-hud: queen state word source ('founding' | 'established' | 'orphan-dead' | 'absent'). */
  queenMode?: string;
  /** ui-hud: workers by allocation group (headcount of the tasks in the group) and the unassigned rest. */
  groups?: { forage: number; nurse: number; dig: number; defend: number; idle: number };
  /** ui-hud: stores 3 game hours ago (null while the history is shorter); the UI turns it into a trend arrow. */
  past?: { c: number | null; p: number | null };
  /** ui-hud: hourly samples of the last 3 game days, oldest first (sparklines in the expanded pulse). */
  spark?: { c: number[]; p: number[] };
  /** ui-hud: today's intake and days of stock left, per nutrient. */
  intake?: { c: number; p: number };
  stockDays?: { c: number; p: number };
  /** ui-hud: the founding queen's reserves 0..1 (before the first egg the pulse shows this alone); null once established. */
  queenReserves?: number | null;
  /** ui-hud: the overall status pip and the worst diagnostic line ("Why?" link target), if any. */
  status?: 'ok' | 'warn' | 'bad';
  worst?: { id: string; label: string; status: 'ok' | 'warn' | 'bad' } | null;
}

export interface UiPossessed {
  id: number;
  caste: string;
  task: string;
  /** 0..1 */
  health: number;
  cropC: number;
  cropP: number;
  cropCap: number;
  carrying: string;
  trailOn: boolean;
  action: string | null;
  underground: boolean;
  /** ui-hud additions (all optional). */
  isQueen?: boolean;
  /** "Worker 0412". */
  name?: string;
  ageDays?: number;
  /** Behaviour state word ("returning home"), from the simulation's reason / state, not invented by the UI. */
  stateWord?: string;
  /** The reason code word of the behaviour's last decision (simulation's `inspect` read-out): "crop full", "hungry"; null none. */
  reason?: string | null;
  /** Founding queen: reserves 0..1 replace the crop meter. */
  reserves?: number | null;
  /** Formicine acid reserve (charges); null when the caste has none. */
  acid?: { charges: number; max: number } | null;
  /** Body heat stress (thermometer glyph). */
  heatStress?: boolean;
  /** Direction to the nearest own entrance relative to where the ant faces (deg, 0 = ahead, clockwise) and distance in BU; null underground / none. */
  home?: { angleDeg: number; distBu: number } | null;
  /** The queen after hand-over: the Colony orders button shows. */
  colonyOrders?: boolean;
}

export interface UiPrompt {
  primary: string | null;
  secondary: string | null;
  extras: string[];
  /** ui-hud: the same lines with the input they belong to (the UI draws the CURRENT binding as the key cap). */
  lines?: UiPromptLine[];
}

export interface UiPromptLine {
  slot: 'primary' | 'secondary' | 'extra';
  /** PromptInput of src/sim/ants/player/prompt.ts: 'interact' | 'interact-hold' | 'dig' | 'share-food' | 'foot' | 'inspect' | 'directives'. */
  input: string;
  text: string;
  ok: boolean;
}

export interface UiAlert {
  id: number;
  kind: string;
  level: string;
  title: string;
  /** ui-hud additions (all optional): the cause line, repeat count, de-duplication subject, click-through targets. */
  cause?: string;
  count?: number;
  subjectId?: number;
  diagnosticId?: string | null;
  focus?: { kind: string; id: number; pos: Vec3 } | null;
  acknowledged?: boolean;
  raisedTick?: number;
}

/** Information-bearing sounds with a visual equivalent (GDD 08 §12 sound-cue indicators). */
export type UiSoundCueKind = 'tremor' | 'alarm' | 'drum' | 'crackle' | 'rain';

/** One edge pip: the direction of the source on the screen (degrees, 0 = right, 90 = up; null = everywhere, e.g. rain). */
export interface UiSoundCue {
  id: number;
  kind: UiSoundCueKind;
  angleDeg: number | null;
  /** The source is inside the view. */
  onScreen: boolean;
}

export interface UiToast {
  id: number;
  text: string;
}

export interface UiSnapshot {
  /** Increments on every refresh. */
  rev: number;
  screen: UiScreen;
  mode: GameMode;
  view: ViewId;
  loading: UiLoading | null;
  time: UiTime | null;
  speed: UiSpeed | null;
  colony: UiColony | null;
  possessed: UiPossessed | null;
  prompt: UiPrompt | null;
  alerts: UiAlert[];
  toasts: UiToast[];
  hudHidden: boolean;
  /** Uncaught error text for the error overlay, null when none. */
  error: string | null;
  /** Epitaph card (T1 minimal), null outside the epitaph. */
  epitaph: { ageDays: number; peakWorkers: number; cause: string } | null;
  /**
   * ui-shell: how long ago the newest save of any kind was written (null = never saved this game). Drives the pause
   * menu's "Saved 3 min ago" line and the 60 s unsaved-progress warning (GDD 08 3.5). Absent = unknown.
   */
  lastSave?: { agoS: number; kind: 'auto' | 'quick' | 'manual'; timeLabel?: string } | null;
  /** ui-hud: the colony orders (Directives) state; null outside a game. */
  directives?: UiDirectives | null;
  /** ui-hud: the roster page requested by the open Roster panel (null while it is closed). */
  roster?: UiRoster | null;
  /** ui-hud: plain-data read-outs of the hovered / selected target (null = no card). */
  inspect?: UiInspect | null;
  /** ui-panels: the diagnostics of the player colony; built only while Colony health is open (null otherwise). */
  health?: UiHealth | null;
  /** ui-panels: the player's main nest (chambers, entrances, tunnels); built only while Nest overview is open. */
  nest?: UiNest | null;
  /** ui-panels: aims, milestones, event log and history series; built only while the Journal is open. */
  journal?: UiJournal | null;
  /** ui-panels: codex entries observed in this game, id -> when (always built in a game; a few dozen entries at most). */
  codex?: UiCodexSeen | null;
  /** ui-panels: markers of the player colony and plan counts against their caps (colony view palette). */
  markers?: UiMarkerCounts | null;
  /** ui-hud: the colony's top aim for the Focus line (GDD 08 3.4); null when no aim is open. */
  focusAim?: UiFocusAim | null;
  /** Sound-cue indicator pips (only while Settings > Accessibility > Sound-cue indicators is on; absent = none). */
  soundCues?: UiSoundCue[];
}

/** The oldest open aim, worded by the interface from `id` and `species`; `newColony` = the colony is in its first game days. */
export interface UiFocusAim {
  id: string;
  species: string;
  openedTick: number;
  newColony: boolean;
  /** Ids of every open aim shown in the Journal (at most 3), oldest first; lets the line notice an aim opening behind the top one. */
  openIds?: readonly string[];
}

// ---- ui-panels: Colony health, Nest overview, Journal, Codex, marker palette (GDD 08 4.3, 4.4, 4.6, 7.2, 7.3) ----

export type UiDiagStatus = 'ok' | 'info' | 'warn' | 'bad';

/** A target the "Show" buttons and alert click-through move the camera to. */
export interface UiFocus {
  kind: string;
  id: number;
  /** mm, world space. */
  pos: Vec3;
}

export interface UiDiagFactor {
  /** Factor id ('protein', 'nurses' ...): the UI words it from the content tables. */
  cause: string;
  /** Share of the shortfall, 0..1 (the shares of one diagnostic sum to 1). */
  weight: number;
  /** Detail line with the numbers already formatted ("3 of 12 nurses"). */
  detail: string;
  /** Diagnostic that explains this factor (cause chain), null none. */
  diagId: string | null;
}

export interface UiDiagnostic {
  id: string;
  system: string;
  status: UiDiagStatus;
  label: string;
  /** Main value (a ratio of the normal rate for most diagnostics). */
  value: number;
  sinceTick: number;
  /** "Day 4, 09:00" style stamp of `sinceTick`. */
  sinceLabel: string;
  factors: UiDiagFactor[];
  /** Remedy ids ('remedy.slider.nurse'); the UI words them and maps them to controls. */
  remedies: string[];
  focus: UiFocus | null;
  /** Up to 72 hourly samples (3 game days) of the series that stands for this diagnostic, oldest first; [] none. */
  history: number[];
  /** History series id the samples come from (the sparkline's accessible name), null none. */
  historyId: string | null;
}

export interface UiHealth {
  /** The worst status of all records ('ok' when there is none). */
  overall: UiDiagStatus;
  rows: UiDiagnostic[];
  nowTick: number;
}

/** A point of the nest in BU relative to the nest origin: x, z horizontal, depth below the ground at that spot. */
export interface UiNestPoint {
  x: number;
  z: number;
  depth: number;
}

export interface UiChamberLoad {
  adults: number;
  brood: number;
  food: number;
  other: number;
}

export interface UiChamber {
  id: number;
  /** ChamberType id ('nursery' ...). */
  type: string;
  designatedBy: string;
  p: UiNestPoint;
  /** Horizontal radius (BU) for the diagram. */
  radius: number;
  /** BU^3 */
  volume: number;
  capacity: UiChamberLoad;
  occupancy: UiChamberLoad;
  /** Degrees C. */
  temp: number;
  /** Relative humidity 0..1. */
  humidity: number;
  /** Flooded fraction 0..1 and predicted flood risk 0..1. */
  flooded: number;
  floodRisk: number;
  /** Types this chamber may be given now (valid for the species and big enough). */
  allowed: string[];
}

export interface UiEntrance {
  id: number;
  /** 'open' | 'sealed' | 'sealing' | 'reopening' ... (the nest module's EntranceStatus). */
  status: string;
  kind: string;
  p: UiNestPoint;
  /** Mound height in BU, null when there is none. */
  moundBu: number | null;
  /** Ants per game hour. */
  trafficIn: number;
  trafficOut: number;
}

export interface UiTunnel {
  planId: number;
  kind: string;
  status: string;
  pts: UiNestPoint[];
}

export interface UiNest {
  nestId: number;
  /** Species id ("lasius-niger"). */
  species: string;
  /** The species' comfortable brood temperature band, degrees C; null unknown. */
  broodBand: { lo: number; hi: number; rhLo: number; rhHi: number } | null;
  volumeOpen: number;
  chambers: UiChamber[];
  entrances: UiEntrance[];
  tunnels: UiTunnel[];
  /** Open dig plans, for the "plans" line. */
  openPlans: number;
}

export interface UiAimLine {
  id: string;
  openedTick: number;
  doneTick: number;
  /** Calendar ticks of the opening / the completion, from the journal entries that recorded them (absent = unknown: the UI falls back to the state tick). */
  openedCal?: number;
  doneCal?: number;
  /** 'out-of-season' for an aim that cannot be worked on yet. */
  hint: string | null;
}

export interface UiJournalEntry {
  id: number;
  tick: number;
  /** Calendar tick the entry was written at (JournalEntry.calTick; absent = the UI uses tick + startTick). A winter lapse moves the calendar on, so this is the entry's own date. */
  calTick?: number;
  kind: string;
  key: string;
  tokens: Record<string, string | number>;
}

export interface UiEventLogLine {
  tick: number;
  /** Calendar tick of the row (EventLogEntry.calTick); see UiJournalEntry.calTick. */
  calTick?: number;
  kind: string;
  level: string;
  /** Text as the sim wrote it; '' when the interface words `key` with `tokens`. */
  text: string;
  key: string;
  tokens: Record<string, string | number>;
  focus: UiFocus | null;
}

export interface UiJournal {
  nowTick: number;
  /** env.calendar.startTick: calendar tick = tick + startTick. */
  startTick: number;
  seasonLength: number;
  /** Species id for the aim wording variants. */
  species: string;
  aims: { current: UiAimLine[]; done: UiAimLine[] };
  /** Journal entries oldest first (all kinds; the timeline filters milestones). */
  entries: UiJournalEntry[];
  /** Milestone thumbnails by milestone id (JPEG data URLs). */
  thumbs: Record<string, string>;
  /** Event log, oldest first. */
  events: UiEventLogLine[];
  /** Series for the graphs: hourly samples of the last 7 days (ending now) and daily samples (ending the last full day). */
  hourly: Record<string, number[]>;
  daily: Record<string, number[]>;
  /** Calendar day index of the last filed daily sample. */
  dailyEndDay: number;
  deaths: { total: number; top: { cause: string; n: number }[] };
}

export interface UiCodexSeen {
  /** Codex id -> { tick it was first seen in this game, date label }. */
  seen: Record<string, { tick: number; label: string }>;
  /** Device-wide unlocks (the profile) when the game exposes them; absent = per-game only. */
  device?: Record<string, { label: string }>;
}

export interface UiMarkerCount {
  n: number;
  cap: number;
}

/** A dig plan as the dig-plans legend lists it (GDD 08 4.3 status table). */
export interface UiPlanLine {
  id: number;
  /** 'chamber' | 'tunnel' | 'shaft' | 'entrance'. */
  kind: string;
  chamberType: string | null;
  /** proposed | queued | active | stalled | paused | complete. */
  status: string;
  /** 'player' | 'architect' | ... */
  source: string;
  /** The nest module's reason id while stalled, null otherwise. */
  blockedReason: string | null;
  /** Carved fraction 0..1. */
  progress: number;
}

export interface UiMarkerCounts {
  /** Per tool kind of GDD 08 4.3 (dig, forage, avoid, rally, entrance, move-brood, move-queen). */
  counts: Record<string, UiMarkerCount>;
  /** Open dig plans (at most 12), for the dig-plans legend. */
  plans: UiPlanLine[];
  /** The species' comfortable brood temperature band, for the temperature legend; null unknown. */
  comfortBand: { lo: number; hi: number } | null;
}

/** Allocation groups, in panel order. */
export type UiGroupId = 'forage' | 'nurse' | 'dig' | 'defend';

export interface UiDirectives {
  /** 'auto': the colony sets its own targets; the shares then show what it is doing. */
  allocationMode: 'auto' | 'manual';
  /** Group shares, percent summing to 100 (manual: the ordered ones; auto: the current targets). */
  shares: Record<UiGroupId, number>;
  /** Per group: workers needed (sum of demand), target and actual headcount (GDD 02 6.3 "need, target, actual"). */
  need: Record<UiGroupId, number>;
  target: Record<UiGroupId, number>;
  actual: Record<UiGroupId, number>;
  workers: number;
  queenAlive: boolean;
  /** 'auto' or -100 (carbohydrate) .. +100 (protein). */
  diet: 'auto' | number;
  alateInvestment: number;
  alatePolicy: string;
  /** Alates can be raised now (a mature colony in the right season); otherwise the reason line. */
  alates: { ok: boolean; reason: string | null };
  stockTarget: string;
  /** Foraging curfew on, and the game hours left before it clears. */
  stayIn: boolean;
  stayInHoursLeft: number;
  sealInCold: boolean;
  stance: string;
  /** Nest architect mode of the main nest: 'auto' | 'suggest' | 'off'; null when there is no nest. */
  architect: string | null;
  nestId: number;
  openPlans: number;
  /** Stores, today's intake and days of stock (Diet emphasis readouts). */
  stores: { c: number; p: number };
  intake: { c: number; p: number };
  stockDays: { c: number; p: number };
  /** Larval protein demand note: larvae count and the colony's current P need rate per game day. */
  larvae: number;
  needRateP: number;
  /** Brood by destined caste ('worker' | 'gyne' | 'male' ...), count. */
  broodByCaste: Record<string, number>;
  /** Species extra directives the species lists (T3; the ids). */
  extras: string[];
}

/** A request of the open Roster panel; the bridge answers with `UiSnapshot.roster`. */
export interface UiRosterQuery {
  caste: 'all' | 'worker' | 'queen' | 'gyne' | 'male';
  group: 'all' | UiGroupId | 'idle';
  where: 'all' | 'nest' | 'outside';
  search: string;
  sort: 'id' | 'age' | 'task' | 'where' | 'health' | 'crop' | 'carrying';
  dir: 'asc' | 'desc';
  /** First visible row and the number of rows wanted (the virtualised window plus overscan). */
  offset: number;
  limit: number;
  /** Bumped by the "Re-sort" chip: the bridge re-sorts only when this or the query changes. */
  resort: number;
}

export interface UiRosterRow {
  id: number;
  caste: string;
  /** "Worker 0412". */
  name: string;
  ageDays: number;
  task: string;
  /** Chamber type + id, or the zone outside ("Lawn"). */
  where: string;
  health: number;
  cropC: number;
  cropP: number;
  carrying: string;
  possessed: boolean;
}

export interface UiRoster {
  /** Rows of the requested window, in the frozen order. */
  rows: UiRosterRow[];
  offset: number;
  /** Ants matching the filters, and in the whole colony. */
  total: number;
  all: number;
  /** Counts by role for the group headers and the quick-possess buttons. */
  roles: { forager: number; digger: number; nurse: number; queen: number };
  /** Counts by caste. */
  byCaste: Record<string, number>;
  /** Counts by task group (and idle). */
  byGroup: Record<string, number>;
  /** The visible order no longer matches the current values: the "Re-sort" chip shows. */
  stale: boolean;
  brood: { egg: number; larva: number; pupa: number; byCaste: Record<string, number> };
}

export interface UiInspectRow {
  key: string;
  word: string;
  value: number | null;
  unit: string;
}

/** Read-outs of the simulation's `inspect` (GDD 01 section 10) for the target the player points at. */
export interface UiInspect {
  kind: string;
  /** Plain target kind of the request ('ant' | 'brood' | 'item' | 'source' | 'creature' | 'chamber' | 'entrance'). */
  targetKind: string;
  targetId: number;
  title: string;
  /** "Worker 0412" for ants, the kind word otherwise. */
  header: string;
  senses: UiInspectRow[];
  colony: UiInspectRow[];
  /** Buttons the card offers. */
  canPossess: boolean;
  canFollow: boolean;
  /** The queen's card: the Colony orders button. */
  colonyOrders: boolean;
}

export function emptySnapshot(screen: UiScreen = 'boot'): UiSnapshot {
  return {
    rev: 0, screen, mode: 'title', view: 'observer', loading: null, time: null, speed: null, colony: null, possessed: null,
    prompt: null, alerts: [], toasts: [], hudHidden: false, error: null, epitaph: null,
  };
}

/** Result of a save/load call. Persistence is the `save` task; until then calls report 'unavailable'. */
export interface SaveResult {
  ok: boolean;
  status: 'ok' | 'unavailable' | 'failed';
  message?: string;
  /** Finer word of the save layer (src/game/save/types.ts SaveCode): 'quota', 'world-mismatch', 'corrupt', ... */
  code?: string;
  /** Saved to the in-memory fallback only: lost when the page closes (storage unavailable). */
  volatile?: boolean;
}

export interface SaveSlotInfo {
  slot: string;
  label: string;
  savedAt: string;
  colonyDay: number;
  workers: number;
  // ui-shell additions (all optional): what the slot card of GDD 08 7.6 shows
  kind?: 'auto' | 'quick' | 'manual';
  /** Autosave ring generation label, e.g. "Season change". */
  trigger?: string;
  species?: string;
  archetype?: string;
  /** Resolved seed code, e.g. "4F7A-21C9". */
  seedCode?: string;
  /** "Summer · Day 5 · Year 2" */
  dateLabel?: string;
  /** Adult ants (workers and queen) at save time. */
  population?: number;
  playTimeS?: number;
  version?: string;
  /** JPEG data URL captured at save time. */
  thumbnail?: string | null;
  /** The stored data failed validation: show "damaged" (save task). */
  damaged?: boolean;
  /** Autosave ring write counter (largest = newest); 0 for other slots (save task). */
  generation?: number;
  /** A pinned autosave generation (`final`) is kept until a new game starts (save task). */
  pinned?: boolean;
}

/** Result of building an export file (the UI does the download or the text fallback). */
export interface ExportResult {
  ok: boolean;
  bytes?: Uint8Array;
  message?: string;
}

/** What the New Game screen sends on top of NewGameOptions (the game ignores fields it does not know yet). */
export interface NewGameExtras {
  /** 'natural' = the species' own founding day (GDD 08 3.7). */
  startSeason?: StartSeasonRule;
  /** Overrides on top of the difficulty preset (GDD 08 3.7 custom rules). */
  customRules?: Partial<CustomRules>;
  /** Onboarding hints on or off for this colony. */
  hints?: boolean;
  /** The seed as the player typed it (the resolved uint32 goes in `seed`). */
  seedText?: string;
}
export type NewGameRequest = NewGameOptions & NewGameExtras;

/** Outcome of GameFacade.newGame: it resolves (never rejects); a failure also shows the loading error panel. */
export interface NewGameResult {
  ok: boolean;
  /** A later newGame / quit superseded this one. */
  cancelled?: boolean;
  error?: string;
}

/** Everything the UI may ask of the game. Methods enqueue commands or change game-level state; they never throw. */
export interface GameFacade {
  newGame(opts?: NewGameRequest): Promise<NewGameResult>;
  /** Cancel a running generation / leave the game and show the title. */
  quitToTitle(): void;
  openPauseMenu(): void;
  closePauseMenu(): void;
  setSpeed(level: SpeedLevel): void;
  togglePause(): void;
  possess(target: number | PossessRole): void;
  release(): void;
  setView(view: ViewId): void;
  setDirectives(patch: DirectivesPatch): void;
  placeMarker(kind: MarkerKind, pos: Vec3, radius?: number): void;
  removeMarker(markerId: number): void;
  setHudHidden(hidden: boolean): void;
  dismissToast(id: number): void;
  // save / load hooks (the save task implements them)
  save(slot: string): Promise<SaveResult>;
  load(slot: string): Promise<SaveResult>;
  listSaves(): Promise<SaveSlotInfo[]>;
  // settings
  getSettings(): GameSettings;
  setSettings(patch: SettingsPatch): void;
  // ui-shell additions (optional: the screens degrade when the game does not provide them yet)
  /** Current key bindings (Settings > Controls). */
  getBindings?(): BindingSet;
  /** Replace the bindings; the owner persists them (`foundress.bindings.v1`). */
  setBindings?(bindings: BindingSet): void;
  /** False when IndexedDB is unavailable: the Save tab is disabled and Export / Import remain (GDD 08 7.6). */
  storageAvailable?(): boolean;
  deleteSave?(slot: string): Promise<SaveResult>;
  /** The `.foundress` bytes of a slot. */
  exportSave?(slot: string): Promise<ExportResult>;
  /** Import `.foundress` bytes or the `FOUNDRESS1:` text into `target` (a slot id, or 'now' = load without storing). */
  importSave?(data: Uint8Array | string, target: string): Promise<SaveResult>;
  /** '' when settings are stored; else the Settings header notice ("Settings cannot be stored in this browser context"). */
  settingsNotice?(): string;
  /** Forget which onboarding hints were learned (Settings > Gameplay). */
  resetHints?(): void;
  /** True when the lineage store has records (the Title shows Lineage only then). */
  hasLineage?(): boolean;
  /**
   * Codex entries unlocked on this device in earlier games (the profile's `codex` block, `profile.get().codex`), so the
   * Codex keeps them open across games (GDD 08 7.3). Absent: only the entries of the running game are open.
   */
  codexUnlocks?(): Record<string, import('@/sim/types').CodexUnlock>;
  // ui-hud additions (optional: the HUD degrades without them; the Game already has `command` and `refreshUi`)
  /** Send any sim command (acknowledgeAlert, setAutoExpand, ...). */
  command?(cmd: import('@/sim/types').Command): unknown;
  /** Rebuild and publish the snapshot now (after the UI changed what the bridge should report). */
  refreshUi?(): void;
}
