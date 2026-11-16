// Packaging (task work item 6): the portable build ships audio by reference scan (INCLUDE_ALL_AUDIO is false). Every file
// the cue table, the event sounds, the giant sounds, the UI sounds and the ambience matrix can ask for must be in the
// scan result, and nothing the code never asks for may ship.
import { describe, expect, it } from 'vitest';
import { ALL_BED_IDS, ALL_SFX_IDS } from './assetIds';
import { requestedAudioFiles } from './requestedFiles';

interface Plan {
  manifest: { assets: { id: string; kind: string; path: string; bytes: number }[] };
  packs: { name: string; assets: { path: string }[] }[];
  leftOut: { id: string; bytes: number }[];
}
interface BuildConfig { INCLUDE_ALL_AUDIO: boolean }

// The build tools are plain .mjs outside the typed project: load them by URL.
const TOOLS = new URL('../../tools/build/', import.meta.url).href;
const plan = (await import(/* @vite-ignore */ `${TOOLS}assetPlan.mjs`)).planAssets() as Plan;
const config = (await import(/* @vite-ignore */ `${TOOLS}config.mjs`)) as BuildConfig;

describe('audio files in the portable build', () => {
  const requested = requestedAudioFiles();
  const shipped = plan.manifest.assets.filter((a) => a.kind === 'audio').map((a) => a.id).sort();

  it('ships audio by reference scan, not wholesale', () => {
    expect(config.INCLUDE_ALL_AUDIO).toBe(false);
  });

  it('the tables ask for a plausible number of files (a floor so the audit cannot silently read nothing)', () => {
    expect(requested.length).toBeGreaterThanOrEqual(40);
    expect(requested).toEqual(expect.arrayContaining(['audio/sfx/thud_giant_step_01', 'audio/ambience/birdsong_day', 'audio/sfx/wet_splat_01']));
  });

  it('every requested file exists in the manifest and is in the scan result (no file a sound asks for is missing)', () => {
    expect(requested.filter((id) => !shipped.includes(id))).toEqual([]);
  });

  it('every shipped audio file is one the code asks for (no unused file ships)', () => {
    expect(shipped.filter((id) => !requested.includes(id))).toEqual([]);
  });

  it('every shipped audio file sits in an asset pack, and none was left out that the code asks for', () => {
    const inPacks = new Set(plan.packs.flatMap((p) => p.assets.map((a) => a.path)));
    const byId = new Map(plan.manifest.assets.map((a) => [a.id, a.path]));
    expect(shipped.filter((id) => !inPacks.has(byId.get(id)!))).toEqual([]);
    expect(plan.leftOut.filter((a) => requested.includes(a.id))).toEqual([]);
  });

  it('the id registry (assetIds.ts, what the scan reads) is exactly the requested set', () => {
    expect([...ALL_SFX_IDS, ...ALL_BED_IDS].sort()).toEqual(requested);
  });
});
