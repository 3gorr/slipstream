/**
 * Track layout — pure data, imported by the client (to build meshes + wall
 * braking) and later the server (checkpoint planes). No engine components here.
 *
 * The chute is an S-bend: it weaves across the width of the scene (X changes,
 * not only Y) while descending, so steering matters. Each segment is a flat
 * ribbon between two points on the ROLLING SURFACE; consecutive segments share a
 * joint exactly and overlap slightly (SEGMENT_EXTEND) so the mitre corners have
 * no gap. Validated approach: a force-driven gyrosphere rides this smoothly at a
 * moderate steer rate (sharp steering shakes — the track is built for wide,
 * flowing turns).
 */
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { JOINT_TUPLES, LANE_HALF } from './track-joints'

export const CHUTE_CENTER_X = 8
export const HALF_LANE = LANE_HALF
/** clear width between the walls, metres */
export const CHUTE_INNER_WIDTH = LANE_HALF * 2
export const WALL_HEIGHT = 3
export const WALL_THICKNESS = 0.4
/** Walls (box primitives) are lengthened this much at each end so they overlap
 * past the mitre wedge at each turn (closing the gap a ball could escape). */
export const WALL_EXTEND = 2.5

// --- floor (box primitives) ---
// The DCL asset pipeline would not load a generated GLB floor (3 attempts), so
// the floor is box slabs again. assets/track.glb + its generator stay in the
// repo for the art pass.
//
// Thick, so the character controller can't tunnel through a thin rotated slab on
// the first frame after a spawn. Top face still lands on the a-b line (sunk by
// half the thickness along the surface normal).
export const FLOOR_THICKNESS = 2.0
// Extend each slab FORWARD only (never backward past its start joint). At a
// concave joint the shallower slab then rides slightly proud past the joint and
// the sphere steps DOWN ~5-9 cm onto the next slab (soft, pinForce holds it);
// backward extension would instead poke UP into a lip the sphere slams into.
// Convex (transition) joints come out seamless this way.
export const FLOOR_FWD_EXTEND = 1.5

/** Ghost samples are stored in centimetres from this point. */
export const TRACK_ORIGIN = Vector3.create(8, 0, 4)

/**
 * Rolling-surface joints, top → bottom. Weaves X 5..11 (so the extended outer
 * walls at the turns stay inside the 16 m-wide scene).
 *
 * Pitch profile: 7.9° → 10.3° → 13.9° → 15.9° (steepening, so the three turn
 * joints are all CONCAVE and support the sphere), then eases 15.9° → 7.5° → 0°
 * across two short transition steps before the flat run-out — spreading what was
 * a single 16°→0° convex cliff (a launch ramp at top speed) into two gentle
 * ~8° convex bends. pinForce keeps the sphere glued through them.
 *
 * Δyaw at the three turn joints ≈ −14° / +18° / −14°. Edit the shape in
 * src/shared/track-joints.ts, then re-run `npm run gen-track`.
 */
export const JOINTS: Vector3[] = JOINT_TUPLES.map((t) => Vector3.create(t[0], t[1], t[2]))

/** Z where the transition segment ends and the flat run-out begins. */
export const RUNOUT_START_Z = 153
/** End of the flat run-out. Kept a few metres inside the Z=160 scene edge — an
 * entity whose bounding box crosses the parcel boundary is dropped entirely
 * (this was the end-of-track fall-through: the run-out slab reached Z≈160.8). */
export const RUNOUT_END_Z = 158
/** Y of the flat run-out surface (matches the last joint). */
export const RUNOUT_Y = 3.9

const WORLD_UP = Vector3.create(0, 1, 0)

export interface TrackSegment {
  a: Vector3
  b: Vector3
  center: Vector3
  /** forward along the segment, normalised */
  dir: Vector3
  /** horizontal, to the right of travel, normalised */
  right: Vector3
  /** surface up, normalised */
  normal: Vector3
  rotation: Quaternion
  len: number
  zLo: number
  zHi: number
}

