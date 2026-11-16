// `window.__onboarding` and `__game.ui.hints()` (GDD 08 App. B), installed only with ?test=1. Read-only except
// `advance` (the scripted run's real-seconds clock), `use` / `learn` / `dismiss` (what the player's input would do) and
// `reset` (Settings > Reset hints). The debug API of the game is not this task's file, so `ui.hints` is attached at
// runtime to the object `__game.ui` that already exists.
import { HINT_TABLE, type HintView, type OnboardingController } from '@/game/onboarding';
import type { HintId } from '@/sim/types';
import { hintText } from '@/content/text';
import { hintView } from './state';

type Getter = () => OnboardingController | null;

interface Win {
  __onboarding?: unknown;
  __game?: { ui?: Record<string, unknown> };
}

const need = (get: Getter): OnboardingController => {
  const c = get();
  if (!c) throw new Error('__onboarding: no game is running');
  return c;
};

export function installOnboardingDebug(get: Getter): () => void {
  const w = window as unknown as Win;
  const api = {
    /** Hint states as the profile has them: `{ 'hint-move': { state, uses }, ... }`. */
    hints: () => need(get).engine.states(),
    /** The hint the card draws now (id, compact, anchor, verb, action) or null. */
    view: (): HintView | null => { const v = hintView.peek(); return v ? { ...v } : null; },
    /** What is on screen: the card's id, its text and key cap text (as drawn), or null. */
    card: () => {
      const el = document.querySelector<HTMLElement>('[data-testid="hint-card"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        id: el.dataset.hintId ?? '', compact: el.dataset.compact === '1', text: el.textContent ?? '',
        key: el.querySelector('kbd')?.textContent ?? null, verb: el.querySelector('[data-testid="hint-verb"]')?.textContent ?? null,
        box: { x: r.left, y: r.top, w: r.width, h: r.height },
      };
    },
    /** Everything that happened, in order (shown / learned / dismissed / hidden / compact), with the engine clock. */
    log: () => need(get).engine.log.map((l) => ({ ...l })),
    /** The facts the triggers saw at the last step. */
    facts: () => (need(get).lastFacts ? JSON.parse(JSON.stringify(need(get).lastFacts)) : null),
    /** Clock, flags and uses of this game. */
    state: () => { const e = need(get).engine; return { clock: e.clock, flags: e.flagList(), uses: e.uses(), quietUntil: e.quietUntil() }; },
    /** The table: id, order, presenter, anchor, words. */
    table: () => HINT_TABLE.map((d) => ({ id: d.id, order: d.order, presenter: d.presenter, anchor: d.anchor, learn: d.learn, ...hintText(d.id) })),
    /** Advance the engine by `s` real seconds (the manual clock of ?test=1). */
    advance: (s: number) => { need(get).advance(Number(s)); return api.view(); },
    /** Report `n` uses of a verb (what the player's action would do). */
    use: (key: string, n = 1) => { need(get).engine.use(key as never, n); need(get).advance(0); return api.hints(); },
    learn: (id: HintId) => { need(get).engine.learn(id); need(get).advance(0); return api.hints(); },
    dismiss: () => need(get).dismiss(),
    /** Settings > Reset hints. */
    reset: () => { need(get).engine.resetStore(); need(get).advance(0); return api.hints(); },
  };
  w.__onboarding = api;
  const ui = w.__game?.ui;
  if (ui) ui.hints = () => api.hints();
  return () => {
    delete w.__onboarding;
    if (w.__game?.ui) delete w.__game.ui.hints;
  };
}
