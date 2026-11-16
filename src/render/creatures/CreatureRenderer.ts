/**
 * Draws every creature of the ecology (instanced, vertex-animated, three details by projected size), the aphid
 * herds on their plants, the antlion pits and the bird event. Reads the simulation only through simAdapter.ts and
 * never writes it. Comfort mode (GDD 08 §12) swaps looks, never behaviour.
 *
 * Per frame: sample + interpolate each live, visible creature; take its look (kind, variant, comfort level; cached
 * per creature until one of them changes); cull against the frustum with the look's own bounds; advance its gait
 * phase by distance; stage its instance; choose details under the near cap (only near detail casts shadows); then
 * write the batches and upload the used ranges.
 */
import { Frustum, Group, Matrix4, Sphere, type Object3D, type PerspectiveCamera } from 'three';
import type { QualityPreset } from '@/render/app/quality';
import { CREATURE_STATS } from '@/sim/balance/creatures';
import { CreatureFlag } from '@/sim/ecology/creatures/common';
import { hash3 } from '@/render/ants/geometry/curves';
import { CR_STRIDE } from './batch';
import type { Detail } from './geometry/builder';
import { HerdLayer } from './herdLayer';
import { creaturePose, newPose, type PoseInput } from './locomotion';
import { LookStore } from './lookStore';
import { COMFORT_LEVELS, LOOK_KEYS, SPIDER_KINDS, comfortFor, lookScale, type ComfortLevel, type ComfortSettingsLike } from './looks';
import { LookTable } from './lookTable';
import { BirdRenderer } from './props/birdRenderer';
import { ComfortMarks } from './props/comfortMarks';
import { PitRenderer, pitDepthNow, pitIsSunk } from './props/pitRenderer';
import { createSharedUniforms } from './shader/materials';
import { WorldLookup, newCreatureSample, readCreature, type CreatureSimSource, type CreatureView, type HazardView } from './simAdapter';
import { ANTLION_LOOK, COMFORT_LOOK, HOVER, PIT_DEPTH, SNAP_BODY_LENGTHS, creatureLodFor, type CreatureLodSettings } from './tuning';
import { detailFor } from './detail';

export interface CreatureRenderContext {
  scene: Object3D;
  camera: PerspectiveCamera;
  quality: QualityPreset;
  renderer?: { domElement: { height: number } };
}

export interface CreatureFrameInfo {
  dt: number;
  /** Animation clock, seconds (frozen in deterministic screenshots). */
  time: number;
  /** Tick interpolation 0..1. */
  alpha: number;
  sim?: CreatureSimSource | null;
  camera?: PerspectiveCamera;
  viewportHeightPx?: number;
  /** Accessibility settings (the settings store's `accessibility` section); when given they replace setComfort(). */
  comfort?: ComfortSettingsLike | null;
}

export interface CreatureRenderStats {
  creatures: number; drawn: [number, number, number]; culled: number; hidden: number; markers: number; labels: number;
  herds: number; aphids: number; herdDecals: number; pits: number; bird: number; drawCalls: number; triangles: number; cpuMs: number;
  looks: number; buildMs: number; spiderBodies: number;
  /** Sum over drawn creatures of their projected body length, px (triangles / this = triangles per projected px). */
  projectedPx: number;
}

/** What a creature is drawn as (GDD 08 E17: `ui.look()` reports the render variant). */
export interface CreatureLookInfo { look: string | null; comfort: ComfortLevel; ring: boolean }

interface RenderState {
  phase: number; x: number; y: number; z: number; seed: number; stamp: number;
  /** Cached look (id, -1 none) and what it was resolved for. */
  look: number; rev: number; vFlags: number; vVariant: string | null;
  level: ComfortLevel; ringed: boolean; label: string | null; size: number; spiderBody: boolean;
}

