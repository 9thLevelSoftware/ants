// Mock facade and scripted snapshots for the HUD demo (task ui-hud): a Lasius colony of 34 workers in a summer
// afternoon, with a possessed worker or the queen, alerts, directives and a 1,500-ant roster. Methods change the shared
// snapshot the way the game would, so every control can be used in the page.
import { defaultBindings, type BindingSet } from '@/input';
import { defaultSettings, SettingsStore, type GameSettings, type SettingsPatch } from '@/game/settings/settings';
import { hudRequests } from '@/game/uiBridge/requests';
import type { Command, SpeedLevel } from '@/sim/types';
import type {
  ExportResult, GameFacade, NewGameRequest, NewGameResult, SaveResult, SaveSlotInfo, UiAlert, UiDirectives, UiInspect, UiPossessed, UiPrompt,
  UiRoster, UiRosterQuery, UiRosterRow, UiSnapshot,
} from '@/ui/api';
import { emptySnapshot } from '@/ui/api';
import { comparator, matchesQuery, orderIsStale, queryOrderKey, roleOfTask, type RosterAnt } from '@/ui/panels/roster/rosterModel';
import { setSnapshot, snapshot } from '@/ui/store';

const TASKS = ['forage', 'forage', 'forage', 'scout', 'nurse', 'nurse', 'queen-care', 'store', 'dig', 'dig', 'haul', 'guard', 'idle', 'rest'];
const GROUP: Record<string, string> = { forage: 'forage', scout: 'forage', tend: 'forage', nurse: 'nurse', 'queen-care': 'nurse', store: 'nurse', dig: 'dig', haul: 'dig', guard: 'defend', patrol: 'defend' };
const CHAMBERS = ['Nursery 3', 'Food 5', 'Royal 1', 'General 7', 'Tunnel'];
const ZONES = ['Lawn', 'Garden bed', 'Pavement', 'Forest floor'];
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

interface MockAnt extends RosterAnt { where: string; carrying: string }

function makeAnts(n: number): MockAnt[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const ants: MockAnt[] = [];
  for (let i = 0; i < n; i++) {
    const id = i === 0 ? 1 : 100 + i * 3 + Math.floor(rnd() * 3);
    const queen = i === 0;
    const task = queen ? 'idle' : TASKS[Math.floor(rnd() * TASKS.length)];
    const inNest = queen || rnd() < 0.55;
    ants.push({
      id, caste: queen ? 'queen' : 'worker', task, physioAgeGd: queen ? 41 : Math.round(rnd() * 300) / 10, hp: Math.round(rnd() * 10) + 1, maxHp: 10,
      cropC: Math.round(rnd() * 80) / 100, cropP: Math.round(rnd() * 20) / 100, chamberId: inNest ? 1 : -1, nestId: inNest ? 1 : -1,
      carry: { kind: rnd() < 0.2 ? 'item' : 'none' },
      where: queen ? 'Royal 1' : inNest ? CHAMBERS[Math.floor(rnd() * CHAMBERS.length)] : ZONES[Math.floor(rnd() * ZONES.length)],
      carrying: queen ? '—' : rnd() < 0.2 ? 'soil pellet' : '—',
    });
  }
  return ants;
}

const colonyShape = { groups: { forage: 11, nurse: 9, dig: 7, defend: 2, idle: 5 }, workers: 34 };

export function demoPossessed(queen: boolean): UiPossessed {
  return queen
    ? {
      id: 1, caste: 'queen', task: 'idle', health: 0.95, cropC: 0.4, cropP: 0.15, cropCap: 1, carrying: 'nothing', trailOn: false, action: null, underground: true,
      isQueen: true, name: 'Queen 0001', ageDays: 41.2, stateWord: 'resting in the chamber', reason: null, reserves: null, acid: null, heatStress: false, home: null, colonyOrders: true,
    }
    : {
      id: 412, caste: 'worker', task: 'forage', health: 0.82, cropC: 0.6, cropP: 0.1, cropCap: 1, carrying: 'crumb', trailOn: true, action: null, underground: false,
      isQueen: false, name: 'Worker 0412', ageDays: 12.4, stateWord: 'returning home', reason: 'crop full', reserves: null, acid: { charges: 3, max: 5 }, heatStress: false,
      home: { angleDeg: 38, distBu: 126 }, colonyOrders: false,
    };
}

