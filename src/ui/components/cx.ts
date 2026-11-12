// Tiny class-name joiner: cx('a', cond && 'b', undefined) -> 'a b'.
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
