/**
 * Local equivalents of the sub-renderer contract (contracts guidance §8: RenderContext / FrameInfo). The real
 * registry (src/render/index.ts, task F3b) passes supersets of these, so AntRenderer plugs in unchanged.
 */
import type { Object3D, PerspectiveCamera } from 'three';
import type { QualityPreset } from '@/render/app/quality';
import type { AntSimSource, WalkerPose } from './simAdapter';

export interface AntRenderContext {
  scene: Object3D;
  camera: PerspectiveCamera;
  quality: QualityPreset;
  /** Used for the viewport height when the frame does not give one. */
  renderer?: { domElement: { height: number } };
}

export interface AntFrameInfo {
  /** Real seconds since the last frame (pose blending, up smoothing). */
  dt: number;
  /** Animation clock, seconds (antenna rhythms, idle fidgets). Frozen in deterministic screenshots. */
  time: number;
  /** Tick interpolation 0..1 between prevPos/pos. */
  alpha: number;
  sim?: AntSimSource | null;
  camera?: PerspectiveCamera;
  /** Drawing-buffer height in px (projected-size LOD). */
  viewportHeightPx?: number;
  underground?: boolean;
  /** The possessed ant's per-frame predicted pose (drawn instead of its tick-interpolated pose); null = none. */
  possessedPose?: WalkerPose | null;
  /** Opacity of the possessed ant from the third-person camera fade (GDD 01 6.5), 0..1; default 1. */
  subjectOpacity?: number;
  /** Hover / inspect highlights (null = none); when given they replace setHover / setInspect for this frame. */
  hover?: PickTarget | null;
  inspect?: PickTarget | null;
  /** Photo mode with 'Hide markers and outlines' on: the possessed ant draws without its possession rim (GDD 01 6.9). */
  hidePossessedHighlight?: boolean;
}

/** What the hover / inspect highlight points at. */
export interface PickTarget { kind: 'ant' | 'brood' | 'item'; id: number }

export interface AntRenderStats {
  ants: number;
  /** Ants in or fading out of the camera-to-subject cone this frame, and of those the ones not drawn at all (occluderFade.ts). */
  faded?: number;
  hiddenAnts?: number;
  /** Debug: the fade rule had a subject this frame (0 / 1) and the largest weight it gave an ant. */
  fadeOn?: number;
  fadeMaxWeight?: number;
  /** Debug: camera xyz, subject xyz and length (mm) the fade rule used. */
  fadeDbg?: number[];
  visible: [number, number, number, number];
  culled: number;
  dropped: number;
  wings: number;
  carried: number;
  looseItems: number;
  drawCalls: number;
  triangles: number;
  /** CPU ms of the last update (sampling, smoothing, culling, LOD, buffer fill). */
  cpuMs: number;
  /** Of which: sampling, smoothing, culling and staging (pass 1). */
  sampleMs: number;
  /** Of which: LOD selection, writing the instance attributes and flagging their upload ranges (pass 2). */
  uploadMs: number;
  variants: number;
  buildMs: number;
}
