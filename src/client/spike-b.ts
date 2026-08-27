/**
 * SPIKE B — avatar locked in a rolling gyrosphere.
 *
 * Throwaway probe. Same code-generated greybox chute as spike A, but the player
 * is no longer driven by avatar locomotion. Instead:
 *
 *   - walk + jump are frozen (InputModifier disableAll)
 *   - a continuous force (Physics API) pushes the player along a heading
 *   - A / D (joystick left/right) rotate the heading
 *   - a translucent emissive sphere mesh is drawn around the player and rolled
 *     visually by distance travelled (roll += ds / R)
 *   - the avatar is frozen in a sitting emote
 *   - a back-and-above virtual camera follows the player
 *
 * FIRST THING TO JUDGE: does the player slide down the slope smoothly under
 * force alone, or is there residual hop / stutter from the character
 * controller's ground-snapping? If it stutters, that is the key finding — the
 * gyrosphere approach is in trouble.
 *
 * Live tuning (number keys / on-screen buttons):
 *   1 / 2  → accel force  −10 / +10
 *   3 / 4  → steer sensitivity  −20 / +20  (deg/s)
 *   F      → respawn at the top
 *
 * Fallback if the avatar juadders: set HIDE_AVATAR = true (AvatarModifierArea).
 */
import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  ColliderLayer,
  InputModifier,
  InputAction,
  PointerEventType,
  inputSystem,
  Physics,
  VirtualCamera,
  MainCamera,
  AvatarModifierArea,
  AvatarModifierType,
  type Entity
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { movePlayerTo, triggerEmote } from '~system/RestrictedActions'
import { hudState } from './spike-b-hud'

// ---- config -------------------------------------------------------------

const HIDE_AVATAR = false // flip to true for the "bare sphere" fallback
const SPHERE_R = 1.0
const SIT_EMOTE = 'sittingGround1'

// Camera mode. false = a fixed observer camera off to the side of the chute that
// does NOT follow the player (isolates camera jitter from movement jitter).
// true = the old back-and-above camera that tracks the player.
const FOLLOW_CAM = true
// Fixed observer: sits at the high near corner and looks down the length of the
// chute so the whole run stays in frame. Both points are inside parcel bounds.
const OBSERVER_POS = Vector3.create(0.6, 46, 2)
const OBSERVER_TARGET = Vector3.create(8, 14, 110)

const CENTER_X = 8
const INNER_WIDTH = 8
const WALL_HEIGHT = 3
const FLOOR_THICKNESS = 0.5

// The chute is defined by points on its ROLLING SURFACE (top face of the floor).
// Consecutive joints share an exact point, so segments meet with no step and no
// gap — only a crease where the pitch changes. Recompute everything from these.
const JOINTS = [
  Vector3.create(CENTER_X, 34, 4), // top      — segment 0 pitch ~9.96 deg
  Vector3.create(CENTER_X, 21, 78), // seam    — shared exactly by both segments
  Vector3.create(CENTER_X, 2, 152) // bottom   — segment 1 pitch ~14.40 deg
]

// Must match scene.json spawnPoints[0].position — surface of segment 0 at Z=6 is
// Y~33.65, so this sits ~0.65 m above the floor; the respawn grace lets the
// player free-fall onto it before the drive force kicks in.
const SPAWN = Vector3.create(CENTER_X, 34.3, 6)
const SPAWN_CAM = Vector3.create(CENTER_X, 30, 30)
const RESPAWN_GRACE = 0.6 // seconds with no drive force after a (re)spawn

// ---- tunables ---------------------------------------------------------

let accelForce = 120
let steerRate = 90 // deg/s

// ---- state -----------------------------------------------------------

let heading = 0 // radians, 0 = +Z (down the chute)
let rollAngle = 0 // radians, visual
let prevPos: Vector3 | undefined
let emaSpeed = 0
let emaFps = 60
let emoteAccu = 0
let graceTimer = RESPAWN_GRACE

const forceEntity = engine.addEntity()
let sphere: Entity

// ---- build chute ----------------------------------------------------

