// Adversarial review tests of the species data and the loader validation (task species-data). Passing tests are
// regression guards; a failing test marks a defect found in review (see the review report).
import { describe, expect, it } from 'vitest';
import type { ActionId, Caste, CasteDef, SpeciesDef, Task } from '@/sim/types';
import { ANT_SIZE_CLASSES } from '@/sim/types';
import { PLAYABLE_SPECIES, requireSpecies } from './index';
import { deriveAntStats, entranceCapOf, larvalCost } from './derive';
import { validateSpecies } from './validate';
import { LARVA_C_REQ, LARVA_P_REQ } from '@/sim/balance';

const WORKER_CASTES: readonly Caste[] = ['worker', 'minor', 'media', 'major'];
const isWorker = (c: CasteDef): boolean => WORKER_CASTES.includes(c.caste);
const weight = (c: CasteDef, t: Task): number => c.taskWeights[t] ?? 1; // missing task = 1 (types/species.ts)
const has = (c: CasteDef, a: ActionId): boolean => c.actions.includes(a);
const caste = (d: SpeciesDef, c: Caste): CasteDef => d.castes.find((x) => x.caste === c)!;

describe('derived stats stay finite and positive over every caste length range', () => {
  for (const def of PLAYABLE_SPECIES) {
    it(def.id, () => {
      for (const cd of def.castes) {
        for (const len of [cd.lengthBu.min, cd.lengthBu.mean, cd.lengthBu.max]) {
          const s = deriveAntStats(def, cd.caste, len);
          for (const [k, v] of Object.entries(s)) expect(Number.isFinite(v) && v >= 0, `${cd.caste} ${len} ${k} = ${v}`).toBe(true);
          expect(s.maxHp).toBeGreaterThan(0);
          if (isWorker(cd)) expect(s.carryCap).toBeGreaterThan(0);
        }
      }
    });
  }

  it('a larger individual of a worker caste is never weaker or lighter (monotone in length)', () => {
    for (const def of PLAYABLE_SPECIES) {
      for (const cd of def.castes.filter(isWorker)) {
        const a = deriveAntStats(def, cd.caste, cd.lengthBu.min);
        const b = deriveAntStats(def, cd.caste, cd.lengthBu.max);
        expect(b.massMg).toBeGreaterThan(a.massMg);
        expect(b.maxHp).toBeGreaterThan(a.maxHp);
        expect(b.bite).toBeGreaterThan(a.bite);
        expect(b.cropCap).toBeGreaterThanOrEqual(a.cropCap);
      }
    }
  });

  it('Atta: the larval FL cost of a gyne by the mass rule (42 at 1.2 P; R43) is above the Ch 06 multiplier value kept (24 FL)', () => {
    const at = requireSpecies('atta-texana');
    const m = caste(at, 'gyne').casteMassMg / at.stdMassMg;
    const rule = larvalCost(m);
    // 42 FL at the GDD's 1.6 FL per larva; at R43's LARVA_P_REQ 0.8 it is 42 x 1.2 / 1.6 = 31.5 (gate-sim-2)
    expect(rule.p + rule.c).toBeCloseTo((42 * (LARVA_P_REQ + LARVA_C_REQ)) / 1.6, -1);
    expect(rule.p + rule.c).toBeGreaterThan(24);
    expect(at.reproduction.sexualCostMult.gyne * 1.6).toBeCloseTo(24, 9);
  });
});

describe('references between fields of one definition', () => {
  for (const def of PLAYABLE_SPECIES) {
    it(`${def.id}: guard castes, first brood caste and size classes exist`, () => {
      const castes = def.castes.map((c) => c.caste);
      for (const g of def.combat.guardCastes) expect(castes, `guard caste ${g}`).toContain(g);
      expect(castes).toContain(def.opening.firstBroodClass.caste);
      for (const cd of def.castes) for (const s of cd.sizeClasses) expect(ANT_SIZE_CLASSES as readonly string[]).toContain(s.id);
      // A caste listed with a nonzero mix share must exist (Lasius uses the media column for its single worker caste).
      for (const [, minor, media, major] of def.life.casteMixTarget) {
        if (minor > 0) expect(castes).toContain('minor');
        if (media > 0) expect(castes.some((c) => c === 'media' || c === 'worker')).toBe(true);
        if (major > 0) expect(castes).toContain('major');
      }
    });
  }

  it('the alate lay window falls where the queen can lay (fSeason > 0 and inside layWindows)', () => {
    for (const def of PLAYABLE_SPECIES) {
      const [doy0, doy1] = def.reproduction.alateLayWindow;
      let layable = 0;
      for (let d = doy0 - 1; d < doy1; d += 0.25) {
        const inWindow = !def.life.layWindows || def.life.layWindows.some(([a, b]) => d >= a && d < b);
        if (inWindow && curve(def.life.fSeason, d) > 0) layable++;
      }
      expect(layable, def.id).toBeGreaterThan(0);
    }
  });

  it('Atta queen upkeep (stored as C + P) equals the fungus block queenUpkeepFl', () => {
    const at = requireSpecies('atta-texana');
    const q = caste(at, 'queen').upkeepOverride!;
    expect(q.restC + q.p).toBeCloseTo(at.modules['fungus-garden']!.queenUpkeepFl, 9);
    expect(at.life.queenUpkeep.c + at.life.queenUpkeep.p).toBeCloseTo(0.5, 9);
  });

  it('Appendix E8 input: Camponotus night willingness is at least 3 x the midday one', () => {
    const t = requireSpecies('camponotus-pennsylvanicus').thermal.lightPref;
    expect(t.night / t.midday).toBeGreaterThanOrEqual(3);
  });
});

