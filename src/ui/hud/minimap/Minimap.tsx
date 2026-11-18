// Minimap (GDD 08 3.4, setting Gameplay > Minimap, default Never): a 176 dp square at the bottom right showing a
// 256 x 256 BU window round the camera target, north up. Zones are flat tints (canvas), the player colony's entrances
// are rings, markers are the palette's icons, the possessed ant is an arrow, and the colony's trail cells show while
// the scent view is on. A click pans the observer camera there. Hidden in the compact layout (CSS) and while a drawer
// is open. The data comes straight from the game through the HUD bridge, a few times a second; nothing is saved.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { MinimapFrame, MinimapPlate } from '@/game/uiBridge/minimap';
import { Icon } from '../../icons';
import { overlays } from '../../overlays/state';
import { uiPrefs } from '../../styles/prefs';
import { hudBridge } from '../state';
import { fromBox, MINIMAP_REFRESH_MS, MINIMAP_SIZE_DP, paintPlate, toBox } from './model';

/** Canvas pixels per dp (a sharp plate on dense screens, bounded so the repaint stays cheap). */
const MAX_DPR = 2;

interface Drawn {
  frame: MinimapFrame;
  /** The arrow's last known heading, kept while the ant points straight up a wall. */
  yaw: number;
}

/** A detached copy of the reused frame (the bridge reuses its arrays). */
function copy(f: MinimapFrame): MinimapFrame {
  return { ...f, entrances: f.entrances.map((e) => ({ ...e })), markers: f.markers.map((m) => ({ ...m })), ant: f.ant ? { ...f.ant } : null, trail: f.trail.map((t) => ({ ...t })) };
}

const pct = (v: number): string => `${(v * 100).toFixed(2)}%`;

export function Minimap() {
  const on = uiPrefs.prefs.value.gameplay.minimap;
  const scent = overlays.value.scent;
  const bridge = hudBridge.value;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const yaw = useRef(0);
  const plate = useRef<MinimapPlate | null>(null);

  useEffect(() => {
    if (!on || !bridge) return;
    const tick = (): void => {
      const f = bridge.minimap(scent);
      if (!f) { setDrawn(null); return; }
      plate.current = bridge.minimapPlate();
      if (f.ant?.yaw != null) yaw.current = f.ant.yaw;
      const next = copy(f);
      setDrawn({ frame: next, yaw: yaw.current });
      paint(canvas.current, plate.current, next);
    };
    tick();
    const id = setInterval(tick, MINIMAP_REFRESH_MS);
    return () => clearInterval(id);
  }, [on, bridge, scent]);

  if (!on || !bridge) return null;
  const f = drawn?.frame;
  const click = (e: MouseEvent): void => {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    if (!f || r.width <= 0) return;
    const p = fromBox(f, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    bridge.panTo(p.x, p.z);
  };
  return (
    <section class="fd-minimap fd-chip" data-hud="minimap" aria-label="Minimap" data-testid="minimap" data-scent={scent ? '1' : undefined}>
      <div class="fd-minimap-box" onClick={click} title="Click to look there" role="img" aria-label="Map of the area round the camera, north up. Click to look there.">
        <canvas ref={canvas} class="fd-minimap-plate" width={MINIMAP_SIZE_DP} height={MINIMAP_SIZE_DP} />
        {f && (
          <>
            {f.entrances.map((e, i) => {
              const b = toBox(f, e.x, e.z);
              return <span key={`e${i}`} class={`fd-mm-ring${e.open ? '' : ' is-closed'}`} style={{ left: pct(b.u), top: pct(b.v) }} data-mm="entrance" />;
            })}
            {f.markers.map((m, i) => {
              const b = toBox(f, m.x, m.z);
              return <span key={`m${i}`} class="fd-mm-marker" style={{ left: pct(b.u), top: pct(b.v) }} data-mm="marker" data-kind={m.kind}><Icon name={`marker-${m.kind}`} size={14} decorative /></span>;
            })}
            {f.ant && (() => {
              const b = toBox(f, f.ant.x, f.ant.z);
              return (
                <span class="fd-mm-ant" style={{ left: pct(b.u), top: pct(b.v), transform: `translate(-50%, -50%) rotate(${(drawn?.yaw ?? 0).toFixed(3)}rad)` }} data-mm="ant">
                  <svg viewBox="-8 -8 16 16" width="16" height="16" aria-hidden="true"><path d="M0 -7 L5 6 L0 3 L-5 6 Z" /></svg>
                </span>
              );
            })()}
          </>
        )}
        <span class="fd-mm-north" aria-hidden="true">N</span>
      </div>
    </section>
  );
}

/** Repaints the zone plate and the trail cells on the canvas. */
function paint(cv: HTMLCanvasElement | null, plate: MinimapPlate | null, f: MinimapFrame): void {
  if (!cv || !plate) return;
  const dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
  const size = Math.round(MINIMAP_SIZE_DP * dpr);
  if (cv.width !== size) { cv.width = size; cv.height = size; }
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(size, size);
  paintPlate(img.data, size, plate, f);
  ctx.putImageData(img, 0, 0);
  if (f.trail.length) {
    const cell = (4 * size) / 256; // a pheromone cell is 4 BU of the 256 BU window
    for (const t of f.trail) {
      const b = toBox(f, t.x, t.z);
      ctx.fillStyle = `rgba(255, 196, 64, ${(0.25 + 0.65 * t.v).toFixed(2)})`;
      ctx.fillRect(b.u * size - cell / 2, b.v * size - cell / 2, cell, cell);
    }
  }
}
