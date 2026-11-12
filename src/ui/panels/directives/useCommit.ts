// A control value with a local draft: it follows the UI at once and is committed to the game 300 ms after the last
// change (GDD 08 4.2: "pointer up, or 300 ms after the last key step"), once per burst. The draft is dropped when the
// snapshot catches up with it, or after a second and a half, so a refused order does not leave a wrong control behind.
import { useEffect, useRef, useState } from 'preact/hooks';

export const COMMIT_MS = 300;
const SETTLE_MS = 1500;

export function useCommit<T>(source: T, commit: (v: T) => void, equals: (a: T, b: T) => boolean = (a, b) => a === b): [T, (v: T) => void] {
  const [draft, setDraft] = useState<T | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const settle = useRef<number | undefined>(undefined);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => { if (draft !== null && equals(draft, source)) setDraft(null); }, [source]);
  useEffect(() => () => { window.clearTimeout(timer.current); window.clearTimeout(settle.current); }, []);
  const set = (v: T) => {
    setDraft(v);
    window.clearTimeout(timer.current);
    window.clearTimeout(settle.current);
    timer.current = window.setTimeout(() => {
      commitRef.current(v);
      settle.current = window.setTimeout(() => setDraft(null), SETTLE_MS);
    }, COMMIT_MS);
  };
  return [draft ?? source, set];
}
