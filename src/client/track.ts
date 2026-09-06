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
 * collider) run the whole track — every segment including the first, so the
 * start looks like the rest.
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
  WALL_EXTEND_OUTER,
  WALL_EXTEND_INNER,
  WALL_EXTEND_STRAIGHT,
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

const STRAIGHT_EPS = 0.03 // |dot(neighbourDir, right)| below this = no real turn at that end

/**
 * Tail length for ONE end of a wall on ONE side.
 * `turnDot` = dot(neighbourDir, s.right) — its sign says which way the track
 * bends at that end; `insideWhenNeg` is true for the FRONT end (turns left when
 * the dot is negative -> left side inside) and inverted for the BACK end (the
 * neighbour is the incoming direction). `side`: -1 = left wall, +1 = right wall.
 */
function wallTail(turnDot: number | undefined, invert: boolean, side: number): number {
  if (turnDot === undefined || Math.abs(turnDot) < STRAIGHT_EPS) return WALL_EXTEND_STRAIGHT
  const bendSign = invert ? -Math.sign(turnDot) : Math.sign(turnDot)
  return bendSign === side ? WALL_EXTEND_INNER : WALL_EXTEND_OUTER
}

function buildSegment(
  s: TrackSegment,
  withRails: boolean,
  prev: TrackSegment | undefined,
  next: TrackSegment | undefined
) {
  // floor: forward-extended slab, top face on the a-b line
  const floorLen = s.len + FLOOR_FWD_EXTEND
  const floorCenter = Vector3.add(
    Vector3.add(s.center, Vector3.scale(s.dir, FLOOR_FWD_EXTEND / 2)),
    Vector3.scale(s.normal, -FLOOR_THICKNESS / 2)
  )
  box(floorCenter, Vector3.create(CHUTE_INNER_WIDTH, FLOOR_THICKNESS, floorLen), s.rotation, FLOOR_COLOR)

  const frontDot = next ? Vector3.dot(next.dir, s.right) : undefined
  const backDot = prev ? Vector3.dot(prev.dir, s.right) : undefined

  for (const side of [-1, 1]) {
    // long tail on the outside of a turn (closes the diverging gap), short on
    // the inside (a long tail there just pokes into the lane). Front and back
    // are decided independently — a wall can be inside at one end, outside the
    // other, so the box is asymmetric: shift its centre and size it by end.
    const front = wallTail(frontDot, false, side)
    const back = wallTail(backDot, true, side)
    const wallLen = s.len + front + back

    const base = Vector3.add(
      Vector3.add(s.center, Vector3.scale(s.dir, (front - back) / 2)),
      Vector3.scale(s.right, side * (HALF_LANE + WALL_THICKNESS / 2))
    )
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

/**
 * Perpendicular cap wall right behind the start of the track (joint0 / SEGMENTS[0].a).
 * The segment 0 side walls extend a little past it (WALL_EXTEND_STRAIGHT — no
 * turn there), but nothing ever closed off the BACK — a player rolled/knocked
 * backward before launch had open air there. Oriented like the segment walls
 * (s.rotation aligns local Y to the
 * surface normal, local Z to the travel direction — segment0 is tilted 7.9°,
 * not flat, so this can't be an axis-aligned box like the finish end-wall).
 */
function buildSpawnWall() {
  const s = SEGMENTS[0]
  const height = WALL_HEIGHT * 2 // matches the finish end-wall's extra height — a hard stop, not hoppable
  box(
    Vector3.add(s.a, Vector3.scale(s.normal, height / 2)),
    Vector3.create(CHUTE_INNER_WIDTH + 2, height, 1.5),
    s.rotation,
    WALL_COLOR
  )
}

export function buildTrack() {
  // rails on EVERY segment (the first one included now) so the start reads the
  // same as the rest of the track. Purely the emissive strip — no collider.
  SEGMENTS.forEach((s, i) => buildSegment(s, true, SEGMENTS[i - 1], SEGMENTS[i + 1]))
  buildRunout()
  buildSpawnWall()
  OBSTACLES.forEach(buildObstacle)
  console.log(`[CLIENT] track built (${SEGMENTS.length} segments, ${OBSTACLES.length} obstacles, box floor)`)
}
