// Camera constants from GDD 01 sections 2 and 6 (presentation-side, real seconds). L = body length of the
// target ant in BU; the rigs convert to millimetres with the species BU. The GDD names
// `src/game/config/camera.ts` as their home; that path belongs to the Game task, so they live here until it
// re-exports or moves them.

export const CAM_UP_TAU = 0.35;
export const CAM_UP_TAU_REDUCED = 0.6;
export const CAM_PIVOT_UP_L = 0.5;
export const CAM_LOOKAHEAD_T = 0.35;
export const CAM_LOOKAHEAD_MAX_L = 1.5;
/** Look-ahead in tunnel states, along the velocity (BU). */
export const CAM_TUNNEL_LOOKAHEAD_BU = 3;
export const CAM_PUSHOUT_TAU = 0.4;
/**
 * Fastest camera motion relative to the pivot, L per real s (views task): no frame-to-frame jumps. GDD 6.2 makes
 * pull-in immediate; here it is immediate only where clearance needs it (the f >= 0.5 R guard), otherwise it takes
 * a few frames at this speed.
 */
export const CAM_MAX_REL_SPEED_L = 20;
/** A target that moved more than this (L) since the last frame was teleported: the rig snaps behind it. */
export const CAM_SNAP_JUMP_L = 3;
export const CAM_AUTOFOLLOW_DELAY_S = 1.5;
export const CAM_AUTOFOLLOW_TAU = { gentle: 1.2, strong: 0.6 } as const;
export const CAM_AUTOFOLLOW_MAX_DEG_S = 60;
export const CAM_AUTOFOLLOW_MIN_SPEED_BU = 0.5;
export const CAM_AUTOFOLLOW_MAX_TURN_DEG_S = 90;
export const CAM_RECENTRE_S = 0.3;
export const CAM_STATE_HOLD_S = 0.3;
export const CAM_STATE_BLEND_S = 0.5;
export const CAM_STATE_BLEND_S_REDUCED = 1.5;
export const CAM_REDUCED_FOV_SPREAD_DEG = 6;

/** Footstep tremor (GDD 01 6.1, the only camera shake): amplitude in L, duration real s, frequency Hz; none in reduced motion. */
export const CAM_TREMOR_AMP_L = 0.05;
export const CAM_TREMOR_S = 0.4;
export const CAM_TREMOR_HZ = 14;

/** Camera sphere radius: clamp(0.25 L, 0.1, 0.5) BU; observer 0.3 BU. A camera centre must keep f >= 0.5 radius. */
export const CAM_RADIUS_L = 0.25;
export const CAM_RADIUS_MIN_BU = 0.1;
export const CAM_RADIUS_MAX_BU = 0.5;
export const CAM_OBSERVER_RADIUS_BU = 0.3;
/**
 * Collision sphere cap, BU (views task, deviation note for GDD 6.1): the carve field's cavity distance saturates at
 * 0.5 BU, so a sphere of the full 0.5 BU (queens, majors) never fits inside a tunnel. Traces use at most this radius;
 * the clearance guarantee (f >= 0.5 x the GDD radius) is unchanged.
 */
export const CAM_RADIUS_FIELD_CAP_BU = 0.35;
/** The guaranteed clearance of a camera centre, as a fraction of its radius (GDD 6.1). */
export const CAM_MIN_CLEARANCE_R = 0.5;

/** Near = clamp(0.02 x distance, 0.005 BU, 0.2 BU) (GDD 6.1), and never more than this fraction of the camera
 * radius so the near-plane corners stay inside the guaranteed clearance at FOV <= 80. */
export const CAM_NEAR_K = 0.02;
export const CAM_NEAR_MIN_BU = 0.005;
export const CAM_NEAR_MAX_BU = 0.2;
export const CAM_NEAR_RADIUS_FRACTION = 0.25;
export const CAM_FAR_BU = 8000;

/** Environment state probe: 8 lateral rays of 4 L in the tangent plane. */
export const CAM_PROBE_RAYS = 8;
export const CAM_PROBE_LEN_L = 4;
export const CAM_PROBE_TUNNEL_L = 1.6;
export const CAM_PROBE_TUNNEL_HITS = 5;
export const CAM_PROBE_CREVICE_L = 0.7;
export const CAM_PROBE_CREVICE_HITS = 7;
/** Rays start this far above the ant along up, so they do not graze the floor it stands on. */
export const CAM_PROBE_LIFT_L = 0.3;

