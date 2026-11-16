// Pooled particles (no three): structure-of-arrays state, a fixed capacity, swap-remove on death so the live
// particles are always [0, count) and the GPU arrays (position, colour + alpha, size) can be drawn as they are.
// Integration: velocity with gravity and linear drag; grains settle on a floor height chosen at spawn.

/** Small seeded generator for render-only randomness (deterministic screenshots, never the sim's RNG). */
export class RenderRng {
  private s: number;
  constructor(seed = 0x9e3779b9) { this.s = seed >>> 0 || 1; }
  next(): number {
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
}

export interface SpawnSpec {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  size: number;
  /** Size multiplier at the end of life. */
  grow: number;
  /** Linear colour. */
  r: number; g: number; b: number;
  alpha: number;
  /** Gravity, mm/s² (negative = rises). */
  gravity: number;
  /** Drag per second. */
  drag: number;
  /** Floor height (settles there), -Infinity = none. */
  floor: number;
}

export class ParticlePool {
  readonly position: Float32Array;
  readonly color: Float32Array;
  readonly size: Float32Array;
  count = 0;
  /** Spawns refused because the pool was full. */
  refused = 0;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size0: Float32Array;
  private readonly grow: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly floor: Float32Array;

  constructor(readonly capacity: number) {
    this.position = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.alpha0 = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.floor = new Float32Array(capacity);
  }

  spawn(p: SpawnSpec): boolean {
    if (this.count >= this.capacity) { this.refused++; return false; }
    const i = this.count++;
    const i3 = i * 3, i4 = i * 4;
    this.position[i3] = p.x; this.position[i3 + 1] = p.y; this.position[i3 + 2] = p.z;
    this.vel[i3] = p.vx; this.vel[i3 + 1] = p.vy; this.vel[i3 + 2] = p.vz;
    this.color[i4] = p.r; this.color[i4 + 1] = p.g; this.color[i4 + 2] = p.b; this.color[i4 + 3] = p.alpha;
    this.age[i] = 0;
    this.life[i] = Math.max(1e-3, p.life);
    this.size0[i] = p.size;
    this.size[i] = p.size;
    this.grow[i] = p.grow;
    this.alpha0[i] = p.alpha;
    this.grav[i] = p.gravity;
    this.drag[i] = p.drag;
    this.floor[i] = p.floor;
    return true;
  }

  /** Advances every particle by dt seconds and removes the dead. */
  step(dt: number): void {
    if (!(dt > 0)) return;
    for (let i = 0; i < this.count; i++) {
      const a = this.age[i] + dt;
      if (a >= this.life[i]) { this.kill(i); i--; continue; }
      this.age[i] = a;
      const i3 = i * 3;
      const k = Math.exp(-this.drag[i] * dt);
      let vx = this.vel[i3] * k, vy = this.vel[i3 + 1] * k - this.grav[i] * dt, vz = this.vel[i3 + 2] * k;
      let x = this.position[i3] + vx * dt, y = this.position[i3 + 1] + vy * dt, z = this.position[i3 + 2] + vz * dt;
      if (y < this.floor[i]) {
        y = this.floor[i];
        vx = 0; vy = 0; vz = 0;
        x = this.position[i3]; z = this.position[i3 + 2];
      }
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.position[i3] = x; this.position[i3 + 1] = y; this.position[i3 + 2] = z;
      const t = a / this.life[i];
      this.size[i] = this.size0[i] * (1 + (this.grow[i] - 1) * t);
      // fade in over the first 10 % and out over the last 40 % of life
      const fade = Math.min(1, t / 0.1) * Math.min(1, (1 - t) / 0.4);
      this.color[i * 4 + 3] = this.alpha0[i] * fade;
    }
  }

  clear(): void { this.count = 0; }

  private kill(i: number): void {
    const j = --this.count;
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3, i4 = i * 4, j4 = j * 4;
    for (let c = 0; c < 3; c++) {
      this.position[i3 + c] = this.position[j3 + c];
      this.vel[i3 + c] = this.vel[j3 + c];
    }
    for (let c = 0; c < 4; c++) this.color[i4 + c] = this.color[j4 + c];
    this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.size0[i] = this.size0[j]; this.size[i] = this.size[j];
    this.grow[i] = this.grow[j]; this.alpha0[i] = this.alpha0[j]; this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j];
    this.floor[i] = this.floor[j];
  }
}