export function demoPrompt(queen: boolean): UiPrompt {
  const lines = queen
    ? [{ slot: 'primary' as const, input: 'interact', text: 'Lay egg', ok: true }, { slot: 'extra' as const, input: 'directives', text: 'Colony orders', ok: true }]
    : [
      { slot: 'primary' as const, input: 'interact', text: 'Pick up crumb', ok: true },
      { slot: 'secondary' as const, input: 'interact-hold', text: 'Pull crumb', ok: true },
      { slot: 'extra' as const, input: 'dig', text: 'Dig — concrete cannot be dug', ok: false },
    ];
  return { primary: lines[0].text, secondary: queen ? null : lines[1].text, extras: lines.filter((l) => l.slot === 'extra').map((l) => l.text), lines };
}

export function demoAlerts(kind: 'none' | 'few' | 'many' | 'critical'): UiAlert[] {
  const a = (id: number, k: string, level: string, title: string, cause: string, count = 1): UiAlert => ({ id, kind: k, level, title, cause, count, subjectId: id, diagnosticId: null, focus: null, acknowledged: false, raisedTick: 7000 + id });
  if (kind === 'none') return [];
  if (kind === 'few') return [a(1, 'food-p-low', 'warning', 'Protein short for the larvae', '18 larvae, 0.3 P stored', 3), a(2, 'source-found', 'notice', 'New food found', 'honeydew, 140 BU north-east')];
  if (kind === 'critical') return [a(9, 'queen-in-danger', 'critical', 'Queen under attack', 'wolf spider, royal chamber'), a(1, 'food-p-low', 'warning', 'Protein short for the larvae', '18 larvae, 0.3 P stored', 3), a(2, 'source-found', 'notice', 'New food found', 'honeydew, 140 BU north-east')];
  return [
    a(1, 'food-p-low', 'warning', 'Protein short for the larvae', '18 larvae, 0.3 P stored', 3), a(2, 'source-found', 'notice', 'New food found', 'honeydew, 140 BU north-east'),
    a(3, 'nest-crowded', 'notice', 'Nest crowded', 'general chamber at 140 % capacity'), a(4, 'weather-change', 'notice', 'Rain coming', 'within 2 game hours'),
    a(5, 'trail-lost', 'notice', 'Trail broken', 'rain washed out the trail to the aphids'),
  ];
}

export function demoDirectives(manual: boolean): UiDirectives {
  return {
    allocationMode: manual ? 'manual' : 'auto', shares: manual ? { forage: 40, nurse: 30, dig: 20, defend: 10 } : { forage: 35, nurse: 30, dig: 25, defend: 10 },
    need: { forage: 12.4, nurse: 9.1, dig: 6.5, defend: 1.2 }, target: { forage: 12, nurse: 9, dig: 8, defend: 2 }, actual: { forage: 11, nurse: 9, dig: 7, defend: 2 },
    workers: 34, queenAlive: true, diet: manual ? 30 : 'auto', alateInvestment: 0, alatePolicy: 'auto-release',
    alates: { ok: false, reason: 'Alates need a mature colony in the right season' }, stockTarget: 'normal', stayIn: false, stayInHoursLeft: 0, sealInCold: false, stance: 'defensive',
    architect: 'auto', nestId: 1, openPlans: 2, stores: { c: 7.4, p: 1.2 }, intake: { c: 3.1, p: 0.4 }, stockDays: { c: 4.6, p: 0.9 }, larvae: 20, needRateP: 1.3,
    broodByCaste: { worker: 40 }, extras: [],
  };
}

