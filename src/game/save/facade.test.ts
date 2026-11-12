import { describe, expect, it } from 'vitest';
import { exportSlotBytes, importInto, listSlotInfos, toSaveResult, toSlotInfo } from './facade';
import { makeRig } from './testkit';

describe('UI facade mapping (src/ui/api.ts shapes)', () => {
  it('maps outcomes to SaveResult with the finer code and the volatile flag', () => {
    expect(toSaveResult({ ok: true, status: 'ok', code: 'ok', message: 'Saved.' })).toEqual({ ok: true, status: 'ok', message: 'Saved.', code: 'ok' });
    expect(toSaveResult({ ok: true, status: 'unavailable', code: 'ok', message: 'x', volatile: true })).toMatchObject({ ok: true, status: 'unavailable', volatile: true });
    expect(toSaveResult({ ok: false, status: 'failed', code: 'quota', message: 'full' })).toMatchObject({ ok: false, status: 'failed', code: 'quota' });
  });

  it('slot cards carry what GDD 08 §7.6 shows', async () => {
    const r = makeRig();
    r.host.thumb = 'data:image/jpeg;base64,/9j/';
    await r.manager.autosave('season');
    await r.manager.saveTo('slot-2');
    await r.manager.saveTo('quick');
    const infos = await listSlotInfos(r.manager);
    expect(infos.map((i) => [i.slot, i.kind])).toEqual([['auto-1', 'auto'], ['quick', 'quick'], ['slot-2', 'manual']]);
    const auto = infos[0];
    expect(auto).toMatchObject({ label: 'Auto-save', trigger: 'Season change', species: 'lasius-niger', workers: 6, population: 6, thumbnail: 'data:image/jpeg;base64,/9j/', damaged: false, generation: 1 });
    expect(auto.seedCode).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(auto.version).toBeTruthy();
    expect(toSlotInfo((await r.manager.list()).value![1]).trigger).toBeUndefined();
  });

  it('exportSave bytes and importSave targets (slot or "now")', async () => {
    const r = makeRig();
    await r.manager.saveTo('slot-1');
    const ex = await exportSlotBytes(r.manager, 'slot-1');
    expect(ex.ok && ex.bytes!.length > 100).toBe(true);
    expect((await exportSlotBytes(r.manager, 'current')).ok).toBe(true);
    expect((await exportSlotBytes(r.manager, 'slot-5')).ok).toBe(false);
    const into = await importInto(r.manager, ex.bytes!, 'slot-5');
    expect(into).toMatchObject({ ok: true, code: 'ok' });
    const now = await importInto(r.manager, ex.bytes!, 'now');
    expect(now.ok).toBe(true);
    expect(r.host.adopted).toHaveLength(1);
    expect(await importInto(r.manager, new Uint8Array(40), 'now')).toMatchObject({ ok: false, status: 'failed', code: 'foreign' });
  });
});
