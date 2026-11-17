/**
 * Draws every ant (instanced, vertex-animated, LOD by projected size), the items they carry, and loose brood/items.
 * Reads the simulation only through SimReader (simAdapter.ts) and never writes it.
 *
 * Per frame: sample + interpolate each live ant, advance its render state (gait by distance walked, smoothed up,
 * blended pose), cull against the frustum, stage its instance data, pick LODs under the caps (the possessed ant is
 * always drawn at LOD0), then copy the staged data into the batches and upload only the used ranges.
 */
import { Color, Frustum, Group, Matrix4, Sphere, type PerspectiveCamera } from 'three';
import type { QualityPreset } from '@/render/app/quality';
import type { AntFrameInfo, AntRenderContext, AntRenderStats, PickTarget } from './frame';
import {
  SimReader, newAntSample, newBroodSample, newItemSample, type AntSimSource, type BroodSample, type ItemSample,
} from './simAdapter';
import { AntStateTable, smoothFactors, stepAntState, trackOffscreen, type SmoothFactors } from './antState';
import { footTarget } from './gait';
import { copyPose, poseTarget, withAlarm, withCarry, NEUTRAL_POSE, type PoseTarget } from './poses';
import { selectLods, type SelectResult } from './select';
import { ANT_FILL, CAMERA_CAPSULE, GAIT, HIGHLIGHT, lodSettingsFor, type AntLodSettings } from './tuning';
import { createSharedUniforms, type SharedAntUniforms } from './shader/materials';
import { VariantStore } from './variantStore';
import { ItemCatalog, type ItemRef } from './items/catalog';
import { LooseItemRenderer, type LooseInstance } from './items/looseRenderer';
import { speciesMorphs } from './morph/catalog';
import type { InstanceBatch } from './batches';

/** Floats staged per ant: matrix 16 + aGait, aPose, aTint, aAct, aExtra, aFootA, aFootB (4 each; batches.ts ATTRS order). */
const STRIDE = 44;
// Linear highlight colours at 0 EV, parsed once (Color.set(hex) parses and colour-manages a string).
const HI_WARM_BASE = new Color(HIGHLIGHT.warm).multiplyScalar(HIGHLIGHT.warmGain);
const HI_COOL_BASE = new Color(HIGHLIGHT.cool).multiplyScalar(HIGHLIGHT.coolGain);
const DEBUG_LOD_TINT: [number, number, number][] = [[12, 1, 1], [1, 10, 1.5], [1.5, 3, 16], [14, 12, 1]];

export class AntRenderer {
  readonly group = new Group();
  private ctx!: AntRenderContext;
  private reader: SimReader | null = null;
  private shared: SharedAntUniforms = createSharedUniforms();
  private store!: VariantStore;
  private catalog!: ItemCatalog;
  private loose!: LooseItemRenderer;
  private states = new AntStateTable();
  private settings!: AntLodSettings;
  private stamp = 0;
  private sample = newAntSample();
  private pose: PoseTarget = { ...NEUTRAL_POSE };
  private kSmooth: SmoothFactors = { up: 0, pose: 0 };
  // staging (grown on demand)
  private cap = 0;
  private stage = new Float32Array(0);
  private dist = new Float32Array(0); private px = new Float32Array(0);
  private forced = new Uint8Array(0); private lod = new Int8Array(0); private order = new Int32Array(0);
  private vIdx = new Int32Array(0); private stagedId = new Int32Array(0); private stagedCount = 0; private carryKey: (string | null)[] = []; private carrySize = new Float32Array(0);
  private winged = new Uint8Array(0);
  private sel: SelectResult = { counts: [0, 0, 0, 0], dropped: 0, sorted: false };
  private frustum = new Frustum(); private pm = new Matrix4(); private sph = new Sphere();
  private carriedBrood = new Map<number, BroodSample>(); private carriedItems = new Map<number, ItemSample>();
  private broodPool = new SamplePool(newBroodSample); private itemPool = new SamplePool(newItemSample);
  private ref: ItemRef = { key: '', sizeMm: 0 };
  private looseList: LooseInstance[] = []; private loosePool: LooseInstance[] = [];
  private hover: PickTarget | null = null; private inspect: PickTarget | null = null;
  /** Exposure the highlight colours were last compensated for (createSharedUniforms builds them at 0 EV). */
  private highlightEV = 0;
  /** Debug: tint each ant by its LOD (red 0, green 1, blue 2, yellow 3). */
  debugLodTint = false;
  /** Debug: force every ant to one LOD (null = automatic). */
  forceLod: number | null = null;
  /** Stats of the last update (one object, rewritten each frame). */
  readonly stats: AntRenderStats = { ants: 0, visible: [0, 0, 0, 0], culled: 0, dropped: 0, wings: 0, carried: 0, looseItems: 0, drawCalls: 0, triangles: 0, cpuMs: 0, sampleMs: 0, uploadMs: 0, variants: 0, buildMs: 0 };

