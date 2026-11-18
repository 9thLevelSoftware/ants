// Manifest ids of the acquired audio files (public/assets/manifest.json, GDD 08 §13.7). The code never depends on
// any one of them existing: each use has a synthesised fallback (cueTable.ts, ambience layers).

export const BED_FILES = {
  birdsong_day: 'audio/ambience/birdsong_day',
  crickets_night: 'audio/ambience/crickets_night',
  rain_light: 'audio/ambience/rain_light',
  rain_heavy: 'audio/ambience/rain_heavy',
  wind_leaves: 'audio/ambience/wind_leaves',
  street_suburban: 'audio/ambience/street_suburban',
  traffic_distant: 'audio/ambience/traffic_distant',
  playground_distant: 'audio/ambience/playground_distant',
  room_fridge_hum: 'audio/ambience/room_fridge_hum',
  underground_rumble: 'audio/ambience/underground_rumble',
} as const;

export const SFX = {
  soil_scrape_01: 'audio/sfx/soil_scrape_01',
  soil_scrape_02: 'audio/sfx/soil_scrape_02',
  gravel_grit_01: 'audio/sfx/gravel_grit_01',
  gravel_grit_02: 'audio/sfx/gravel_grit_02',
  gravel_grit_03: 'audio/sfx/gravel_grit_03',
  wood_creak_01: 'audio/sfx/wood_creak_01',
  wood_creak_02: 'audio/sfx/wood_creak_02',
  wood_creak_03: 'audio/sfx/wood_creak_03',
  wood_rasp_01: 'audio/sfx/wood_rasp_01',
  wood_rasp_02: 'audio/sfx/wood_rasp_02',
  crunch_01: 'audio/sfx/crunch_01',
  crunch_02: 'audio/sfx/crunch_02',
  crunch_03: 'audio/sfx/crunch_03',
  water_drip_01: 'audio/sfx/water_drip_01',
  water_drip_02: 'audio/sfx/water_drip_02',
  wet_splat_01: 'audio/sfx/wet_splat_01',
  wet_splat_02: 'audio/sfx/wet_splat_02',
  thud_giant_step_01: 'audio/sfx/thud_giant_step_01',
  thud_giant_step_02: 'audio/sfx/thud_giant_step_02',
  lawnmower_loop: 'audio/sfx/lawnmower_loop',
  lawnmower_push_loop: 'audio/sfx/lawnmower_push_loop',
  car_pass_01: 'audio/sfx/car_pass_01',
  car_pass_02: 'audio/sfx/car_pass_02',
  broom_sweep_01: 'audio/sfx/broom_sweep_01',
  broom_sweep_02: 'audio/sfx/broom_sweep_02',
  insect_wing_buzz_01: 'audio/sfx/insect_wing_buzz_01',
  insect_wing_buzz_02: 'audio/sfx/insect_wing_buzz_02',
  cricket_chirp_01: 'audio/sfx/cricket_chirp_01',
  cricket_chirp_02: 'audio/sfx/cricket_chirp_02',
  stridulation_grasshopper_01: 'audio/sfx/stridulation_grasshopper_01',
  ui_click_01: 'audio/sfx/ui_click_01',
  ui_click_02: 'audio/sfx/ui_click_02',
  ui_click_03: 'audio/sfx/ui_click_03',
  ui_hover_01: 'audio/sfx/ui_hover_01',
  ui_switch_01: 'audio/sfx/ui_switch_01',
} as const;

export type BedFileId = (typeof BED_FILES)[keyof typeof BED_FILES];
export type SfxFileId = (typeof SFX)[keyof typeof SFX];
export type AudioFileId = BedFileId | SfxFileId;

export const ALL_SFX_IDS: SfxFileId[] = Object.values(SFX);
export const ALL_BED_IDS: BedFileId[] = Object.values(BED_FILES);

/**
 * Files recorded near people must pass the §13.7 intelligibility check before they may play. The manifest marks a
 * passed file with `speechCheck: "passed"`; nothing carries that mark yet, so `playground_distant` never plays.
 * (Since the provenance pass `playground_distant` is a rendered, voice-less bed, tools/audio/sounds/beds.mjs; the gate
 * is kept as it was: lifting it would change what the Distant voices setting plays, which is not that pass's call.)
 */
export const SPEECH_CHECKED_FILES: AudioFileId[] = [BED_FILES.playground_distant];
