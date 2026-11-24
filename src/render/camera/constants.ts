// Camera constants from GDD 01 sections 2 and 6 (presentation-side, real seconds). L = body length of the
// target ant in BU; the rigs convert to millimetres with the species BU. The GDD names
// `src/game/config/camera.ts` as their home; that path belongs to the Game task, so they live here until it
// re-exports or moves them.

export const CAM_UP_TAU = 0.35;
/**
 * Slope lift (look pass 3, S10): the open-state camera sits in the surface's tangent plane behind the ant, so on a slope the
 * ant climbs the picture looks up the slope at the sky, the ant a speck at the lower edge. The orbit elevation is raised by
 * CAM_SLOPE_LIFT_K x the slope of the camera's own offset below the pivot (the camera stands downhill of the ant, so the view looks up
 * the slope; at most CAM_SLOPE_LIFT_MAX_DEG, eased over CAM_SLOPE_LIFT_TAU s), which levels the view. A camera on the flat or uphill
 * of the ant adds nothing, whichever way the ant faces.
 */
export const CAM_SLOPE_LIFT_K = 0.85;
export const CAM_SLOPE_LIFT_MAX_DEG = 40;
export const CAM_SLOPE_LIFT_TAU = 0.4;
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
/**
 * Tight rooms (look pass 3, stage1a strict). In a room barely higher than the camera sphere (a queen's cell whose ceiling is 0.4 mm
 * above her back) the pivot base, which sits just above the ant, has no room for a sphere. Two things follow:
 *  - the COLLISION sphere of the traces shrinks to what fits at the pivot base, down to this fraction of the GDD radius
 *    (never below: a sphere that small has no room anywhere), so the orbit and the boom can leave the pivot at all. This is a
 *    function of the pivot base alone (no easing, no memory), so a restarted rig shows the same picture as a settled one;
 *  - the camera is placed by `findClosePose` (closePose.ts) where a sphere of the GDD clearance does fit, so `radiusMm` and
 *    GDD 6.1's f >= 0.5 R stay the GDD's. Only when the room has no such place at all (lower than twice the clearance: no camera
 *    could stand in it) does the reported radius fall back to the shrunk one, and the rig says so (`ThirdPersonRig.clearanceHonoured`).
 */
export const CAM_TIGHT_MIN_SCALE = 0.08;
/** The close pose search: candidate distances (fractions of the wanted distance, nearest to the framing's first), yaws round the wanted side and elevations (degrees above the tangent plane). */
export const CAM_CLOSE_DIST_FRACTIONS = [1, 0.8, 0.62, 0.46, 0.34, 0.24] as const;
export const CAM_CLOSE_YAWS_DEG = [0, 20, -20, 45, -45, 75, -75, 110, -110, 150, -150, 180] as const;
export const CAM_CLOSE_ELEVS_DEG = [0, 12, 28, -12] as const;
/** A candidate place is centred between floor and ceiling when the free gap through it is below this many camera radii. */
export const CAM_CLOSE_GAP_R = 6;

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
/**
 * A small nest lets the colony camera come closer than CV_DIST_BU[0] (gate-close-app: at 30 BU the founding chamber
 * was about 110 px wide at 1280): the closest distance is CV_DIST_PER_NEST_SPAN x the nest's span, kept between
 * CV_DIST_SMALL_MIN_BU and CV_DIST_BU[0].
 */
export const CV_DIST_PER_NEST_SPAN = 2.5;
export const CV_DIST_SMALL_MIN_BU = 10;
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

/**
 * The founding chamber shot (look pass 5): behind the time-lapse, the outcome card and the failure card the camera hangs
 * above the cell and looks down into it through a slice cut (GDD 08 §7.10 "X-ray cutaway", GDD 06 §5.11 "a macro cutaway of
 * the sealed chamber"), so the queen, her brood and the first workers are all in view. The possession camera cannot make
 * this picture: the cell is barely higher than the queen, so the rig can only stand against her.
 */
export const FSHOT_FOV_DEG = 40;
/** Camera elevation over the horizontal, degrees. */
export const FSHOT_PITCH_DEG = 52;
/** The subject's bounding sphere fills 1 / this much of the frame height. */
export const FSHOT_FILL = 0.92;
/** Behind a card in the middle of the screen (outcome, failure): the cell is shown this far above the middle of the frame, filling this much. */
export const FSHOT_CARD_LIFT = 0.42;
export const FSHOT_CARD_FILL = 0.74;
/** The subject sphere never counts as smaller than this radius (BU): a lone queen still gets a chamber-sized frame. */
export const FSHOT_MIN_RADIUS_BU = 4.5;
/**
 * The slice plane sits this far above the highest animal's reference point (BU): the cut cap is a soil face with the cell as a hole in it, so
 * the plane has to pass through the cell, above every animal (an animal above the plane is cut away with the soil) and, in a cell barely
 * higher than the queen, as close above her back as it can be.
 */
