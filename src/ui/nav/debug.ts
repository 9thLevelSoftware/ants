// window.__nav (?test=1 only): what the navigation layer sees, for scripted checks.
import { effectiveLayerReport } from './report';

export function installNavDebug(win: Window = window): () => void {
  (win as unknown as { __nav?: unknown }).__nav = effectiveLayerReport;
  return () => { delete (win as unknown as { __nav?: unknown }).__nav; };
}