export function demoSnapshot(over: Partial<UiSnapshot> = {}, o: { queen?: boolean; alerts?: 'none' | 'few' | 'many' | 'critical'; possessed?: boolean } = {}): UiSnapshot {
  const possessed = o.possessed !== false;
  const queen = !!o.queen;
  return {
    ...emptySnapshot('playing'), screen: 'playing', mode: 'playing', view: possessed ? 'possess' : 'observer', rev: 1,
    time: {
      tick: 36000, year: 1, season: 'summer', dayOfSeason: 5, hour: 14, minute: 20, label: 'Summer · Day 5 · 14:20',
      weather: { state: 'clear', word: 'Clear', tempC: 24, isDay: true }, seasonLength: 7,
    },
    speed: { level: 1, paused: false, requested: 1, effective: 1, lagging: false, belowRealTime: false, allowed: possessed ? [0, 1, 2, 4] : [0, 1, 2, 4, 8], manualClock: false },
    colony: {
      workers: colonyShape.workers, queenAlive: true, adults: 35, brood: { egg: 12, larva: 20, pupa: 8 }, stores: { c: 7.4, p: 1.2 }, queenMode: 'established', groups: colonyShape.groups,
      past: { c: 6.5, p: 1.5 }, spark: { c: Array.from({ length: 72 }, (_, i) => 5 + Math.sin(i / 9) * 1.2 + i / 40), p: Array.from({ length: 72 }, (_, i) => 2 - i / 70 + Math.sin(i / 5) * 0.2) },
      intake: { c: 3.1, p: 0.4 }, stockDays: { c: 4.6, p: 0.9 }, status: 'warn', worst: { id: 'diag-food-intake-p', label: 'Protein intake low', status: 'warn' },
    },
    possessed: possessed ? demoPossessed(queen) : null, prompt: possessed ? demoPrompt(queen) : null, alerts: demoAlerts(o.alerts ?? 'few'),
    directives: demoDirectives(false), ...over,
  };
}

export class HudMockFacade implements GameFacade {
  readonly store = new SettingsStore(defaultSettings());
  bindings: BindingSet = defaultBindings();
  readonly calls: string[] = [];
  readonly commands: unknown[] = [];
  private readonly ants = makeAnts(1500);
  private order: number[] = [];
  private orderKey = '';
  private roster: UiRoster | null = null;

  private log(s: string): void { this.calls.push(s); }
  private set(patch: Partial<UiSnapshot>): void { setSnapshot({ ...snapshot.value, ...patch, rev: snapshot.value.rev + 1 }); }

  async newGame(_o?: NewGameRequest): Promise<NewGameResult> { return { ok: true }; }
  quitToTitle(): void { this.log('quitToTitle'); }
  openPauseMenu(): void { this.set({ screen: 'paused', mode: 'paused' }); }
  closePauseMenu(): void { this.set({ screen: 'playing', mode: 'playing' }); }