/** Tunnel path boom (GDD 6.4). */
export const BOOM_SAMPLE_L = 0.1;
export const BOOM_ENTRIES = 64;
export const BOOM_RAISE_L = 0.35;
export const BOOM_REVERSAL_L = 0.3;
export const BOOM_REVERSAL_S = 0.5;
export const BOOM_LOOK_YAW_DEG = 70;
export const BOOM_LOOK_PITCH_DEG = 35;
export const BOOM_SPRING_TAU = 0.8;
export const BOOM_SPRING_DELAY_S = 1.0;
/**
 * Views-task retune on the real nest (deviation note for GDD 01 6.4): the boom's collision is checked along the
 * breadcrumb path every BOOM_CHECK_STEP_L (not by one straight trace from the pivot, which cuts every bend), the
 * camera sphere must keep BOOM_CLEAR_R x R there (above the 0.5 R guarantee), and the 0.35 L raise never goes past
 * BOOM_CENTRE_FRACTION of the free gap above the floor (a queen-sized tunnel is barely taller than the queen).
 */
export const BOOM_CHECK_STEP_L = 0.25;
export const BOOM_CLEAR_R = 0.75;
export const BOOM_CENTRE_FRACTION = 0.5;
/** Around a bend the boom comes in to keep the ant in sight, but not closer than this (L). */
export const BOOM_MIN_SIGHT_L = 1.2;

/**
 * Path assist (views task): an orbit (open / chamber) pulled in below PATH_ASSIST_ON of its wanted distance, e.g. by
 * a chamber ceiling barely higher than a queen, blends over PATH_ASSIST_BLEND_S toward the boom path behind the ant
 * (her own route: known free space); it hands back above PATH_ASSIST_OFF.
 */
export const PATH_ASSIST_ON = 0.4;
export const PATH_ASSIST_OFF = 0.7;
export const PATH_ASSIST_BLEND_S = 0.4;

/**
 * Pinch fallback (spike-nest 5.10): when the camera is squeezed closer than PINCH_DIST_L to the pivot for
 * PINCH_HOLD_S it moves over the ant (along its up, at most PINCH_HEIGHT_L), looking down with the heading at the
 * top of the screen; it leaves once the boom / orbit would allow PINCH_EXIT_L for PINCH_HOLD_S. Blend PINCH_BLEND_S.
 */
export const PINCH_DIST_L = 0.35;
export const PINCH_EXIT_L = 0.7;
export const PINCH_HOLD_S = 0.5;
export const PINCH_HEIGHT_L = 1.5;
export const PINCH_BLEND_S = 0.3;

/**
 * Ceiling comfort (spike-nest 5.9, an option): with the ant upside down the view's up blends toward world up,
 * from none at ant-up y = COMFORT_UP_Y_START to full at COMFORT_UP_Y_FULL; orbit and collision stay in the ant's frame.
 */
export const COMFORT_UP_Y_START = -0.3;
export const COMFORT_UP_Y_FULL = -0.7;

/** Fade rules (GDD 6.5). */
export const FADE_FULL_L = 1.0;
export const FADE_MIN_L = 0.5;
export const FADE_MIN_OPACITY = 0.3;
export const FADE_CREVICE_OPACITY = 0.5;
export const OCCLUSION_TRIGGER_S = 0.15;
export const OCCLUSION_RELEASE_S = 0.3;
export const OCCLUSION_CAPSULE_L = 0.8;
export const OTHERS_CAPSULE_L = 0.6;
/**
 * Occlusion cutaway shape (views-task deviation from GDD 01 6.5 rule 3, decided on the real nest): a cone from the
 * camera (radius OCCLUSION_CONE_START x the end radius) to a point OCCLUSION_CONE_END_L short of the thorax (radius
 * OCCLUSION_CONE_RADIUS_L), not a 0.8 L capsule. Only walls really between the camera and the ant are dithered; the
 * floor under the ant and the tunnel walls around the camera stay solid, so underground the sky never shows.
 */
