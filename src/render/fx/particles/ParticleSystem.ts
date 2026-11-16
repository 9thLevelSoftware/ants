// The particle effects' CPU side (no three): drains the cue feed into pooled effects near the camera, adds
// footfall dust from ants walking on dry loose soil, keeps the underground scent motes around brood piles, food
// stores and the queen, and integrates both pools. Reads sim state only; randomness is render-local.
import type { Vec3 } from '@/core';
import type { Sim } from '@/sim/types';
import { PHERO_SHARED_COLONY } from '@/sim/balance';
import { EmitQueue, subscribeEffects, type PendingEmit } from './cueFeed';
import { emitEffect, hexToLinear, type EffectSpec } from './emitters';
import { ParticlePool, RenderRng } from './ParticlePool';
import { topsoilMoistureAt } from '../overlays/samplers';
import {
  EMIT_MAX_AGE_TICKS, FOOTFALL_DRY, FOOTFALL_MIN_SPEED_BU_S, FOOTFALL_PER_BU, LOOSE_MATERIALS, MOTE, type ParticleBudget,
} from './tuning';

export interface ParticleFrame {
  /** Real seconds to integrate (0 = frozen). */
  dt: number;
  camera: Vec3;
  /** Scent view on: motes take the colour of the strongest channel where they appear. */
  scentOn: boolean;
  /** sRGB inks of the scent channels (trail, home, alarm) for the motes. */
  inks: { trail: string; home: string; alarm: string };
}

export interface ParticleStats {
  particles: number;
  motes: number;
  emitted: number;
  dropped: number;
  ms: number;
}

const MOTE_EMITTER_REFRESH_S = 0.5;
/** Grains in a cavity settle this far below where they were bitten off, BU (no field query per particle). */
const CAVITY_DROP_BU = 0.8;
/** A bite less than this below the open ground sprays its grains onto the ground around the pit, BU. */
const SHALLOW_BITE_BU = 3;
/** A settled grain's centre rests this far above the floor (about its radius), BU. */
const GRAIN_REST_BU = 0.12;
/** Motes are additive and a little brighter than white so the bloom catches them (spike-look 2.9). */
const MOTE_GLOW = 1.4;

export class ParticleSystem {
  fx: ParticlePool;
  motes: ParticlePool;
  readonly queue = new EmitQueue();
  private readonly rng = new RenderRng(0x5ca1ab1e);
  private sim: Sim | null = null;
  private off: (() => void) | null = null;
  private readonly spec: EffectSpec = { kind: 'debris', x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, dx: 0, dy: 0, dz: 0, strength: 1, color: null, floor: -Infinity };
  private readonly nrm: Vec3 = { x: 0, y: 1, z: 0 };
  private readonly p: Vec3 = { x: 0, y: 0, z: 0 };
  private footCursor = 0;
  private emitters: Vec3[] = [];
  private emittersAge = Infinity;
  private moteDebt = 0;
  private emitted = 0;
  private dropped = 0;
  private lastMs = 0;
  private scentWas = false;
  /** Effects (pool) and motes are drawn; both off = nothing is spawned or integrated. */
  effectsOn = true;
  motesOn = true;

  constructor(private budget: ParticleBudget) {
    this.fx = new ParticlePool(Math.max(1, budget.particles));
    this.motes = new ParticlePool(Math.max(1, budget.motes));
  }

  /** New pool sizes (quality change); live particles are dropped. */
  setBudget(b: ParticleBudget): void {
    this.budget = b;
    this.fx = new ParticlePool(Math.max(1, b.particles));
    this.motes = new ParticlePool(Math.max(1, b.motes));
  }

  setSim(sim: Sim | null): void {
    this.off?.();
    this.off = null;
    this.sim = sim;
    this.queue.clear();
    this.fx.clear();
    this.motes.clear();
    this.emitters = [];
    this.emittersAge = Infinity;
    if (sim) this.off = subscribeEffects(sim, this.queue);
  }

  update(f: ParticleFrame): void {
    const sim = this.sim;
    if (!sim) return;
    const t0 = performance.now();
    if (this.effectsOn && this.budget.particles > 0) {
      this.drain(sim, f.camera);
      if (f.dt > 0) this.footfall(sim, f.camera, f.dt);
      this.fx.step(f.dt);
    } else {
      this.queue.clear();
      this.fx.clear();
    }
    if (this.motesOn && this.budget.motes > 0) {
      // motes take their tint when they appear: re-seed them when the scent view is switched
      if (f.scentOn !== this.scentWas) { this.motes.clear(); this.scentWas = f.scentOn; }
      this.updateMotes(sim, f);
      this.motes.step(f.dt);
    } else this.motes.clear();
    this.lastMs = performance.now() - t0;
  }

