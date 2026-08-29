/**
 * Track geometry builder. One export: buildTrack().
 *
 * FLOOR: box slab per segment. Each slab's top face lies on its joint-to-joint
 * line and it is extended FORWARD only (see FLOOR_FWD_EXTEND) so joints have at
 * worst a small step-DOWN, never an upward lip. A seamless single-mesh floor
 * lives in assets/track.glb (+ scripts/gen-track-glb.mjs) for the art pass — the
 * DCL asset pipeline would not load it here.
 *
 * WALLS + RAILS: box primitives, one pair per segment. Rails (emissive neon, no
 * collider) only on the turn segments.
 *
 * Mesh count: 5 floor + 5×2 walls + 3×2 rails + run-out slab + end wall +
 * 2 run-out side walls = 25 (the §6 ceiling).
 */
import { engine, Transform, MeshRenderer, MeshCollider, Material, ColliderLayer } from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import {
  SEGMENTS,
  CHUTE_CENTER_X,
  CHUTE_INNER_WIDTH,
  HALF_LANE,
  WALL_HEIGHT,
  WALL_THICKNESS,
  WALL_EXTEND,
  FLOOR_THICKNESS,
  FLOOR_FWD_EXTEND,
  RUNOUT_END_Z,
  RUNOUT_START_Z,
  RUNOUT_Y,
  type TrackSegment
} from '../shared/track'

const FLOOR_COLOR = Color4.create(0.14, 0.14, 0.18, 1)
const WALL_COLOR = Color4.create(0.1, 0.1, 0.14, 1)
const RAIL_GLOW = Color3.create(0.15, 0.55, 1)
const RAIL_SIZE = 0.18

function box(pos: Vector3, scale: Vector3, rot: Quaternion, color: Color4) {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale, rotation: rot })
  MeshRenderer.setBox(e)
  MeshCollider.setBox(e, ColliderLayer.CL_PHYSICS)
  Material.setPbrMaterial(e, { albedoColor: color, metallic: 0, roughness: 1 })
  return e
}

/** emissive neon strip — visual only, no collider */
function rail(pos: Vector3, scale: Vector3, rot: Quaternion) {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale, rotation: rot })
  MeshRenderer.setBox(e)
  Material.setPbrMaterial(e, {
    albedoColor: Color4.create(RAIL_GLOW.r, RAIL_GLOW.g, RAIL_GLOW.b, 1),
    emissiveColor: RAIL_GLOW,
    emissiveIntensity: 2
  })
  return e
}

function buildSegment(s: TrackSegment, withRails: boolean) {
  // floor: forward-extended slab, top face on the a-b line
  const floorLen = s.len + FLOOR_FWD_EXTEND
  const floorCenter = Vector3.add(
    Vector3.add(s.center, Vector3.scale(s.dir, FLOOR_FWD_EXTEND / 2)),
    Vector3.scale(s.normal, -FLOOR_THICKNESS / 2)
  )
  box(floorCenter, Vector3.create(CHUTE_INNER_WIDTH, FLOOR_THICKNESS, floorLen), s.rotation, FLOOR_COLOR)

  const wallLen = s.len + 2 * WALL_EXTEND
  for (const side of [-1, 1]) {
    const base = Vector3.add(s.center, Vector3.scale(s.right, side * (HALF_LANE + WALL_THICKNESS / 2)))
    box(
      Vector3.add(base, Vector3.scale(s.normal, WALL_HEIGHT / 2)),
      Vector3.create(WALL_THICKNESS, WALL_HEIGHT, wallLen),
      s.rotation,
      WALL_COLOR
    )
    if (withRails) {
      rail(
        Vector3.add(base, Vector3.scale(s.normal, WALL_HEIGHT)),
        Vector3.create(RAIL_SIZE, RAIL_SIZE, wallLen),
        s.rotation
      )
    }
  }
}

function buildRunout() {
  const q = Quaternion.Identity()
  // The slab starts BEFORE RUNOUT_START_Z so it overlaps the end of seg4 (whose
  // forward-extended slab reaches ~Z 154.5), and ends exactly at RUNOUT_END_Z so
  // its bounding box stays inside the scene.
  const startZ = RUNOUT_START_Z - 4
  const len = RUNOUT_END_Z - startZ
  const midZ = (startZ + RUNOUT_END_Z) / 2

  // flat run-out slab — same 2 m thickness as the segment slabs (tunnel-proof)
  box(
    Vector3.create(CHUTE_CENTER_X, RUNOUT_Y - FLOOR_THICKNESS / 2, midZ),
    Vector3.create(CHUTE_INNER_WIDTH, FLOOR_THICKNESS, len),
    q,
    FLOOR_COLOR
  )
  // end wall (fully inside Z=160)
  box(
    Vector3.create(CHUTE_CENTER_X, RUNOUT_Y + 2, RUNOUT_END_Z - 0.5),
    Vector3.create(CHUTE_INNER_WIDTH + 2, 6, 1),
    q,
    WALL_COLOR
  )
  // run-out side walls
  for (const side of [-1, 1]) {
    box(
      Vector3.create(CHUTE_CENTER_X + side * (HALF_LANE + WALL_THICKNESS / 2), RUNOUT_Y + WALL_HEIGHT / 2, midZ),
      Vector3.create(WALL_THICKNESS, WALL_HEIGHT, len),
      q,
      WALL_COLOR
    )
  }
}

export function buildTrack() {
  // rails only on the turn segments (1–3)
  SEGMENTS.forEach((s, i) => buildSegment(s, i >= 1 && i <= 3))
  buildRunout()
  console.log(`[CLIENT] track built (${SEGMENTS.length} segments, box floor)`)
}