describe('caste action lists follow the GDD 01 §7 "Who" column', () => {
  const where = (a: ActionId): string[] => PLAYABLE_SPECIES.flatMap((d) => d.castes.filter((c) => has(c, a)).map((c) => `${d.id}:${c.caste}`));

  it('species- and caste-specific primitives appear only where the catalogue allows them', () => {
    const only = (a: ActionId, allowed: string[]): void => {
      for (const w of where(a)) expect(allowed, `${a} on ${w}`).toContain(w);
    };
    only('carry-aphid', ['lasius-niger:worker']);
    only('tend-aphid', ['lasius-niger:worker', 'camponotus-pennsylvanicus:minor', 'camponotus-pennsylvanicus:media']);
    only('hitchhike', ['atta-texana:minor']);
    only('eject-frass', ['camponotus-pennsylvanicus:minor', 'camponotus-pennsylvanicus:media', 'camponotus-pennsylvanicus:major']);
    only('drum', ['camponotus-pennsylvanicus:minor', 'camponotus-pennsylvanicus:media', 'camponotus-pennsylvanicus:major']);
    only('mill-seed', ['messor-barbarus:media', 'messor-barbarus:major']);
    only('cut-seed-head', ['messor-barbarus:media', 'messor-barbarus:major']);
    only('gnaw-radicle', ['messor-barbarus:minor', 'messor-barbarus:media']);
    only('cut-leaf', ['atta-texana:media', 'atta-texana:major']);
    only('process-leaf', ['atta-texana:media']);
    only('plant', ['atta-texana:queen']);
    only('block-opening', ['camponotus-pennsylvanicus:major', 'messor-barbarus:major', 'atta-texana:major']);
    for (const w of where('lay-egg')) expect(w.endsWith(':queen'), w).toBe(true);
    for (const w of where('dealate')) expect(w.endsWith(':gyne'), w).toBe(true);
    for (const w of where('fly')) expect(w.endsWith(':gyne') || w.endsWith(':male'), w).toBe(true);
  });

  it('weapons follow the subfamily: spray-acid only in formicines, sting only in species that list it', () => {
    for (const def of PLAYABLE_SPECIES) {
      for (const cd of def.castes) {
        if (has(cd, 'spray-acid')) expect(def.combat.weapons, `${def.id}:${cd.caste}`).toContain('spray-acid');
        if (has(cd, 'sting')) expect(def.combat.weapons, `${def.id}:${cd.caste}`).toContain('sting');
      }
      expect(caste(def, 'male').actions).not.toContain('spray-acid');
      expect(caste(def, 'male').actions).not.toContain('harvest-liquid'); // "all adults that feed (not males)"
    }
  });

  // GDD 01 §7 `feed-larva` Who: "worker castes; founding queen (from reserves); AT: only with fungus".
  // GDD 07 §5.4.2: Atta larvae are fed staphylae "by minims and small media" (small media are the `media` caste).
  it('every worker caste and every queen may feed larvae (feed-larva)', () => {
    const missing: string[] = [];
    for (const def of PLAYABLE_SPECIES) {
      for (const cd of def.castes) {
        if ((isWorker(cd) && weight(cd, 'nurse') > 0) || cd.caste === 'queen') {
          if (!has(cd, 'feed-larva')) missing.push(`${def.id}:${cd.caste}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  // A caste allocated to a task (weight > 0; a missing weight is 1) must own the primitive that task performs, or
  // the action runner refuses it with reason 'caste' (ants/actions/runner.ts casteAllows).
  it('a worker caste with a positive task weight has the primitive the task needs', () => {
    const needs: [Task, ActionId][] = [
      ['dig', 'dig-bite'], ['nurse', 'feed-larva'], ['tend', 'tend-aphid'], ['mill', 'mill-seed'], ['cut', 'cut-leaf'], ['garden', 'tend-fungus'],
    ];
    const bad: string[] = [];
    for (const def of PLAYABLE_SPECIES) {
      for (const cd of def.castes.filter(isWorker)) {
        for (const [task, action] of needs) {
          if (weight(cd, task) > 0 && !has(cd, action)) bad.push(`${def.id}:${cd.caste} task ${task} (weight ${weight(cd, task)}) lacks ${action}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('nest template entrance rule', () => {
  // Open-entrance cap = min(max, start + floor(N / perWorkers)); perWorkers 0 = no growth with N, cap max
  // (NestTemplate.entrances). The raw formula divides by zero for perWorkers 0, so the one implementation is used.
  const cap = entranceCapOf;

  it('the documented cap formula gives a finite count between start and max for every species and N', () => {
    for (const def of PLAYABLE_SPECIES) {
      for (const n of [0, 1, 59, 300, 800, 1500]) {
        const c = cap(def, n);
        expect(Number.isFinite(c), `${def.id} N ${n}: cap ${c}`).toBe(true);
        expect(c).toBeGreaterThanOrEqual(def.nestTemplate.entrances.start);
        expect(c).toBeLessThanOrEqual(def.nestTemplate.entrances.max);
      }
    }
  });

  it('Camponotus: the cap does not depend on N (perWorkers 0 = max 6, GDD 03 §8.2 maxEntrances)', () => {
    const cp = requireSpecies('camponotus-pennsylvanicus');
    expect([0, 1, 300, 1500].map((n) => cap(cp, n))).toEqual([6, 6, 6, 6]);
  });

  it('Atta: min(40, 1 + floor(N / 40)) (GDD 07 §5.4.6); Messor: 1 + 1 per 300 workers', () => {
    const at = requireSpecies('atta-texana');
    expect([0, 39, 40, 400, 1500].map((n) => cap(at, n))).toEqual([1, 1, 2, 11, 38]);
    const mb = requireSpecies('messor-barbarus');
    expect([0, 299, 300, 1500].map((n) => cap(mb, n))).toEqual([1, 1, 2, 6]);
  });
});

describe('loader validation rejects values that break the systems reading them', () => {
  const LN = (): SpeciesDef => structuredClone(requireSpecies('lasius-niger'));

  // stageDu (colony/life.ts) multiplies the stage duration by devMult: 0 gives a zero-length stage, a negative one a
  // negative duration.
  it('a caste devMult of 0 or below', () => {
    for (const v of [0, -1]) {
      const d = LN();
      d.castes[0].devMult = v;
      expect(validateSpecies(d).length, `devMult ${v}`).toBeGreaterThan(0);
    }
  });

  it('a negative upkeep override or crop / carry cap', () => {
    const a = LN();
    caste(a, 'queen').upkeepOverride = { restC: -0.3, activeC: 0.3, p: 0.1 };
    expect(validateSpecies(a).length).toBeGreaterThan(0);
    const b = LN();
    caste(b, 'gyne').cropMax = -1;
    expect(validateSpecies(b).length).toBeGreaterThan(0);
  });

  it('a guard caste or first-brood caste the species does not define', () => {
    const a = LN();
    a.combat.guardCastes = ['major'];
    expect(validateSpecies(a).length, 'guard caste').toBeGreaterThan(0);
    const b = LN();
    b.opening.firstBroodClass = { caste: 'minor', nanitic: false };
    expect(validateSpecies(b).length, 'first brood caste').toBeGreaterThan(0);
  });

  it('accepts every shipped definition unchanged (no false positives)', () => {
    for (const def of PLAYABLE_SPECIES) expect(validateSpecies(structuredClone(def))).toEqual([]);
  });
});

describe('GDD 07 values that live in module blocks', () => {
  it('Camponotus satiation, forager share and Atta small-media devMult are present', () => {
    const w = requireSpecies('camponotus-pennsylvanicus').modules['wood-nesting']!;
    expect([w.satiationStoresGd, w.satiationActivityMult, w.foragerShare, w.forageDemandMult]).toEqual([10, 0.7, 0.03, 0.15]);
    expect(requireSpecies('atta-texana').modules['fungus-garden']!.smallMediaDevMult).toBe(0.95);
  });
});

function curve(c: [number, number][], x: number): number {
  if (x <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (x <= c[i][0]) {
      const [x0, y0] = c[i - 1];
      const [x1, y1] = c[i];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return c[c.length - 1][1];
}