  init(ctx: AntRenderContext): void {
    this.ctx = ctx;
    this.group.name = 'ants';
    ctx.scene.add(this.group);
    this.applyQuality(ctx.quality);
    this.store = new VariantStore(this.group, this.shared, (sp) => this.reader?.speciesInfo(sp).appearance ?? null, { physicalLod0: this.settings.physicalLod0, shadows: this.settings.shadows });
    this.catalog = new ItemCatalog({
      variant: (sp, c, sc) => this.store.variant(sp, c, sc),
      cocoons: (sp) => speciesMorphs(sp).morphs.cocoons,
      buMm: (sp) => this.reader?.speciesInfo(sp).buMm ?? 4,
    });
    this.loose = new LooseItemRenderer(this.group, this.shared, (k) => this.catalog.get(k), this.settings.shadows);
  }

  setSim(sim: AntSimSource | null): void {
    this.reader = sim ? new SimReader(sim) : null;
  }

  setQuality(q: QualityPreset): void {
    this.applyQuality(q);
    this.store.setOptions({ physicalLod0: this.settings.physicalLod0, shadows: this.settings.shadows });
    this.loose.shadows = this.settings.shadows;
  }

  /** Overrides LOD thresholds / caps (debug, benchmarks). */
  setLod(o: Partial<AntLodSettings>): AntLodSettings { Object.assign(this.settings, o); return this.settings; }
  get lodSettings(): Readonly<AntLodSettings> { return this.settings; }

  /**
   * The highlight rim is emissive and would scale with the scene exposure (night and the underground look add 2-3
   * EV, which turned the possessed ant pale): pass the current exposure (EV) to keep it the same on screen.
   */
  setHighlightExposure(ev: number): void {
    const e = Number.isFinite(ev) ? ev : 0;
    if (e === this.highlightEV) return; // called every frame; the colours change only with the exposure
    this.highlightEV = e;
    const k = Math.pow(2, -e);
    this.shared.uHiWarm.value.copy(HI_WARM_BASE).multiplyScalar(k);
    this.shared.uHiCool.value.copy(HI_COOL_BASE).multiplyScalar(k);
    this.updateFill();
  }

  /** Underground blend of the form light (eased in update()) and the dim-scene blend that follows the exposure. */
  private fillUnder = 0;

  /**
   * Form light uniforms (tuning.ts ANT_FILL) from the exposure and the underground blend: the underground amplitudes
   * and the warm colour follow `fillUnder`, the night amplitudes the exposure above the daylight range; both are
   * scaled by 2^-EV like the highlight rim, so the ant's brightness on screen does not depend on the metering.
   */
  private updateFill(): void {
    const F = ANT_FILL, u = this.fillUnder;
    const t = Math.min(1, Math.max(0, (this.highlightEV - F.fromEV) / (F.toEV - F.fromEV)));
    const night = (1 - u) * t * t * (3 - 2 * t);
    const k = Math.pow(2, -this.highlightEV);
    this.shared.uFillBody.value = k * (F.body.underground * u + F.body.night * night);
    this.shared.uFillRim.value = k * (F.rim.underground * u + F.rim.night * night);
    const w = u + night > 0 ? u / (u + night) : 0;
    this.shared.uFillCol.value.setRGB(
      F.cool[0] + (F.warm[0] - F.cool[0]) * w, F.cool[1] + (F.warm[1] - F.cool[1]) * w, F.cool[2] + (F.warm[2] - F.cool[2]) * w,
    );
  }

  setHover(t: PickTarget | null): void { this.hover = t; }
  setInspect(t: PickTarget | null): void { this.inspect = t; }

