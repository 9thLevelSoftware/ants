// Ready-to-paste replacement for src/render/slots/fxSlot.ts (owned by the app integration; scent-fx may not edit it).
// The whole file becomes this one line, so `registerRenderer('fx', () => new FxSlot())` in src/render/index.ts keeps
// working unchanged and the slot draws the scent view, the overlays and the particle effects:
//
//   export { FxRenderer as FxSlot } from '@/render/fx/overlays/FxRenderer';
//
// Overlay host registration (src/game/Game.ts, after `this.registry.init(...)` in boot(); unregister in dispose):
//
//   import { overlayHostOf } from '@/render/fx/overlays/FxRenderer';
//   import { registerOverlayHost } from '@/ui/overlays/state';
//   const fxHost = overlayHostOf(this.registry);
//   this.unregisterOverlayHost = fxHost ? registerOverlayHost(fxHost) : () => {};
//
// Optional: the overlay palette from Settings > Accessibility (`fxHost.setPalette(id)`), and effects on in `?test=1`
// runs that need them (`fxHost.setEffects({ particles: true, motes: true })`).
//
// This module re-exports under the slot's name so the replacement is type-checked here.
export { FxRenderer as FxSlot } from './FxRenderer';