/** Ring labels per substituted kind (GDD 08 §12 "a ring on the ground with the label Spider"). */
const LABELS: Record<string, string> = { 'jumping-spider': 'Spider', 'wolf-spider': 'Spider', 'ant-spider': 'Spider', mite: 'Mite', centipede: 'Centipede' };

const _m = new Matrix4();
const HAIRY_BIT = 1 << 6;
// Module-local copies of imported bindings used in the per-creature loop (under Vite's SSR runner, used by tests and
// tools, every imported binding is read through a getter; the browser build is unaffected).
const HIDDEN = CreatureFlag.HIDDEN;
const poseOf = creaturePose, read = readCreature, pickDetail = detailFor;

export class CreatureRenderer {
  readonly group = new Group();
  private ctx!: CreatureRenderContext;
  private src: CreatureSimSource | null = null;
  private lookup: WorldLookup | null = null;
  private shared = createSharedUniforms();
  private store!: LookStore;
  private readonly table = new LookTable();
  private herds = new HerdLayer();
  private pits = new PitRenderer();
  private bird = new BirdRenderer();
  private marks = new ComfortMarks();
  private settings!: CreatureLodSettings;
  private comfort: ComfortSettingsLike = { spiderComfort: 'off', comfortMites: false, comfortCentipedes: false };
  /** Bumped when the comfort settings change: cached looks are re-resolved. */
  private comfortRev = 1;
  private states = new Map<number, RenderState>();
  private seen = 0;
  private stamp = 0;
  private smp = newCreatureSample();
  private pose = newPose();
  private pin: PoseInput = { kind: 'aphid', state: '', flags: 0, speed: 0, stepMm: 0, hp: 1, alpha: 1, time: 0, seed: 0 };
  private frustum = new Frustum(); private pm = new Matrix4(); private sph = new Sphere();
  private hazardById = new Map<number, HazardView>();
  // staging (grown on demand)
  private cap = 0;
  private S = new Float32Array(0);
  private px = new Float32Array(0);
  private looks = new Int16Array(0);
  private nearPx = new Float32Array(0);
  /** Debug: force every creature to one detail (null = automatic). */
  forceDetail: Detail | null = null;
  readonly stats: CreatureRenderStats = {
    creatures: 0, drawn: [0, 0, 0], culled: 0, hidden: 0, markers: 0, labels: 0, herds: 0, aphids: 0, herdDecals: 0, pits: 0, bird: 0,
    drawCalls: 0, triangles: 0, cpuMs: 0, looks: 0, buildMs: 0, spiderBodies: 0, projectedPx: 0,
  };

  init(ctx: CreatureRenderContext): void {
    this.ctx = ctx;
    this.group.name = 'creatures';
    ctx.scene.add(this.group);
    this.applyQuality(ctx.quality);
    this.store = new LookStore(this.group, this.shared, this.settings.shadows);
    this.group.add(this.pits.group, this.bird.group, this.marks.group, this.herds.group);
  }

  setSim(src: CreatureSimSource | null): void {
    this.src = src;
    this.lookup = src ? new WorldLookup(src) : null;
    this.states.clear();
    this.herds.clear();
  }

  /** Comfort settings (GDD 08 §12); takes effect on the next update, completely (looks are re-resolved). */
  setComfort(s: Partial<ComfortSettingsLike>): void {
    const level = s.spiderComfort && (COMFORT_LEVELS as readonly string[]).includes(s.spiderComfort) ? s.spiderComfort : this.comfort.spiderComfort;
    const mites = s.comfortMites ?? this.comfort.comfortMites, cents = s.comfortCentipedes ?? this.comfort.comfortCentipedes;
    const c = this.comfort;
    if (level === c.spiderComfort && mites === c.comfortMites && cents === c.comfortCentipedes) return;
    this.comfort = { spiderComfort: level, comfortMites: mites, comfortCentipedes: cents };
    this.comfortRev++;
  }
  get comfortLevel(): ComfortLevel { return this.comfort.spiderComfort; }