function buildChute() {
  for (let i = 0; i < JOINTS.length - 1; i++) {
    const a = JOINTS[i]
    const b = JOINTS[i + 1]
    const mid = Vector3.scale(Vector3.add(a, b), 0.5)
    const delta = Vector3.subtract(b, a)
    const len = Vector3.length(delta)
    const dir = Vector3.normalize(delta)
    // surface outward normal: dir rotated 90 deg in the Y-Z plane (dir has no X)
    const up = Vector3.create(0, dir.z, -dir.y)
    const rot = Quaternion.lookRotation(dir) // local +Z -> down-slope, local +Y -> up

    // floor: sink the box by half its thickness so its TOP face lies on a-b
    const floor = engine.addEntity()
    Transform.create(floor, {
      position: Vector3.subtract(mid, Vector3.scale(up, FLOOR_THICKNESS / 2)),
      scale: Vector3.create(INNER_WIDTH, FLOOR_THICKNESS, len),
      rotation: rot
    })
    MeshRenderer.setBox(floor)
    MeshCollider.setBox(floor, ColliderLayer.CL_PHYSICS)
    Material.setPbrMaterial(floor, { albedoColor: Color4.create(0.22, 0.22, 0.28, 1) })

    const pitchDeg = (Math.atan2(-dir.y, dir.z) * 180) / Math.PI
    console.log(
      `[CLIENT] spike-b seg ${i}: A=(${a.x},${a.y},${a.z}) B=(${b.x},${b.y},${b.z}) ` +
        `boxCenter=(${mid.x.toFixed(2)},${(mid.y - (up.y * FLOOR_THICKNESS) / 2).toFixed(2)},${mid.z.toFixed(2)}) ` +
        `len=${len.toFixed(2)} pitch=${pitchDeg.toFixed(2)}deg`
    )

    for (const side of [-1, 1]) {
      const wall = engine.addEntity()
      const wallBase = Vector3.create(mid.x + side * (INNER_WIDTH / 2 + 0.2), mid.y, mid.z)
      Transform.create(wall, {
        position: Vector3.add(wallBase, Vector3.scale(up, WALL_HEIGHT / 2)),
        scale: Vector3.create(0.4, WALL_HEIGHT, len),
        rotation: rot
      })
      MeshRenderer.setBox(wall)
      MeshCollider.setBox(wall, ColliderLayer.CL_PHYSICS)
      Material.setPbrMaterial(wall, {
        albedoColor: Color4.create(0.1, 0.1, 0.15, 1),
        emissiveColor: Color3.create(0.1, 0.3, 0.6),
        emissiveIntensity: 1
      })
    }
  }
}

function solidBox(pos: Vector3, scale: Vector3) {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale })
  MeshRenderer.setBox(e)
  MeshCollider.setBox(e, ColliderLayer.CL_PHYSICS)
  Material.setPbrMaterial(e, { albedoColor: Color4.create(0.12, 0.12, 0.16, 1) })
}

// Keep the player inside scene bounds so movePlayerTo (respawn) always has a
// valid in-bounds player. Back wall at the top, flat run-out + end wall at the
// bottom, all within parcel bounds (Z 0..160).
function buildContainment() {
  const top = JOINTS[0]
  const bottom = JOINTS[JOINTS.length - 1]
  solidBox(Vector3.create(CENTER_X, top.y + 2, top.z - 1), Vector3.create(INNER_WIDTH + 2, 6, 1)) // back wall
  solidBox(Vector3.create(CENTER_X, bottom.y - 0.25, 156), Vector3.create(INNER_WIDTH, 0.5, 12)) // run-out floor
  solidBox(Vector3.create(CENTER_X, bottom.y + 2, 159.5), Vector3.create(INNER_WIDTH + 2, 6, 1)) // end wall
  for (const side of [-1, 1]) {
    solidBox(Vector3.create(CENTER_X + side * (INNER_WIDTH / 2 + 0.2), bottom.y + 1.5, 156), Vector3.create(0.4, 3, 12))
  }
}

// ---- build sphere + camera + avatar --------------------------------

function buildSphere() {
  sphere = engine.addEntity()
  Transform.create(sphere, { position: SPAWN, scale: Vector3.create(SPHERE_R * 2, SPHERE_R * 2, SPHERE_R * 2) })
  MeshRenderer.setSphere(sphere)
  // Translucent shell with an emissive rim feel. No collider — purely visual.
  Material.setPbrMaterial(sphere, {
    albedoColor: Color4.create(0.4, 0.8, 1, 0.12),
    emissiveColor: Color3.create(0.2, 0.6, 1),
    emissiveIntensity: 0.6,
    metallic: 0,
    roughness: 1,
    transparencyMode: 2 // ALPHA_BLEND
  })
}

function buildCamera() {
  const cam = engine.addEntity()
  if (FOLLOW_CAM) {
    Transform.create(cam, { position: Vector3.create(CENTER_X, 24, 0) })
    VirtualCamera.create(cam, { lookAtEntity: engine.PlayerEntity })
  } else {
    // Fixed: orient once via Transform, no lookAtEntity, never touched again.
    const fwd = Vector3.normalize(Vector3.subtract(OBSERVER_TARGET, OBSERVER_POS))
    Transform.create(cam, { position: OBSERVER_POS, rotation: Quaternion.lookRotation(fwd) })
    VirtualCamera.create(cam, {})
  }
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: cam })
  return cam
}

function buildAvatarHide() {
  if (!HIDE_AVATAR) return
  const area = engine.addEntity()
  Transform.create(area, { position: Vector3.create(CENTER_X, 10, 78), scale: Vector3.create(INNER_WIDTH + 4, 60, 170) })
  AvatarModifierArea.create(area, {
    area: Vector3.create(INNER_WIDTH + 4, 60, 170),
    modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
    excludeIds: []
  })
}

