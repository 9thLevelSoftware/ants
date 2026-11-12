// Banded gaster with hidden intersegmental membranes (the shader spreads the plates for a full crop), setae, and the
// rear weapon: formicine acidopore with its coronula of hairs, or a short myrmicine sting.
import { type Ring, type V3, add, norm, scl, sub } from './meshBuilder';
import { ringPoint, smooth } from './curves';
import type { Assembly } from './context';
import { PART } from './rig';

export interface GasterInfo { gC: V3; G0: V3; axis: V3; GL: number; GH: number; gb: number; nb: number; tip: V3 }

export function buildGaster(A: Assembly, gasterFrontZ: number): GasterInfo {
  const { p, lod, BL, body, col, yb, MH } = A;
  const GW = p.gaster.width * BL, GH = p.gaster.height * BL, GL = p.gaster.length * BL;
  const full = p.gaster.fullness;
  const gPitch = 0.1;
  const axis: V3 = [0, -Math.sin(gPitch), -Math.cos(gPitch)];
  const gCy = Math.max(GH / 2 + 0.03 * BL, yb + 0.35 * MH);
  const gC: V3 = [0, gCy, gasterFrontZ - GL / 2];
  const G0 = sub(gC, scl(axis, GL / 2));
  const nb = p.gaster.segments;
  const bw = [1.25, 1.1, 0.95, 0.8, 0.6, 0.45].slice(0, nb); const bsum = bw.reduce((a, b) => a + b, 0);
  const R = (t: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 2.3)), 1 / 2.3);
  const ga = GW / 2 * (1 + full * 0.15), gb = GH / 2 * (1 + full * 0.12);
  const ringAt = (t: number, rs: number, band: number, mem: number): Ring => ({
    c: add(G0, scl(axis, t * GL)), t: axis, a: Math.max(ga * R(t) * rs, 1e-4), b: Math.max(gb * R(t) * rs, 1e-4), e: 2.15, lower: 0.88,
    color: col.gaster, rig: [PART.GASTER, 0, band, mem],
  });
  const rings: Ring[] = [{ c: G0, t: axis, a: 0, b: 0, color: col.gaster, rig: [PART.GASTER, 0, 0, 0] }];
  const t1 = 0.985;
  let tc = 0; const bands: { a: number; b: number }[] = [];
  for (let i = 0; i < nb; i++) { const w = (bw[i]! / bsum) * t1; bands.push({ a: tc, b: tc + w }); tc += w; }
  bands.forEach((bd, i) => {
    const rp = lod.ringsPerBand;
    if (rp < 0) {
      if (i === 0) rings.push(ringAt(0.12, 0.92, 0, 0));
      if (i === Math.floor(nb / 2) || i === nb - 1) rings.push(ringAt(i === nb - 1 ? 0.85 : 0.45, 1.0, i, 0));
      return;
    }
    if (rp === 0) { rings.push(ringAt(Math.max(bd.a + 0.02, 0.03), 0.97, i, 0), ringAt(bd.b, 1.0, i, 0)); return; }
    const first = i === 0 ? 0.02 : bd.a + 0.009;
    for (let r = 0; r <= rp; r++) {
      const t = first + (bd.b - first) * (r / rp);
      const lip = r === rp ? 1.012 : 0.975 + 0.03 * smooth(r / rp + 0.2);
      rings.push(ringAt(t, i === 0 && r === 0 ? 0.92 : lip, i, 0));
    }
    if (i < nb - 1) {
      rings.push(ringAt(bd.b + 0.003, 0.955, i + 0.3, 1));
      if (rp > 1) rings.push(ringAt(bd.b + 0.006, 0.955, i + 0.7, 1));
    }
  });
  rings.push({ c: add(G0, scl(axis, GL * 0.995)), t: axis, a: 0, b: 0, color: col.gaster, rig: [PART.GASTER, 0, nb - 1, 0] });
  body.loft(rings, lod.gasRad, [-1, 0, 0]);

  const tip = add(G0, scl(axis, GL * 0.975));
  if (lod.level === 0) buildRearWeapon(A, tip, axis, nb);
  if (lod.hairs) {
    const nh = Math.round(p.hairs * 0.4 * p.gasterHairs);
    for (let h = 0; h < nh; h++) {
      const bi = Math.floor(A.rnd() * nb); const bd = bands[bi]!; const t = bd.a + (bd.b - bd.a) * (0.55 + 0.4 * A.rnd());
      const rg = ringAt(t, 1.0, bi, 0); const th = Math.PI / 2 + (A.rnd() - 0.5) * 2.6;
      const sp = ringPoint(rg, th, [-1, 0, 0]);
      body.color = col.hair; body.rigV = [PART.GASTER, 0, bi, 0];
      // dense pale pubescence (Camponotus) lies flatter along the gaster than sparse erect setae
      const lie = p.gasterHairs > 1.5 ? 1.6 : 0.55;
      body.hair(sp.p, add(sp.n, scl(axis, lie)), A.hairLen * (0.7 + 0.6 * A.rnd()), A.hairR, sp.n);
    }
  }
  return { gC, G0, axis, GL, GH, gb, nb, tip };
}

function buildRearWeapon(A: Assembly, tip: V3, axis: V3, nb: number): void {
  const { p, lod, BL, body, col } = A;
  body.color = col.gaster; body.rigV = [PART.GASTER, 0, nb - 1, 0];
  if (p.rearWeapon === 'acidopore') {
    body.tubePath([sub(tip, scl(axis, 0.01 * BL)), add(tip, scl(axis, 0.02 * BL)), add(add(tip, scl(axis, 0.032 * BL)), [0, -0.004 * BL, 0])], [0.03 * BL, 0.018 * BL, 0.008 * BL], 6, false, true);
    if (lod.hairs) {
      for (let h = 0; h < 8; h++) {
        const th = (h / 8) * Math.PI * 2; const n: V3 = norm([Math.cos(th), Math.sin(th) * 0.8, 0]);
        body.color = col.hair;
        body.hair(add(add(tip, scl(axis, 0.026 * BL)), scl(n, 0.012 * BL)), add(axis, scl(n, 0.6)), A.hairLen * 0.6, A.hairR * 0.7, n);
      }
    }
  } else {
    // sting: mostly retracted, only the dark tapering shaft shows at the tip
    body.color = col.teeth;
    body.tubePath([sub(tip, scl(axis, 0.005 * BL)), add(tip, scl(axis, 0.025 * BL)), add(add(tip, scl(axis, 0.045 * BL)), [0, -0.006 * BL, 0])], [0.012 * BL, 0.007 * BL, 0.0012 * BL], 5, false, true);
  }
}
