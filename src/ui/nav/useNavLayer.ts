// The hook form of registerNavLayer for a component that owns a root element.
import { useEffect } from 'preact/hooks';
import { registerNavLayer, type NavLayerSpec } from './layers';

/**
 * Registers the component's root as a navigation layer while it is mounted:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useNavLayer(ref, { id: 'overwinter', rank: 50, claim: 'always', kind: 'screen' });
 */
export function useNavLayer(ref: { current: HTMLElement | null }, spec: Omit<NavLayerSpec, 'root' | 'selector'>): void {
  useEffect(() => registerNavLayer({ ...spec, root: () => ref.current }), [spec.id]);
}
