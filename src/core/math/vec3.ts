// 3D vectors as plain `{x, y, z}` objects (millimetres when used as world positions, Y up).
//
// Every operation writes into an `out` parameter (first argument) and returns it, so hot code never allocates.
// `out` may alias any input. The only allocating functions are the constructor `vec3` and the factories
// `v3Zero`, `v3UnitX/Y/Z`, `v3Clone`: there are deliberately no shared mutable constant vectors.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Lengths whose square is below this are treated as zero by v3Normalize (length < 1e-150). */
const NORMALIZE_MIN_LENGTH_SQ = 1e-300;

// --- allocating constructors / factories ---

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}
export function v3Zero(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}
export function v3UnitX(): Vec3 {
  return { x: 1, y: 0, z: 0 };
}
/** World up (+Y). */
export function v3UnitY(): Vec3 {
  return { x: 0, y: 1, z: 0 };
}
export function v3UnitZ(): Vec3 {
  return { x: 0, y: 0, z: 1 };
}
export function v3Clone(a: Vec3): Vec3 {
  return { x: a.x, y: a.y, z: a.z };
}

// --- out-param operations ---

export function v3Set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function v3Copy(out: Vec3, a: Vec3): Vec3 {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
}

export function v3Add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  return out;
}

export function v3Sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
}

export function v3Scale(out: Vec3, a: Vec3, s: number): Vec3 {
  out.x = a.x * s;
  out.y = a.y * s;
  out.z = a.z * s;
  return out;
}

/** out = a + b * s */
export function v3AddScaled(out: Vec3, a: Vec3, b: Vec3, s: number): Vec3 {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
  out.z = a.z + b.z * s;
  return out;
}

export function v3Negate(out: Vec3, a: Vec3): Vec3 {
  out.x = -a.x;
  out.y = -a.y;
  out.z = -a.z;
  return out;
}

export function v3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** out = a x b (right-handed). */
export function v3Cross(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function v3LengthSq(a: Vec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function v3Length(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function v3DistanceSq(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function v3Distance(a: Vec3, b: Vec3): number {
  return Math.sqrt(v3DistanceSq(a, b));
}

/**
 * Safe normalize: writes a / |a| into out and returns the ORIGINAL length.
 * A (near-)zero vector (length < 1e-150) is copied to out untouched and 0 is returned, so callers test the result.
 */
export function v3Normalize(out: Vec3, a: Vec3): number {
  const lenSq = a.x * a.x + a.y * a.y + a.z * a.z;
  if (!(lenSq > NORMALIZE_MIN_LENGTH_SQ)) {
    v3Copy(out, a);
    return 0;
  }
  const len = Math.sqrt(lenSq);
  const inv = 1 / len;
  out.x = a.x * inv;
  out.y = a.y * inv;
  out.z = a.z * inv;
  return len;
}

export function v3Lerp(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}

/** Removes the component of v along the UNIT normal n: out = v - n (v.n). */
export function v3ProjectOnPlane(out: Vec3, v: Vec3, n: Vec3): Vec3 {
  return v3AddScaled(out, v, n, -v3Dot(v, n));
}

/** Projection of v onto direction d (d need not be unit). Zero d gives zero. */
export function v3Project(out: Vec3, v: Vec3, d: Vec3): Vec3 {
  const dd = v3LengthSq(d);
  if (dd === 0) return v3Set(out, 0, 0, 0);
  return v3Scale(out, d, v3Dot(v, d) / dd);
}

/** Rejection of v from direction d (d need not be unit): out = v - project(v, d). */
export function v3Reject(out: Vec3, v: Vec3, d: Vec3): Vec3 {
  const dd = v3LengthSq(d);
  const s = dd === 0 ? 0 : v3Dot(v, d) / dd;
  return v3AddScaled(out, v, d, -s);
}

export function v3Min(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x < b.x ? a.x : b.x;
  out.y = a.y < b.y ? a.y : b.y;
  out.z = a.z < b.z ? a.z : b.z;
  return out;
}

export function v3Max(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x > b.x ? a.x : b.x;
  out.y = a.y > b.y ? a.y : b.y;
  out.z = a.z > b.z ? a.z : b.z;
  return out;
}

/** Component-wise |a - b| <= eps. */
export function v3EqualsApprox(a: Vec3, b: Vec3, eps = 1e-6): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps;
}

export function v3IsFinite(a: Vec3): boolean {
  return Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);
}
