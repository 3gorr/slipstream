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
import { engine, TouchScreenControls } from '@dcl/sdk/ecs'

export function setupMobileControls() {
  TouchScreenControls.hideAll() // all 8 gamepad buttons — we draw our own restart
  TouchScreenControls.hideCrosshair() // nothing to aim at
  TouchScreenControls.showJoystick() // keep it — the only steering input on a phone
  console.log('[CLIENT] mobile controls configured')
}