export const OCCLUSION_CONE_RADIUS_L = 0.35;
export const OCCLUSION_CONE_END_L = 0.5;
export const OCCLUSION_CONE_START = 0.35;

/** View transitions (GDD 01 section 2). */
export const CAM_SWITCH_MIN_S = 0.4;
export const CAM_SWITCH_MAX_S = 0.9;
export const CAM_SWITCH_BU_PER_S = 300;
export const CAM_SWITCH_FADE_DIST_BU = 150;
export const CAM_SWITCH_DIP_HALF_S = 0.15;
export const CAM_TO_COLONY_S = 0.8;
/** A release keeps the camera (GDD 01 §2) when it is within this many body lengths of the ant and sees it. */
export const CAM_HANDOVER_KEEP_MAX_L = 12;
/** Reduced motion: a view switch is a crossfade this long (GDD 08 2.4: 200 ms). */
export const CAM_REDUCED_CROSSFADE_S = 0.2;

/** Observer (GDD 6.6). */
export const OBS_SPEED_BASE_BU = 4;
export const OBS_SPEED_PER_HEIGHT = 1.2;
export const OBS_SPEED_CAP_BU = 800;
export const OBS_FAST_MULT = 4;
export const OBS_ACCEL_TAU = 0.15;
export const OBS_BOUNDS_MARGIN_BU = 50;
export const OBS_MAX_ALTITUDE_BU = 1200;
export const OBS_PITCH_FREE_DEG: [number, number] = [-89, 89];
export const OBS_PITCH_FOLLOW_DEG: [number, number] = [-10, 85];
export const OBS_FOLLOW_DIST_L: [number, number, number] = [2, 6, 80]; // min, default, max
export const OBS_FOV_DEG = 60;
export const OBS_FOLLOW_LOSS_HOLD_S = 2;
/**
 * The follow orbit's centre sits this far above the subject along its up (L), but never past BOOM_CENTRE_FRACTION of
 * the free gap above it (views-task review fix: in a queen-sized shaft 0.5 L above the queen is inside the soil).
 */
export const OBS_FOLLOW_LIFT_L = 0.5;

/** Colony view (GDD 6.7). */
export const CV_PITCH_DEG: [number, number, number] = [30, 55, 89];
export const CV_DIST_BU: [number, number, number] = [30, 200, 1500];
export const CV_ENTRY_DIST_BU = 120;
/** The colony camera's boom starts this far above the target (so a pulled-in camera still looks down at it). */
export const CV_BOOM_LIFT_BU = 2;
export const CV_FOV_DEG = 45;
export const CV_PAN_PER_DIST = 0.8;
export const CV_SLICE_STEP_BU = 2;
export const CV_SLICE_FAST_MULT = 5;
export const CV_SLICE_BELOW_DEEPEST_BU = 10;
export const CV_RCUT_BU: [number, number, number] = [40, 120, 400];

/** Photo mode: GDD 01 6.9 defers camera and lens values to GDD 08 7.9. */
export const PHOTO_SPEED_BU_S = 4;
/** Shift and Ctrl speed multipliers. */
export const PHOTO_FAST_MULT = 5;
export const PHOTO_SLOW_MULT = 0.2;
/** Soft wall around the entry point. */
export const PHOTO_MAX_RADIUS_BU = 400;
export const PHOTO_COLLISION_BU = 0.3;
/** Focal length range (mm, full-frame equivalent); vertical FOV = 2 atan(PHOTO_SENSOR_HALF_HEIGHT_MM / f). */
export const PHOTO_FOCAL_MM: [number, number] = [24, 200];
export const PHOTO_SENSOR_HALF_HEIGHT_MM = 12;
export const PHOTO_FOCUS_BU: [number, number] = [0.5, 200];
/** Aperture stops f/1.4 .. f/22; the aperture is continuous between them; bokeh scale = PHOTO_BOKEH_K / f-number. */
export const PHOTO_F_STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22] as const;
export const PHOTO_BOKEH_K = 9;
export const PHOTO_EXPOSURE_EV: [number, number] = [-3, 3];
export const PHOTO_ROLL_DEG: [number, number] = [-45, 45];
export const PHOTO_ROLL_DEG_S = 45;
export const PHOTO_EXPOSURE_STEP_EV = 0.25;