  private drain(sim: Sim, cam: Vec3): void {
    const bu = sim.world.bu;
    const r2 = (this.budget.radiusBu * bu) ** 2;
    const now = sim.state.tick;
    this.queue.drain((e) => {
      if (now - e.tick > EMIT_MAX_AGE_TICKS || (e.x - cam.x) ** 2 + (e.y - cam.y) ** 2 + (e.z - cam.z) ** 2 > r2) { this.dropped++; return; }
      this.emitAt(sim, e);
    });
  }

  /** Spawns one effect at a pending record (normal and floor from the world field). */
  emitAt(sim: Sim, e: PendingEmit): void {
    const bu = sim.world.bu;
    const s = this.spec, p = this.p, n = this.nrm;
    p.x = e.x; p.y = e.y; p.z = e.z;
    if (sim.field.normal(p, n) === 0) { n.x = 0; n.y = 1; n.z = 0; }
    const ground = sim.field.height(e.x, e.z);
    const inCavity = sim.field.substrateXYZ(e.x, e.y, e.z) < 0;
    s.kind = e.kind; s.x = e.x; s.y = e.y; s.z = e.z;
    s.nx = n.x; s.ny = n.y; s.nz = n.z;
    // a bite just under the open ground (a dig starting from the surface): the grains fly up out of the pit and
    // settle on the ground around it
    const shallow = ground - e.y;
    if ((e.kind === 'debris' || e.kind === 'pellet') && shallow >= 0 && shallow < SHALLOW_BITE_BU * bu) {
      s.y = ground; s.nx = 0; s.ny = 1; s.nz = 0;
      s.floor = ground + GRAIN_REST_BU * bu;
    } else s.floor = (inCavity ? e.y - CAVITY_DROP_BU * bu : Math.min(e.y, ground)) + GRAIN_REST_BU * bu;
    this.emitted += emitEffect(this.fx, this.rng, s, bu);
  }

  /** Dust from a few ants per frame walking outside on dry loose soil. */
  private footfall(sim: Sim, cam: Vec3, dt: number): void {
    const ants = sim.state.ants;
    const n = ants.length, k = Math.min(n, this.budget.footfallAnts);
    if (k === 0) return;
    const bu = sim.world.bu;
    const near2 = (this.budget.radiusBu * 0.5 * bu) ** 2;
    const share = n / k;
    for (let i = 0; i < k; i++) {
      this.footCursor = (this.footCursor + 1) % n;
      const a = ants[this.footCursor];
      if (!a.alive || a.nestId >= 0 || a.medium !== 'surface' || a.up.y < 0.6) continue;
      const spBu = a.speed / bu;
      if (spBu < FOOTFALL_MIN_SPEED_BU_S) continue;
      if ((a.pos.x - cam.x) ** 2 + (a.pos.y - cam.y) ** 2 + (a.pos.z - cam.z) ** 2 > near2) continue;
      if (this.rng.next() > Math.min(1, FOOTFALL_PER_BU * spBu * dt * share)) continue;
      this.p.x = a.pos.x; this.p.y = a.pos.y - 0.3 * bu; this.p.z = a.pos.z;
      if (!LOOSE_MATERIALS.has(sim.field.materialAt(this.p))) continue;
      const m = topsoilMoistureAt(sim, a.pos.x, a.pos.z);
      if (m === null || m >= FOOTFALL_DRY) continue;
      this.emitAt(sim, { kind: 'dust', x: a.pos.x, y: a.pos.y, z: a.pos.z, dx: 0, dy: 0, dz: 0, strength: 1, color: null, tick: sim.state.tick });
    }
  }

