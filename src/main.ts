// Entry point: mounts the UI, checks WebGL2, creates the Game, exposes window.__game, and with ?autostart=1
// goes straight into a generated game. Sets window.__ready once the first real frame is rendered.
import { FOUNDRESS_VERSION, createLogger } from '@/core';
import { Game } from '@/game/Game';
import { createDebugApi, type DebugApi } from '@/game/debug/debugApi';
import { parseGameFlags } from '@/game/flags';
import { mountUi } from '@/ui/App';
import { installErrorTraps, webgl2Available } from '@/ui/boot';
import { facade, setBootScreen, setSnapshot, showError } from '@/ui/store';

declare global {
  interface Window {
    __ready?: boolean;
    __game?: DebugApi;
    /** Throws asynchronously (verification of the error overlay, tests/e2e/crash.mjs). */
    __crash?: (message?: string) => void;
  }
}

const log = createLogger('main');

async function boot(): Promise<void> {
  const uiRoot = document.getElementById('ui');
  const canvas = document.getElementById('view') as HTMLCanvasElement | null;
  if (!uiRoot || !canvas) throw new Error('index.html must provide #view and #ui');
  mountUi(uiRoot);
  let game: Game | null = null;
  installErrorTraps(window, (text) => { if (game) game.showError(text); else showError(text); });
  window.__crash = (message = 'FOUNDRESS deliberate test error') => { setTimeout(() => { throw new Error(message); }, 0); };
  const flags = parseGameFlags(location.search);
  log.info(`FOUNDRESS ${FOUNDRESS_VERSION}${flags.test ? ' (test mode)' : ''}`);
  if (!webgl2Available()) {
    setBootScreen('unsupported');
    window.__ready = true;
    return;
  }
  game = new Game({
    canvas, testMode: flags.test, quality: flags.quality, post: flags.post, forceDebugRender: flags.forceDebugRender,
    onSnapshot: setSnapshot,
  });
  window.__game = createDebugApi(game);
  facade.value = game;
  await game.boot();
  if (flags.autostart) await game.newGame(flags.newGame);
  else game.renderNow();
  window.__ready = true;
}

boot().catch((e: unknown) => {
  const text = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  showError(text);
  console.error('[main] boot failed', e);
});
