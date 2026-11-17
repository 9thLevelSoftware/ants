// WeatherRenderer (task weather-effects): what the weather looks like at ant scale, read from the simulation only.
//   rain       camera-following streaks by rain class (rainField.ts), hidden underground
//   splashes   crowns on exposed ground around the focus; ripples on puddles and water bodies (impacts.ts)
//   frost      rime glints on the ground in a frost
//   wet look   surface wetness max(precip x 2, env.moisture.surfaceWet) pushed to the world materials' uWet
//              (WorldRenderer.setWetness, through the `world` peer), so the ground stays wet after the rain
//   lightning  a <= 120 ms hemisphere-light pulse on `weather.lightning` (reduced motion: a soft brightening)
//   flooding   water sheets in flooded nest cavities (floodWater.ts)
// Overcast and storm grading, haze and frost desaturation are the world lighting's (WEATHER_LOOK); puddle sheets are
// the decor water layer's (it reads the sim's puddle store, which the weather fills). Never writes sim state.
import { Group, Vector3 } from 'three';
import type { FrameInfo, RenderContext, SubRenderer } from '@/render';
import type { QualityPreset } from '@/render/app';
import type { RainClass, Sim } from '@/sim/types';
import { isInteriorAt } from '@/sim/environment/ground';
import { ImpactLayer } from './impacts';
import { FloodWater } from './floodWater';
import { FlashTimer, LightningFlash } from './lightning';
import { RainField } from './rainField';
import { rainTint } from './rainTint';
import {
  DROP_LOOK, FLECKS, IMPACT_AREA_BU, RAIN_STREAKS, RIPPLES,
  FLECK_TINT, RIPPLE_LIFE_S, RIPPLE_RADIUS_MM, RIPPLE_TINT, SPLASHES, SPLASH_LIFE_S, SPLASH_RADIUS_DROPS, SPLASH_TINT, WET_PER_PRECIP,
} from './tuning';

/** What the renderer reads of the sim each frame (pure; exported for tests). */
export interface WeatherView {
  rain: RainClass | 'storm' | null;
  /** 0..1 share of the class's peak rate. */
  intensity: number;
  wind: number;
  windX: number;
  windZ: number;
  wet: number;
  frost: boolean;
  dew: number;
}

const PEAK_MMH: Record<RainClass | 'storm', number> = { drizzle: 1, shower: 5, downpour: 18, storm: 30 };

export function readWeather(sim: Sim): WeatherView {
  const w = sim.state.env.weather;
  const rain: WeatherView['rain'] = w.rainRateMmH > 0.05 ? (w.state === 'storm' ? 'storm' : w.intensityClass ?? 'shower') : null;
  const intensity = rain ? Math.min(1, w.rainRateMmH / PEAK_MMH[rain]) : 0;
  const wet = Math.min(1, Math.max(w.precip * WET_PER_PRECIP, sim.state.env.moisture.surfaceWet ?? 0, rain ? intensity : 0));
  const len = Math.hypot(w.windDir.x, w.windDir.z) || 1;
  return { rain, intensity, wind: w.wind2m, windX: w.windDir.x / len, windZ: w.windDir.z / len, wet, frost: w.state === 'frost', dew: w.dew.level };
}

type WetTarget = { setWetness(w: number): void };

/** The world renderer behind the `world` peer (WorldSlot.world) or the peer itself, when it takes a wetness. */
function wetTarget(peer: SubRenderer | null): WetTarget | null {
  const p = peer as unknown as { world?: Partial<WetTarget>; setWetness?: unknown } | null;
  if (p?.world && typeof p.world.setWetness === 'function') return p.world as WetTarget;
  if (p && typeof p.setWetness === 'function') return p as unknown as WetTarget;
  return null;
}

export class WeatherRenderer implements SubRenderer {
  readonly name = 'weather';
  readonly group = new Group();
  private ctx!: RenderContext;
  private rain!: RainField;
  private splashes!: ImpactLayer;
  private ripples!: ImpactLayer;
  private flecks!: ImpactLayer;
  private readonly flood = new FloodWater();
  private readonly flash = new LightningFlash();
  private sim: Sim | null = null;
  private offLightning: (() => void) | null = null;
  private readonly flashTimer = new FlashTimer();
  /** Tick of the last strike the sim reported, and of the last one shown (a strike flashes once, when it is new). */
  private strikeTick = -1;
  private shownStrike = -1;
  /** The last flash was started with reduced motion / flash reduction (flashNow without a frame). */
  private lastReduced = false;
  private wetTo: WetTarget | null = null;
  private view: WeatherView | null = null;
  private readonly focus = new Vector3();
  private readonly center = new Vector3();
  private rippleSpots: number[] = [];
  private rippleAge = Infinity;
  private streaks = 0;

