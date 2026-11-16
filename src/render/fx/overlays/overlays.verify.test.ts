// Reviewer tests (scent-fx review): the threats overlay against the sim's own definitions. A FAILING test here
// demonstrates a defect that stays for the fixer (see the review report).
import { describe, expect, it } from 'vitest';
import { claimAt } from '@/sim/rivals/claims';
import { TERR_CLAIM_MIN } from '@/sim/balance/combat';
import { fxScenario } from '../../../../spikes/fx-demo/scenario';
import { FieldRaster, isothermSpots, regionFor } from './raster';
import { countdownText, decodeTemp, encodeTemp, threatSampler, threatZones } from './samplers';

/** A territory grid over the test world with the player in slot 0 and a rival colony id 99 in slot 1. */
function withTerritory() {
  const sc = fxScenario(1, 4);
  const sim = sc.sim;
  const t = sim.state.rivals.territory;
  const cell = 16 * sim.world.bu;
  t.cell = cell;
  t.w = Math.ceil(sim.world.size / cell);
  t.h = t.w;
  t.slots = 8;
  t.marks = new Float32Array(t.w * t.h * t.slots);
  t.slotColony = [sc.colony.id, 99, -1, -1, -1, -1, -1, -1];
  return { sim, t, cell };
}

describe('threats overlay (review)', () => {
  it('rival territory follows the territory claim rule (GDD 05 §3.5: marks >= 20 and >= 1.5 x the second)', () => {
    const { sim, t, cell } = withTerritory();
    const at = (ix: number, iz: number, player: number, rival: number) => {
      const c = iz * t.w + ix;
      t.marks[c * t.slots] = player;
      t.marks[c * t.slots + 1] = rival;
      return { x: (ix + 0.5) * cell, z: (iz + 0.5) * cell };
    };
    const cases = [
      { p: at(1, 1, 0, 1), name: 'one stray rival mark (unclaimed)' },
      { p: at(2, 1, 0, 10), name: 'rival marks below CLAIM_MIN' },
      { p: at(3, 1, 100, 25), name: 'the PLAYER claims the cell' },
      { p: at(4, 1, 0, 40), name: 'rival claims the cell' },
    ];
    const s = threatSampler(sim, []);
    const out = new Float32Array(4);
    const got: Record<string, { overlay: number; claimedByRival: boolean }> = {};
    for (const c of cases) {
      out.fill(0);
      s.sample(c.p.x, c.p.z, out);
      const claim = claimAt(sim, c.p);
      got[c.name] = { overlay: out[1], claimedByRival: claim.owner === 99 };
    }
    // the outline is drawn where channel G crosses 0.5 (groundShader edgeLine)
    for (const [name, g] of Object.entries(got)) {
      expect(g.overlay >= 0.5, `${name}: overlay ${g.overlay} vs claim ${g.claimedByRival} (CLAIM_MIN ${TERR_CLAIM_MIN})`).toBe(g.claimedByRival);
    }
  });

  it('samplers ignore points outside the locality; a zero-radius zone stays finite', () => {
    const { sim } = withTerritory();
    const s = threatSampler(sim, [{ x: 10, z: 10, r: 0, ch: 0, strength: 1 }]);
    const out = new Float32Array(4);
    s.sample(-1, 5, out);
    expect([...out]).toEqual([0, 0, 0, 0]);
    s.sample(10, 10, out); // zone of radius 0 at the point itself
    expect(Number.isFinite(out[0])).toBe(true);
  });

  it('countdowns and temperature encoding at the edges', () => {
    expect(countdownText(1)).toBe('in 1 min');
    expect(countdownText(0)).toBe('in 1 min');
    expect(decodeTemp(encodeTemp(24.5))).toBeCloseTo(24.5, 9);
    // a camera on the ground still gets the minimum region; a very high one the maximum
    expect(regionFor(100, 100, 0, 4, 7, 120, 900, 16).size).toBeCloseTo(480, 6);
    expect(regionFor(100, 100, 1e9, 4, 7, 120, 900, 16).size).toBeCloseTo(3600, 6);
  });

  it('isotherm labels: a uniform field gives none, a field exactly on a 10 °C step gives none', () => {
    const r = new FieldRaster(16);
    r.start({ x0: 0, z0: 0, size: 16 }, { sample(_x, _z, out) { out[0] = encodeTemp(20); out[1] = 1; } });
    r.step(Infinity);
    expect(isothermSpots(r, decodeTemp, 10, 8, 3)).toHaveLength(0);
  });

  it('the threat zone list is bounded by live predators, territories and known hazards', () => {
    const { sim } = withTerritory();
    const { zones, forecasts } = threatZones(sim);
    for (const z of zones) expect(Number.isFinite(z.x) && Number.isFinite(z.z) && z.r > 0).toBe(true);
    expect(forecasts.every((f) => /^in \d+ (h|min)$/.test(f.text))).toBe(true);
  });
});
