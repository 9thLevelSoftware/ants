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
    /** The opening record itself (hazard log, failure outcome) for scripts that report why a run ended. */
    opening: () => { const s = host.session; return s ? plain(s.sim.state.player.opening) : null; },
    /**
     * Static suitability map cells of the played species within `rBu` of (x, z), nearest first, at or above `minQ`
     * (0..1): where a scripted player heads for a good site (the same map the site overlay shows).
     */
    sites: (x: number, z: number, rBu: number, minQ: number) => {
      const s = host.session;
      if (!s) return [];
      const m = s.sim.world.maps.suitability[s.sim.species.id as keyof typeof s.sim.world.maps.suitability];
      if (!m) return [];
      const bu = s.sim.world.bu, out: { x: number; z: number; q: number; d: number }[] = [];
      for (let iz = 0; iz < m.nz; iz++) for (let ix = 0; ix < m.nx; ix++) {
        const cx = (ix + 0.5) * m.cell, cz = (iz + 0.5) * m.cell, q = m.data[iz * m.nx + ix] / 255, d = Math.hypot(cx - x, cz - z);
        if (q >= minQ && d <= rBu * bu) out.push({ x: cx, z: cz, q, d });
      }
      return out.sort((a, b) => a.d - b.d);
    },
  };
}