  init(ctx: RenderContext): void {
    this.ctx = ctx;
    this.group.name = 'weather';
    this.build(ctx.quality);
    this.group.add(this.flood.group, this.flash.mesh);
    ctx.scene.add(this.group);
  }

  private build(q: QualityPreset): void {
    for (const l of [this.rain, this.splashes, this.ripples, this.flecks]) if (l) { this.group.remove(l.mesh); l.dispose(); }
    this.rain = new RainField(RAIN_STREAKS[q.id]);
    // colours are set every frame from the scene's light (rainTint)
    this.splashes = new ImpactLayer('splash', SPLASHES[q.id], [0.8, 0.85, 0.9], 0.5);
    this.ripples = new ImpactLayer('ripple', RIPPLES[q.id], [0.75, 0.8, 0.85], 0.45);
    this.flecks = new ImpactLayer('fleck', FLECKS[q.id], [0.9, 0.95, 1.0], 0.6);
    this.group.add(this.rain.mesh, this.splashes.mesh, this.ripples.mesh, this.flecks.mesh);
  }

  setQuality(q: QualityPreset): void {
    this.build(q);
  }

  onGameStart(sim: Sim): void {
    this.sim = sim;
    this.offLightning?.();
    this.offLightning = sim.events.on('weather.lightning', () => { this.strikeTick = sim.state.tick; });
    this.wetTo = wetTarget(this.ctx.peer?.('world') ?? null);
    this.flood.clear();
    this.rippleAge = Infinity;
  }

  onGameEnd(): void {
    this.offLightning?.();
    this.offLightning = null;
    this.sim = null;
    this.flood.clear();
  }

  update(frame: FrameInfo): void {
    const sim = frame.sim ?? this.sim;
    if (!sim) { this.group.visible = false; return; }
    this.group.visible = true;
    const v = (this.view = readWeather(sim));
    const bu = sim.world.bu;
    const cam = frame.camera.position;
    const p = frame.subject;
    if (p) this.focus.set(p.x, p.y, p.z);
    else this.focus.set(cam.x, sim.field.height(cam.x, cam.z), cam.z);
    const outside = !frame.underground;
    // rain streaks around the camera
    this.center.set(cam.x, Math.max(cam.y, this.focus.y), cam.z);
    const look = v.rain ? DROP_LOOK[v.rain] : DROP_LOOK.drizzle;
    const cam3 = frame.camera;
    const hPx = frame.viewportHeightPx > 0 ? frame.viewportHeightPx : 720;
    const view = { widthPx: Math.round(hPx * (cam3.aspect > 0 ? cam3.aspect : 16 / 9)), heightPx: hPx, focal: cam3.projectionMatrix.elements[5] > 0 ? cam3.projectionMatrix.elements[5] : 2 };
    const tint = rainTint(this.ctx.scene);
    this.streaks = this.rain.set(look, outside && v.rain ? Math.max(0.15, v.intensity) : 0, v.wind, v.windX, v.windZ, tint, this.center, frame.time, bu, view);
    // splashes, ripples and rime glints are lit like the rain: dim at dusk and by night, never a pure white
    for (const [layer, k] of [[this.splashes, SPLASH_TINT], [this.ripples, RIPPLE_TINT], [this.flecks, FLECK_TINT]] as const) layer.setColor(tint[0] * k, tint[1] * k, tint[2] * k);
    // splashes on exposed ground, ripples on water, rime glints
    const area = IMPACT_AREA_BU * bu;
    const fx = this.focus.x, fz = this.focus.z;
    const nSplash = outside && v.rain && v.rain !== 'drizzle' ? this.splashes.capacity * Math.max(0.2, v.intensity) : 0;
    this.splashes.update(frame.time, nSplash, SPLASH_LIFE_S, 1, (a, b, out) => {
      const r = Math.sqrt(a) * area, ang = b * Math.PI * 2;
      out.x = fx + Math.cos(ang) * r; out.z = fz + Math.sin(ang) * r;
      out.y = sim.field.height(out.x, out.z) + 0.05;
      out.r = look.diameterMm * SPLASH_RADIUS_DROPS;
      return openSky(sim, out.x, out.y, out.z);
    });
    this.rippleAge += frame.dt > 0 ? frame.dt : Infinity;
    if (this.rippleAge > 1) { this.rippleAge = 0; this.rippleSpots = waterSpots(sim, fx, fz, area * 1.5); }
    const spots = this.rippleSpots;
    const nRipple = outside && v.rain && spots.length > 0 ? this.ripples.capacity * Math.max(0.3, v.intensity) : 0;
    this.ripples.update(frame.time, nRipple, RIPPLE_LIFE_S, 2, (a, b, out) => {
      const s = Math.min(spots.length / 4 - 1, Math.floor(a * spots.length / 4)) * 4;
      out.x = spots[s] + (b - 0.5) * spots[s + 3]; out.z = spots[s + 2] + ((b * 7.31) % 1 - 0.5) * spots[s + 3];
      out.y = spots[s + 1] + 0.08;
      out.r = RIPPLE_RADIUS_MM * (0.6 + 0.4 * b);
      return true;
    });
    const nFleck = outside && v.frost ? this.flecks.capacity : 0;
    this.flecks.update(nFleck > 0 ? 0 : frame.time, nFleck, 1e6, 3, (a, b, out) => {
      const r = Math.sqrt(a) * area, ang = b * Math.PI * 2;
      out.x = fx + Math.cos(ang) * r; out.z = fz + Math.sin(ang) * r;
      out.y = sim.field.height(out.x, out.z) + 0.05;
      out.r = 0.35 + 0.5 * b;
      return true;
    });
    // wet surfaces (the world slot's own precip easing runs first; this write wins for the frame)
    this.wetTo?.setWetness(v.wet);
    // lightning (reduced motion or flash reduction: a slow soft brightening instead of the pulse)
    const reduced = !!frame.reducedMotion || !!frame.reducedFlash;
    if (this.strikeTick !== this.shownStrike) {
      // only a strike of the last couple of ticks flashes (a scripted jump over many ticks shows none)
      if (sim.state.tick - this.strikeTick <= 2) this.flashTimer.strike(reduced);
      this.shownStrike = this.strikeTick;
    }
    this.lastReduced = reduced;
    this.flash.set(this.flashTimer.frame(frame.dt, reduced) * (outside ? 1 : 0.1));
    // flooded cavities
    this.flood.update(sim, frame.dt);
  }

