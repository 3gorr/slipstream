/**
 * SPIKE A — does speed feel good?
 *
 * Throwaway probe. A straight, inclined greybox chute (~150 m) with two segments
 * that meet at a seam, built entirely from box primitives IN CODE (not composite)
 * — deliberate for a spike, see SPIKE.md. Cranks avatar locomotion, adds an
 * optional extra downward force to fake stronger gravity, kills jump.
 *
 * Live tunables from the number keys / on-screen buttons 1–4 (so it can be tuned
 * from a phone without a rebuild):
 *   1 / 2  → run speed  −1 / +1
 *   3 / 4  → extra gravity force  −4 / +4
 *   E      → flip chute pitch sign (if the chute tilts the wrong way)
 *   F      → respawn at the top
 */
import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  ColliderLayer,
  AvatarLocomotionSettings,
  InputModifier,
  InputAction,
  PointerEventType,
  inputSystem,
  Physics,
  type Entity
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { hudState } from './spike-a-hud'

// ---- chute layout -----------------------------------------------------------

const CENTER_X = 8
const INNER_WIDTH = 8 // gap between the walls
const WALL_HEIGHT = 3
const FLOOR_THICKNESS = 0.5

// Two segments. Horizontal run + vertical drop each; angle derived.
const SEGMENTS = [
  { zStart: 4, zEnd: 78, yStart: 18, yEnd: 12 }, // gentle
  { zStart: 78, zEnd: 152, yStart: 12, yEnd: 2 } // steeper
]

const SPAWN = Vector3.create(CENTER_X, 19, 6)

// Flip this (or press E at runtime) if the chute tilts the wrong way. The sign
// convention for a rotation about X that dips the +Z end downward is exactly the
// kind of thing CLAUDE.md §8 says to verify visually rather than recall.
let pitchSign = -1

// ---- tunables -------------------------------------------------------------

let runSpeed = 18 // client default run is 10
let extraGravity = 0 // extra downward force magnitude; 0 = client default only

const gravityEntity = engine.addEntity()

// ---- build ---------------------------------------------------------------

const floorParts: { entity: Entity; seg: (typeof SEGMENTS)[number] }[] = []

function buildChute() {
  for (const seg of SEGMENTS) {
    const run = seg.zEnd - seg.zStart
    const drop = seg.yStart - seg.yEnd
    const len = Math.sqrt(run * run + drop * drop)
    const pitchDeg = (Math.atan2(drop, run) * 180) / Math.PI
    const midZ = (seg.zStart + seg.zEnd) / 2
    const midY = (seg.yStart + seg.yEnd) / 2

    const rot = () => Quaternion.fromEulerDegrees(pitchSign * pitchDeg, 0, 0)

    // floor
    const floor = engine.addEntity()
    Transform.create(floor, {
      position: Vector3.create(CENTER_X, midY, midZ),
      scale: Vector3.create(INNER_WIDTH, FLOOR_THICKNESS, len),
      rotation: rot()
    })
    MeshRenderer.setBox(floor)
    MeshCollider.setBox(floor, ColliderLayer.CL_PHYSICS)
    Material.setPbrMaterial(floor, { albedoColor: Color4.create(0.25, 0.25, 0.3, 1) })
    floorParts.push({ entity: floor, seg })

    // walls
    for (const side of [-1, 1]) {
      const wall = engine.addEntity()
      Transform.create(wall, {
        position: Vector3.create(CENTER_X + side * (INNER_WIDTH / 2), midY + WALL_HEIGHT / 2, midZ),
        scale: Vector3.create(0.4, WALL_HEIGHT, len),
        rotation: rot()
      })
      MeshRenderer.setBox(wall)
      MeshCollider.setBox(wall, ColliderLayer.CL_PHYSICS)
      Material.setPbrMaterial(wall, {
        albedoColor: Color4.create(0.1, 0.1, 0.15, 1),
        emissiveColor: Color3.create(0.1, 0.3, 0.6),
        emissiveIntensity: 1
      })
      floorParts.push({ entity: wall, seg })
    }
  }
}

function applyChuteRotation() {
  for (const seg of SEGMENTS) {
    const run = seg.zEnd - seg.zStart
    const drop = seg.yStart - seg.yEnd
    const pitchDeg = (Math.atan2(drop, run) * 180) / Math.PI
    const q = Quaternion.fromEulerDegrees(pitchSign * pitchDeg, 0, 0)
    for (const p of floorParts) {
      if (p.seg === seg) Transform.getMutable(p.entity).rotation = q
    }
  }
}

// ---- ride --------------------------------------------------------------

function applyLocomotion() {
  AvatarLocomotionSettings.createOrReplace(engine.PlayerEntity, {
    runSpeed,
    jogSpeed: runSpeed // mobile joystick tends to drive jog, not run
  })
}

function applyGravity() {
  Physics.removeForceFromPlayer(gravityEntity)
  if (extraGravity > 0) {
    Physics.applyForceToPlayer(gravityEntity, Vector3.create(0, -1, 0), extraGravity)
  }
}

// ---- speed + fps measurement ----------------------------------------------

let prev: Vector3 | undefined
let emaSpeed = 0
let emaFps = 60

function probeSystem(dt: number) {
  if (dt <= 0) return
  emaFps = emaFps * 0.9 + (1 / dt) * 0.1

  if (Transform.has(engine.PlayerEntity)) {
    const p = Transform.get(engine.PlayerEntity).position
    if (prev) {
      const dx = p.x - prev.x
      const dz = p.z - prev.z
      const horiz = Math.sqrt(dx * dx + dz * dz) / dt
      emaSpeed = emaSpeed * 0.85 + horiz * 0.15
    }
    prev = Vector3.create(p.x, p.y, p.z)
  }

  hudState.speed = emaSpeed
  hudState.runSpeed = runSpeed
  hudState.extraGravity = extraGravity
  hudState.pitchSign = pitchSign
  hudState.fps = emaFps
}

function inputSystemTick() {
  if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) {
    runSpeed = Math.max(4, runSpeed - 1)
    applyLocomotion()
  }
  if (inputSystem.isTriggered(InputAction.IA_ACTION_4, PointerEventType.PET_DOWN)) {
    runSpeed = Math.min(60, runSpeed + 1)
    applyLocomotion()
  }
  if (inputSystem.isTriggered(InputAction.IA_ACTION_5, PointerEventType.PET_DOWN)) {
    extraGravity = Math.max(0, extraGravity - 4)
    applyGravity()
  }
  if (inputSystem.isTriggered(InputAction.IA_ACTION_6, PointerEventType.PET_DOWN)) {
    extraGravity = Math.min(200, extraGravity + 4)
    applyGravity()
  }
  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) {
    pitchSign *= -1
    console.log('[CLIENT] spike-a pitchSign =', pitchSign)
    applyChuteRotation()
  }
  if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) {
    void movePlayerTo({ newRelativePosition: SPAWN, cameraTarget: Vector3.create(CENTER_X, 14, 40) })
  }
}

export function startSpikeA() {
  buildChute()
  applyLocomotion()
  applyGravity()

  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({
      disableJump: true,
      disableDoubleJump: true,
      disableGliding: true
    })
  })

  engine.addSystem(probeSystem)
  engine.addSystem(inputSystemTick)
  console.log('[CLIENT] spike-a started')
}
