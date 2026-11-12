// `window.__founding` (test mode only): the opening's read-outs and the founding screens' actions for scripted
// playtests (tests/e2e/founding.mjs), next to window.__game. Everything goes through the same flow methods the
// screens call.
import { foundingView } from '@/sim/colony/founding';
import { foundingUi } from '@/ui/screens/founding/store';
import type { FoundingFlow, FoundingHost } from './flow';

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function installFoundingDebug(flow: FoundingFlow, host: FoundingHost): void {
  if (typeof window === 'undefined' || !host.opts.testMode) return;
  (window as unknown as { __founding: unknown }).__founding = {
    /** The simulation's plain read of the opening (phase, meters, site, readiness, clutch, lapse, outcome). */
    view: () => { const s = host.session; return s ? plain(foundingView(s.sim)) : null; },
    /** What the founding screens show now. */
    ui: () => plain(foundingUi.value),
    skipIntro: () => flow.skipIntro(),
    beginLapse: () => flow.beginLapse(),
    skipLapse: () => flow.skipLapse(),
    closeOutcome: () => flow.closeOutcome(),
    stayWithQueen: () => flow.stayWithQueen(),
    takeWorker: () => flow.takeWorker(),
    retry: () => flow.retry(),
    acceptFailure: () => flow.acceptFailure(),
  };
}
