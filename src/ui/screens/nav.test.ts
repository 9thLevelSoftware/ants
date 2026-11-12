import { describe, expect, it } from 'vitest';
import { activeOverlay, allowedOverlays, baseScreen, closeAll, closeTop, initialNav, onModeChange, openOverlay, type NavState } from './nav';

describe('screen routing from the game mode (GDD 01 1.1)', () => {
  it('maps every snapshot screen to a base screen', () => {
    expect(baseScreen('boot')).toBe('boot');
    expect(baseScreen('unsupported')).toBe('unsupported');
    expect(baseScreen('title')).toBe('title');
    expect(baseScreen('loading')).toBe('loading');
    expect(baseScreen('paused')).toBe('pause');
    expect(baseScreen('epitaph')).toBe('epitaph');
    expect(baseScreen('playing')).toBe('hud');
  });

  it('book screens open over the title and the pause menu, nowhere else', () => {
    expect(allowedOverlays('title')).toContain('new-game');
    expect(allowedOverlays('paused')).toContain('settings');
    expect(allowedOverlays('paused')).not.toContain('new-game');
    expect(allowedOverlays('loading')).toEqual([]);
    expect(allowedOverlays('playing')).toEqual([]);
    let n = openOverlay(initialNav(), 'new-game');
    expect(activeOverlay('title', n)).toBe('new-game');
    expect(activeOverlay('paused', n)).toBeNull(); // not allowed over the pause menu
    n = openOverlay(initialNav(), 'settings', { settingsTab: 'controls' });
    expect(n.settingsTab).toBe('controls');
    expect(activeOverlay('paused', n)).toBe('settings');
  });

  it('stacks overlays, closes the top one and does not stack the same one twice', () => {
    let n = openOverlay(initialNav(), 'settings');
    n = openOverlay(n, 'settings');
    expect(n.stack).toEqual(['settings']);
    n = openOverlay(n, 'save-load', { saveTab: 'save' });
    expect(n.stack).toEqual(['settings', 'save-load']);
    expect(closeTop(n).stack).toEqual(['settings']);
    expect(closeAll(n).stack).toEqual([]);
  });
});

describe('mode transitions', () => {
  it('leaving the title or the pause menu drops the overlays', () => {
    const n = openOverlay(initialNav(), 'new-game');
    expect(onModeChange(n, 'title', 'loading').stack).toEqual([]);
    expect(onModeChange(openOverlay(initialNav(), 'settings'), 'paused', 'playing').stack).toEqual([]);
  });

  it('Cancel on loading returns to the title with New Game open again (fields preserved)', () => {
    let n = openOverlay(initialNav(), 'new-game');
    n = { ...n, afterLoadingCancel: 'new-game' };
    n = onModeChange(n, 'title', 'loading'); // generation starts
    expect(n.afterLoadingCancel).toBe('new-game'); // remembered through loading
    n = onModeChange(n, 'loading', 'title'); // cancelled
    expect(n.stack).toEqual(['new-game']);
    expect(n.afterLoadingCancel).toBeNull();
  });

  it('a finished load clears the remembered return and lands without overlays', () => {
    let n: NavState = { ...initialNav(), afterLoadingCancel: 'new-game' };
    n = onModeChange(n, 'title', 'loading');
    n = onModeChange(n, 'loading', 'playing');
    expect(n.stack).toEqual([]);
    expect(n.afterLoadingCancel).toBeNull();
  });

  it('is a no-op when the mode did not change', () => {
    const n = openOverlay(initialNav(), 'credits');
    expect(onModeChange(n, 'title', 'title')).toBe(n);
  });

  it('title -> epitaph and the like never keep stale overlays', () => {
    const n = openOverlay(initialNav(), 'credits');
    expect(onModeChange(n, 'title', 'epitaph').stack).toEqual([]);
  });
});