// ---- systems -------------------------------------------------------

let camEntity: Entity

function respawn() {
  heading = 0
  rollAngle = 0
  prevPos = undefined
  emaSpeed = 0
  graceTimer = RESPAWN_GRACE
  Physics.removeForceFromPlayer(forceEntity)
  void movePlayerTo({ newRelativePosition: SPAWN, cameraTarget: SPAWN_CAM })
  void triggerEmote({ predefinedEmote: SIT_EMOTE })
  console.log('[CLIENT] spike-b respawn')
}

function driveSystem(dt: number) {
  if (dt <= 0 || !Transform.has(engine.PlayerEntity)) return

  emaFps = emaFps * 0.9 + (1 / dt) * 0.1

  // safety net: if the player somehow escapes the chute envelope, pull them back
  // before they leave scene bounds (movePlayerTo needs an in-bounds player).
  const pos = Transform.get(engine.PlayerEntity).position
  if (graceTimer <= 0 && (pos.z < 1 || pos.z > 158 || pos.y < 0 || pos.x < 1 || pos.x > 15)) {
    respawn()
    return
  }

  // steering
  let steer = 0
  if (inputSystem.isPressed(InputAction.IA_LEFT)) steer -= 1
  if (inputSystem.isPressed(InputAction.IA_RIGHT)) steer += 1
  heading += steer * ((steerRate * Math.PI) / 180) * dt

  // continuous push along heading (gravity supplies the down-slope pull). Held
  // off during the post-spawn grace so the player settles on the floor first.
  if (graceTimer > 0) {
    graceTimer -= dt
    Physics.removeForceFromPlayer(forceEntity)
  } else {
    const dir = Vector3.create(Math.sin(heading), 0, Math.cos(heading))
    Physics.applyForceToPlayer(forceEntity, dir, accelForce)
  }

  // measure horizontal speed + advance visual roll
  const p = Transform.get(engine.PlayerEntity).position
  if (prevPos) {
    const dx = p.x - prevPos.x
    const dz = p.z - prevPos.z
    const ds = Math.sqrt(dx * dx + dz * dz)
    emaSpeed = emaSpeed * 0.85 + (ds / dt) * 0.15
    rollAngle += ds / SPHERE_R
  }
  prevPos = Vector3.create(p.x, p.y, p.z)

  // sphere: centre on the player, yaw to heading, then roll about local X
  const sT = Transform.getMutable(sphere)
  sT.position = Vector3.create(p.x, p.y + SPHERE_R, p.z)
  sT.rotation = Quaternion.multiply(
    Quaternion.fromEulerDegrees(0, (heading * 180) / Math.PI, 0),
    Quaternion.fromEulerDegrees((rollAngle * 180) / Math.PI, 0, 0)
  )

  // camera: only the follow camera is repositioned per frame; the fixed
  // observer camera is set once in buildCamera() and never touched.
  if (FOLLOW_CAM) {
    const camT = Transform.getMutable(camEntity)
    camT.position = Vector3.create(p.x - Math.sin(heading) * 7, p.y + 4.5, p.z - Math.cos(heading) * 7)
  }

  // keep the sit pose alive (predefined emotes do not loop; re-trigger)
  emoteAccu += dt
  if (emoteAccu > 1.5) {
    emoteAccu = 0
    void triggerEmote({ predefinedEmote: SIT_EMOTE })
  }

  hudState.speed = emaSpeed
  hudState.fps = emaFps
  hudState.accelForce = accelForce
  hudState.steerRate = steerRate
  hudState.headingDeg = ((heading * 180) / Math.PI) % 360
}

function tuneSystem() {
  if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) accelForce = Math.max(0, accelForce - 20)
  if (inputSystem.isTriggered(InputAction.IA_ACTION_4, PointerEventType.PET_DOWN)) accelForce = Math.min(600, accelForce + 20)
  if (inputSystem.isTriggered(InputAction.IA_ACTION_5, PointerEventType.PET_DOWN)) steerRate = Math.max(10, steerRate - 20)
  if (inputSystem.isTriggered(InputAction.IA_ACTION_6, PointerEventType.PET_DOWN)) steerRate = Math.min(360, steerRate + 20)
  if (
    inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN) ||
    inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
  ) {
    respawn()
  }
}

export function startSpikeB() {
  buildChute()
  buildContainment()
  buildSphere()
  buildAvatarHide()
  camEntity = buildCamera()

  // Freeze locomotion, but NOT with disableAll — that also swallows the action
  // keys (F/E), which we need for respawn and (later) boost. Disable the
  // movement modes explicitly instead.
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

  void triggerEmote({ predefinedEmote: SIT_EMOTE })

  engine.addSystem(driveSystem)
  engine.addSystem(tuneSystem)
  console.log('[CLIENT] spike-b started (HIDE_AVATAR=' + HIDE_AVATAR + ')')
}