  /** What creature `id` was drawn as in the last update (null when it was not seen). */
  lookOf(id: number): CreatureLookInfo | null {
    const r = this.states.get(id);
    if (!r || r.stamp !== this.stamp) return null;
    return { look: r.look >= 0 ? LOOK_KEYS[r.look]! : null, comfort: r.level, ring: r.ringed };
  }

  setQuality(q: QualityPreset): void {
    this.applyQuality(q);
    this.store.setShadows(this.settings.shadows);
    this.herds.clear();
  }

  private applyQuality(q: QualityPreset): void {
    this.settings = creatureLodFor(q.id, q.density.crowdLod, q.shadows.enabled);
  }

  setLod(o: Partial<CreatureLodSettings>): CreatureLodSettings { Object.assign(this.settings, o); return this.settings; }

  update(frame: CreatureFrameInfo): void {
    const t0 = performance.now();
    if (frame.sim !== undefined && frame.sim !== this.src) this.setSim(frame.sim);
    if (frame.comfort) this.setComfort(frame.comfort);
    const camera = frame.camera ?? this.ctx.camera;
    this.shared.uTime.value = frame.time;
    this.store.resetAll();
    this.marks.begin();
    const st = this.stats;
    st.creatures = 0; st.drawn[0] = st.drawn[1] = st.drawn[2] = 0; st.culled = 0; st.hidden = 0; st.spiderBodies = 0; st.projectedPx = 0;
    const src = this.src, lookup = this.lookup;
    this.stamp++;
    if (!src || !lookup) {
      this.store.commitAll(); this.marks.commit(); this.herds.hide();
      this.pits.update([], 0, this.frustum, null); this.bird.update(null, 0, () => 0);
      this.finishStats(t0);
      return;
    }
    camera.updateMatrixWorld();
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.pm);
    const viewportH = frame.viewportHeightPx ?? this.ctx.renderer?.domElement.height ?? 720;
    const pxPerMm = viewportH / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const cam = camera.position;
    const tick = src.state.tick, alpha = Math.min(1, Math.max(0, frame.alpha)), dt = Math.max(0, frame.dt);
    const eco = src.state.ecology;
    this.hazardById.clear();
    if (eco) for (const h of eco.hazards) this.hazardById.set(h.id, h);

    // ---- pass 1: sample, cull, stage
    const list = src.state.creatures;
    this.ensureCap(list.length);
    let n = 0;
    this.seen = 0;
    const s = this.settings, smp = this.smp, pose = this.pose, table = this.table, rev = this.comfortRev;
    for (const c of list) {
      if (!c.alive) continue;
      st.creatures++;
      if (c.flags & HIDDEN) { st.hidden++; continue; }
      const rs = this.state(c);
      if (rs.rev !== rev || rs.vFlags !== (c.flags & HAIRY_BIT) || rs.vVariant !== c.variant) this.resolveLook(rs, c);
      const look = rs.look, ringed = rs.ringed;
      if (look < 0 && !ringed) continue;
      read(c, alpha, smp, tick);
      const size = rs.size;
      const pin = this.pin;
      pin.kind = c.kind; pin.state = smp.state; pin.flags = smp.flags; pin.speed = smp.speed; pin.stepMm = smp.stepMm; pin.hp = smp.hp;
      pin.alpha = alpha; pin.time = frame.time; pin.seed = rs.seed;
      poseOf(pin, pose);
      const hover = pose.style === 'hover' ? size * HOVER.bodyLengths + HOVER.bobMm * Math.sin(frame.time * HOVER.bobHz * 6.283 + rs.seed * 9) : 0;
      this.cullSphere(look, size, hover + pose.arcMm, pose.flip, ringed);
      if (!this.frustum.intersectsSphere(this.sph)) { this.advance(rs, smp.pos, 0, size); st.culled++; continue; }
      const dist = Math.max(1e-3, cam.distanceTo(this.sph.center));
      const px = (size / dist) * pxPerMm;
      if (ringed) {
        const r = size * COMFORT_LOOK.ringRadiusBodyLengths;
        this.surfaceFrame(smp.pos, smp.up, smp.fwd);
        this.marks.add(_m, r, smp.windup > 0 ? smp.windup : 0, rs.label);
      }
      if (look < 0) continue;
      if (px < s.minPx) { this.advance(rs, smp.pos, 0, size); st.culled++; continue; }
      const k = size / table.size[look]!;
      this.advance(rs, smp.pos, table.stride[look]! * k, size);
      if (pose.style === 'crawl' && pose.moving < 0.05) rs.phase = (rs.phase + dt * 0.25) % 1;
      this.stageCreature(n, look, size, pose, rs, hover);
      this.px[n] = px;
      this.looks[n] = look;
      if (rs.spiderBody) st.spiderBodies++;
      n++;
    }
    // stale render states only exist when fewer were seen than are stored
    if (this.seen !== this.states.size) for (const [id, r] of this.states) if (r.stamp !== this.stamp) this.states.delete(id);