  /** Builds the variants of a species ahead of use (avoids a hitch on first sight). */
  prebuild(species: string, castes: { caste: string; sizeClass?: string | null }[]): void {
    for (const c of castes) this.store.index(species, c.caste, c.sizeClass ?? null);
  }

  private applyQuality(q: QualityPreset): void {
    this.settings = lodSettingsFor(q.id, q.density.crowdLod, q.shadows.enabled);
  }

  /** Set per frame from AntFrameInfo.hidePossessedHighlight (photo mode). */
  private hidePossessedRim = false;

  private highlightOf(kind: PickTarget['kind'], id: number, possessed: boolean): number {
    if (possessed && kind === 'ant' && !this.hidePossessedRim) return HIGHLIGHT.possessed;
    if (this.hover && this.hover.kind === kind && this.hover.id === id) return -HIGHLIGHT.hovered;
    if (this.inspect && this.inspect.kind === kind && this.inspect.id === id) return -HIGHLIGHT.inspected;
    return 0;
  }

  update(frame: AntFrameInfo): void {
    const t0 = performance.now();
    if (frame.sim !== undefined && (frame.sim === null ? this.reader !== null : this.reader?.sim !== frame.sim)) this.setSim(frame.sim);
    const reader = this.reader;
    if (frame.hover !== undefined) this.hover = frame.hover;
    if (frame.inspect !== undefined) this.inspect = frame.inspect;
    this.hidePossessedRim = frame.hidePossessedHighlight === true;
    const camera: PerspectiveCamera = frame.camera ?? this.ctx.camera;
    this.store.resetAll();
    this.stamp++;
    this.shared.uTime.value = frame.time;
    const op = frame.subjectOpacity;
    this.shared.uSubjectOpacity.value = op !== undefined && Number.isFinite(op) ? Math.min(1, Math.max(0, op)) : 1;
    const underGoal = frame.underground ? 1 : 0, ke = frame.dt > 0 ? 1 - Math.exp(-frame.dt / ANT_FILL.easeS) : 1;
    const under = this.fillUnder + (underGoal - this.fillUnder) * ke;
    this.fillUnder = under;
    this.updateFill(); // a few multiplications: every frame, so a retuned ANT_FILL (the look lab) shows at once
    if (!reader) { this.store.commitAll(); this.loose.update([], camera, 1, 1, 0); return; }
    reader.beginFrame();
    camera.updateMatrixWorld();
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.pm);
    const viewportH = frame.viewportHeightPx ?? this.ctx.renderer?.domElement.height ?? 720;
    const pxPerMm = viewportH / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const camPos = camera.position;
    const dt = Math.max(0, frame.dt);
    this.collectCarried(reader);
    smoothFactors(dt, this.kSmooth);

