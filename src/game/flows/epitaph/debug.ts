// `window.__lifecycle` (test mode only): read-outs and actions of the winter, flight, epitaph and Lineage screens
// for scripted playtests (tests/e2e/lifecycle.mjs), next to window.__game. Everything goes through the flows' own
// methods, the ones the screens call.
import { winterUi } from '@/ui/screens/overwinter/store';
import { flightUi } from '@/ui/screens/flight/store';
import { epitaphUi } from '@/ui/screens/epitaph/store';
import { lineageUi } from '@/ui/screens/lineage/store';
import type { LifecycleFlows } from './lifecycle';
import type { LifecycleHost } from './host';
import { lineageProfile } from './lineage';

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function installLifecycleDebug(flows: LifecycleFlows, host: LifecycleHost): void {
  if (typeof window === 'undefined' || !host.opts.testMode) return;
  (window as unknown as { __lifecycle: unknown }).__lifecycle = {
    /** What each screen shows now (null: nothing). */
    ui: () => plain({ winter: winterUi.value, flight: flightUi.value, epitaph: epitaphUi.value, lineage: lineageUi.value }),
    /** The colony's lifecycle record in the sim. */
    record: () => { const s = host.session; return s ? plain(s.sim.state.colonies[0]?.lifecycle ?? null) : null; },
    winter: {
      begin: () => flows.winter.begin(), delay: () => flows.winter.delay(), skip: () => flows.winter.skip(),
      close: () => flows.winter.close(), setProgress: (p: number) => flows.winter.setProgress(p),
    },
    flight: {
      release: () => flows.flight.release(), flyAsQueen: () => flows.flight.flyAsQueen(), watch: () => flows.flight.watch(),
      landNow: () => flows.flight.landNow(), closeEnded: () => flows.flight.closeEnded(),
    },
    epitaph: { copy: () => flows.epitaph.copyRecord(), foundDaughter: (id: string | null) => flows.epitaph.foundDaughter(id) },
    lineage: {
      open: () => flows.openLineage(), close: () => flows.close(), foundDaughter: (id: string) => flows.foundDaughter(id),
      profile: () => plain(lineageProfile().get().lineage),
    },
  };
}
