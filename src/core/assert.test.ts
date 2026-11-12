import { describe, expect, it } from 'vitest';
import { AssertionError, assert, assertFinite, unreachable } from './assert';
import { createLogger, getLogLevel, setLogLevel, setLogSink } from './log';

describe('assert', () => {
  it('assert passes truthy values and throws AssertionError with the message otherwise', () => {
    expect(() => assert(1, 'x')).not.toThrow();
    expect(() => assert(0, 'zero is falsy')).toThrow(AssertionError);
    expect(() => assert(null, 'gone')).toThrow('gone');
    expect(() => assert(false)).toThrow('assertion failed');
    let built = 0;
    assert(true, () => `never ${++built}`);
    expect(built).toBe(0); // lazy message is not built on success
    expect(() => assert(false, () => 'lazy')).toThrow('lazy');
  });

  it('assertFinite returns the value and rejects NaN and infinities', () => {
    expect(assertFinite(3.5)).toBe(3.5);
    expect(() => assertFinite(Number.NaN, 'ant.pos.x')).toThrow('ant.pos.x is not finite: NaN');
    expect(() => assertFinite(-Infinity)).toThrow(AssertionError);
  });

  it('unreachable throws (used for exhaustive switches)', () => {
    type Kind = 'a' | 'b';
    const f = (k: Kind) => {
      switch (k) {
        case 'a': return 1;
        case 'b': return 2;
        default: return unreachable(k);
      }
    };
    expect(f('b')).toBe(2);
    expect(() => f('c' as Kind)).toThrow(/unreachable/);
  });
});

describe('log', () => {
  it('is silent by default under Vitest', () => {
    expect(getLogLevel()).toBe('silent');
  });

  it('filters by level, prefixes the tag and can be redirected to a sink', () => {
    const lines: string[] = [];
    setLogSink((level, tag, args) => lines.push(`${level} ${tag} ${args.join(' ')}`));
    try {
      const log = createLogger('nest');
      log.error('hidden while silent');
      setLogLevel('warn');
      log.info('too low');
      log.warn('dig stalled', 3);
      log.error('collapse');
      setLogLevel('debug');
      log.debug('detail');
      expect(lines).toEqual(['warn nest dig stalled 3', 'error nest collapse', 'debug nest detail']);
    } finally {
      setLogLevel('silent');
      setLogSink(null);
    }
  });
});
