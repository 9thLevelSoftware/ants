// Turns one effect (a recipe, a point, a surface normal, an optional direction) into pooled particles. Pure: the
// floor height and the normal are supplied by the caller (from the world field), colours are converted here from
// sRGB hex to the linear working space.
import { RECIPES, type EffectKind, GRAVITY_BU_S2 } from './tuning';
import type { ParticlePool, RenderRng } from './ParticlePool';

export interface EffectSpec {
  kind: EffectKind;
  x: number; y: number; z: number;
  /** Surface normal at the point (unit). */
  nx: number; ny: number; nz: number;
  /** Main direction (unit) for directed effects (acid mist), or 0,0,0. */
  dx: number; dy: number; dz: number;
  /** 0..1, scales the particle count (at least one). */
  strength: number;
  /** sRGB hex overriding the recipe colour (grain of the dug material, food kind). */
  color: string | null;
  /** Floor height for settling grains, mm (-Infinity = none). */
  floor: number;
}

const linCache = new Map<string, [number, number, number]>();

/** sRGB hex -> linear rgb (cached). */
export function hexToLinear(hex: string): [number, number, number] {
  const hit = linCache.get(hex);
  if (hit) return hit;
  const v = parseInt(hex.replace('#', ''), 16);
  const f = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const out: [number, number, number] = [f((v >> 16) & 255), f((v >> 8) & 255), f(v & 255)];
  linCache.set(hex, out);
  return out;
}

const spec = {
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 1, grow: 1, r: 1, g: 1, b: 1, alpha: 1, gravity: 0, drag: 0, floor: -Infinity,
};

/** Spawns the particles of one effect; returns how many were spawned. */
export function emitEffect(pool: ParticlePool, rng: RenderRng, e: EffectSpec, bu: number): number {
  const r = RECIPES[e.kind];
  const n = Math.max(1, Math.round(rng.range(r.count[0], r.count[1] + 0.999) * Math.max(0.15, Math.min(1, e.strength))));
  const [cr, cg, cb] = hexToLinear(e.color ?? r.color);
  // tangent frame of the normal
  let tx = 1, ty = 0, tz = 0;
  if (Math.abs(e.nx) > 0.9) { tx = 0; tz = 1; }
  const dn = tx * e.nx + ty * e.ny + tz * e.nz;
  tx -= dn * e.nx; ty -= dn * e.ny; tz -= dn * e.nz;
  const tl = Math.hypot(tx, ty, tz) || 1;
  tx /= tl; ty /= tl; tz /= tl;
  const bx = e.ny * tz - e.nz * ty, by = e.nz * tx - e.nx * tz, bz = e.nx * ty - e.ny * tx;
  const directed = e.dx !== 0 || e.dy !== 0 || e.dz !== 0;
  let made = 0;
  for (let i = 0; i < n; i++) {
    const a = rng.next() * Math.PI * 2;
    const spread = directed ? 0.35 : 1;
    const ca = Math.cos(a) * spread, sa = Math.sin(a) * spread;
    const up = r.lift;
    let vx: number, vy: number, vz: number;
    if (directed) {
      // a cone around the direction, slightly lifted off the surface
      vx = e.dx + (tx * ca + bx * sa) * 0.6 + e.nx * up;
      vy = e.dy + (ty * ca + by * sa) * 0.6 + e.ny * up;
      vz = e.dz + (tz * ca + bz * sa) * 0.6 + e.nz * up;
    } else {
      const side = Math.sqrt(Math.max(0, 1 - up * up));
      vx = (tx * ca + bx * sa) * side + e.nx * up;
      vy = (ty * ca + by * sa) * side + e.ny * up;
      vz = (tz * ca + bz * sa) * side + e.nz * up;
    }
    const vl = Math.hypot(vx, vy, vz) || 1;
    const sp = rng.range(r.speed[0], r.speed[1]) * bu;
    spec.x = e.x + e.nx * 0.2 * bu; spec.y = e.y + e.ny * 0.2 * bu; spec.z = e.z + e.nz * 0.2 * bu;
    spec.vx = (vx / vl) * sp; spec.vy = (vy / vl) * sp; spec.vz = (vz / vl) * sp;
    spec.life = rng.range(r.life[0], r.life[1]);
    spec.size = rng.range(r.size[0], r.size[1]) * bu;
    spec.grow = r.grow;
    const shade = 0.85 + 0.3 * rng.next();
    spec.r = cr * shade; spec.g = cg * shade; spec.b = cb * shade;
    spec.alpha = r.alpha;
    spec.gravity = r.gravity * GRAVITY_BU_S2 * bu;
    spec.drag = r.drag;
    spec.floor = r.settles ? e.floor : -Infinity;
    if (pool.spawn(spec)) made++;
  }
  return made;
}
