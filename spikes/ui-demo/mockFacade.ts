// A mock GameFacade for the demo page: in-memory settings, saves and bindings, no game behind it. Methods that in
// the game change the mode (newGame, load, quitToTitle, pause) move the demo's snapshot the same way.
import type { BindingSet } from '@/input';
import { defaultBindings } from '@/input';
import { defaultSettings, type GameSettings, type SettingsPatch, SettingsStore } from '@/game/settings/settings';
import type { ExportResult, GameFacade, NewGameRequest, NewGameResult, SaveResult, SaveSlotInfo, UiSnapshot } from '@/ui/api';
import { emptySnapshot } from '@/ui/api';
import { setSnapshot, snapshot } from '@/ui/store';

export interface MockOptions {
  saves: 'none' | 'some';
  storage: boolean;
  lineage: boolean;
}

const BINOMIAL = 'lasius-niger';

export function sampleSaves(): SaveSlotInfo[] {
  const base = Date.parse('2026-11-12T09:40:00Z');
  const mk = (slot: string, over: Partial<SaveSlotInfo>): SaveSlotInfo => ({
    slot, label: slot, savedAt: new Date(base).toISOString(), colonyDay: 5, workers: 34, species: BINOMIAL, archetype: 'suburban-garden',
    seedCode: '4F7A-21C9', dateLabel: 'Summer · Day 5 · Year 2', population: 35, playTimeS: 5400, version: '0.1.0', thumbnail: null, kind: 'manual', ...over,
  });
  return [
    mk('auto-1', { kind: 'auto', trigger: 'Season change', savedAt: new Date(base).toISOString(), dateLabel: 'Summer · Day 5 · Year 2', population: 35 }),
    mk('auto-2', { kind: 'auto', trigger: 'Interval', savedAt: new Date(base - 5 * 60_000).toISOString(), dateLabel: 'Summer · Day 4 · Year 2', population: 31, workers: 30 }),
    mk('auto-3', { kind: 'auto', trigger: 'Before time-lapse', savedAt: new Date(base - 22 * 60_000).toISOString(), dateLabel: 'Spring · Day 7 · Year 2', population: 22, workers: 21 }),
    mk('quick', { kind: 'quick', savedAt: new Date(base - 2 * 60_000).toISOString(), population: 34, workers: 33 }),
    mk('slot-1', { archetype: 'woodland-edge', seedCode: '0A31-77D0', dateLabel: 'Spring · Day 2 · Year 1', population: 9, workers: 8, playTimeS: 1500, savedAt: new Date(base - 86400_000 * 3).toISOString() }),
    mk('slot-3', { archetype: 'playground-park', seedCode: 'C0FF-EE01', dateLabel: 'Autumn · Day 6 · Year 3', population: 212, workers: 205, playTimeS: 36_000, savedAt: new Date(base - 86400_000 * 9).toISOString() }),
  ];
}

export class MockFacade implements GameFacade {
  readonly store = new SettingsStore(defaultSettings());
  bindings: BindingSet = defaultBindings();
  saves: SaveSlotInfo[];
  readonly calls: string[] = [];

  constructor(private readonly opts: MockOptions) {
    this.saves = opts.saves === 'some' ? sampleSaves() : [];
  }

  private log(s: string): void { this.calls.push(s); }
  private set(patch: Partial<UiSnapshot>): void { setSnapshot({ ...snapshot.value, ...patch, rev: snapshot.value.rev + 1 }); }

