/**
 * Gyrosphere vehicle. One export: startVehicle().
 *
 * The player is moved by a continuous Physics force (validated in spike B —
 * smooth, no ground-snapping hop). Walk/jump are frozen; A/D (joystick
 * left/right) steer. A translucent emissive sphere is drawn around the player and
 * rolled visually by distance travelled.
 *
 * TEST_FLAT (flags.ts): on the flat test pad there is no slope, so the drive
 * force is applied only while W (forward) is held — manual throttle. On the real
 * track the force is continuous (the slope is the throttle). A tuning HUD with
 * live STEER_RATE / ACCEL_FORCE is shown in TEST_FLAT only.
 *
 * Known open item (next step): the avatar inside the sphere still animates / hops.
 */
import {
  engine,
  Transform,
  MeshRenderer,
  Material,
  InputModifier,
  InputAction,
  PointerEventType,
  inputSystem,
  Physics,
  VirtualCamera,
  MainCamera,
  MaterialTransparencyMode,
  type Entity
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import {
  SPAWN,
  SPAWN_LOOK,
  SPAWN_GRACE,
  RUNOUT_END_Z,
  RUNOUT_Y,
  HALF_LANE,
  SEAM_Z,
  SEAM_ZONE,
  segmentAtZ,
  trackCentreAt,
  trackOffsetAt
} from '../shared/track'
import { TEST_FLAT, DEBUG_HUD, TOUCH_TUNE, CAM_FREEZE_TEST } from './flags'
import { TESTPAD_SPAWN, TESTPAD_LOOK } from './testpad'
import { hudState, setupVehicleHud } from './vehicle-hud'
import { isMobile } from '@dcl/sdk/platform'

// ---- tuning (live in TEST_FLAT via 1/2/3/4) --------------------------

let steerRate = 70 // deg/s — desktop keys (A/D), digital
// The analog touch joystick throws the sphere harder than a key tap; SDK7 gives
// no analog joystick read, so it's just a lower digital rate on mobile.
let touchSteerRate = 42 // deg/s — mobile joystick; live-tunable while TOUCH_TUNE
let accelForce = 110 // continuous / throttled push
const SPHERE_R = 1.0
let wallBrake = 0.7 // × accelForce, opposing ALONG-track speed while scraping a wall
let pinForce = 0.5 // × accelForce, constant downward — keeps the sphere on the surface everywhere
let seamPin = 1.0 // × accelForce, EXTRA downward within ±SEAM_ZONE of a floor seam,
//                    scaled up with speed (× (1 + 0.06 · speed)) so fast passes get pinned harder
const CAM_BACK = 7
const CAM_UP = 4.5
// Camera rig is PARENTED to the player (position rigid → no jitter). Its WORLD
// yaw is forced to `heading` every frame by cancelling the parent rotation
// exactly — so the avatar's own turning (the mobile joystick rotates the avatar)
// does NOT swing the view. The camera entity has a FIXED local look-down rotation
// and NO lookAtEntity, so the active VirtualCamera fully owns the view and the
// client's native touch/mouse look never applies.

const activeSpawn = TEST_FLAT ? TESTPAD_SPAWN : SPAWN
const activeLook = TEST_FLAT ? TESTPAD_LOOK : SPAWN_LOOK

// ---- state ---------------------------------------------------------

let heading = 0 // radians, 0 = +Z
let rollAngle = 0 // radians, visual only
let prevPos: Vector3 | undefined
let graceTimer = SPAWN_GRACE
let placeDelay = 0.4 // wait this long before the one-shot placement, so the track colliders are live
let placed = false
let emaSpeed = 0
let emaFps = 60

/** live values for the debug tuning panel (rendered by race-hud when DEBUG_HUD) */
export const debugHud = {
  seamPin: 0,
  pinForce: 0,
  steerRate: 0,
  touchSteer: 0,
  wallBrake: 0,
  speed: 0,
  fps: 0
}

/**
 * `launched` = the post-spawn grace has ended and the drive force is now on. It
 * is the single fair "the player really started" moment — deterministic every
 * run (fixed spawn, fixed SPAWN_GRACE). The ghost keys record + playback to this,
 * NOT to the race phase (which flips a bit later, once the player has moved).
 */
export const vehicleState = { launched: false }

const forceEntity = engine.addEntity()
const wallBrakeEntity = engine.addEntity()
const pinEntity = engine.addEntity()
let sphere: Entity
let camEntity: Entity

// ---- build -------------------------------------------------------

function buildSphere() {
  // Parented to the player: position is inherited by the engine each frame — no
  // per-frame chase, no one-frame lag. Only local rotation (yaw + roll) is
  // written per frame, and that does not affect position.
  sphere = engine.addEntity()
  Transform.create(sphere, {
    parent: engine.PlayerEntity,
    position: Vector3.create(0, SPHERE_R, 0),
    scale: Vector3.create(SPHERE_R * 2, SPHERE_R * 2, SPHERE_R * 2)
  })
  MeshRenderer.setSphere(sphere)
  Material.setPbrMaterial(sphere, {
    albedoColor: Color4.create(0.4, 0.8, 1, 0.12),
    emissiveColor: Color3.create(0.2, 0.6, 1),
    emissiveIntensity: 0.6,
    metallic: 0,
    roughness: 1,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND
  })
}

const FROZEN_CAM_ROT = Quaternion.lookRotation(Vector3.normalize(Vector3.create(0, -CAM_UP, CAM_BACK)))

/**
 * Diagnostic (Sept) proved it: an UNPARENTED, manually-driven VirtualCamera
 * fully owns the view on mobile — the joystick does NOT rotate it. The earlier
 * swing came from the camera rig being a CHILD of engine.PlayerEntity: the
 * avatar turns with the joystick, the rig inherited that rotation, and our
 * per-frame inverse-cancel was always a frame stale against the render-time
 * parent transform. So: no parent. Drive position + rotation directly.
 */
function buildCamera() {
  camEntity = engine.addEntity()
  Transform.create(camEntity, { position: Vector3.create(0, CAM_UP, -CAM_BACK), rotation: FROZEN_CAM_ROT })
  VirtualCamera.create(camEntity, {})
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: camEntity })
}

