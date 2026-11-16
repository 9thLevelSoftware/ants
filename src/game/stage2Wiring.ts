// Game-side wiring of the Stage 2 renderers (task wire-stage2): the fx slot as the UI's overlay host (with the
// overlay palette from Settings > Accessibility), the comfort settings the creature renderer reads from the frame,
// and the creature slot's look read-out for the debug API. Plain functions so Game.ts only calls them.
import type { ComfortSettings, RenderRegistry } from '@/render';
import { overlayHostOf, type FxRenderer } from '@/render/fx/overlays/FxRenderer';
import { comfortFor, type CreatureLookInfo } from '@/render/creatures';
import type { CreatureKind } from '@/sim/types';
import { clearOverlays, registerOverlayHost } from '@/ui/overlays/state';
import type { GameSettings, SettingsStore } from './settings/settings';

/** The comfort part of the accessibility settings (the frame carries it to the creature renderer). */
export function comfortOf(s: GameSettings): ComfortSettings {
  const a = s.accessibility;
  return { spiderComfort: a.spiderComfort, comfortMites: a.comfortMites, comfortCentipedes: a.comfortCentipedes };
}

/** Comfort settings for the frame, rebuilt only when the accessibility section changed (no per-frame allocation). */
export class ComfortFeed {
  private src: GameSettings['accessibility'] | null = null;
  private value: ComfortSettings | null = null;

  get(s: GameSettings): ComfortSettings {
    if (s.accessibility !== this.src || !this.value) { this.src = s.accessibility; this.value = comfortOf(s); }
    return this.value;
  }
}

/** The fx slot's renderer, or null when the slot runs its debug fallback. */
export function fxHostOf(registry: RenderRegistry | null | undefined): FxRenderer | null {
  return registry ? overlayHostOf(registry) : null;
}

/**
 * Registers the fx renderer as the UI's overlay host and keeps its palette on the accessibility setting. Returns the
 * undo function (unregister + unsubscribe).
 */
export function installOverlayHost(registry: RenderRegistry, settings: SettingsStore): () => void {
  const fx = fxHostOf(registry);
  if (!fx) return () => {};
  fx.setPalette(settings.get().accessibility.overlayPalette);
  const unregister = registerOverlayHost(fx);
  const unsubscribe = settings.subscribe((s, changed) => {
    if (changed.some((p) => p.startsWith('accessibility'))) fx.setPalette(s.accessibility.overlayPalette);
  });
  return () => { unsubscribe(); unregister(); };
}

/** Switches every overlay off (the end of a game): the UI state and the drawn overlays together. */
export { clearOverlays };

/**
 * GDD 08 §12: a creature drawn under spider comfort is never auto-framed by the camera. Decision: this covers every
 * comfort level other than `off` (softened, abstract, marker), not only `softened`. For any future automatic framing
 * (event cameras, photo-mode subject suggestions); player-chosen follows are not automatic and stay allowed.
 */
export function mayAutoFrame(kind: CreatureKind, comfort: ComfortSettings): boolean {
  return comfortFor(kind, comfort) === 'off';
}

/** What creature `id` was drawn as in the last frame (GDD 08 E17), null when not drawn or no real creature slot. */
export function creatureLookOf(registry: RenderRegistry | null | undefined, id: number): CreatureLookInfo | null {
  const r = registry?.entries.find((e) => e.slot === 'creatures')?.renderer as { lookOf?: (id: number) => CreatureLookInfo | null } | undefined;
  return typeof r?.lookOf === 'function' ? r.lookOf(id) : null;
}
