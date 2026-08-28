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
import { SPAWN, SPAWN_LOOK, SPAWN_GRACE, RUNOUT_END_Z } from '../shared/track'
import { TEST_FLAT } from './flags'
import { TESTPAD_SPAWN, TESTPAD_LOOK } from './testpad'
import { hudState, setupVehicleHud } from './vehicle-hud'

// ---- tuning (live in TEST_FLAT via 1/2/3/4) --------------------------

let steerRate = 90 // deg/s
let accelForce = 120 // continuous / throttled push
const SPHERE_R = 1.0
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
let placed = false // one-shot: move the player onto the active surface at start
let emaSpeed = 0

const forceEntity = engine.addEntity()
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
  void movePlayerTo({ newRelativePosition: activeSpawn, cameraTarget: activeLook })
}

// ---- systems --------------------------------------------------

function driveSystem(dt: number) {
  if (dt <= 0 || !Transform.has(engine.PlayerEntity)) return
  const p = Transform.get(engine.PlayerEntity).position

  if (!placed) {
    placed = true
    respawn()
    return
  }

  // safety: pull back before leaving scene bounds (movePlayerTo needs the player in bounds)
  if (graceTimer <= 0 && (p.z < 1 || p.z > RUNOUT_END_Z - 2 || p.y < 0 || p.x < 1 || p.x > 15)) {
    respawn()
    return
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
  if (prevPos) {
    const dx = p.x - prevPos.x
    const dz = p.z - prevPos.z
    const ds = Math.sqrt(dx * dx + dz * dz)
    rollAngle += ds / SPHERE_R
    emaSpeed = emaSpeed * 0.85 + (ds / dt) * 0.15
  }
  prevPos = Vector3.create(p.x, p.y, p.z)

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
  }
}

function inputSystemTick() {
  if (
    inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN) ||
    inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
  ) {
    respawn()
  }
  if (!TEST_FLAT) return
  if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) steerRate = Math.max(15, steerRate - 15)
  if (inputSystem.isTriggered(InputAction.IA_ACTION_4, PointerEventType.PET_DOWN)) steerRate = Math.min(360, steerRate + 15)
  if (inputSystem.isTriggered(InputAction.IA_ACTION_5, PointerEventType.PET_DOWN)) accelForce = Math.max(20, accelForce - 20)
  if (inputSystem.isTriggered(InputAction.IA_ACTION_6, PointerEventType.PET_DOWN)) accelForce = Math.min(600, accelForce + 20)
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