// ---- respawn ----------------------------------------------------

function respawn() {
  heading = 0
  rollAngle = 0
  prevPos = undefined
  emaSpeed = 0
  graceTimer = SPAWN_GRACE
  vehicleState.launched = false
  Physics.removeForceFromPlayer(forceEntity)
  Physics.removeForceFromPlayer(wallBrakeEntity)
  Physics.removeForceFromPlayer(pinEntity)
  void movePlayerTo({ newRelativePosition: activeSpawn, cameraTarget: activeLook })
}

// ---- systems --------------------------------------------------

function driveSystem(dt: number) {
  if (dt <= 0 || !Transform.has(engine.PlayerEntity)) return
  const p = Transform.get(engine.PlayerEntity).position
  emaFps = emaFps * 0.9 + (1 / dt) * 0.1

  // one-shot placement, delayed so the freshly-built track colliders are live
  if (!placed) {
    placeDelay -= dt
    if (placeDelay > 0) return
    placed = true
    respawn()
    return
  }

  // --- escape check: measured against the LANE CENTRE, not world bounds — the
  // track legitimately weaves close to the scene edges (walls reach X ≈ 15.8).
  if (!TEST_FLAT) {
    const centre = trackCentreAt(p.z)
    const offset = trackOffsetAt(p) // signed lateral distance from the centreline
    const below = centre.y - p.y // how far under the surface the player is

    let reason = ''
    let catastrophic = false
    if (below > 5) {
      reason = `fell through floor (${below.toFixed(1)} m below surface)`
      catastrophic = true
    } else if (p.y < RUNOUT_Y - 15) {
      reason = `void (y ${p.y.toFixed(1)})`
      catastrophic = true
    } else if (Math.abs(offset) > HALF_LANE + 3) {
      reason = `off lane (offset ${offset.toFixed(1)} m)`
    } else if (p.z < 1) {
      reason = `behind start (z ${p.z.toFixed(1)})`
    } else if (p.z > RUNOUT_END_Z + 1) {
      reason = `past finish (z ${p.z.toFixed(1)})`
    }

    if (reason !== '' && (catastrophic || graceTimer <= 0)) {
      console.log(
        `[CLIENT] auto-respawn: ${reason}  @ player (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})` +
          `  surfaceY ${centre.y.toFixed(1)}`
      )
      respawn()
      return
    }
  }

  // steering — lower rate on the analog touch joystick than on desktop keys
  let steer = 0
  if (inputSystem.isPressed(InputAction.IA_LEFT)) steer -= 1
  if (inputSystem.isPressed(InputAction.IA_RIGHT)) steer += 1
  const rate = isMobile() ? touchSteerRate : steerRate
  heading += steer * ((rate * Math.PI) / 180) * dt

  // drive force: held off during grace; on the flat pad only while W is held
  const throttling = TEST_FLAT ? inputSystem.isPressed(InputAction.IA_FORWARD) : true
  if (graceTimer > 0) {
    graceTimer -= dt
    Physics.removeForceFromPlayer(forceEntity)
  } else {
    vehicleState.launched = true // grace over — the fair start moment (idempotent)
    if (throttling) {
      Physics.applyForceToPlayer(forceEntity, Vector3.create(Math.sin(heading), 0, Math.cos(heading)), accelForce)
    } else {
      Physics.removeForceFromPlayer(forceEntity)
    }
  }

  // visual roll + speed from horizontal distance moved
  let vx = 0
  let vz = 0
  let speed = 0
  if (prevPos) {
    vx = (p.x - prevPos.x) / dt
    vz = (p.z - prevPos.z) / dt
    const ds = Math.sqrt((p.x - prevPos.x) ** 2 + (p.z - prevPos.z) ** 2)
    speed = ds / dt
    rollAngle += ds / SPHERE_R
    emaSpeed = emaSpeed * 0.85 + speed * 0.15
  }
  prevPos = Vector3.create(p.x, p.y, p.z)

  // down-pin: constant base everywhere, plus a stronger speed-scaled boost within
  // ±SEAM_ZONE of a floor seam so the sphere rides the step-down without lifting.
  if (!TEST_FLAT && graceTimer <= 0) {
    let pin = pinForce
    for (const sz of SEAM_Z) {
      if (Math.abs(p.z - sz) < SEAM_ZONE) {
        pin += seamPin * (1 + 0.06 * speed)
        break
      }
    }
    Physics.applyForceToPlayer(pinEntity, Vector3.create(0, -1, 0), accelForce * pin)
  } else {
    Physics.removeForceFromPlayer(pinEntity)
  }

  // wall brake: scraping a wall bleeds ALONG-track speed only — a bad line costs
  // you momentum, but you can still steer off the wall freely (no pull toward it).
  if (!TEST_FLAT && graceTimer <= 0) {
    let braking = false
    if (Math.abs(trackOffsetAt(p)) > HALF_LANE - SPHERE_R - 0.3) {
      const seg = segmentAtZ(p.z)
      const fl = Math.sqrt(seg.dir.x * seg.dir.x + seg.dir.z * seg.dir.z) || 1
      const fx = seg.dir.x / fl
      const fz = seg.dir.z / fl
      const along = vx * fx + vz * fz // signed forward speed
      if (along > 0.3) {
        Physics.applyForceToPlayer(wallBrakeEntity, Vector3.create(-fx, 0, -fz), accelForce * wallBrake)
        braking = true
      }
    }
    if (!braking) Physics.removeForceFromPlayer(wallBrakeEntity)
  }

  // Sphere + camera rig are PARENTED to the player (position rigid, no jitter).
  // We want their WORLD yaw to be exactly `heading`, independent of the avatar's
  // own rotation (the joystick spins the avatar on mobile). Set LOCAL rotation to
  // cancel the parent precisely:  local = inverse(playerRotation) · yaw(heading).
  const rp = Transform.get(engine.PlayerEntity).rotation
  const invPlayer = Quaternion.create(-rp.x, -rp.y, -rp.z, rp.w) // conjugate = inverse (unit quat)
  const headingWorld = Quaternion.fromEulerDegrees(0, (heading * 180) / Math.PI, 0)
  const localYaw = Quaternion.multiply(invPlayer, headingWorld)

  // sphere: local yaw, then roll about local X. Position untouched.
  Transform.getMutable(sphere).rotation = Quaternion.multiply(
    localYaw,
    Quaternion.fromEulerDegrees((rollAngle * 180) / Math.PI, 0, 0)
  )

  // camera: unparented, driven directly. Orbits behind `heading`, above; rotation
  // either pinned (CAM_FREEZE_TEST) or aimed at the sphere.
  const ct = Transform.getMutable(camEntity)
  const camX = p.x - Math.sin(heading) * CAM_BACK
  const camY = p.y + CAM_UP
  const camZ = p.z - Math.cos(heading) * CAM_BACK
  ct.position.x = camX
  ct.position.y = camY
  ct.position.z = camZ

  if (CAM_FREEZE_TEST) {
    ct.rotation.x = FROZEN_CAM_ROT.x
    ct.rotation.y = FROZEN_CAM_ROT.y
    ct.rotation.z = FROZEN_CAM_ROT.z
    ct.rotation.w = FROZEN_CAM_ROT.w
  } else {
    const look = Quaternion.fromLookAt(
      Vector3.create(camX, camY, camZ),
      Vector3.create(p.x, p.y + SPHERE_R, p.z)
    )
    ct.rotation.x = look.x
    ct.rotation.y = look.y
    ct.rotation.z = look.z
    ct.rotation.w = look.w
  }

  // re-assert our virtual camera every frame — some clients drop back to the
  // default camera after a touch/look input.
  const mc = MainCamera.getMutableOrNull(engine.CameraEntity)
  if (mc && mc.virtualCameraEntity !== camEntity) mc.virtualCameraEntity = camEntity

  if (TEST_FLAT) {
    hudState.steerRate = steerRate
    hudState.accelForce = accelForce
    hudState.speed = emaSpeed
    hudState.throttle = throttling
  } else {
    debugHud.seamPin = seamPin
    debugHud.pinForce = pinForce
    debugHud.steerRate = steerRate
    debugHud.touchSteer = touchSteerRate
    debugHud.wallBrake = wallBrake
    debugHud.speed = emaSpeed
    debugHud.fps = emaFps
  }
}

