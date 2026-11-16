/**
 * Herds on their host plants (GDD 05 §1.4): each herd's spots are laid out once (herds.ts). The first min(A, cap)
 * are drawn as instances (aphids, or scale insects for a `scale` herd), the rest of the herd up to A as the density
 * layer (props/herdDecals.ts), so the visible herd grows and shrinks with the simulated one. Herd instances share
 * the creatures' near-detail cap (only near detail casts shadows).
 */
import { Group, Matrix4, Sphere, type Frustum } from 'three';
import { hash3 } from '@/render/ants/geometry/curves';
import type { Detail } from './geometry/builder';
import { herdIsBlack, herdSpots, isMummy, type AphidSpot } from './herds';
import type { LookStore } from './lookStore';
import { HerdDecals } from './props/herdDecals';
import type { HerdView, WorldLookup } from './simAdapter';
import { detailFor } from './detail';
import { APHID_COLOURS, HERD_DENSITY, type CreatureLodSettings } from './tuning';
import { CR_STRIDE } from './batch';

interface HerdEntry {
  hostId: number; segment: number; spots: AphidSpot[]; black: boolean; stamp: number;
  /** Bounding sphere of the first boundN spots. */
  cx: number; cy: number; cz: number; r: number; boundN: number;
}

export interface HerdStats {
  herds: number;
  /** Herd members drawn as instances (aphids or scale insects). */
  aphids: number;
  /** Herd members drawn in the density layer (beyond the instance cap). */
  decals: number; decalTris: number;
  /** Instances at near detail (they count toward the creatures' maxNear). */
  near: number;
}

const APHID_MM = 2;
const _m = new Matrix4();

export class HerdLayer {
  readonly group = new Group();
  private cache = new Map<number, HerdEntry>();
  private stamp = 0;
  private sph = new Sphere();
  private S = new Float32Array(CR_STRIDE);
  private decals = new HerdDecals(this.group);
  readonly stats: HerdStats = { herds: 0, aphids: 0, decals: 0, decalTris: 0, near: 0 };

  constructor() { this.group.name = 'creatures:herds'; }

  /** `nearBudget` = how many more instances may use near detail this frame (the creatures' cap minus their own). */
  update(herds: readonly HerdView[], lookup: WorldLookup, store: LookStore, frustum: Frustum, cam: { x: number; y: number; z: number },
    pxPerMm: number, lod: CreatureLodSettings, nearBudget: number): void {
    this.stamp++;
    this.decals.begin();
    let nh = 0, na = 0, near = 0;
    for (const h of herds) {
      if (!h.alive || h.a < 0.5) continue;
      let e = this.cache.get(h.id);
      if (!e || e.hostId !== h.hostId || e.segment !== h.segment) {
        const site = lookup.herdSite(h);
        if (!site) continue;
        const spots = herdSpots(site.prims, site.site, HERD_DENSITY.maxSpots, h.id);
        if (spots.length === 0) continue;
        e = { hostId: h.hostId, segment: h.segment, spots, black: herdIsBlack(h.id), cx: 0, cy: 0, cz: 0, r: 0, boundN: -1, stamp: 0 };
        this.cache.set(h.id, e);
      }
      e.stamp = this.stamp;
      const total = Math.min(e.spots.length, Math.round(h.a));
      const inst = Math.min(total, lod.aphidsPerHerd);
      if (e.boundN !== total) bound(e, total);
      this.sph.center.set(e.cx, e.cy, e.cz); this.sph.radius = e.r + APHID_MM;
      if (!frustum.intersectsSphere(this.sph)) continue;
      const dist = Math.max(1e-3, Math.hypot(e.cx - cam.x, e.cy - cam.y, e.cz - cam.z) - e.r);
      const px = (APHID_MM / dist) * pxPerMm;
      if (px < lod.minPx) continue;
      const scale = h.kind === 'scale';
      const key = scale ? 'scale-insect' : 'aphid';
      // near detail only while the shared cap allows; the rest of the herd at mid (or its own) detail
      let d: Detail = detailFor(px, store.lod(key, 1).tris, lod, true);
      const nearHere = d === 0 ? Math.min(inst, Math.max(0, nearBudget - near)) : 0;
      if (d === 0) d = 1;
      const col = scale ? APHID_COLOURS.scale : h.kind === 'root' ? APHID_COLOURS.root : e.black ? APHID_COLOURS.black : APHID_COLOURS.green;
      const nearBatch = nearHere > 0 ? store.lod(key, 0).body : null, batch = store.lod(key, d).body;
      for (let i = 0; i < inst; i++) {
        this.stage(e.spots[i]!, h.id, i, !scale && isMummy(h.id, i) ? APHID_COLOURS.mummy : col);
        (i < nearHere ? nearBatch! : batch).push(this.S, 0);
      }
      for (let i = inst; i < total; i++) this.decal(e.spots[i]!, h.id, i, !scale && isMummy(h.id, i) ? APHID_COLOURS.mummy : col, scale);
      near += nearHere;
      nh++; na += inst;
    }
    for (const [id, e] of this.cache) if (e.stamp !== this.stamp) this.cache.delete(id);
    this.decals.commit();
    const st = this.stats;
    st.herds = nh; st.aphids = na; st.decals = this.decals.n; st.decalTris = this.decals.triangles; st.near = near;
  }