function makeSegment(a: Vector3, b: Vector3): TrackSegment {
  const delta = Vector3.subtract(b, a)
  const len = Vector3.length(delta)
  const dir = Vector3.normalize(delta)
  const right = Vector3.normalize(Vector3.cross(WORLD_UP, dir)) // horizontal
  const normal = Vector3.normalize(Vector3.cross(dir, right)) // up-ish
  return {
    a,
    b,
    center: Vector3.scale(Vector3.add(a, b), 0.5),
    dir,
    right,
    normal,
    rotation: Quaternion.lookRotation(dir, normal),
    len,
    zLo: Math.min(a.z, b.z),
    zHi: Math.max(a.z, b.z)
  }
}

export const SEGMENTS: TrackSegment[] = (() => {
  const out: TrackSegment[] = []
  for (let i = 0; i < JOINTS.length - 1; i++) out.push(makeSegment(JOINTS[i], JOINTS[i + 1]))
  return out
})()

/** the segment whose Z range contains z (clamped to the ends) */
export function segmentAtZ(z: number): TrackSegment {
  for (const s of SEGMENTS) if (z <= s.zHi) return s
  return SEGMENTS[SEGMENTS.length - 1]
}

/** centreline point (x, y, z) of the rolling surface at world Z */
export function surfacePointAt(z: number): Vector3 {
  const s = segmentAtZ(z)
  let t = (z - s.a.z) / (s.b.z - s.a.z)
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Vector3.add(s.a, Vector3.scale(Vector3.subtract(s.b, s.a), t))
}

/** signed horizontal offset of a position from the centreline (+ = right of travel) */
export function laneOffsetAt(pos: Vector3): number {
  const s = segmentAtZ(pos.z)
  return Vector3.dot(Vector3.subtract(pos, s.a), s.right)
}

/**
 * Centreline point + surface Y, valid on the winding segments AND the straight
 * run-out. Use this (not surfacePointAt) for escape checks that run all the way
 * to the finish.
 */
export function trackCentreAt(z: number): Vector3 {
  if (z >= RUNOUT_START_Z) {
    return Vector3.create(CHUTE_CENTER_X, RUNOUT_Y, z < RUNOUT_END_Z ? z : RUNOUT_END_Z)
  }
  return surfacePointAt(z)
}

/** signed horizontal offset from the centreline, handling the straight run-out */
export function trackOffsetAt(pos: Vector3): number {
  if (pos.z >= RUNOUT_START_Z) return pos.x - CHUTE_CENTER_X
  return laneOffsetAt(pos)
}

// ---- spawn ---------------------------------------------------------

export const SPAWN_ALONG = 6 // metres down segment 0, on the centreline
export const SPAWN_LIFT = 1.2 // metres above the surface, along the surface normal
export const SPAWN_GRACE = 0.6 // seconds of no drive force after a (re)spawn

// SPAWN is on the centreline of segment 0's floor (never near an edge), lifted
// along the surface normal. scene.json spawnPoints[0] must be kept in sync by
// hand (it cannot import this): position (8.51, 34.37, 10.09),
// cameraTarget (10.33, 29.11, 32).
export const SPAWN: Vector3 = Vector3.add(
  Vector3.add(SEGMENTS[0].a, Vector3.scale(SEGMENTS[0].dir, SPAWN_ALONG)),
  Vector3.scale(SEGMENTS[0].normal, SPAWN_LIFT)
)
export const SPAWN_LOOK: Vector3 = Vector3.add(surfacePointAt(SEGMENTS[0].a.z + 28), Vector3.create(0, -1, 0))

/**
 * Checkpoint plane Z positions for server-side timing (not wired yet).
 * First = start line, last = finish line.
 */
export const CHECKPOINTS_Z = [8, 40, 78, 116, 150]