/** Restart the run — F / E on desktop, the on-screen button on mobile. */
export function requestRespawn() {
  respawn()
}

function inputSystemTick() {
  if (
    inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN) ||
    inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
  ) {
    respawn()
  }

  // TOUCH_TUNE (temporary): buttons 1 / 2 nudge the mobile steer rate so it can
  // be dialled in on a phone. Takes IA_ACTION_3/4 over the DEBUG_HUD seamPin use.
  if (TOUCH_TUNE) {
    if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) {
      touchSteerRate = Math.max(10, touchSteerRate - 3)
      console.log('[CLIENT] touchSteerRate =', touchSteerRate)
    }
    if (inputSystem.isTriggered(InputAction.IA_ACTION_4, PointerEventType.PET_DOWN)) {
      touchSteerRate = Math.min(90, touchSteerRate + 3)
      console.log('[CLIENT] touchSteerRate =', touchSteerRate)
    }
    return
  }

  // Live tuning keys — desktop debug only. Gated on DEBUG_HUD so the number-key
  // actions (which map to on-screen buttons on mobile) do nothing in the build
  // judges play. The buttons themselves are hidden by setupMobileControls().
  if (!DEBUG_HUD) return
  if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) {
    seamPin = Math.max(0, Math.round((seamPin - 0.2) * 10) / 10)
    console.log('[CLIENT] seamPin =', seamPin)
  }
  if (inputSystem.isTriggered(InputAction.IA_ACTION_4, PointerEventType.PET_DOWN)) {
    seamPin = Math.min(4, Math.round((seamPin + 0.2) * 10) / 10)
    console.log('[CLIENT] seamPin =', seamPin)
  }
  if (inputSystem.isTriggered(InputAction.IA_ACTION_5, PointerEventType.PET_DOWN)) {
    pinForce = Math.max(0, Math.round((pinForce - 0.1) * 10) / 10)
    console.log('[CLIENT] pinForce =', pinForce)
  }
  if (inputSystem.isTriggered(InputAction.IA_ACTION_6, PointerEventType.PET_DOWN)) {
    pinForce = Math.min(3, Math.round((pinForce + 0.1) * 10) / 10)
    console.log('[CLIENT] pinForce =', pinForce)
  }
}

export function startVehicle() {
  buildSphere()
  buildCamera()
  if (TEST_FLAT) setupVehicleHud()

  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({
      disableWalk: true,
      disableJog: true,
      disableRun: true,
      disableJump: true,
      disableDoubleJump: true,
      disableGliding: true
    })
  })

  engine.addSystem(driveSystem)
  engine.addSystem(inputSystemTick)
  console.log(`[CLIENT] vehicle started (TEST_FLAT=${TEST_FLAT})`)
}