    // ---- pass 2: details under the near cap, then write
    const nearCut = this.nearCutoff(n);
    let nearUsed = 0;
    for (let i = 0; i < n; i++) {
      const px = this.px[i]!, look = this.looks[i]!;
      let d: Detail = pickDetail(px, table.tris1[look]!, s, px >= nearCut);
      if (this.forceDetail !== null) d = this.forceDetail;
      const lod = this.store.lodAt(look, d);
      lod.body.push(this.S, i * CR_STRIDE);
      if (lod.wings) lod.wings.push(this.S, i * CR_STRIDE);
      st.drawn[d]++;
      st.projectedPx += px;
      if (d === 0) nearUsed++;
    }

    // ---- herds (share the near cap), pits, bird
    if (eco) {
      this.herds.update(eco.herds, lookup, this.store, this.frustum, cam, pxPerMm, s, Math.max(0, s.maxNear - nearUsed));
      this.pits.update(eco.hazards, tick, this.frustum, lookup);
      this.bird.update(eco.birdEvent, tick - 1 + alpha, (x, z) => lookup.height(x, z, eco.birdEvent?.pos.y ?? 0), lookup.hardDistance());
    } else { this.herds.hide(); this.pits.update([], tick, this.frustum, null); this.bird.update(null, 0, () => 0); }
    this.store.commitAll();
    this.marks.commit();
    this.finishStats(t0);
  }

  /** Render state of a creature (gait phase by distance, seed, cached look); created at its first sight. */
  private state(c: CreatureView): RenderState {
    let r = this.states.get(c.id);
    if (!r) {
      const p = c.pos, id = c.id;
      r = {
        phase: hash3(id, 3, 1), x: p.x, y: p.y, z: p.z, seed: hash3(id, 5, 2), stamp: 0,
        look: -1, rev: 0, vFlags: -1, vVariant: null, level: 'off', ringed: false, label: null, size: 1, spiderBody: false,
      };
      this.states.set(id, r);
    }
    if (r.stamp !== this.stamp) { r.stamp = this.stamp; this.seen++; }
    return r;
  }

  /** Resolves (and caches in rs) the look of creature c under the current comfort settings. */
  private resolveLook(rs: RenderState, c: CreatureView): void {
    const level = comfortFor(c.kind, this.comfort);
    const look = this.table.lookFor(c.kind, c.variant, c.flags, level);
    rs.look = look; rs.level = level; rs.rev = this.comfortRev; rs.vFlags = c.flags & HAIRY_BIT; rs.vVariant = c.variant;
    rs.ringed = level === 'marker' || (look >= 0 && this.table.ring[look] === 1);
    rs.label = level === 'marker' ? (LABELS[c.kind] ?? null) : null;
    rs.size = CREATURE_STATS[c.kind].sizeMm * lookScale(c.kind, c.variant);
    rs.spiderBody = look >= 0 && this.table.spiderLike[look] === 1 && SPIDER_KINDS.has(c.kind);
  }

  /** this.sph = the cull sphere of the sampled creature (its look's own bounds; the ring for marker mode). */
  private cullSphere(look: number, size: number, lift: number, flip: boolean, ringed: boolean): void {
    const smp = this.smp, u = smp.up, f = smp.fwd, p = smp.pos;
    let cx = 0, cy = 0.3 * size, cz = 0, r = 0;
    if (look >= 0) {
      const b = this.table.bounds(look), k = size / this.table.size[look]!;
      cx = b.cx * k; cy = b.cy * k; cz = b.cz * k; r = b.r * k;
      if (flip) { r += cy * 2; cy = 0; }
    }
    if (ringed) r = Math.max(r, size * COMFORT_LOOK.ringRadiusBodyLengths * 1.1);
    cy += lift;
    // left = up x fwd
    const lx = u.y * f.z - u.z * f.y, ly = u.z * f.x - u.x * f.z, lz = u.x * f.y - u.y * f.x;
    this.sph.center.set(p.x + lx * cx + u.x * cy + f.x * cz, p.y + ly * cx + u.y * cy + f.y * cz, p.z + lz * cx + u.z * cy + f.z * cz);
    this.sph.radius = r;
  }

  private advance(r: RenderState, p: { x: number; y: number; z: number }, strideMm: number, size: number): void {
    const dx = p.x - r.x, dy = p.y - r.y, dz = p.z - r.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (strideMm > 0 && d < SNAP_BODY_LENGTHS * size) r.phase = (r.phase + d / strideMm) % 1;
    r.x = p.x; r.y = p.y; r.z = p.z;
  }

  /** _m = unit surface frame at p (columns left, up, forward). */
  private surfaceFrame(p: { x: number; y: number; z: number }, u: { x: number; y: number; z: number }, f: { x: number; y: number; z: number }): void {
    const lx = u.y * f.z - u.z * f.y, ly = u.z * f.x - u.x * f.z, lz = u.x * f.y - u.y * f.x;
    _m.set(lx, u.x, f.x, p.x, ly, u.y, f.y, p.y, lz, u.z, f.z, p.z, 0, 0, 0, 1);
  }

  private stageCreature(n: number, look: number, size: number, pose: ReturnType<typeof newPose>, rs: RenderState, hover: number): void {
    const S = this.S, o = n * CR_STRIDE, smp = this.smp, table = this.table;
    const k = size / table.size[look]!;
    let ux = smp.up.x, uy = smp.up.y, uz = smp.up.z, fx = smp.fwd.x, fy = smp.fwd.y, fz = smp.fwd.z;
    let tx = smp.pos.x, ty = smp.pos.y, tz = smp.pos.z;
    let ax = 0, ay = 0; // aPose.xy (pit offset / radius for buried looks)
    const buried = pose.style === 'buried';
    if (buried) {
      // antlion: tilted head-up at the bottom of its pit and sunk into the sand; the pit is in its instance (shader/pitDepth.ts)
      const pit = smp.pitId >= 0 ? this.hazardById.get(smp.pitId) : undefined;
      const fl = Math.hypot(fx, fz) || 1, hx = fx / fl, hz = fz / fl;
      const c = Math.cos(ANTLION_LOOK.tiltRad), sn = Math.sin(ANTLION_LOOK.tiltRad);
      fx = hx * c; fy = sn; fz = hz * c;
      ux = -hx * sn; uy = c; uz = -hz * sn;
      const depth = pit ? pitDepthNow(pit, this.src!.state.tick) : 0;
      const base = pit ? pit.pos : smp.pos;
      tx = base.x; ty = base.y - depth - ANTLION_LOOK.sinkMm; tz = base.z;
      // where the ground already follows the pit (sunk pits, props/pitRenderer.ts) real depths are right: no depth rule
      const sunk = pit !== undefined && pitIsSunk(pit, depth, this.lookup!.height(pit.pos.x, pit.pos.z, pit.pos.y));
      ax = (base.y + PIT_DEPTH.liftMm) - ty; ay = pit && !sunk ? pit.radius : 0;
    }
    let lx = uy * fz - uz * fy, ly = uz * fx - ux * fz, lz = ux * fy - uy * fx;
    const lift = hover + pose.arcMm;
    tx += ux * lift; ty += uy * lift; tz += uz * lift;
    if (pose.flip) {
      // on its back: rotate pi about the forward axis and raise by the body height
      const h = table.bodyAxisY[look]! * 2 * k;
      tx += ux * h; ty += uy * h; tz += uz * h;
      lx = -lx; ly = -ly; lz = -lz; ux = -ux; uy = -uy; uz = -uz;
    }
    S[o] = lx * k; S[o + 1] = ly * k; S[o + 2] = lz * k; S[o + 3] = 0;
    S[o + 4] = ux * k; S[o + 5] = uy * k; S[o + 6] = uz * k; S[o + 7] = 0;
    S[o + 8] = fx * k; S[o + 9] = fy * k; S[o + 10] = fz * k; S[o + 11] = 0;
    S[o + 12] = tx; S[o + 13] = ty; S[o + 14] = tz; S[o + 15] = 1;
    S[o + 16] = rs.phase; S[o + 17] = pose.moving; S[o + 18] = table.legAmp[look]!; S[o + 19] = rs.seed;
    S[o + 20] = buried ? ax : pose.curl; S[o + 21] = buried ? ay : pose.fold;
    S[o + 22] = pose.crouch; S[o + 23] = pose.flap;
    const v = 0.92 + 0.16 * rs.seed;
    S[o + 24] = v; S[o + 25] = v; S[o + 26] = v; S[o + 27] = pose.act;
  }

  /** Smallest px that still gets near detail when more than maxNear qualify (nearest-first by size on screen). */
  private nearCutoff(n: number): number {
    const s = this.settings;
    let m = 0;
    for (let i = 0; i < n; i++) if (this.px[i]! >= s.nearPx) this.nearPx[m++] = this.px[i]!;
    if (m <= s.maxNear) return 0;
    if (s.maxNear <= 0) return Infinity;
    const sub = this.nearPx.subarray(0, m).sort();
    return sub[m - s.maxNear]!;
  }

  private ensureCap(n: number): void {
    if (n <= this.cap) return;
    const c = Math.max(64, 1 << Math.ceil(Math.log2(n)));
    this.cap = c;
    this.S = new Float32Array(c * CR_STRIDE); this.px = new Float32Array(c); this.nearPx = new Float32Array(c);
    this.looks = new Int16Array(c);
  }

  private finishStats(t0: number): void {
    const st = this.stats;
    const cnt = { calls: 0, tris: 0 };
    for (const e of this.store.entries.values()) e.count(cnt);
    st.herds = this.herds.stats.herds; st.aphids = this.herds.stats.aphids; st.herdDecals = this.herds.stats.decals; st.pits = this.pits.drawn;
    st.bird = (this.bird.shadowOn ? 1 : 0) + (this.bird.beakOn ? 1 : 0);
    st.markers = this.marks.rings; st.labels = this.marks.labelsShown;
    st.drawCalls = cnt.calls + this.pits.drawn + st.bird + (st.markers > 0 ? 1 : 0) + st.labels + (st.herdDecals > 0 ? 1 : 0);
    st.triangles = cnt.tris + this.herds.stats.decalTris; st.looks = this.store.entries.size; st.buildMs = this.store.buildMs;
    st.cpuMs = performance.now() - t0;
  }

  dispose(): void {
    this.store?.dispose();
    this.pits.dispose(); this.bird.dispose(); this.marks.dispose(); this.herds.dispose();
    this.group.removeFromParent();
    this.src = null; this.lookup = null;
  }
}