  /** Nothing drawn this frame (no source). */
  hide(): void { this.decals.begin(); this.decals.commit(); const st = this.stats; st.herds = st.aphids = st.decals = st.decalTris = st.near = 0; }

  private stage(s: AphidSpot, herdId: number, i: number, col: readonly number[]): void {
    const S = this.S, u = s.up, f = s.fwd;
    const k = sizeOf(herdId, i);
    const lx = u.y * f.z - u.z * f.y, ly = u.z * f.x - u.x * f.z, lz = u.x * f.y - u.y * f.x;
    S[0] = lx * k; S[1] = ly * k; S[2] = lz * k; S[3] = 0;
    S[4] = u.x * k; S[5] = u.y * k; S[6] = u.z * k; S[7] = 0;
    S[8] = f.x * k; S[9] = f.y * k; S[10] = f.z * k; S[11] = 0;
    S[12] = s.pos.x; S[13] = s.pos.y; S[14] = s.pos.z; S[15] = 1;
    const seed = hash3(herdId, i, 29);
    S[16] = seed; S[17] = 0; S[18] = 1; S[19] = seed;
    S[20] = 0; S[21] = 0; S[22] = 0; S[23] = 0;
    const v = 0.9 + 0.2 * hash3(herdId, i, 31);
    S[24] = col[0]! * v; S[25] = col[1]! * v; S[26] = col[2]! * v; S[27] = 0;
  }

  /** A density-layer spot: quad long side along the heading, lifted off the surface. */
  private decal(s: AphidSpot, herdId: number, i: number, col: readonly number[], scale: boolean): void {
    const u = s.up, f = s.fwd, k = sizeOf(herdId, i);
    const len = (scale ? 2.2 : APHID_MM) * HERD_DENSITY.spotLength * k, wid = len * HERD_DENSITY.spotAspect;
    const lx = u.y * f.z - u.z * f.y, ly = u.z * f.x - u.x * f.z, lz = u.x * f.y - u.y * f.x;
    const o = HERD_DENSITY.liftMm;
    // plane: local X (long side) -> heading, Y -> up, Z -> left
    _m.set(f.x * len, u.x, lx * wid, s.pos.x + u.x * o, f.y * len, u.y, ly * wid, s.pos.y + u.y * o, f.z * len, u.z, lz * wid, s.pos.z + u.z * o, 0, 0, 0, 1);
    const v = 0.9 + 0.2 * hash3(herdId, i, 31);
    this._c[0] = col[0]! * v; this._c[1] = col[1]! * v; this._c[2] = col[2]! * v;
    this.decals.add(_m, this._c);
  }
  private _c = [1, 1, 1];

  clear(): void { this.cache.clear(); }

  dispose(): void { this.decals.dispose(); this.group.removeFromParent(); }
}

/** Nymphs and adults: 0.55 .. 1.0 of the adult length. */
function sizeOf(herdId: number, i: number): number { return 0.55 + 0.45 * hash3(herdId, i, 23); }

/** Bounding sphere of the first `n` spots (the part of the herd drawn this frame). */
function bound(e: HerdEntry, n: number): void {
  n = Math.max(1, Math.min(n, e.spots.length));
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < n; i++) { const p = e.spots[i]!.pos; x += p.x; y += p.y; z += p.z; }
  e.cx = x / n; e.cy = y / n; e.cz = z / n;
  let r = 0;
  for (let i = 0; i < n; i++) { const p = e.spots[i]!.pos; r = Math.max(r, Math.hypot(p.x - e.cx, p.y - e.cy, p.z - e.cz)); }
  e.r = r; e.boundN = n;
}
