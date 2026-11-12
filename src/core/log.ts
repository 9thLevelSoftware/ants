// Levelled logger. Default level is 'info', or 'silent' when running under Vitest (so test output stays
// readable); tests that want output call setLogLevel(). A custom sink can capture lines (in-game console, tests).

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
export type LogSink = (level: Exclude<LogLevel, 'silent'>, tag: string, args: unknown[]) => void;

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** True under Vitest (it sets VITEST in the environment and in import.meta.env). */
function underVitest(): boolean {
  const env = (import.meta as { env?: Record<string, unknown> }).env;
  if (env && env.VITEST) return true;
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return !!proc?.env?.VITEST;
}

const consoleSink: LogSink = (level, tag, args) => {
  const fn = level === 'debug' ? console.debug : level === 'info' ? console.info : level === 'warn' ? console.warn : console.error;
  fn(`[${tag}]`, ...args);
};

let currentLevel: LogLevel = underVitest() ? 'silent' : 'info';
let currentSink: LogSink = consoleSink;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

/** Replaces the output sink; pass null to restore the console. */
export function setLogSink(sink: LogSink | null): void {
  currentSink = sink ?? consoleSink;
}

function write(level: Exclude<LogLevel, 'silent'>, tag: string, args: unknown[]): void {
  if (RANK[level] < RANK[currentLevel]) return;
  currentSink(level, tag, args);
}

/** Logger whose lines are prefixed with `[tag]`. Level and sink are global and read at call time. */
export function createLogger(tag: string): Logger {
  return {
    debug: (...args) => write('debug', tag, args),
    info: (...args) => write('info', tag, args),
    warn: (...args) => write('warn', tag, args),
    error: (...args) => write('error', tag, args),
  };
}