    // ---- pass 1: sample, step render state, cull, stage
    const ants = reader.ants;
    this.ensureCap(ants.length);
    let n = 0, culled = 0;
    const smp = this.sample;
    const predicted = frame.possessedPose ?? null, possessedId = reader.possessedId;
    this.shared.uCapR.value = 0; // set below when the possessed ant is drawn
    for (const a of ants) {
      if (!reader.isLive(a)) continue;
      reader.readAnt(a, frame.alpha, smp, predicted && a.id === possessedId ? predicted : null);
      const st = this.states.get(smp.id, this.stamp);
      if (st.vi < 0 || st.vSpecies !== smp.species || st.vCaste !== smp.caste || st.vSize !== smp.sizeClass || st.vWinged !== smp.winged) {
        // a new body (caste change, dealation) has its own rig: start its gait and pose afresh
        if (st.vi >= 0) st.fresh = true;
        st.vi = this.store.index(smp.species, smp.caste, smp.sizeClass, smp.winged);
        st.vSpecies = smp.species; st.vCaste = smp.caste; st.vSize = smp.sizeClass; st.vWinged = smp.winged;
      }
      const vi = st.vi;
      const v = this.store.entries[vi]!.variant;
      const scale = smp.lengthMm / v.morph.bodyLength;
      // cull first (generous sphere incl. a carried item); off-screen ants only keep their position current
      const L = smp.lengthMm;
      this.sph.center.set(smp.pos.x + smp.up.x * L * 0.1, smp.pos.y + smp.up.y * L * 0.1, smp.pos.z + smp.up.z * L * 0.1);
      this.sph.radius = L * (v.wings ? 1.3 : 0.9) + (smp.carryKind !== 'none' ? L : 0);
      if (!smp.possessed && !this.frustum.intersectsSphere(this.sph)) { trackOffscreen(st, smp); culled++; continue; }
      // GDD 01 6.5 rule 2: the capsule from the camera to the possessed ant's thorax. Not while photo mode hides the
      // possession rim: the shader tells the possessed ant apart by its rim, so without it she was dithered inside
      // her own capsule (gate-close-app, e2e/photo/02-f1.4-focus-subject.png: a dotted queen)
      if (smp.possessed && !this.hidePossessedRim) {
        this.shared.uCapA.value.copy(camPos);
        this.shared.uCapB.value.copy(this.sph.center);
        this.shared.uCapR.value = CAMERA_CAPSULE.radiusL * L;
      }
      // carried thing and its carry pose
      let ck: string | null = null, cs = 0;
      if (smp.carryKind === 'brood') {
        const b = this.carriedBrood.get(smp.carryId);
        if (b) { const r = this.catalog.brood(b, b.species, true, this.ref); ck = r.key; cs = r.sizeMm; }
      } else if (smp.carryKind === 'item') {
        const it = this.carriedItems.get(smp.carryId);
        if (it) { const r = this.catalog.item(it, it.species ?? smp.species, this.ref); ck = r.key; cs = r.sizeMm; }
      }
      const target = this.pose;
      if (ck) { const c = this.catalog.get(ck).carry; withCarry(poseTarget(smp.poseId), c.raise, c.gape, target); }
      else copyPose(poseTarget(smp.poseId), target);
      withAlarm(target, smp.alarm);
      stepAntState(st, smp, target, v.rig, scale, dt, this.kSmooth);
      const d = Math.max(1e-3, camPos.distanceTo(this.sph.center));
      this.dist[n] = d; this.px[n] = (L / d) * pxPerMm; this.forced[n] = smp.possessed ? 1 : 0;
      this.vIdx[n] = vi; this.stagedId[n] = smp.id; this.carryKey[n] = ck; this.carrySize[n] = cs; this.winged[n] = smp.winged ? 1 : 0;
      this.stageAnt(n, st, scale, L);
      n++;
    }
    this.states.sweep(this.stamp);
    this.stagedCount = n;

    // ---- pass 2: LOD + caps, then write batches
    const t1 = performance.now();
    const s = this.settings;
    selectLods(n, this.dist, this.px, this.forced, s, this.lod, this.order, this.sel);
    let wings = 0, carried = 0;
    for (let i = 0; i < n; i++) {
      let lod = this.lod[i]!;
      if (lod < 0) continue;
      if (this.forceLod !== null && !this.forced[i]) lod = this.forceLod;
      const e = this.store.entries[this.vIdx[i]!]!;
      const b = e.lods[lod]!;
      const j = this.writeStaged(b, i);
      if (this.debugLodTint) { const t = DEBUG_LOD_TINT[lod]!; b.a.aTint[j * 4] *= t[0]; b.a.aTint[j * 4 + 1] *= t[1]; b.a.aTint[j * 4 + 2] *= t[2]; }
      if (lod < 2 && e.wings && this.winged[i]) { e.wings.copyFrom(b, j); wings++; }
      const ck = this.carryKey[i];
      if (ck && lod < 2) {
        const def = this.catalog.get(ck);
        const ib = this.store.itemBatch(e, def, lod === 0);
        const k = ib.copyFrom(b, j);
        ib.a.aExtra[k * 4] = this.carrySize[i]! / def.nominalMm;
        carried++;
      }
    }
    this.store.commitAll();
    const t2 = performance.now();

    // ---- loose brood and items
    this.loose.update(this.looseList, camera, viewportH, s.itemMinPx, s.maxItems);