  /** Forces a lightning flash (demo, tests); `reduced` picks the reduced-motion brightening. */
  flashNow(reduced = false): void {
    this.startFlash(reduced);
  }

  private startFlash(reduced: boolean): void {
    this.flashLeft = flashDuration(reduced);
    this.flashReduced = reduced;
    this.sinceFlashS = 0;
    this.flashFresh = true;
  }

  stats(): Record<string, number> {
    return {
      streaks: this.streaks, splashes: this.splashes?.active ?? 0, ripples: this.ripples?.active ?? 0,
      flecks: this.flecks?.active ?? 0, floodCells: this.flood.cells, wet: this.view?.wet ?? 0,
    };
  }

  dispose(): void {
    this.offLightning?.();
    for (const l of [this.rain, this.splashes, this.ripples, this.flecks]) l?.dispose();
    this.flood.dispose();
    this.flash.dispose();
    this.ctx?.scene.remove(this.group);
  }
}

const UP = { x: 0, y: 1, z: 0 };
const probe = { x: 0, y: 0, z: 0 };
/** Rain reaches the point: outdoors and nothing solid within 3 BU above (grass blades do not stop a splash). */
function openSky(sim: Sim, x: number, y: number, z: number): boolean {
  if (isInteriorAt(sim.world, x, z)) return false;
  probe.x = x; probe.y = y + 0.25 * sim.world.bu; probe.z = z;
  const reach = 3 * sim.world.bu;
  return sim.field.sphereTrace(probe, UP, reach, 0.1 * sim.world.bu) >= reach - 1e-6;
}

/**
 * Standing water near (x, z) within r: puddle cells of the sim's store (>= 1 mm) and static bodies with water, as
 * [x, surface y, z, extent] quadruples (mm).
 */
export function waterSpots(sim: Sim, x: number, z: number, r: number): number[] {
  const out: number[] = [];
  const m = sim.state.env.moisture;
  if (m.nx > 0) {
    const i0 = Math.max(0, Math.floor((x - r) / m.cell)), i1 = Math.min(m.nx - 1, Math.floor((x + r) / m.cell));
    const k0 = Math.max(0, Math.floor((z - r) / m.cell)), k1 = Math.min(m.nz - 1, Math.floor((z + r) / m.cell));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const units = m.puddle[k * m.nx + i];
      if (units < 20) continue;
      const cx = (i + 0.5) * m.cell, cz = (k + 0.5) * m.cell;
      let low = Infinity;
      for (let s = 0; s <= 4; s++) for (let t = 0; t <= 4; t++) low = Math.min(low, sim.field.height(i * m.cell + (s / 4) * m.cell, k * m.cell + (t / 4) * m.cell));
      out.push(cx, low + units * 0.05, cz, m.cell * 0.9);
    }
  }
  const levels = sim.state.worldDelta.waterLevels;
  sim.world.waterBodies.forEach((b, idx) => {
    const lv = levels && idx < levels.length ? levels[idx] : b.levelMm;
    if (b.kind === 'wet-patch' || lv < 0.5 || Math.hypot(b.pos.x - x, b.pos.z - z) > r + b.radius) return;
    out.push(b.pos.x, b.pos.y + lv, b.pos.z, b.radius * 1.4);
  });
  return out;
}
