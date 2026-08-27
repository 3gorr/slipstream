/**
 * Track geometry builder. One export: buildTrack().
 *
 * Night look: near-black floor, dark walls with an emissive neon rail along the
 * top edge. All primitives (no GLB yet). Mesh count is deliberately small — see
 * CLAUDE.md §6 (≤ 25 merged meshes for the whole track).
 *
 * Colliders: CL_PHYSICS on the floor, the walls and the containment only. The
 * neon rails are visual-only (no collider).
 */
import { engine, Transform, MeshRenderer, MeshCollider, Material, ColliderLayer } from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import {
  JOINTS,
  CHUTE_CENTER_X,
  CHUTE_INNER_WIDTH,
  WALL_HEIGHT,
  FLOOR_THICKNESS,
  RUNOUT_END_Z,
  RUNOUT_Y
} from '../shared/track'

const FLOOR_COLOR = Color4.create(0.14, 0.14, 0.18, 1)
const WALL_COLOR = Color4.create(0.1, 0.1, 0.14, 1)
const RAIL_GLOW = Color3.create(0.15, 0.55, 1)
const WALL_THICKNESS = 0.4
const RAIL_SIZE = 0.18

function boxEntity(pos: Vector3, scale: Vector3, rot: Quaternion, collide: boolean) {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale, rotation: rot })
  MeshRenderer.setBox(e)
  if (collide) MeshCollider.setBox(e, ColliderLayer.CL_PHYSICS)
  return e
}

/** one inclined segment: sunk floor slab + two walls + two emissive top rails */
function buildSegment(a: Vector3, b: Vector3) {
  const mid = Vector3.scale(Vector3.add(a, b), 0.5)
  const delta = Vector3.subtract(b, a)
  const len = Vector3.length(delta)
  const dir = Vector3.normalize(delta)
  // surface outward normal: dir rotated 90° in the Y-Z plane (dir has no X)
  const up = Vector3.create(0, dir.z, -dir.y)
  const rot = Quaternion.lookRotation(dir)

  const floor = boxEntity(
    Vector3.subtract(mid, Vector3.scale(up, FLOOR_THICKNESS / 2)),
    Vector3.create(CHUTE_INNER_WIDTH, FLOOR_THICKNESS, len),
    rot,
    true
  )
  Material.setPbrMaterial(floor, { albedoColor: FLOOR_COLOR, metallic: 0, roughness: 1 })

  for (const side of [-1, 1]) {
    const base = Vector3.create(mid.x + side * (CHUTE_INNER_WIDTH / 2 + WALL_THICKNESS / 2), mid.y, mid.z)
    const wall = boxEntity(
      Vector3.add(base, Vector3.scale(up, WALL_HEIGHT / 2)),
      Vector3.create(WALL_THICKNESS, WALL_HEIGHT, len),
      rot,
      true
    )
    Material.setPbrMaterial(wall, { albedoColor: WALL_COLOR, metallic: 0, roughness: 1 })

    const rail = boxEntity(
      Vector3.add(base, Vector3.scale(up, WALL_HEIGHT)),
      Vector3.create(RAIL_SIZE, RAIL_SIZE, len),
      rot,
      false
    )
    Material.setPbrMaterial(rail, {
      albedoColor: Color4.create(RAIL_GLOW.r, RAIL_GLOW.g, RAIL_GLOW.b, 1),
      emissiveColor: RAIL_GLOW,
      emissiveIntensity: 2
    })
  }
}

/** back wall, flat run-out slab, end wall, run-out side walls — keeps the player in bounds */
function buildContainment() {
  const top = JOINTS[0]
  const bottom = JOINTS[JOINTS.length - 1]
  const runoutMidZ = (bottom.z + RUNOUT_END_Z) / 2
  const runoutLen = RUNOUT_END_Z - bottom.z
  const q = Quaternion.Identity()

  const backWall = boxEntity(
    Vector3.create(CHUTE_CENTER_X, top.y + 2, top.z - 1),
    Vector3.create(CHUTE_INNER_WIDTH + 2, 6, 1),
    q,
    true
  )
  Material.setPbrMaterial(backWall, { albedoColor: WALL_COLOR, metallic: 0, roughness: 1 })

  const runout = boxEntity(
    Vector3.create(CHUTE_CENTER_X, RUNOUT_Y - FLOOR_THICKNESS / 2, runoutMidZ),
    Vector3.create(CHUTE_INNER_WIDTH, FLOOR_THICKNESS, runoutLen),
    q,
    true
  )
  Material.setPbrMaterial(runout, { albedoColor: FLOOR_COLOR, metallic: 0, roughness: 1 })

  const endWall = boxEntity(
    Vector3.create(CHUTE_CENTER_X, RUNOUT_Y + 2, RUNOUT_END_Z - 0.5),
    Vector3.create(CHUTE_INNER_WIDTH + 2, 6, 1),
    q,
    true
  )
  Material.setPbrMaterial(endWall, { albedoColor: WALL_COLOR, metallic: 0, roughness: 1 })

  for (const side of [-1, 1]) {
    const w = boxEntity(
      Vector3.create(CHUTE_CENTER_X + side * (CHUTE_INNER_WIDTH / 2 + WALL_THICKNESS / 2), RUNOUT_Y + WALL_HEIGHT / 2, runoutMidZ),
      Vector3.create(WALL_THICKNESS, WALL_HEIGHT, runoutLen),
      q,
      true
    )
    Material.setPbrMaterial(w, { albedoColor: WALL_COLOR, metallic: 0, roughness: 1 })
  }
}

export function buildTrack() {
  for (let i = 0; i < JOINTS.length - 1; i++) buildSegment(JOINTS[i], JOINTS[i + 1])
  buildContainment()
  console.log('[CLIENT] track built')
}
