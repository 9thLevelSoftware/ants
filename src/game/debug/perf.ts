// `__game.perf()` (architecture §5): frame time, simulation time per tick, draw calls, triangles, ant count.
import type { RenderApp } from '@/render/app';
import type { RenderRegistry } from '@/render';
import type { GameSession } from '../session';

const r2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

export function gamePerf(app: RenderApp, registry: RenderRegistry, s: GameSession | null) {
  const st = app.frameStats();
  return {
    frameMs: r2(st.frameMs), fps: r2(st.fps), p95Ms: r2(st.p95Ms), renderCpuMs: r2(st.cpuMs), drawCalls: st.drawCalls,
    triangles: st.triangles, frames: st.frames, width: st.width, height: st.height,
    simMsPerTick: s ? r2(s.driver.tickMs) : null,
    ticksLastFrame: s ? s.driver.last.ran : 0,
    effectiveSpeed: s ? r2(s.driver.speedReport().effective) : null,
    ants: s ? s.sim.state.ants.reduce((n, a) => n + (a.alive ? 1 : 0), 0) : 0,
    renderers: registry.stats(),
  };
}
