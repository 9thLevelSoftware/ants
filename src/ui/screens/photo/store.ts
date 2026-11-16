// Photo mode's UI contract (GDD 08 7.9): a plain read-out the game's photo controller (src/game/views/photo) publishes
// while photo mode is open, and the actions the panel calls. The UI never reads the camera rig or the simulation.
import { signal } from '@preact/signals';

export type PhotoGuides = 'off' | 'thirds' | 'centre';
export const PHOTO_GUIDES: readonly PhotoGuides[] = ['off', 'thirds', 'centre'];
export type PhotoFocusMode = 'manual' | 'centre' | 'subject';

export interface PhotoLensUi {
  /** Full-frame equivalent, mm. */
  focalMm: number;
  fNumber: number;
  /** Focus distance, BU. */
  focusBu: number;
  exposureEV: number;
  rollDeg: number;
}

export interface PhotoRangesUi {
  focalMm: [number, number];
  fNumber: [number, number];
  focusBu: [number, number];
  exposureEV: [number, number];
  rollDeg: [number, number];
}

/** The captured image on its way to the player (and the routes left when the browser refused the download). */
export interface PhotoPreviewUi {
  /** Object URL of the PNG (shown in an <img>: right-click to save always works). */
  url: string;
  filename: string;
  width: number;
  height: number;
  bytes: number;
  /** 2 when the image was rendered at twice the canvas size. */
  scale: number;
  /** 2x was asked for and the GPU did not allow it. */
  reduced: boolean;
  /** 'started' (download triggered), 'skipped' or 'failed' (blocked): the preview then explains the other routes. */
  download: 'started' | 'skipped' | 'failed';
  /** One line about what happened to the file. */
  note: string;
  /** New tabs can work here: false in a frame that cannot open them (the button then says why instead of trying). */
  canOpenTab: boolean;
  /** Result of the last Open in new tab / Copy, or null. */
  message: string | null;
}

export interface PhotoUi {
  active: boolean;
  lens: PhotoLensUi;
  ranges: PhotoRangesUi;
  focusMode: PhotoFocusMode;
  look: string;
  looks: { id: string; label: string }[];
  guides: PhotoGuides;
  hideMarkers: boolean;
  orbit: boolean;
  /** The photo's subject ("Queen #12"), null when there is none. */
  subject: string | null;
  caps: {
    /** The post chain's depth of field exists at this quality: aperture and focus blur work. */
    depthOfField: boolean;
    vignette: boolean;
    /** Largest capture scale the GPU allows for the current canvas (1 or 2). */
    maxScale: number;
    /** Canvas size in pixels (capture size at scale 1). */
    width: number;
    height: number;
    quality: string;
  };
  /** Scale the next capture uses (1 or 2); 2 is only honoured when `caps.maxScale` allows it. */
  captureScale: number;
  capturing: boolean;
  preview: PhotoPreviewUi | null;
  error: string | null;
}

export interface PhotoActions {
  setFocalMm(v: number): void;
  setFNumber(v: number): void;
  setFocusBu(v: number): void;
  setExposureEV(v: number): void;
  setRollDeg(v: number): void;
  setFocusMode(m: PhotoFocusMode): void;
  /** Frame the subject: aim the camera at it and focus on it. */
  frameSubject(): void;
  setOrbit(on: boolean): void;
  setLook(id: string): void;
  setGuides(g: PhotoGuides): void;
  setHideMarkers(on: boolean): void;
  resetLens(): void;
  setCaptureScale(n: number): void;
  capture(scale: number): Promise<unknown>;
  /** Preview: try the file download again. */
  saveAgain(): void;
  openInTab(): void;
  copyImage(): Promise<void>;
  closePreview(): void;
  exit(): void;
}

/** What the panel shows now; null outside photo mode. */
export const photoUi = signal<PhotoUi | null>(null);
/** Set by the game when a game starts. */
export const photoActions = signal<PhotoActions | null>(null);

export function publishPhoto(ui: PhotoUi | null): void {
  photoUi.value = ui;
}
