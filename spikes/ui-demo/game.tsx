// The ui-shell router mounted on the REAL Game (the integration App.tsx will do): same boot as src/main.ts, but the
// screens come from ScreenRouter. Used to prove the facade, snapshot and settings wiring; not part of the game.
//   node tools/harness/play.mjs --root spikes/ui-demo --query "test=1&quality=test" --script <file> (page: game.html)
import { render } from 'preact';
import { createLogger } from '@/core';
import { Game } from '@/game/Game';
import { createDebugApi, type DebugApi } from '@/game/debug/debugApi';
import { parseGameFlags } from '@/game/flags';
import { Hud, installErrorTraps, webgl2Available } from '@/ui/boot';
import { snapshot, facade, setBootScreen, setSnapshot, showError } from '@/ui/store';
import { ScreenRouter } from '@/ui/screens';

declare global {
  interface Window {
    __ready?: boolean;
    __game?: DebugApi;
  }
}

const log = createLogger('game-demo');

function Root() {
  const s = snapshot.value;
  return (
    <>
      <ScreenRouter />
      {(s.screen === 'playing' || s.screen === 'paused') && <Hud snap={s} />}
    </>
  );
}

async function boot(): Promise<void> {
  const uiRoot = document.getElementById('ui') as HTMLElement;
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  render(<Root />, uiRoot);
  let game: Game | null = null;
  installErrorTraps(window, (text) => { if (game) game.showError(text); else showError(text); });
  const flags = parseGameFlags(location.search);
  log.info('ui-shell on the real game');
  if (flags.noWebgl || !webgl2Available()) { setBootScreen('unsupported'); window.__ready = true; return; }
  game = new Game({ canvas, testMode: flags.test, quality: flags.quality, post: flags.post, forceDebugRender: flags.forceDebugRender, onSnapshot: setSnapshot });
  game.newGameDefaults = flags.newGame;
  window.__game = createDebugApi(game);
  facade.value = game;
  await game.boot();
  game.renderNow();
  window.__ready = true;
}

boot().catch((e: unknown) => { showError(e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)); console.error('[game-demo] boot failed', e); });
