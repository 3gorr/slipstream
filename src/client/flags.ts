/**
 * Temporary dev flags. Flip and rebuild.
 *
 * TEST_FLAT — build a flat test pad with manual throttle instead of the real
 * chute, to practise steering without rolling off the end. Set false to restore
 * the real track with no other changes.
 */
export const TEST_FLAT = false

/** Small on-screen tuning panel (real track only). Temporary — remove later. */
export const DEBUG_HUD = false

/**
 * Temporary: show the touch-steer value + keep gamepad buttons 1/2 visible on
 * mobile so TOUCH_STEER_RATE can be dialled in on a phone. Remove once set.
 */
export const TOUCH_TUNE = true

/**
 * DIAGNOSTIC: pin the camera's WORLD rotation to a constant forever — the rig
 * never follows `heading`, camEntity is unparented, no lookAtEntity. Position
 * still follows the player (pure translation). If the joystick STILL swings the
 * view on mobile, it is DCL's native touch-look and unfixable from scene code.
 * If the view goes rock-steady, our rig was the cause.
 *
 * RESULT (Sept): rock-steady — the rig was the cause. The camera is now
 * unparented and driven directly; leave this false. Set true only to re-check
 * against a fixed rotation.
 */
export const CAM_FREEZE_TEST = false

/**
 * HUD gating: the debug panels are dev-only and must never be on screen for a
 * judge. Both default false. Flip SHOW_TOUCH_TUNE to true to bring back the
 * touch-steer readout while dialling in TOUCH_STEER_RATE on a phone.
 */
export const SHOW_TOUCH_TUNE = false
export const SHOW_DEBUG_PANEL = false

/**
 * Phase B network debug: the small top-left "server: connected · <name>"
 * indicator (NetPanel in race-hud.tsx). Dev-only — a judge must never see it.
 * Default false. Flip to true to watch the handshake / racer-name cache resolve.
 * Only the panel is gated; the name cache itself (net.ts) always runs — the
 * ghost billboards need it.
 */
export const SHOW_NET_DEBUG = false
