// wire-stage2 review finding 6: the title backdrop's frames carry the comfort settings (GDD 08 §12), and a change in
// Settings > Accessibility while the title is a settled still frame redraws it with the new value.
import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import type { FrameInfo, RenderRegistry } from '@/render';
import type { RenderApp } from '@/render/app';
import { ComfortFeed } from './stage2Wiring';
import { SettingsStore } from './settings/settings';
import { TITLE_STILL_SETTLE_FRAMES, TitleHost } from './title';

function host(settings: SettingsStore) {
  const registry = {
    onGameStart: vi.fn(() => Promise.resolve()),
    update: vi.fn(),
  } as unknown as RenderRegistry & { update: ReturnType<typeof vi.fn> };
  const app = { quality: { id: 'low' }, renderer: { domElement: { height: 720 } }, setFocus: vi.fn(), setOnDemand: vi.fn(), requestRender: vi.fn() };
  const feed = new ComfortFeed();
  const h = new TitleHost({
    registry: () => registry, app: () => app as unknown as RenderApp, camera: new PerspectiveCamera(),
    canvas: { clientWidth: 1280, clientHeight: 720 } as HTMLCanvasElement, testMode: false, reducedMotion: () => false,
    playerQuality: () => 'low', comfort: () => feed.get(settings.get()),
  });
  return { h, registry };
}

describe('title backdrop comfort', () => {
  it('every title frame carries the comfort settings; a change redraws a settled still backdrop', async () => {
    const settings = new SettingsStore();
    settings.set({ accessibility: { spiderComfort: 'abstract' } });
    const f = host(settings);
    await f.h.enter();
    for (let i = 0; i < TITLE_STILL_SETTLE_FRAMES + 20; i++) f.h.frame(1 / 60);
    const calls = () => f.registry.update.mock.calls.map((c) => (c[0] as FrameInfo).comfort?.spiderComfort);
    expect(calls().length).toBe(TITLE_STILL_SETTLE_FRAMES);
    expect(calls().every((c) => c === 'abstract')).toBe(true);
    settings.set({ accessibility: { spiderComfort: 'softened' } });
    f.h.frame(1 / 60);
    expect(calls().length).toBe(TITLE_STILL_SETTLE_FRAMES + 1);
    expect(calls().at(-1)).toBe('softened');
  });
});
