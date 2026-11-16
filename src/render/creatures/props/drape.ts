/**
 * A disc mesh laid over the ground: a polar grid whose vertices are set to the ground height (+ a small lift) every
 * time it is placed, so a soft shadow follows uneven terrain. Vertex alpha falls off toward the rim.
 */
import { BufferAttribute, BufferGeometry } from 'three';

export class DrapedDisc {
  readonly geometry = new BufferGeometry();
  private readonly pos: Float32Array;
  private readonly rings: number;
  private readonly radial: number;

  constructor(rings = 8, radial = 24, private readonly falloff = (r: number) => 1 - r * r * (3 - 2 * r)) {
    this.rings = rings; this.radial = radial;
    const n = 1 + rings * radial;
    this.pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const r = i === 0 ? 0 : Math.ceil(i / radial) / rings;
      const a = this.falloff(r);
      col[i * 4] = 1; col[i * 4 + 1] = 1; col[i * 4 + 2] = 1; col[i * 4 + 3] = a;
    }
    const idx: number[] = [];
    for (let j = 0; j < radial; j++) idx.push(0, 1 + ((j + 1) % radial), 1 + j);
    for (let i = 0; i + 1 < rings; i++) for (let j = 0; j < radial; j++) {
      const a = 1 + i * radial + j, b = 1 + i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, b, c, b, d, c);
    }
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('color', new BufferAttribute(col, 4));
    this.geometry.setIndex(idx);
  }

  /** Places the disc: centre (x, z), half axes along (dirX, dirZ) and across, height function, lift (mm). */
  place(x: number, z: number, along: number, across: number, dirX: number, dirZ: number, height: (x: number, z: number) => number, lift: number): void {
    const P = this.pos;
    let k = 0;
    const put = (px: number, pz: number) => { P[k++] = px; P[k++] = height(px, pz) + lift; P[k++] = pz; };
    put(x, z);
    for (let i = 1; i <= this.rings; i++) {
      const r = i / this.rings;
      for (let j = 0; j < this.radial; j++) {
        const a = (j / this.radial) * Math.PI * 2, u = Math.cos(a) * along * r, v = Math.sin(a) * across * r;
        put(x + dirX * u - dirZ * v, z + dirZ * u + dirX * v);
      }
    }
    const at = this.geometry.getAttribute('position') as BufferAttribute;
    at.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  dispose(): void { this.geometry.dispose(); }
}