  /** Mote emitters near the camera: brood piles (per chamber), food chambers, the queen. */
  private refreshEmitters(sim: Sim, cam: Vec3): void {
    const bu = sim.world.bu;
    const near2 = (MOTE.nearBu * bu) ** 2;
    const out: Vec3[] = [];
    const close = (p: Vec3) => (p.x - cam.x) ** 2 + (p.y - cam.y) ** 2 + (p.z - cam.z) ** 2 <= near2;
    const piles = new Map<number, { x: number; y: number; z: number; n: number }>();
    for (const b of sim.state.brood) {
      if (!b.alive || b.carriedBy >= 0 || !close(b.pos)) continue;
      const key = b.chamberId >= 0 ? b.chamberId : -1 - Math.round(b.pos.x / (4 * bu)) * 7919 - Math.round(b.pos.z / (4 * bu));
      const g = piles.get(key) ?? { x: 0, y: 0, z: 0, n: 0 };
      g.x += b.pos.x; g.y += b.pos.y; g.z += b.pos.z; g.n++;
      piles.set(key, g);
    }
    for (const g of piles.values()) out.push({ x: g.x / g.n, y: g.y / g.n + 0.5 * bu, z: g.z / g.n });
    for (const nest of sim.state.nests) {
      for (const c of nest.chambers) {
        if ((c.type === 'food' || c.type === 'granary') && close(c.center)) out.push({ x: c.center.x, y: c.center.y - c.radii.y * 0.4, z: c.center.z });
      }
    }
    for (const a of sim.state.ants) if (a.alive && a.caste === 'queen' && a.nestId >= 0 && close(a.pos)) out.push({ x: a.pos.x, y: a.pos.y + 0.6 * bu, z: a.pos.z });
    this.emitters = out;
    this.emittersAge = 0;
  }

  private updateMotes(sim: Sim, f: ParticleFrame): void {
    this.emittersAge += f.dt;
    if (this.emittersAge >= MOTE_EMITTER_REFRESH_S || f.dt === 0) this.refreshEmitters(sim, f.camera);
    const em = this.emitters;
    if (em.length === 0) return;
    const bu = sim.world.bu;
    const R = MOTE.radiusBu * bu;
    const perEmitter = MOTE.perBu3 * (4 / 3) * Math.PI * MOTE.radiusBu ** 3;
    const target = Math.min(this.motes.capacity, Math.round(perEmitter * em.length));
    const meanLife = (MOTE.life[0] + MOTE.life[1]) / 2;
    // frozen frame (test screenshots): fill to the target at once; otherwise spawn at the replacement rate
    let want: number;
    if (f.dt === 0) want = target - this.motes.count;
    else {
      this.moteDebt += (target / meanLife) * f.dt;
      want = Math.floor(this.moteDebt);
      this.moteDebt -= want;
    }
    want = Math.min(want, target - this.motes.count);
    const base = hexToLinear(MOTE.color);
    for (let i = 0; i < want; i++) {
      const e = em[Math.floor(this.rng.next() * em.length)];
      let ok = false;
      for (let tries = 0; tries < 4 && !ok; tries++) {
        const u = this.rng.next() * 2 - 1, a = this.rng.next() * Math.PI * 2, rr = R * Math.cbrt(this.rng.next());
        const s = Math.sqrt(1 - u * u);
        this.p.x = e.x + Math.cos(a) * s * rr; this.p.y = e.y + u * rr * 0.6; this.p.z = e.z + Math.sin(a) * s * rr;
        ok = sim.field.sample(this.p) > 0.15 * bu;
      }
      if (!ok) continue;
      const [r, g, b] = f.scentOn ? this.moteInk(sim, this.p, f.inks) : base;
      const d = MOTE.driftBu * bu;
      this.motes.spawn({
        x: this.p.x, y: this.p.y, z: this.p.z,
        vx: (this.rng.next() - 0.5) * d, vy: (this.rng.next() - 0.4) * d * 0.5, vz: (this.rng.next() - 0.5) * d,
        life: this.rng.range(MOTE.life[0], MOTE.life[1]), size: MOTE.sizeBu * MOTE.drawScale * bu, grow: 1,
        r: r * MOTE_GLOW, g: g * MOTE_GLOW, b: b * MOTE_GLOW, alpha: MOTE.alpha, gravity: 0, drag: 0.05, floor: -Infinity,
      });
    }
  }

  /** Ink of the strongest scent channel at p (colony home smell when nothing is deposited, as in the nest). */
  private moteInk(sim: Sim, p: Vec3, inks: ParticleFrame['inks']): [number, number, number] {
    const col = sim.state.colonies.find((c) => c.alive && c.isPlayer);
    const tr = col ? sim.phero.sample(col.id, 'trail', p) : 0;
    const al = sim.phero.sample(PHERO_SHARED_COLONY, 'alarm', p);
    if (al > 0.5 && al >= tr) return hexToLinear(inks.alarm);
    if (tr > 0.3) return hexToLinear(inks.trail);
    return hexToLinear(inks.home);
  }

  stats(): ParticleStats {
    return { particles: this.fx.count, motes: this.motes.count, emitted: this.emitted, dropped: this.dropped, ms: this.lastMs };
  }

  dispose(): void { this.setSim(null); }
}