  setSpeed(level: SpeedLevel): void {
    this.log(`setSpeed ${level}`);
    const sp = snapshot.value.speed;
    if (!sp) return;
    this.set({ speed: level === 0 ? { ...sp, paused: true, level: 0 } : { ...sp, paused: false, level, requested: level as 1 | 2 | 4 | 8 } });
  }
  togglePause(): void {
    const sp = snapshot.value.speed;
    if (sp) this.setSpeed(sp.paused ? sp.requested : 0);
  }
  possess(target: number | 'forager' | 'digger' | 'nurse' | 'queen'): void {
    this.log(`possess ${target}`);
    const queen = target === 'queen' || target === 1;
    this.set({ view: 'possess', possessed: demoPossessed(queen), prompt: demoPrompt(queen), speed: snapshot.value.speed ? { ...snapshot.value.speed, allowed: [0, 1, 2, 4], level: snapshot.value.speed.paused ? 0 : 1, requested: 1 } : null });
  }
  release(): void { this.log('release'); this.set({ view: 'observer', possessed: null, prompt: null }); }
  setView(): void { /* not used */ }
  setDirectives(patch: Record<string, unknown>): void {
    this.log(`setDirectives ${JSON.stringify(patch)}`);
    this.commands.push({ type: 'setDirectives', ...patch });
    const d = snapshot.value.directives;
    if (!d) return;
    const next = { ...d } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'allocation') { if (v === 'auto') next.allocationMode = 'auto'; else { next.allocationMode = 'manual'; next.shares = v; } } else next[k] = v;
    }
    this.set({ directives: next as unknown as UiDirectives });
  }
  command(cmd: Command): void {
    this.log(`command ${JSON.stringify(cmd)}`);
    this.commands.push(cmd);
    if (cmd.type === 'setAutoExpand') this.setDirectives({ architect: cmd.mode });
  }
  placeMarker(): void { /* not used */ }
  removeMarker(): void { /* not used */ }
  setHudHidden(hidden: boolean): void { this.set({ hudHidden: hidden }); }
  dismissToast(id: number): void { this.set({ toasts: snapshot.value.toasts.filter((t) => t.id !== id) }); }
  async save(): Promise<SaveResult> { return { ok: true, status: 'ok' }; }
  async load(): Promise<SaveResult> { return { ok: true, status: 'ok' }; }
  async listSaves(): Promise<SaveSlotInfo[]> { return []; }
  async exportSave(): Promise<ExportResult> { return { ok: false }; }
  getSettings(): GameSettings { return this.store.get(); }
  setSettings(patch: SettingsPatch): void { this.store.set(patch); }
  getBindings(): BindingSet { return this.bindings; }

  /** Rebuilds the slices the open panels asked for (roster page, inspect card), like the game's bridge does. */
  refreshUi(): void {
    const q = hudRequests.roster;
    const inspectReq = hudRequests.inspect;
    this.set({ roster: q ? this.buildRoster(q) : null, inspect: inspectReq ? this.buildInspect(inspectReq.id) : null });
  }

  private rowOf(a: MockAnt): UiRosterRow {
    return {
      id: a.id, caste: a.caste, name: `${cap(a.caste)} ${String(a.id).padStart(4, '0')}`, ageDays: a.physioAgeGd, task: cap(a.task.replace(/-/g, ' ')), where: a.where,
      health: a.hp / a.maxHp, cropC: a.cropC, cropP: a.cropP, carrying: a.carrying, possessed: a.id === snapshot.value.possessed?.id,
    };
  }

  private buildRoster(q: UiRosterQuery): UiRoster {
    const key = queryOrderKey(q);
    if (key !== this.orderKey) {
      this.orderKey = key;
      this.order = this.ants.filter((a) => matchesQuery(a, q, (GROUP[a.task] ?? 'idle') as 'forage')).sort(comparator(q.sort, q.dir)).map((a) => a.id);
    }
    const byId = new Map(this.ants.map((a) => [a.id, a]));
    const rows = this.order.slice(q.offset, q.offset + Math.min(q.limit, 80)).map((id) => this.rowOf(byId.get(id) as MockAnt));
    const roles = { forager: 0, digger: 0, nurse: 0, queen: 1 };
    const byGroup: Record<string, number> = {};
    const byCaste: Record<string, number> = {};
    for (const a of this.ants) {
      byCaste[a.caste] = (byCaste[a.caste] ?? 0) + 1;
      const g = GROUP[a.task] ?? 'idle';
      if (a.caste !== 'queen') { byGroup[g] = (byGroup[g] ?? 0) + 1; const r = roleOfTask(a.task); if (r) roles[r]++; }
    }
    const live = this.order.slice(q.offset, q.offset + rows.length).map((id) => byId.get(id) as MockAnt);
    this.roster = {
      rows, offset: q.offset, total: this.order.length, all: this.ants.length, roles, byCaste, byGroup, stale: orderIsStale(live, q.sort, q.dir),
      brood: { egg: 12, larva: 20, pupa: 8, byCaste: { worker: 40 } },
    };
    return this.roster;
  }

  private buildInspect(id: number): UiInspect | null {
    const a = this.ants.find((x) => x.id === id);
    if (!a) return null;
    const queen = a.caste === 'queen';
    const row = (key: string, word: string, value: number | null = null, unit = '') => ({ key, word, value, unit });
    return {
      kind: 'ant', targetKind: 'ant', targetId: id, title: queen ? 'queen' : 'nestmate', header: `${cap(a.caste)} ${String(a.id).padStart(4, '0')}`,
      senses: [
        row('odour', 'nestmate'), row('caste', a.caste), row('age', a.physioAgeGd > 12 ? 'old' : 'young', a.physioAgeGd, 'game days'),
        row('health', a.hp > 7 ? 'healthy' : 'hurt', (a.hp / a.maxHp) * 100, '%'), row('crop-c', 'carbohydrate', a.cropC, 'loads'), row('crop-p', 'protein', a.cropP, 'loads'), row('carrying', a.carrying === '—' ? 'nothing' : a.carrying),
      ],
      colony: [row('task', a.task), row('state', 'forage.return'), row('target', 'source', 23), row('reason', 'crop full', 3), ...(queen ? [row('colony-orders', 'Colony orders')] : [])],
      canPossess: a.id !== snapshot.value.possessed?.id, canFollow: true, colonyOrders: queen,
    };
  }
}