    let calls = 0, tris = 0;
    for (const e of this.store.entries) {
      for (const b of e.lods) if (b.n > 0) { calls++; tris += b.n * b.tris; }
      if (e.wings && e.wings.n > 0) { calls++; tris += e.wings.n * e.wings.tris; }
      for (const b of e.items.values()) if (b.n > 0) { calls++; tris += b.n * b.tris; }
    }
    const st = this.stats;
    st.ants = n + culled; for (let k = 0; k < 4; k++) st.visible[k] = this.sel.counts[k]!;
    st.culled = culled; st.dropped = this.sel.dropped; st.wings = wings; st.carried = carried;
    st.looseItems = this.loose.drawn; st.drawCalls = calls + this.loose.drawCalls; st.triangles = tris + this.loose.triangles;
    st.cpuMs = performance.now() - t0; st.sampleMs = t1 - t0; st.uploadMs = t2 - t1;
    st.variants = this.store.entries.length; st.buildMs = this.store.buildMs;
  }

  /** Splits brood/items into carried (attached to the carrier's head) and loose (drawn where they lie). */
  private collectCarried(reader: SimReader): void {
    this.carriedBrood.clear(); this.carriedItems.clear();
    this.broodPool.reset(); this.itemPool.reset();
    for (const l of this.looseList) this.loosePool.push(l);
    this.looseList.length = 0;
    const r = this.ref;
    for (const view of reader.brood) {
      if (!reader.isLive(view)) continue;
      const b = reader.readBrood(view, this.broodPool.take());
      if (b.carried) { this.carriedBrood.set(b.id, b); continue; }
      this.catalog.brood(b, b.species, false, r);
      this.pushLoose(r.key, b.pos.x, b.pos.y, b.pos.z, r.sizeMm, b.id, this.highlightOf('brood', b.id, false), true);
    }
    for (const view of reader.items) {
      if (!reader.isLive(view)) continue;
      const it = reader.readItem(view, this.itemPool.take());
      if (it.carried) { this.carriedItems.set(it.id, it); continue; }
      this.catalog.item(it, it.species ?? 'lasius-niger', r);
      this.pushLoose(r.key, it.pos.x, it.pos.y, it.pos.z, r.sizeMm, it.id, this.highlightOf('item', it.id, false), it.piles);
    }
  }

  private pushLoose(key: string, x: number, y: number, z: number, sizeMm: number, id: number, hi: number, pile: boolean): void {
    const o = this.loosePool.pop() ?? { key, x, y, z, sizeMm, id, highlight: hi, pile };
    o.key = key; o.x = x; o.y = y; o.z = z; o.sizeMm = sizeMm; o.id = id; o.highlight = hi; o.pile = pile;
    this.looseList.push(o);
  }

  private ensureCap(n: number): void {
    if (n <= this.cap) return;
    const c = Math.max(64, 1 << Math.ceil(Math.log2(n)));
    this.cap = c;
    this.stage = new Float32Array(c * STRIDE);
    this.dist = new Float32Array(c); this.px = new Float32Array(c); this.forced = new Uint8Array(c);
    this.lod = new Int8Array(c); this.order = new Int32Array(c); this.vIdx = new Int32Array(c); this.stagedId = new Int32Array(c);
    this.carrySize = new Float32Array(c); this.carryKey = new Array<string | null>(c).fill(null); this.winged = new Uint8Array(c);
  }

  /** Writes ant n's instance data (matrix + 5 vec4) into the staging buffer. */
  private stageAnt(n: number, st: ReturnType<AntStateTable['get']>, scale: number, L: number): void {
    const smp = this.sample; const o = n * STRIDE; const S = this.stage;
    const u = st.up, f = st.fwd;
    // body frame: X = left = up x fwd, Y = up, Z = fwd
    const lx = u.y * f.z - u.z * f.y, ly = u.z * f.x - u.x * f.z, lz = u.x * f.y - u.y * f.x;
    S[o] = lx * scale; S[o + 1] = ly * scale; S[o + 2] = lz * scale; S[o + 3] = 0;
    S[o + 4] = u.x * scale; S[o + 5] = u.y * scale; S[o + 6] = u.z * scale; S[o + 7] = 0;
    S[o + 8] = f.x * scale; S[o + 9] = f.y * scale; S[o + 10] = f.z * scale; S[o + 11] = 0;
    S[o + 12] = smp.pos.x; S[o + 13] = smp.pos.y; S[o + 14] = smp.pos.z; S[o + 15] = 1;
    const p = st.pose;
    const moving = smp.speed / (GAIT.cruiseBodyLengthsPerS * L);
    const idle = moving < 0.03 && smp.poseId === 'walk' ? 1 : 0;
    const g = st.gait;
    S[o + 16] = g.phase; S[o + 17] = moving; S[o + 18] = g.yawPerCycle; S[o + 19] = st.seed;
    S[o + 20] = p.raise; S[o + 21] = p.gaster; S[o + 22] = smp.crop; S[o + 23] = p.gape;
    S[o + 24] = st.tint[0]; S[o + 25] = st.tint[1]; S[o + 26] = st.tint[2]; S[o + 27] = idle;
    S[o + 28] = g.share; S[o + 29] = p.pitch; S[o + 30] = p.groom; S[o + 31] = p.chew;
    S[o + 32] = Math.max(p.spread, smp.airborne ? 0.8 : 0); S[o + 33] = this.highlightOf('ant', smp.id, smp.possessed); S[o + 34] = smp.callow; S[o + 35] = p.antenna;
    const pl = g.feet;
    S[o + 36] = pl[0]!; S[o + 37] = pl[1]!; S[o + 38] = pl[2]!; S[o + 39] = g.dir;
    S[o + 40] = pl[3]!; S[o + 41] = pl[4]!; S[o + 42] = pl[5]!; S[o + 43] = 0;
  }

  /** Copies staged ant i into the next slot of batch b (plain loops: no typed-array views per ant). */
  private writeStaged(b: InstanceBatch, i: number): number {
    const j = b.next(); const S = this.stage; let o = i * STRIDE;
    const m = b.m; const mj = j * 16;
    for (let k = 0; k < 16; k++) m[mj + k] = S[o + k]!;
    o += 16;
    const a = b.a; const aj = j * 4;
    copy4(a.aGait, aj, S, o); copy4(a.aPose, aj, S, o + 4); copy4(a.aTint, aj, S, o + 8); copy4(a.aAct, aj, S, o + 12);
    copy4(a.aExtra, aj, S, o + 16); copy4(a.aFootA, aj, S, o + 20); copy4(a.aFootB, aj, S, o + 24);
    return j;
  }

  /**
   * Debug / verification: world positions of the six feet (tarsus tips, before IK) of a drawn ant, from the same
   * phase and matrix the shader received this frame. Used by the demo's foot-sliding measurement.
   */
  debugFeet(id: number): { x: number; y: number; z: number; stance: boolean }[] | null {
    const st = this.states.peek(id);
    if (!st) return null;
    let i = -1;
    for (let k = 0; k < this.stagedCount; k++) if (this.stagedId[k] === id) { i = k; break; }
    if (i < 0) return null;
    const rig = this.store.entries[this.vIdx[i]!]!.variant.rig; const S = this.stage; const o = i * STRIDE;
    const out: { x: number; y: number; z: number; stance: boolean }[] = [];
    const ft = { x: 0, y: 0, z: 0, stance: false };
    const v = Math.min(1.5, Math.max(0, S[o + 17]!)); const u = Math.min(1, Math.max(0, (v - 0.02) / 0.23));
    const moving = u * u * (3 - 2 * u); // the shader's smoothstep(0.02, 0.25, aGait.y)
    for (let leg = 0; leg < 6; leg++) {
      footTarget(rig, leg, st.gait, moving, ft);
      out.push({
        x: S[o]! * ft.x + S[o + 4]! * ft.y + S[o + 8]! * ft.z + S[o + 12]!,
        y: S[o + 1]! * ft.x + S[o + 5]! * ft.y + S[o + 9]! * ft.z + S[o + 13]!,
        z: S[o + 2]! * ft.x + S[o + 6]! * ft.y + S[o + 10]! * ft.z + S[o + 14]!,
        stance: ft.stance,
      });
    }
    return out;
  }

  dispose(): void {
    this.store?.dispose();
    this.loose?.dispose();
    this.group.removeFromParent();
    this.reader = null;
  }
}

function copy4(dst: Float32Array, d: number, src: Float32Array, s: number): void {
  dst[d] = src[s]!; dst[d + 1] = src[s + 1]!; dst[d + 2] = src[s + 2]!; dst[d + 3] = src[s + 3]!;
}

/** Reusable sample objects (no allocation per brood/item per frame once warmed up). */
class SamplePool<T> {
  private items: T[] = [];
  private used = 0;
  constructor(private readonly make: () => T) {}
  reset(): void { this.used = 0; }
  take(): T {
    if (this.used === this.items.length) this.items.push(this.make());
    return this.items[this.used++]!;
  }
}
