// Nearest-site distance transform on a regular grid (two raster passes propagating the nearest site, then the
// exact Euclidean distance to that site): used to blend natural ground toward built levels and for "distance to"
// maps. Sites are the cells with site[i] = 1.

/** Returns the nearest site index per cell (-1 if there is no site) and fills `dist` (cell units). */
export function nearestSites(site: Uint8Array, nx: number, nz: number, dist: Float32Array): Int32Array {
  const n = nx * nz;
  const near = new Int32Array(n).fill(-1);
  const sx = new Int32Array(n), sz = new Int32Array(n);
  const best = new Float64Array(n).fill(Infinity);
  for (let c = 0; c < n; c++) if (site[c]) { near[c] = c; sx[c] = c % nx; sz[c] = (c / nx) | 0; best[c] = 0; }
  // relax cell c from neighbour j: adopt j's site if it is closer (ties: lower site index)
  const relax = (c: number, j: number, ci: number, ck: number) => {
    const s = near[j];
    if (s < 0) return;
    const dx = ci - sx[j], dz = ck - sz[j], d = dx * dx + dz * dz;
    if (d < best[c] || (d === best[c] && s < near[c])) { near[c] = s; sx[c] = sx[j]; sz[c] = sz[j]; best[c] = d; }
  };
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const c = k * nx + i;
    if (i > 0) relax(c, c - 1, i, k);
    if (k > 0) { relax(c, c - nx, i, k); if (i > 0) relax(c, c - nx - 1, i, k); if (i < nx - 1) relax(c, c - nx + 1, i, k); }
  }
  for (let k = nz - 1; k >= 0; k--) for (let i = nx - 1; i >= 0; i--) {
    const c = k * nx + i;
    if (i < nx - 1) relax(c, c + 1, i, k);
    if (k < nz - 1) { relax(c, c + nx, i, k); if (i < nx - 1) relax(c, c + nx + 1, i, k); if (i > 0) relax(c, c + nx - 1, i, k); }
  }
  for (let c = 0; c < n; c++) dist[c] = near[c] < 0 ? Infinity : Math.sqrt(best[c]);
  return near;
}

/** Separable box blur of radius r (cells) with edge clamping, in place. */
export function boxBlur(a: Float32Array, nx: number, nz: number, r: number): void {
  if (r < 1) return;
  const tmp = new Float32Array(a.length);
  const w = 2 * r + 1;
  for (let k = 0; k < nz; k++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += a[k * nx + Math.min(nx - 1, Math.max(0, i))];
    for (let i = 0; i < nx; i++) {
      tmp[k * nx + i] = s / w;
      s += a[k * nx + Math.min(nx - 1, i + r + 1)] - a[k * nx + Math.max(0, i - r)];
    }
  }
  for (let i = 0; i < nx; i++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.min(nz - 1, Math.max(0, k)) * nx + i];
    for (let k = 0; k < nz; k++) {
      a[k * nx + i] = s / w;
      s += tmp[Math.min(nz - 1, k + r + 1) * nx + i] - tmp[Math.max(0, k - r) * nx + i];
    }
  }
}
