// Species data against the other tables that must agree with it: the nest templates the architect reads
// (src/sim/balance/nestTemplates.ts, GDD 03 §8.2), the climates of GDD 06 §2.1, the region mapping and body units of
// the world generator, and the canonical constants of 00-index C-sections.
import { describe, expect, it } from 'vitest';
import type { SpeciesDef, SpeciesId } from '@/sim/types';
import { SPECIES_IDS } from '@/sim/types';
import { maxEntrancesFor, NEST_TEMPLATES } from '@/sim/balance';
import { CLIMATES, seasonalMean } from '@/sim/environment/climates';
import { defaultWorldParams } from '@/worldgen';
import { REGION_CLIMATE } from '@/worldgen/params';
import { SPECIES_BU_MM } from '@/worldgen/tuning/pipeline';
import { PLAYABLE_SPECIES, requireSpecies } from './index';

const byId = (id: SpeciesId): SpeciesDef => requireSpecies(id);

describe('SpeciesDef.nestTemplate stays in sync with the template the nest module reads (balance/nestTemplates.ts)', () => {
  for (const id of SPECIES_IDS) {
    it(id, () => {
      const n = byId(id).nestTemplate;
      const t = NEST_TEMPLATES[id];
      expect(n.footprintRBu).toBe(t.footprintR);
      expect(n.maxDepthBu).toBe(t.maxDepth);
      expect(n.maxPathToEntranceBu).toBe(t.maxPathToEntrance);
      expect(n.volumeCapBu3).toBe(t.volumeCap);
      expect(n.entrances.max).toBe(Math.max(t.maxEntrances, t.maxEntrancesLarge));
      for (const ch of n.chambers) {
        if (ch.type === 'royal') expect(ch.minWorkers, 'royalAt').toBe(t.royalAt);
        const band = t.depthBands[ch.type];
        if (band) expect(ch.depthBu, `${ch.type} depth band`).toEqual(band);
      }
    });
  }

  it('the Lasius entrance cap (3, 4 from 800 workers) matches maxEntrancesFor at every size', () => {
    const e = byId('lasius-niger').nestTemplate.entrances;
    for (const n of [0, 100, 799, 800, 1200, 1500]) {
      expect(Math.min(e.max, e.start + Math.floor(n / e.perWorkers)), `N ${n}`).toBe(maxEntrancesFor('lasius-niger', n));
    }
  });
});

describe('climates (GDD 06 §2.1 table, repeated in GDD 07 §4)', () => {
  const TABLE = {
    'temperate-maritime': { tann: 12.0, aseas: 8.5, ad: [5, 6, 4, 2.5], w: [1, 1, 1, 1], heat: 6, frostMax: 9.5, heatMin: 17, wind: 1.0, rh: 0.75, peak: 20.5, trough: 3.5 },
    'temperate-continental': { tann: 11.5, aseas: 12.5, ad: [6, 7, 5, 3.5], w: [1.1, 1.2, 0.9, 1.2], heat: 6, frostMax: 9.5, heatMin: 19, wind: 0.9, rh: 0.7, peak: 24.0, trough: -1.0 },
    mediterranean: { tann: 17.5, aseas: 7.5, ad: [6, 8, 5, 4], w: [0.5, 0.8, 1.5, 0.15], heat: 5, frostMax: 11, heatMin: 21, wind: 0.9, rh: 0.5, peak: 25.0, trough: 10.0 },
    subtropical: { tann: 19.5, aseas: 9.5, ad: [6, 7, 6, 5], w: [0.9, 1.5, 1.3, 0.15], heat: 4, frostMax: 11, heatMin: 24, wind: 1.0, rh: 0.7, peak: 29.0, trough: 10.0 },
  } as const;

  for (const [id, t] of Object.entries(TABLE)) {
    it(id, () => {
      const c = CLIMATES[id as keyof typeof CLIMATES];
      expect([c.tann, c.aseas]).toEqual([t.tann, t.aseas]);
      expect([c.ad.spring, c.ad.summer, c.ad.autumn, c.ad.winter]).toEqual(t.ad);
      expect([c.rainMult, c.stormMult, c.heatMult, c.frostMult]).toEqual(t.w);
      expect([c.heatOffsetC, c.frostSeasonalMaxC, c.heatSeasonalMinC, c.windBase, c.humidityBase]).toEqual([t.heat, t.frostMax, t.heatMin, t.wind, t.rh]);
      expect(c.tann + c.aseas).toBeCloseTo(t.peak, 6);
      expect(c.tann - c.aseas).toBeCloseTo(t.trough, 6);
      expect(seasonalMean(c, 9.5 / 28)).toBeCloseTo(t.peak, 6); // the peak sits at d = 9.5 (about 22 July)
    });
  }

  it('each species names its own climate, and the world generator maps its region to the same climate', () => {
    const expected: Record<SpeciesId, string> = {
      'lasius-niger': 'temperate-maritime', 'camponotus-pennsylvanicus': 'temperate-continental',
      'messor-barbarus': 'mediterranean', 'atta-texana': 'subtropical',
    };
    for (const def of PLAYABLE_SPECIES) {
      expect(def.climate).toBe(expected[def.id]);
      expect(REGION_CLIMATE[defaultWorldParams(def.id, 1).region]).toBe(def.climate);
      expect(CLIMATES[def.climate]).toBeDefined();
    }
  });
});

