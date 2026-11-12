import { describe, expect, it } from 'vitest';
import { COMMAND_TYPES } from '@/sim/types';
import { commandHandler, handledCommandTypes } from '@/sim/commands';
import { SYSTEMS } from '@/sim/systems';

describe('command handlers', () => {
  it('has a handler for every Command type and nothing else', () => {
    for (const t of COMMAND_TYPES) expect(typeof commandHandler(t), t).toBe('function');
    expect([...handledCommandTypes()].sort()).toEqual([...COMMAND_TYPES].sort());
  });
});

describe('system list', () => {
  it('has unique system names', () => {
    const names = SYSTEMS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('starts with commands and ends with lifecycle (architecture §3)', () => {
    expect(SYSTEMS[0].name).toBe('commands');
    expect(SYSTEMS[SYSTEMS.length - 1].name).toBe('lifecycle');
  });
});
