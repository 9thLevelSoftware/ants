// Long sweep (FOUNDRESS_LONG=1, or FOUNDRESS_WORLDGEN_FULL=1): 20 seeds per Tier 1 archetype at standard size
// (Lasius). Task worldgen-life acceptance 2-6 and GDD 04 App. E 3, 6, 7: every world passes validation within the
// attempt limit (repairs rare), rival spacing, the start rule and a walker reaching a diggable founding site from
// the start, food anchors reachable and on surfaces, the economy floors, the founding-site class shares, and
// generation time. The always-on version (3 worlds) is populate/populate.test.ts. Numbers are printed.
import { describe, expect, it } from 'vitest';
import { createKernel } from '@/sim/kernel';
import { T1_ARCHETYPES, FULL } from '../testing/fixtures';
import { LONG, generated, siteDistribution, walkToDigSite } from '../populate/testkit';
import { accessOfAnchor } from '../populate/economy';
import { foodReport } from '../populate/finalize';
import { checkStartRule } from '../maps/start';
import { cellAt, navDistances } from './graph';
import { VALID } from '../tuning/pipeline';

const SEEDS = 20;
const RUN = LONG || FULL;

const stat = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return `min ${s[0].toFixed(1)} median ${s[Math.floor(s.length / 2)].toFixed(1)} max ${s[s.length - 1].toFixed(1)}`;
};

describe.skipIf(!RUN)(`long sweep: ${SEEDS} seeds per Tier 1 archetype (standard, Lasius)`, () => {
  for (const a of T1_ARCHETYPES) {
    it(`${a}: validation, rivals, start, food, site quality`, () => {
      let repaired = 0;
      const lines: string[] = [], fails: string[] = [];
      const check = (ok: boolean, what: string) => { if (!ok) fails.push(what); };
      const c300: number[] = [], p300: number[] = [], c900: number[] = [], p900: number[] = [], ms: number[] = [];
      const shares = { excellent: 0, good: 0, fair: 0, poor: 0 };
      for (let s = 100; s < 100 + SEEDS; s++) {
        const { report: r, ctx } = generated(a, s, 'standard', 'lasius-niger', false, () => performance.now());
        const w = ctx.world, bu = w.bu;
        ms.push(r.timingsMs.total ?? 0);
        const failed = r.checks.filter((c) => c.status === 'fail').map((c) => `${c.id}: ${c.detail}`);
        check(failed.length === 0, `${a}#${s} ${failed.join('; ')}`);
        check(r.attempts <= 8, `${a}#${s} attempts ${r.attempts}`);
        if (r.repairs.length > 0) repaired++;
        // rivals
        const st = w.queenStart.pos;
        const est = w.placements.rivalSites.filter((x) => !x.incipient);
        for (const x of est) check(Math.hypot(x.origin.x - st.x, x.origin.z - st.z) >= VALID.startRivalMinBu * bu, `${a}#${s} rival near start`);
        for (let i = 0; i < est.length; i++) for (let j = i + 1; j < est.length; j++) {
          check(Math.hypot(est[i].origin.x - est[j].origin.x, est[i].origin.z - est[j].origin.z) >= VALID.rivalSpacingBu * bu, `${a}#${s} rival spacing`);
        }
        // start rule and the walk to a diggable founding site
        const rule = checkStartRule(ctx);
        check(rule.ok, `${a}#${s} start ${rule.detail}`);
        const walk = walkToDigSite(ctx);
        check(walk.reached && walk.diggable, `${a}#${s} walk ${walk.detail} diggable=${walk.diggable}`);
        // anchors: reachable, sampled ones not inside solids
        const d = navDistances(ctx, [cellAt(ctx, st.x, st.z)]);
        const k = createKernel(w, { voxel: bu / 2, keys: [], chunks: [], breaches: [] }, { field: { hashCell: 32 * bu } });
        w.placements.foodAnchors.forEach((an, i) => {
          const acc = accessOfAnchor(ctx, an);
          check(!!acc && d[acc.cell] < Infinity, `${a}#${s} anchor ${an.id} unreachable`);
          if (i % 5 === 0) check(k.field.sampleXYZ(an.pos.x, an.pos.y, an.pos.z) > -0.5, `${a}#${s} anchor ${an.id} in solid`);
        });
        // economy and site quality
        const fr = foodReport(ctx);
        c300.push(fr.floors[0].c); p300.push(fr.floors[0].p); c900.push(fr.floors[1].c); p900.push(fr.floors[1].p);
        const dist = siteDistribution(ctx);
        for (const key of Object.keys(shares) as (keyof typeof shares)[]) shares[key] += dist[key] / SEEDS;
        lines.push(`${s}: attempts=${r.attempts} repairs=[${r.repairs}] ${Math.round(r.timingsMs.total ?? 0)} ms start ${rule.detail} | ${r.checks.find((c) => c.id === 'v-food')!.detail}`);
      }
      const pct = (x: number) => (100 * x).toFixed(1);
      console.info(`[sweep] ${a}\n  ${lines.join('\n  ')}\n  economy 300 BU: C ${stat(c300)}, P ${stat(p300)}; 900 BU: C ${stat(c900)}, P ${stat(p900)}\n`
        + `  site classes (mean over seeds): excellent ${pct(shares.excellent)} %, good ${pct(shares.good)} %, fair ${pct(shares.fair)} %, poor ${pct(shares.poor)} %\n`
        + `  generation ms: ${stat(ms)}; repaired ${repaired}/${SEEDS}\n  failures: ${fails.length ? fails.join('\n    ') : 'none'}`);
      expect(fails, fails.join('\n')).toEqual([]);
      expect(repaired / SEEDS).toBeLessThan(0.05 + 1 / SEEDS);
      expect(shares.excellent).toBeLessThanOrEqual(0.1);
      expect(shares.good).toBeLessThanOrEqual(0.25);
      expect(shares.poor).toBeGreaterThanOrEqual(0.05);
    }, 3_600_000);
  }
});