export const FSHOT_CUT_ABOVE_BU = 0.6;
/** Slice radius as a multiple of the camera's horizontal reach (the cut must contain the line of sight). */
export const FSHOT_CUT_REACH = 1.8;
/** Opening yaw of the orbit (degrees) and its rate (GDD 08 §7.10: 0.02 revolutions per real second). */
export const FSHOT_YAW_DEG = 35;
export const FSHOT_ORBIT_REV_PER_S = 0.02;
/**
 * The shot's subject is eased, never taken raw: a worker walking into the cell, a nurse lifting an egg or the card opening (lift and fill
 * change) would otherwise move the camera tens of millimetres in one frame (GDD 01 section 6.3 "no frame-to-frame jumps"). Time constant of
 * the exponential approach, and the speed caps of the sphere's radius and of its centre (BU per s; the camera distance is about 3.2 times
 * the radius, so these keep the camera well under CAM_MAX_REL_SPEED_L body lengths per second).
 */
export const FSHOT_EASE_TAU_S = 0.5;
export const FSHOT_EASE_RADIUS_BU_PER_S = 6;
export const FSHOT_EASE_MOVE_BU_PER_S = 12;
/** Behind the shot the world is lit as at this hour whatever the clock says (GDD 06 section 5.11: warm light, constant). */
export const FSHOT_LIGHT_HOUR = 17.5;
/** Reduced motion (GDD 08 section 7.10): the camera stays on one still, refreshed (crossfade) this often in real seconds. */
export const FSHOT_STILL_S = 3;

/**
 * The cell camera (look pass 6, item 1): in a room barely larger than the ant (the founding cell: 18 x 10 x 16 mm round a queen of 8.5 mm)
 * the possession rig cannot back off: it ends up inside her radius and dithers her, or in the soil and shows the void through the cut cone.
 * GDD 01 6.2 to 6.5 and GDD 08 11.5 say nothing about a room this small, so the founding shot's rule applies (GDD 08 7.10 "X-ray cutaway",
 * GDD 06 5.11): the soil between the camera and the ant is cut away, not the camera pushed into her. While the rig's camera stands closer
 * to the ant than CELLCAM_ON_L (underground only) for CELLCAM_ON_S, the camera goes up and back over her at the founding shot's pitch, a slice
 * through the open space at her back hides the soil above it, and she is drawn solid (no fade, no occlusion cone). It hands back when the rig
 * has stood farther than CELLCAM_OFF_L for CELLCAM_OFF_S. The blend between the two poses takes CELLCAM_BLEND_S.
 */
export const CELLCAM_ON_L = 1.9;
export const CELLCAM_OFF_L = 2.4;
export const CELLCAM_ON_S = 0.3;
export const CELLCAM_OFF_S = 1.0;
export const CELLCAM_BLEND_S = 0.5;
/** The subject sphere (centre: the ant's thorax) has this radius in body lengths; the frame is filled CELLCAM_FILL by it. */
export const CELLCAM_RADIUS_L = 1.0;
export const CELLCAM_FILL = 0.9;
/** The slice plane passes this far (BU) above the ant's highest point, never above the roof of the cell over her. */
export const CELLCAM_CUT_ABOVE_BU = 0.12;
/** The slice centre and height are held on this grid (mm): the cut faces are rasterised again whenever they change. */
export const CELLCAM_CUT_GRID_MM = 3;
/** Auto-follow of the cell camera's azimuth (as CAM_AUTOFOLLOW_*): idle seconds, time constant, speed cap (degrees per second). */
export const CELLCAM_FOLLOW_DELAY_S = 1.5;
export const CELLCAM_FOLLOW_TAU_S = 1.2;
export const CELLCAM_FOLLOW_MAX_DEG_S = 60;
/** The camera's pitch in the cell: the founding shot's, FSHOT_PITCH_DEG. */
export const CELLCAM_MIN_RADIUS_BU = 0.5;
/**
 * The cell camera's side view, for an ant on a steep wall or tunnel slope (her up's height below CELLCAM_SIDE_ENTER_UP_Y; back to the view from
 * above over CELLCAM_SIDE_EXIT_UP_Y): a vertical section stands CELLCAM_SIDE_OFFSET_L body lengths (at least; see cellCam.ts) toward the camera
 * from her, held to CELLCAM_SIDE_FREE_FRACTION of the free room that way; the camera looks from CELLCAM_SIDE_PITCH_DEG above the horizontal.
 * The cut faces are rasterised with texels of CELLCAM_TEXEL_BU (the colony view's are 0.5 BU: far too coarse for a cell 4 BU wide).
 */
export const CELLCAM_SIDE_ENTER_UP_Y = 0.6;
export const CELLCAM_SIDE_EXIT_UP_Y = 0.8;
export const CELLCAM_SIDE_OFFSET_L = 1.2;
export const CELLCAM_SIDE_FREE_FRACTION = 0.85;
export const CELLCAM_SIDE_PITCH_DEG = 28;
export const CELLCAM_TEXEL_BU = 0.1;
/** Width of the cut edge line in the cell camera's cut faces, solidness units (the colony view's is CUTAWAY.edgeBU 0.25: a 5 mm pale band round a 16 mm cell). */
export const CELLCAM_EDGE_W = 0.04;
/** The view from above returns after the floor and the open air over her have held this long, s. */
export const CELLCAM_TOP_HOLD_S = 0.6;
/** The side view needs this much free room (body lengths) toward the camera, or the camera is turned to the open side at CELLCAM_PULL_DEG_S. */
export const CELLCAM_SIDE_MIN_FREE_L = 0.9;
export const CELLCAM_PULL_DEG_S = 240;
