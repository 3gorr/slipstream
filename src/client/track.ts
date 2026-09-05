/**
 * Track geometry builder. One export: buildTrack().
 *
 * FLOOR: box slab per segment — visible (FLOOR_COLOR) and carries the PHYSICS
 * collider the gyrosphere rolls on. Each slab's top face lies on its
 * joint-to-joint line and it is extended FORWARD only (see FLOOR_FWD_EXTEND) so
 * joints have at worst a small step-DOWN, never an upward lip.
 *
 * A seamless single-mesh floor lives in assets/track.glb (+ scripts/gen-track-glb.mjs)
 * for a future art pass. It is NOT loaded: the engine builds no usable collider
 * from that hand-authored trimesh (the sphere falls through), and on the night
 * skybox the flat ribbon reads washed-out. Kept in the repo, not in the scene.
 *
 * WALLS + RAILS: box primitives, one pair per segment. Rails (emissive neon, no
 * collider) run the whole track except the very first segment (kept dim for
 * contrast at the start) — extended past the original three turn segments to
 * cover the longer easing tail too (length pass, Sept 2026).
 *
 * OBSTACLES: static box pillars (OBSTACLES in shared/track.ts), full collider,
 * offset off the centreline so there is always a way around. Same box-primitive
 * style as everything else — no new mesh type, no new collider layer.
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
  OBSTACLES,
  segmentAtZ,
  surfacePointAt,
  type Obstacle,
  type TrackSegment
} from '../shared/track'

const FLOOR_COLOR = Color4.create(0.14, 0.14, 0.18, 1)
const WALL_COLOR = Color4.create(0.1, 0.1, 0.14, 1)
const RAIL_GLOW = Color3.create(0.15, 0.55, 1)
const RAIL_SIZE = 0.18

const OBSTACLE_COLOR = Color4.create(1, 0.32, 0.14, 1) // hazard amber-red — reads as "stop" against the cool rails
const OBSTACLE_GLOW = Color3.create(1, 0.28, 0.1)
const OBSTACLE_WIDTH = 0.7
const OBSTACLE_HEIGHT = 4.5

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

/** vertical pillar, perpendicular to the local track surface — same orientation
 *  convention as the walls (s.rotation aligns local Y to the surface normal). */
function buildObstacle(o: Obstacle) {
  const seg = segmentAtZ(o.z)
  const base = surfacePointAt(o.z)
  const pos = Vector3.add(
    base,
    Vector3.add(Vector3.scale(seg.right, o.offset), Vector3.scale(seg.normal, OBSTACLE_HEIGHT / 2))
  )
  const e = engine.addEntity()
  Transform.create(e, {
    position: pos,
    scale: Vector3.create(OBSTACLE_WIDTH, OBSTACLE_HEIGHT, OBSTACLE_WIDTH),
    rotation: seg.rotation
  })
  MeshRenderer.setBox(e)
  MeshCollider.setBox(e, ColliderLayer.CL_PHYSICS)
  Material.setPbrMaterial(e, {
    albedoColor: OBSTACLE_COLOR,
    emissiveColor: OBSTACLE_GLOW,
    emissiveIntensity: 1.2,
    metallic: 0,
    roughness: 1
  })
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
  // rails on every segment but the first (kept dim so the run starts in
  // near-dark, then lights up) — covers the turns AND the longer easing tail.
  SEGMENTS.forEach((s, i) => buildSegment(s, i >= 1))
  buildRunout()
  OBSTACLES.forEach(buildObstacle)
  console.log(`[CLIENT] track built (${SEGMENTS.length} segments, ${OBSTACLES.length} obstacles, box floor)`)
}
