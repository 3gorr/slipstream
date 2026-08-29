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
import { TEST_FLAT } from './flags'
import { TESTPAD_SPAWN, TESTPAD_LOOK } from './testpad'
import { hudState, setupVehicleHud } from './vehicle-hud'

// ---- tuning (live in TEST_FLAT via 1/2/3/4) --------------------------

let steerRate = 70 // deg/s — moderate; the track is built for wide, flowing turns
let accelForce = 110 // continuous / throttled push
const SPHERE_R = 1.0
let wallBrake = 0.7 // × accelForce, opposing ALONG-track speed while scraping a wall
let pinForce = 0.5 // × accelForce, constant downward — keeps the sphere on the surface everywhere
let seamPin = 1.0 // × accelForce, EXTRA downward within ±SEAM_ZONE of a floor seam,
//                    scaled up with speed (× (1 + 0.06 · speed)) so fast passes get pinned harder
const CAM_BACK = 7
const CAM_UP = 4.5
// The camera rig is PARENTED to the player, so its position moves rigidly with
// the player every frame — no per-frame chase, no one-frame lag, no jitter. Only
// the rig's yaw eases toward the steering heading. CAM_SMOOTH is that easing:
// per-frame slerp amount, 0..1; 1 = snap (no yaw smoothing).
const CAM_SMOOTH = 0.25

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
  wallBrake: 0,
  speed: 0,
  fps: 0
}

const forceEntity = engine.addEntity()
const wallBrakeEntity = engine.addEntity()
const pinEntity = engine.addEntity()
let sphere: Entity
let camRig: Entity
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

function buildCamera() {
  // rig parented to the player: rigid position, zero chase lag.
  camRig = engine.addEntity()
  Transform.create(camRig, { parent: engine.PlayerEntity })

  // camera hangs off the rig at a fixed local offset (behind + above).
  camEntity = engine.addEntity()
  Transform.create(camEntity, { parent: camRig, position: Vector3.create(0, CAM_UP, -CAM_BACK) })
  VirtualCamera.create(camEntity, { lookAtEntity: engine.PlayerEntity })
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: camEntity })
}

// ---- respawn ----------------------------------------------------

function respawn() {
  heading = 0
  rollAngle = 0
  prevPos = undefined
  emaSpeed = 0
  graceTimer = SPAWN_GRACE
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

  // steering
  let steer = 0
  if (inputSystem.isPressed(InputAction.IA_LEFT)) steer -= 1
  if (inputSystem.isPressed(InputAction.IA_RIGHT)) steer += 1
  heading += steer * ((steerRate * Math.PI) / 180) * dt

  // drive force: held off during grace; on the flat pad only while W is held
  const throttling = TEST_FLAT ? inputSystem.isPressed(InputAction.IA_FORWARD) : true
  if (graceTimer > 0) {
    graceTimer -= dt
    Physics.removeForceFromPlayer(forceEntity)
  } else if (throttling) {
    Physics.applyForceToPlayer(forceEntity, Vector3.create(Math.sin(heading), 0, Math.cos(heading)), accelForce)
  } else {
    Physics.removeForceFromPlayer(forceEntity)
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

  // The sphere and the camera rig are both PARENTED to the player, so their
  // position is inherited by the engine each frame — no per-frame chase. We only
  // write LOCAL rotation, cancelling the avatar's own body yaw (which we don't
  // control) so world yaw tracks `heading`.
  const rp = Transform.get(engine.PlayerEntity).rotation
  const playerYaw = Math.atan2(2 * (rp.w * rp.y + rp.x * rp.z), 1 - 2 * (rp.y * rp.y + rp.z * rp.z))
  const localYawDeg = ((heading - playerYaw) * 180) / Math.PI

  // sphere: local yaw to heading, then roll about local X. Position untouched.
  Transform.getMutable(sphere).rotation = Quaternion.multiply(
    Quaternion.fromEulerDegrees(0, localYawDeg, 0),
    Quaternion.fromEulerDegrees((rollAngle * 180) / Math.PI, 0, 0)
  )

  // camera rig: only the yaw eases toward heading.
  const targetQ = Quaternion.fromEulerDegrees(0, localYawDeg, 0)
  const rigT = Transform.getMutable(camRig)
  rigT.rotation = CAM_SMOOTH >= 1 ? targetQ : Quaternion.slerp(rigT.rotation, targetQ, CAM_SMOOTH)

  if (TEST_FLAT) {
    hudState.steerRate = steerRate
    hudState.accelForce = accelForce
    hudState.speed = emaSpeed
    hudState.throttle = throttling
  } else {
    debugHud.seamPin = seamPin
    debugHud.pinForce = pinForce
    debugHud.steerRate = steerRate
    debugHud.wallBrake = wallBrake
    debugHud.speed = emaSpeed
    debugHud.fps = emaFps
  }
}

function inputSystemTick() {
  if (
    inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN) ||
    inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
  ) {
    respawn()
  }
  // live tuning, logged to console:
  //   keys 1/2 → seamPin  (extra down-pin at the floor seams)  ±0.2
  //   keys 3/4 → pinForce  (constant base down-pin)            ±0.1
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
