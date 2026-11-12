// Text overlay: input state and frame statistics.
import type { FrameStatsSnapshot } from '@/render/app';

export function renderOverlay(o: {
  rig: string; quality: string; post: boolean; stats: FrameStatsSnapshot; t: number; warnings: number;
  input: { contexts: string[]; device: string; held: string[]; pressed: string[]; pointer: string };
  info: Record<string, unknown>;
}): string {
  const s = o.stats;
  const n = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-');
  return [
    `FOUNDRESS app-shell demo   rig ${o.rig}   quality ${o.quality}   post ${o.post ? 'on' : 'off'}   t ${o.t.toFixed(2)} s`,
    `frame ${n(s.frameMs)} ms  ${n(s.fps)} fps  p95 ${n(s.p95Ms)}  cpu ${n(s.cpuMs, 2)} ms  calls ${s.drawCalls}  tris ${s.triangles}  ${s.width}x${s.height} (${n(s.resolutionScale, 2)})`,
    `input ${o.input.contexts.join('+') || '-'}  device ${o.input.device}  mouse ${o.input.pointer}  held [${o.input.held.join(' ')}]`,
    `camera ${Object.entries(o.info).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(',') : String(v)}`).join('  ')}`,
    o.warnings ? `asset warnings ${o.warnings}` : '',
    'keys 1-4 rig  Q quality  P post  F8 mouse lock  RMB/MMB drag orbit  wheel zoom  Z recentre',
  ].filter(Boolean).join('\n');
}