describe('body units and world scale', () => {
  it('buMm = Lasius 4, Camponotus 9, Messor 7, Atta 7 (C2) and equals the world generator table', () => {
    expect(PLAYABLE_SPECIES.map((d) => d.buMm)).toEqual([4, 9, 7, 7]);
    for (const d of PLAYABLE_SPECIES) expect(SPECIES_BU_MM[d.id]).toBe(d.buMm);
  });

  it('colony caps (C2): Lasius 1500, Camponotus 1200, Messor 1500, Atta 1500', () => {
    expect(PLAYABLE_SPECIES.map((d) => d.scale.simCapWorkers)).toEqual([1500, 1200, 1500, 1500]);
  });
});

describe('canonical constants repeated in species data (00-index C-sections)', () => {
  it('C6 founding: FOUND_R0 56 / 36 / 40 / 48, clutch 48 / 16 / 20 / 40, D_MIN, V_MIN, W_MIN', () => {
    const o = PLAYABLE_SPECIES.map((d) => d.opening);
    expect(o.map((x) => x.R0)).toEqual([56, 36, 40, 48]);
    expect(o.map((x) => x.clutchCap)).toEqual([48, 16, 20, 40]);
    expect(o.map((x) => [x.dMinOpenBu, x.dMinCoverBu])).toEqual([[8, 5], [3, 3], [20, 15], [30, 25]]);
    expect(o.map((x) => x.vMinBu3)).toEqual([10, 10, 15, 25]);
    expect(o.map((x) => x.wMinBu)).toEqual([3.5, 3.5, 4.0, 4.5]);
  });

  it('C11 stages: grow 75 / 50 / 50 / 150, mature 700 / 500 / 700 / 1000, matureAge 2 / 4 / 3 / 3, REPRO 0.10 / 0.12 / 0.02 / 0.04', () => {
    const d = PLAYABLE_SPECIES;
    expect(d.map((x) => x.scale.growThreshold)).toEqual([75, 50, 50, 150]);
    expect(d.map((x) => x.scale.matureThreshold)).toEqual([700, 500, 700, 1000]);
    expect(d.map((x) => x.reproduction.matureAgeYears)).toEqual([2, 4, 3, 3]);
    expect(d.map((x) => x.reproduction.reproMaxFrac)).toEqual([0.1, 0.12, 0.02, 0.04]);
    expect(d.map((x) => x.reproduction.reproGyneShare)).toEqual([0.4, 0.44, 0.5, 0.25]);
  });

  it('C11 alate upkeep gyne / male: 0.15 / 0.06, 0.15 / 0.10, 0.15 / 0.08, 0.2 / 0.15, equal to the caste overrides', () => {
    for (const [i, up] of [[0.15, 0.06], [0.15, 0.1], [0.15, 0.08], [0.2, 0.15]].entries()) {
      const def = PLAYABLE_SPECIES[i];
      expect([def.reproduction.gyneUpkeepC, def.reproduction.maleUpkeepC]).toEqual(up);
      expect(def.castes.find((c) => c.caste === 'gyne')!.upkeepOverride!.restC).toBe(up[0]);
      expect(def.castes.find((c) => c.caste === 'male')!.upkeepOverride!.restC).toBe(up[1]);
    }
  });

  it('C5 sexual cost multipliers: Lasius 12 / 2, Camponotus 8.0 / 1.3, Messor 10 / 2, Atta 15 / 3', () => {
    expect(PLAYABLE_SPECIES.map((d) => [d.reproduction.sexualCostMult.gyne, d.reproduction.sexualCostMult.male])).toEqual([[12, 2], [8, 1.3], [10, 2], [15, 3]]);
  });

  it('C3 load speed multipliers: 0.85 / 0.85 / 0.75 / 0.65', () => {
    expect(PLAYABLE_SPECIES.map((d) => d.loadSpeedMult)).toEqual([0.85, 0.85, 0.75, 0.65]);
  });

  it('winter modes (06 §6.1): diapause-lapse, diapause-lapse, rest-lapse, active', () => {
    expect(PLAYABLE_SPECIES.map((d) => d.winter.mode)).toEqual(['diapause-lapse', 'diapause-lapse', 'rest-lapse', 'active']);
  });

  it('natural start windows (06 §1.6 / C1): doy 9-12 (10), 2-9 (5), 15-19 (17), 2-8 (5)', () => {
    expect(PLAYABLE_SPECIES.map((d) => d.opening.startDoy)).toEqual([
      { min: 9, max: 12, default: 10 }, { min: 2, max: 9, default: 5 }, { min: 15, max: 19, default: 17 }, { min: 2, max: 8, default: 5 },
    ]);
  });

  it('GDD 01 §7.3: queens and gynes can sniff and antennate; the founding queen can drop and unseal (Lasius, Camponotus, Messor)', () => {
    for (const d of PLAYABLE_SPECIES) {
      for (const caste of ['queen', 'gyne'] as const) {
        const a = d.castes.find((c) => c.caste === caste)!.actions;
        expect(a, `${d.id} ${caste}`).toEqual(expect.arrayContaining(['sniff', 'antennate']));
      }
      const q = d.castes.find((c) => c.caste === 'queen')!.actions;
      expect(q, `${d.id} queen`).toEqual(expect.arrayContaining(['drop', 'unseal-entrance', 'harvest-liquid', 'dig-bite', 'seal-entrance', 'lay-egg']));
    }
  });

  it('formicines carry spray-acid and no sting; myrmicines sting (Messor) or only bite (Atta)', () => {
    const weapons = (id: SpeciesId): string[] => byId(id).combat.weapons;
    expect(weapons('lasius-niger')).toContain('spray-acid');
    expect(weapons('camponotus-pennsylvanicus')).toContain('spray-acid');
    expect(weapons('messor-barbarus')).toContain('sting');
    expect(weapons('atta-texana')).toEqual(['bite', 'bite-hold']);
  });
});