  async newGame(opts?: NewGameRequest): Promise<NewGameResult> {
    this.log(`newGame ${JSON.stringify(opts ?? {})}`);
    this.set({ screen: 'loading', mode: 'loading', loading: { phase: 'Zone layout', progress: 0.02, attempt: 1, maxAttempts: 8, error: null } });
    return { ok: true };
  }
  quitToTitle(): void { this.log('quitToTitle'); this.set({ screen: 'title', mode: 'title', loading: null }); }
  openPauseMenu(): void { this.set({ screen: 'paused', mode: 'paused' }); }
  closePauseMenu(): void { this.log('closePauseMenu'); this.set({ screen: 'playing', mode: 'playing' }); }
  setSpeed(): void { /* not used by the shell */ }
  togglePause(): void { /* not used by the shell */ }
  possess(): void { /* not used by the shell */ }
  release(): void { /* not used by the shell */ }
  setView(): void { /* not used by the shell */ }
  setDirectives(): void { /* not used by the shell */ }
  placeMarker(): void { /* not used by the shell */ }
  removeMarker(): void { /* not used by the shell */ }
  setHudHidden(): void { /* not used by the shell */ }
  dismissToast(): void { /* not used by the shell */ }

  async save(slot: string): Promise<SaveResult> {
    this.log(`save ${slot}`);
    if (!this.opts.storage) return { ok: false, status: 'unavailable', message: 'Saving to this browser is not available here.' };
    const rec: SaveSlotInfo = {
      slot, label: slot, savedAt: new Date('2026-11-12T10:00:00Z').toISOString(), colonyDay: 6, workers: 36, species: BINOMIAL, archetype: 'suburban-garden',
      seedCode: '4F7A-21C9', dateLabel: 'Summer · Day 6 · Year 2', population: 37, playTimeS: 5600, version: '0.1.0', thumbnail: null, kind: slot === 'quick' ? 'quick' : 'manual',
    };
    this.saves = [...this.saves.filter((s) => s.slot !== slot), rec];
    return { ok: true, status: 'ok' };
  }
  async load(slot: string): Promise<SaveResult> {
    this.log(`load ${slot}`);
    this.set({ screen: 'loading', mode: 'loading', loading: { phase: 'Terrain and cavity meshes', progress: 0.8, attempt: 1, maxAttempts: 8, error: null } });
    return { ok: true, status: 'ok' };
  }
  async listSaves(): Promise<SaveSlotInfo[]> { return this.opts.storage ? [...this.saves] : []; }
  async deleteSave(slot: string): Promise<SaveResult> { this.log(`delete ${slot}`); this.saves = this.saves.filter((s) => s.slot !== slot); return { ok: true, status: 'ok' }; }
  async exportSave(slot: string): Promise<ExportResult> {
    this.log(`export ${slot}`);
    const bytes = new Uint8Array(3000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + slot.length) & 255;
    return { ok: true, bytes };
  }
  async importSave(data: Uint8Array | string, target: string): Promise<SaveResult> {
    this.log(`import ${typeof data === 'string' ? `text:${data.length}` : `bytes:${data.length}`} -> ${target}`);
    return { ok: true, status: 'ok' };
  }
  getSettings(): GameSettings { return this.store.get(); }
  /** Like the game's settings persistence: a notice when the browser gives no usable localStorage (e.g. a sandboxed frame). */
  settingsNotice(): string {
    let usable = this.opts.storage !== false;
    if (usable) {
      try {
        localStorage.setItem('foundress.probe', '1');
        localStorage.removeItem('foundress.probe');
      } catch {
        usable = false;
      }
    }
    return usable ? '' : 'Settings cannot be stored in this browser context. They last until you close the page.';
  }
  setSettings(patch: SettingsPatch): void { this.log(`setSettings ${JSON.stringify(patch)}`); this.store.set(patch); }
  getBindings(): BindingSet { return this.bindings; }
  setBindings(b: BindingSet): void { this.log('setBindings'); this.bindings = b; }
  storageAvailable(): boolean { return this.opts.storage; }
  resetHints(): void { this.log('resetHints'); }
  hasLineage(): boolean { return this.opts.lineage; }
}

export function demoSnapshot(screen: UiSnapshot['screen'], over: Partial<UiSnapshot> = {}): UiSnapshot {
  return { ...emptySnapshot(screen), screen, mode: screen === 'paused' ? 'paused' : screen === 'playing' ? 'playing' : (screen === 'loading' ? 'loading' : 'title'), ...over };
}
