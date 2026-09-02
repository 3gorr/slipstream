/**
 * Mobile / touch controls. One export: setupMobileControls().
 *
 * Judges play from a phone, so this is critical (Buildathon: Mobile-First,
 * Mobile UX). The gyrosphere only needs one axis of input — steer left/right —
 * which the native virtual joystick provides (its left/right still reaches
 * inputSystem as IA_LEFT / IA_RIGHT even though locomotion is frozen). Downhill
 * acceleration is automatic.
 *
 * So: keep the joystick, hide everything else the client draws (crosshair + all
 * gamepad buttons). Restart is an on-screen button in the HUD (race-hud.tsx),
 * bound to IA_PRIMARY.
 *
 * TouchScreenControls is the confirmed component name (SDK 7.26.0+), set on
 * engine.RootEntity. No-op on desktop, so it is safe to call unconditionally.
 */
import { TouchScreenControls, InputAction } from '@dcl/sdk/ecs'
import { SHOW_TOUCH_TUNE } from './flags'

export function setupMobileControls() {
  if (SHOW_TOUCH_TUNE) {
    // keep buttons "1" / "2" (IA_ACTION_3 / IA_ACTION_4) for TOUCH_STEER_RATE
    // tuning on a phone. Gated by the same flag as TouchTunePanel — a judge
    // never sees these; the nudge logic itself lives in vehicle.ts.
    TouchScreenControls.hide([
      InputAction.IA_POINTER,
      InputAction.IA_PRIMARY,
      InputAction.IA_SECONDARY,
      InputAction.IA_JUMP,
      InputAction.IA_ACTION_5,
      InputAction.IA_ACTION_6
    ])
  } else {
    TouchScreenControls.hideAll() // all 8 gamepad buttons — we draw our own restart
  }
  TouchScreenControls.hideCrosshair() // nothing to aim at
  TouchScreenControls.showJoystick() // keep it — the only steering input on a phone
  console.log('[CLIENT] mobile controls configured (SHOW_TOUCH_TUNE=' + SHOW_TOUCH_TUNE + ')')
}
