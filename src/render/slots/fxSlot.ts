// Registry slot 'fx' (wire-stage2): the scent view, the world overlays (temperature, moisture, threats, dig plans) and
// the particle effects (src/render/fx/overlays/FxRenderer). It is also the UI's overlay host: Game registers it with
// registerOverlayHost (src/ui/overlays/state.ts) after the registry exists. Markers, dig-plan outlines and ghosts are
// drawn by the views layer's MarkerRenderer (src/render/fx/markers); the dig-plans overlay only switches that layer.
export { FxRenderer as FxSlot } from '@/render/fx/overlays/FxRenderer';
