import { describe, expect, it } from 'vitest';
import type { SaveSlotInfo } from '../../api';
import { agoText, continueLine, isAutoSlot, newestSave, playTimeText, slotTitle, speciesName } from './describe';
import { base64ToBytes, bytesToBase64, checkImportText, EXPORT_PREFIX, exportText, sizeKb } from './saveText';

const info = (slot: string, over: Partial<SaveSlotInfo> = {}): SaveSlotInfo => ({ slot, label: slot, savedAt: '2026-11-12T09:00:00Z', colonyDay: 5, workers: 30, ...over });

describe('export / import text form (GDD 08 7.6)', () => {
  it('round-trips bytes through FOUNDRESS1: + base64', () => {
    const bytes = new Uint8Array(70000).map((_, i) => (i * 7 + 3) & 255);
    const text = exportText(bytes);
    expect(text.startsWith(EXPORT_PREFIX)).toBe(true);
    const c = checkImportText(text);
    expect(c.ok).toBe(true);
    if (c.ok) {
      expect(c.sizeKb).toBe(Math.round(70000 / 1024));
      expect(Array.from(base64ToBytes(c.text.slice(EXPORT_PREFIX.length)))).toEqual(Array.from(bytes));
    }
    expect(bytesToBase64(new Uint8Array([102, 111, 111]))).toBe('Zm9v');
  });
  it('tolerates whitespace and line breaks in pasted text', () => {
    const text = exportText(new Uint8Array(100).fill(9));
    const wrapped = text.replace(/(.{40})/g, '$1\n  ');
    expect(checkImportText(wrapped).ok).toBe(true);
  });
  it('explains plainly why pasted text is refused', () => {
    expect(checkImportText('   ')).toMatchObject({ ok: false, error: expect.stringContaining('Paste') });
    expect(checkImportText('hello')).toMatchObject({ ok: false, error: expect.stringContaining('FOUNDRESS1:') });
    expect(checkImportText(EXPORT_PREFIX)).toMatchObject({ ok: false, error: expect.stringContaining('cut off') });
    expect(checkImportText(`${EXPORT_PREFIX}ab$cd`)).toMatchObject({ ok: false, error: expect.stringContaining('characters') });
  });
  it('reports sizes in KB, at least 1', () => {
    expect(sizeKb(10)).toBe(1);
    expect(sizeKb(5 * 1024)).toBe(5);
  });
});

describe('slot descriptions', () => {
  it('names slots and tells the autosave ring apart', () => {
    expect(slotTitle('quick')).toBe('Quick save');
    expect(slotTitle('slot-3')).toBe('Slot 3');
    expect(slotTitle('auto-2')).toBe('Autosave');
    expect(isAutoSlot(info('auto-1'))).toBe(true);
    expect(isAutoSlot(info('slot-1', { kind: 'auto' }))).toBe(true);
    expect(isAutoSlot(info('slot-1'))).toBe(false);
  });
  it('writes ages and play time in plain words', () => {
    expect(agoText(3)).toBe('just now');
    expect(agoText(45)).toBe('45 s ago');
    expect(agoText(180)).toBe('3 min ago');
    expect(agoText(7200)).toBe('2 h ago');
    expect(agoText(86400 * 4)).toBe('4 days ago');
    expect(playTimeText(1500)).toBe('25 min');
    expect(playTimeText(5400)).toBe('1 h 30 min');
  });
  it('finds the newest save and describes it for Continue', () => {
    const list = [info('slot-1', { savedAt: '2026-11-10T00:00:00Z' }), info('auto-1', { savedAt: '2026-11-12T08:00:00Z', species: 'lasius-niger', dateLabel: 'Summer · Day 3 · Year 1', population: 12 }), info('quick', { savedAt: '2026-11-11T00:00:00Z' })];
    const n = newestSave(list)!;
    expect(n.slot).toBe('auto-1');
    expect(continueLine(n)).toContain('Lasius niger');
    expect(continueLine(n)).toContain('Summer · Day 3 · Year 1');
    expect(continueLine(n)).toContain('12 workers');
    expect(newestSave([])).toBeNull();
    expect(speciesName('atta-texana')).toBe('Atta texana');
  });
});
